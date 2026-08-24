import asyncio
import uuid
import subprocess
import threading
import json
import os
import signal
import sqlite3
import sys
import httpx
from pathlib import Path
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.schemas import (
    PublishRequest,
    PublishResponse,
    TaskStatus,
    SiteResult,
    ParseRequest,
    ParseResponse,
    RealtorResult,
    ParseStatus,
)
from api.publisher import publish_to_sites, check_site_auth, check_site_preflight, check_promotion_preflight
from api.cookie_manager import save_cookies, save_storage_state, delete_auth_state

PARSER_CODE_PATH = "/root/karty-lab/karty-core/karty-lab-code"
if PARSER_CODE_PATH not in sys.path:
    sys.path.insert(0, PARSER_CODE_PATH)
import parser_state as parser_state_db
from db import get_stats

app = FastAPI(title="Karty Publisher API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory task storage
tasks: dict[str, dict] = {}
PUBLISH_TASKS_FILE = Path('/root/karty-lab/publish_tasks.json')
PUBLISH_STATE_DB = Path('/root/karty-lab/realtors.db')
tasks_lock = threading.Lock()


def _init_publish_idempotency() -> None:
    with sqlite3.connect(PUBLISH_STATE_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS publish_idempotency (
                idempotency_key TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


_init_publish_idempotency()


def _load_publish_tasks():
    if not PUBLISH_TASKS_FILE.exists():
        return
    try:
        data = json.loads(PUBLISH_TASKS_FILE.read_text())
        for task_id, task in data.items():
            if task.get('status') == 'processing':
                task['status'] = 'failed'
                task['error'] = 'API перезапущен во время публикации'
            tasks[task_id] = task
    except Exception:
        pass


def _save_publish_tasks():
    try:
        with tasks_lock:
            recent = dict(list(tasks.items())[-200:])
            PUBLISH_TASKS_FILE.write_text(json.dumps(recent, ensure_ascii=False))
    except Exception:
        pass


_load_publish_tasks()


async def _notify_publish_failure(task_id: str, req: PublishRequest, results: dict):
    token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_ADMIN_CHAT_ID')
    failed = {site: data for site, data in results.items() if data.get('status') != 'success'}
    if not token or not chat_id or not failed:
        return
    lines = [
        "Karty CRM — требуется внимание",
        "",
        "При публикации объявления возникла проблема.",
        "",
        f"Задача: {task_id}",
        f"Пользователь: {req.user_id}",
        f"Объект: {req.listing.address or 'адрес не указан'}",
        f"Тип: {req.listing.type} · Сделка: {req.listing.deal}",
    ]
    for site, data in failed.items():
        lines.append("\n━━━━━━━━━━━━━━━━━━━━")
        lines.append(f"Площадка: {site}")
        lines.append(f"Код: {data.get('error_code', 'UNKNOWN_PUBLISH_ERROR')}")
        lines.append(f"Этап: {data.get('stage', 'publish pipeline')}")
        lines.append(f"Причина: {data.get('error', 'не указана')}")
        lines.append(f"Рекомендация: {data.get('user_action', 'проверить вручную')}")
        if data.get('screenshot_error'):
            lines.append(f"Screenshot: {data['screenshot_error']}")
    lines.append("\nТехнические материалы: /root/karty-lab/logs и publish_tasks.json")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat_id, "text": ''.join(lines)})
            user_chat_id = req.telegram_chat_id
            if user_chat_id and str(user_chat_id) != str(chat_id):
                user_message = _user_failure_message(req, failed)
                await client.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": user_chat_id, **user_message})
    except Exception:
        pass


def _user_failure_message(req: PublishRequest, failed: dict) -> dict:
    platform_names = {'ss_ge': 'SS.ge', 'korter_ge': 'Korter', 'myhome_ge': 'MyHome'}
    platforms = ', '.join(platform_names.get(site, site) for site in failed)
    codes = {str(data.get('error_code', 'UNKNOWN_PUBLISH_ERROR')) for data in failed.values()}
    object_name = ', '.join(part for part in [req.listing.city, req.listing.address] if part) or 'вашего объявления'
    self_fix = {'AUTH_EXPIRED', 'BALANCE_ERROR', 'PHOTO_UPLOAD_ERROR', 'SITE_VALIDATION_ERROR'}
    if codes.issubset(self_fix):
        actions = '; '.join(str(data.get('user_action', 'проверьте данные объявления')) for data in failed.values())
        reason = f"Причина: {actions}."
        support = None
    else:
        reason = 'Похоже, произошла временная техническая ошибка на стороне площадки.'
        support_id = os.getenv('TELEGRAM_SUPPORT_CHAT_ID') or os.getenv('TELEGRAM_ADMIN_CHAT_ID')
        support = {"inline_keyboard": [[{"text": "Связаться с поддержкой", "url": f"tg://user?id={support_id}"}]]} if support_id else None
    payload = {
        "text": ("Здравствуйте!\n\n"
                 f"К сожалению, не получилось опубликовать объявление ({object_name}) на {platforms}.\n"
                 "Ваши данные и фотографии сохранены, объявление не потеряно.\n\n"
                 f"{reason}\n\n"
                 "Если потребуется помощь, мы обязательно поможем разобраться."),
    }
    if support: payload['reply_markup'] = support
    return payload


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/cookies/{user_id}/{site}")
async def upload_cookies(user_id: str, site: str, cookies: list[dict]):
    """Save cookies for a user+site after authentication."""
    valid_sites = ["ss_ge", "myhome_ge", "korter_ge"]
    if site not in valid_sites:
        raise HTTPException(400, f"Invalid site. Must be one of: {valid_sites}")
    try:
        save_cookies(user_id, site, cookies)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "ok", "user_id": user_id, "site": site, "count": len(cookies)}


@app.post("/api/storage-state/{user_id}/{site}")
async def upload_storage_state(user_id: str, site: str, state: dict):
    """Save full browser storage state (cookies + localStorage) for a site.

    Required for korter.ge which stores auth in localStorage, not cookies.
    Generate on Mac with: ctx.storage_state(path='state.json')
    """
    valid_sites = ["ss_ge", "myhome_ge", "korter_ge"]
    if site not in valid_sites:
        raise HTTPException(400, f"Invalid site. Must be one of: {valid_sites}")
    try:
        save_storage_state(user_id, site, state)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    cookies_count = len(state.get("cookies", []))
    origins_count = len(state.get("origins", []))
    return {
        "status": "ok",
        "user_id": user_id,
        "site": site,
        "cookies": cookies_count,
        "origins": origins_count,
    }


@app.post("/api/publish/preflight")
async def publish_preflight(data: dict):
    """Validate listing data, photos, sessions and paid-site balances before publish."""
    user_id = str(data.get("user_id") or "")
    sites = data.get("sites") or ["ss_ge", "myhome_ge", "korter_ge"]
    listing = data.get("listing") or {}
    photos = data.get("photos") or data.get("photo_urls") or listing.get("photo_urls") or []
    if not user_id:
        raise HTTPException(400, "user_id is required")

    checks = []
    for site in sites:
        site_check = await check_site_preflight(user_id, site)
        errors = list(site_check.pop("errors", []))
        warnings = list(site_check.pop("warnings", []))
        def required(fields: list[tuple[str, object]]) -> None:
            for label, value in fields:
                if value is None or value == "" or value == 0:
                    errors.append(label)

        if listing.get("deal") not in {"sale", "rent"}:
            errors.append("Укажите тип сделки: продажа или аренда")
        if listing.get("type") not in {"apartment", "house", "land", "commercial"}:
            errors.append("Укажите тип недвижимости")
        if not photos:
            errors.append("Добавьте хотя бы одну фотографию")
        if site == "korter_ge" and len(photos) < 3:
            errors.append("Korter требует минимум 3 фотографии")
        if site == "korter_ge" and listing.get("type") == "land" and listing.get("deal") == "rent":
            errors.append("Korter не поддерживает аренду земельного участка")
        prop_type = listing.get("type")
        if site == "ss_ge" and prop_type == "apartment":
            required([("Количество комнат", listing.get("rooms")), ("Спальни", listing.get("bedrooms")), ("Этаж", listing.get("floor")), ("Этажность", listing.get("floors_total"))])
        if site == "ss_ge" and prop_type == "house":
            required([("Количество комнат", listing.get("rooms")), ("Спальни", listing.get("bedrooms")), ("Площадь двора", listing.get("yard_area"))])
        if site == "myhome_ge" and prop_type == "apartment":
            required([("Количество комнат", listing.get("rooms")), ("Этаж", listing.get("floor")), ("Этажность", listing.get("floors_total"))])
        if site == "myhome_ge" and prop_type == "house":
            required([("Количество комнат", listing.get("rooms")), ("Спальни", listing.get("bedrooms")), ("Этажность", listing.get("floors_total"))])
        if site == "myhome_ge" and prop_type == "commercial":
            required([("Количество комнат", listing.get("rooms")), ("Этаж", listing.get("floor")), ("Этажность", listing.get("floors_total"))])
        if site == "korter_ge" and prop_type == "apartment":
            required([("Количество комнат", listing.get("rooms")), ("Спальни", listing.get("bedrooms")), ("Этаж", listing.get("floor")), ("Этажность", listing.get("floors_total"))])
        if site == "korter_ge" and prop_type == "house":
            required([("Количество комнат", listing.get("rooms")), ("Спальни", listing.get("bedrooms")), ("Этажность", listing.get("floors_total"))])
        if site == "korter_ge" and prop_type == "commercial":
            required([("Этаж", listing.get("floor")), ("Этажность", listing.get("floors_total"))])
        checks.append({"site": site, "ready": not errors and site_check["auth"] == "valid", "errors": errors, "warnings": warnings, **site_check})
    return {"ready": all(item["ready"] for item in checks), "checks": checks}


@app.post("/api/publish", response_model=PublishResponse)
async def start_publish(req: PublishRequest):
    """Start publishing listing to specified sites. Returns task_id for polling."""
    valid_sites = {"ss_ge", "myhome_ge", "korter_ge"}
    invalid = set(req.sites) - valid_sites
    if invalid:
        raise HTTPException(400, f"Invalid sites: {invalid}")
    disabled = {site.strip() for site in os.getenv("PUBLISH_DISABLED_SITES", "").split(",") if site.strip()}
    blocked = set(req.sites) & disabled
    if blocked:
        raise HTTPException(503, f"Publishing temporarily disabled for: {sorted(blocked)}")

    with tasks_lock:
        if req.idempotency_key:
            with sqlite3.connect(PUBLISH_STATE_DB) as conn:
                row = conn.execute(
                    "SELECT task_id FROM publish_idempotency WHERE idempotency_key = ?",
                    (req.idempotency_key,),
                ).fetchone()
            if row:
                existing_id = row[0]
                existing = tasks.get(existing_id)
                if existing:
                    return PublishResponse(task_id=existing_id, status=existing.get("status", "processing"))
                raise HTTPException(409, "Идемпотентный ключ уже использован предыдущей задачей")

        requested_sites = set(req.sites)
        for existing_id, existing in tasks.items():
            if existing.get("status") == "processing" and existing.get("user_id") == req.user_id and requested_sites.intersection(existing.get("sites", [])):
                raise HTTPException(409, f"Публикация уже выполняется: {existing_id}")

        task_id = str(uuid.uuid4())[:8]
        tasks[task_id] = {
            "status": "processing",
            "results": {s: {"status": "pending"} for s in req.sites},
            "listing_id": req.listing_id,
            "idempotency_key": req.idempotency_key,
            "user_id": req.user_id,
            "sites": req.sites,
        }
        if req.idempotency_key:
            with sqlite3.connect(PUBLISH_STATE_DB) as conn:
                conn.execute(
                    "INSERT INTO publish_idempotency (idempotency_key, task_id, user_id) VALUES (?, ?, ?)",
                    (req.idempotency_key, task_id, req.user_id),
                )
    _save_publish_tasks()

    # Launch background task
    asyncio.create_task(_run_publish(task_id, req))

    return PublishResponse(task_id=task_id, status="processing")


async def _run_publish(task_id: str, req: PublishRequest):
    """Background task that runs the actual publishing."""
    try:
        async def checkpoint(site: str, data: dict):
            tasks[task_id]["results"][site] = data
            tasks[task_id]["checkpoint"] = {
                "site": site,
                "stage": data.get("stage", "unknown"),
                "updated_at": datetime.now().isoformat(),
            }
            _save_publish_tasks()

        for site in req.sites:
            await checkpoint(site, {"status": "processing", "stage": "worker_start"})

        worker_request = json.dumps({
            "user_id": req.user_id,
            "sites": req.sites,
            "listing": {**req.listing.model_dump(), "_publish_task_id": task_id},
        }, ensure_ascii=False)
        worker_env = {
            "HOME": "/root",
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "PATH": "/root/karty-lab/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "PYTHONPATH": "/root/karty-lab",
            "PYTHONUNBUFFERED": "1",
            "PUBLISH_AUTH_PREFLIGHT": "false",
            "PUBLISH_HEADLESS": os.getenv("PUBLISH_HEADLESS", "false"),
            "PUBLISH_DISABLED_SITES": os.getenv("PUBLISH_DISABLED_SITES", ""),
        }
        process = await asyncio.create_subprocess_exec(
            "xvfb-run",
            "--auto-servernum",
            "--server-args=-screen 0 1280x900x24",
            "/root/karty-lab/venv/bin/python3",
            "-m",
            "api.publish_worker",
            cwd="/root/karty-lab",
            env=worker_env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        worker_timeout = int(os.getenv("PUBLISH_WORKER_TIMEOUT_SECONDS", "900"))
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(worker_request.encode()),
                timeout=worker_timeout,
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise RuntimeError(f"PUBLISH_WORKER_TIMEOUT after {worker_timeout}s")
        if stderr:
            print(f"[publish worker {task_id}] {stderr.decode(errors='replace')[-4000:]}", flush=True)
        if process.returncode != 0:
            raise RuntimeError(f"Publish worker exited with code {process.returncode}")
        output_lines = stdout.decode(errors="replace").splitlines()
        result_line = next((line.strip() for line in reversed(output_lines) if line.strip().startswith("{")), "")
        if not result_line:
            raise RuntimeError("Publish worker returned no JSON result")
        results = json.loads(result_line)
        tasks[task_id]["results"] = results
        unknown = any(
            item.get("error_code") == "PUBLISH_NOT_VERIFIED" or item.get("stage") == "submit"
            for item in results.values()
        )
        successful = any(item.get("status") == "success" for item in results.values())
        all_successful = bool(results) and all(item.get("status") == "success" for item in results.values())
        tasks[task_id]["status"] = "completed" if all_successful else "publish_unknown" if unknown else "partial" if successful else "failed"
        tasks[task_id]["completed_at"] = datetime.now().isoformat()
        _save_publish_tasks()
        await _notify_publish_failure(task_id, req, results)
    except Exception as e:
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
        worker_code = "PUBLISH_TIMEOUT" if "PUBLISH_WORKER_TIMEOUT" in str(e) else "PUBLISH_TASK_ERROR"
        for site in req.sites:
            if tasks[task_id]["results"].get(site, {}).get("status") == "processing":
                tasks[task_id]["results"][site] = {
                    "status": "failed",
                    "stage": "worker",
                    "error": str(e),
                    "error_code": worker_code,
                    "user_action": "Повторите публикацию и проверьте Task ID",
                    "user_message": "Публикационный worker завершился с ошибкой. Проверьте Task ID и повторите попытку.",
                }
        tasks[task_id]["completed_at"] = datetime.now().isoformat()
        _save_publish_tasks()
        await _notify_publish_failure(task_id, req, {"publish": {"status": "failed", "error": str(e), "error_code": worker_code, "user_action": "Повторите публикацию и проверьте Task ID"}})


@app.get("/api/publish/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """Check publishing task status."""
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    task = tasks[task_id]
    results = {}
    for site, data in task["results"].items():
        results[site] = SiteResult(**data)
    return TaskStatus(task_id=task_id, status=task["status"], user_id=task.get("user_id"), results=results)


@app.post("/api/auth/check")
async def check_auth(req: dict):
    """Verify that the stored browser state still authenticates on the site."""
    user_id = req.get("user_id")
    site = req.get("site")
    if not user_id or not site:
        raise HTTPException(400, "user_id and site are required")
    return await check_site_auth(user_id, site)


@app.post("/api/auth/balance")
async def check_balance(req: dict):
    """Read the current platform balance without performing any paid action."""
    user_id = req.get("user_id")
    site = req.get("site")
    if not user_id or not site:
        raise HTTPException(400, "user_id and site are required")
    result = await check_site_preflight(user_id, site)
    return {
        "site": site,
        "auth": result.get("auth"),
        "balance": result.get("balance", {"checked": False, "amount": None, "currency": "GEL"}),
        "errors": result.get("errors", []),
        "warnings": result.get("warnings", []),
    }


@app.post("/api/promotion/preflight")
async def promotion_preflight(req: dict):
    user_id = req.get("user_id")
    site = req.get("site")
    if not user_id or not site:
        raise HTTPException(400, "user_id and site are required")
    return await check_promotion_preflight(user_id, site, req.get("listing_url"))


@app.post("/api/auth/remove")
async def remove_auth(req: dict):
    user_id = req.get("user_id")
    site = req.get("site")
    if not user_id or not site:
        raise HTTPException(400, "user_id and site are required")
    delete_auth_state(user_id, site)
    return {"status": "removed", "site": site}


# ── Parser endpoints ──

parse_tasks: dict[str, dict] = {}
parse_history: list[dict] = []  # Last N parse results
PARSE_HISTORY_MAX = 20
parse_cancel_events: dict[str, threading.Event] = {}  # Cancel signals per task
parse_schedulers: dict[str, object] = {}  # CategoryScheduler instances per task

parser_state_db.initialize()


@app.post("/api/parse", response_model=ParseResponse)
async def start_parse(req: ParseRequest):
    """Start realtor parsing. Returns task_id for polling."""
    valid_sites = {"korter", "myhome", "ssge"}
    invalid = set(req.sites) - valid_sites
    if invalid:
        raise HTTPException(400, f"Invalid sites: {invalid}. Must be one of: {valid_sites}")

    # Check if a parse for the SAME site is already running
    new_sites = set(req.sites)
    for tid, t in parse_tasks.items():
        if t["status"] == "processing":
            running_sites = set(t.get("sites", []))
            conflict = new_sites & running_sites
            if conflict:
                raise HTTPException(409, f"Parse already running for: {', '.join(conflict)} (task {tid})")

    task_id = str(uuid.uuid4())[:8]
    parser_state_db.create_task(task_id, req.mode, req.sites)
    parse_tasks[task_id] = {
        "status": "processing",
        "realtors_found": 0,
        "total_in_db": 0,
        "by_source": {},
        "error": "",
        "mode": req.mode,
        "sites": req.sites,
        "started_at": datetime.now().isoformat(),
        "current_site": "",
        "current_url": "",
        "processed_count": 0,
        "total_urls": 0,
    }

    # Create cancel event
    cancel_event = threading.Event()
    parse_cancel_events[task_id] = cancel_event

    asyncio.create_task(_run_parse(task_id, req, cancel_event))

    return ParseResponse(task_id=task_id)


async def _run_parse(task_id: str, req: ParseRequest, cancel_event: threading.Event):
    """Run category-level parallel parser with RAM-aware scheduling."""
    import os, logging, importlib
    os.environ["DISPLAY"] = os.environ.get("DISPLAY", ":99")
    for var in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
        os.environ.pop(var, None)

    sys.path.insert(0, PARSER_CODE_PATH)
    # The API process is long-lived. Reload parser modules before every task so
    # a new task uses code changes without requiring a service restart.
    import realtor_parser as realtor_parser_module
    import category_scheduler as category_scheduler_module
    importlib.reload(realtor_parser_module)
    importlib.reload(category_scheduler_module)
    from category_scheduler import CategoryScheduler
    from db import init_db, get_stats

    init_db()

    # Convert threading.Event to asyncio.Event for the scheduler
    async_cancel = asyncio.Event()

    def _check_cancel():
        if cancel_event.is_set() and not async_cancel.is_set():
            async_cancel.set()

    # Bridge threading.Event → asyncio.Event
    _cancel_watcher = asyncio.create_task(asyncio.to_thread(cancel_event.wait))
    def _on_cancel_done(_):
        async_cancel.set()
    _cancel_watcher.add_done_callback(_on_cancel_done)

    scheduler = CategoryScheduler(
        task_id,
        mode=req.mode,
        max_concurrent=4,
        max_per_site=2,
        skip_categories=set(req.skip_categories),
        ram_limit_mb=3000,
    )
    parse_schedulers[task_id] = scheduler

    try:
        found = await scheduler.run(cancel_event=async_cancel)
        stats = get_stats()
        status = "completed" if not cancel_event.is_set() else "cancelled"
        logging.info(f"[API] Category scheduler done: found={found}, total={stats['total']}")

        parse_tasks[task_id]["status"] = status
        parse_tasks[task_id]["realtors_found"] = found
        parse_tasks[task_id]["total_in_db"] = stats["total"]
        parse_tasks[task_id]["by_source"] = stats["by_source"]
        parser_state_db.update_task(task_id, realtors_found=found)
        parser_state_db.finish_task(task_id, status)

        parse_history.append({
            "task_id": task_id, "mode": req.mode, "sites": req.sites,
            "realtors_found": found, "total_in_db": stats["total"],
            "by_source": stats["by_source"],
            "timestamp": datetime.now().isoformat(), "status": status,
        })
        if len(parse_history) > PARSE_HISTORY_MAX:
            parse_history.pop(0)
    except Exception as e:
        logging.error(f"[API] Category scheduler failed: {e}")
        parse_tasks[task_id]["status"] = "failed"
        parse_tasks[task_id]["error"] = str(e)
        parser_state_db.finish_task(task_id, "failed", str(e))
        parse_history.append({
            "task_id": task_id, "mode": req.mode, "sites": req.sites,
            "realtors_found": 0, "total_in_db": 0, "by_source": {},
            "timestamp": datetime.now().isoformat(), "status": "failed", "error": str(e),
        })
    finally:
        _cancel_watcher.cancel()
        parse_cancel_events.pop(task_id, None)
        parse_schedulers.pop(task_id, None)


async def _restore_parse_tasks():
    """Resume parser tasks that survived an API restart."""
    for stored in parser_state_db.list_unfinished_tasks():
        task_id = stored["task_id"]
        if task_id in parse_cancel_events:
            continue
        status = stored.get("status", "")
        if status not in ("running", "in_progress", "stalled"):
            logging.info("Skipping restore of parser task %s (status=%s)", task_id, status)
            continue
        # Do not resume tasks that are older than 24 hours; mark them stalled/failed.
        started = stored.get("started_at", "")
        try:
            started_dt = datetime.fromisoformat(started)
            if datetime.now() - started_dt > timedelta(hours=24):
                logging.warning("Parser task %s is older than 24h; marking stalled instead of resuming", task_id)
                parser_state_db.update_task(task_id, status="stalled", last_heartbeat=datetime.now().isoformat())
                continue
        except Exception:
            pass
        try:
            sites = json.loads(stored.get("sites_json") or "[]")
            req = ParseRequest(
                mode=stored.get("mode", "daily"),
                sites=sites,
                max_per_site=2000 if stored.get("mode") == "full" else 200,
            )
            cancel_event = threading.Event()
            parse_cancel_events[task_id] = cancel_event
            parse_tasks[task_id] = {
                "status": "processing",
                "realtors_found": stored.get("realtors_found", 0),
                "total_in_db": 0,
                "by_source": {},
                "error": "",
                "mode": req.mode,
                "sites": req.sites,
                "started_at": stored.get("started_at", datetime.now().isoformat()),
                "current_site": stored.get("current_site", ""),
                "current_url": stored.get("current_url", ""),
                "processed_count": stored.get("processed_count", 0),
                "total_urls": stored.get("total_urls", 0),
            }
            parser_state_db.update_task(task_id, status="running", last_heartbeat=datetime.now().isoformat())
            asyncio.create_task(_run_parse(task_id, req, cancel_event))
        except Exception as exc:
            logging.error("Could not restore parser task %s: %s", task_id, exc)


async def _parse_watchdog():
    while True:
        await asyncio.sleep(60)
        try:
            stalled = parser_state_db.mark_stalled_tasks(stale_after_seconds=300)
            if stalled:
                logging.warning("Parser watchdog marked %s task(s) stalled", stalled)
        except Exception as exc:
            logging.error("Parser watchdog failed: %s", exc)


_retry_worker = None
_retry_worker_task = None


async def _serve_retry_worker():
    global _retry_worker
    from retry_worker import RetryWorker, SiteParserProcessor

    processor = SiteParserProcessor()
    _retry_worker = RetryWorker(processor)
    try:
        await _retry_worker.serve_forever()
    finally:
        await processor.close()


@app.on_event("startup")
async def parser_startup():
    global _retry_worker_task
    asyncio.create_task(_restore_parse_tasks())
    asyncio.create_task(_parse_watchdog())
    _retry_worker_task = asyncio.create_task(_serve_retry_worker())


@app.on_event("shutdown")
async def parser_shutdown():
    if _retry_worker:
        _retry_worker.stop()
    if _retry_worker_task:
        try:
            await asyncio.wait_for(_retry_worker_task, timeout=10)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            _retry_worker_task.cancel()


@app.get("/api/parse/history")
async def get_parse_history():
    """Get parse history (last N runs)."""
    stored = parser_state_db.list_recent_tasks(20)
    current_stats = get_stats()
    history = []
    for task in stored:
        try:
            sites = json.loads(task.get("sites_json") or "[]")
        except (TypeError, ValueError):
            sites = []
        history.append({
            "task_id": task.get("task_id"),
            "mode": task.get("mode", "unknown"),
            "sites": sites,
            "realtors_found": task.get("realtors_found", 0),
            "total_in_db": current_stats.get("total", 0),
            "by_source": current_stats.get("by_source", {}),
            "timestamp": task.get("completed_at") or task.get("updated_at") or task.get("started_at"),
            "status": task.get("status", "unknown"),
            "error": task.get("last_error") or "",
        })
    return {"history": history or list(reversed(parse_history))}


@app.get("/api/parse/health")
async def parse_health():
    now = datetime.now().timestamp()
    tasks = []
    for task in parser_state_db.list_unfinished_tasks():
        try:
            heartbeat = datetime.fromisoformat(task["last_heartbeat"].replace("Z", "+00:00")).timestamp()
            age = max(0, int(now - heartbeat))
        except Exception:
            age = None
        tasks.append({**task, "heartbeat_age_seconds": age, "stalled": age is None or age > 300})
    last_finished = parser_state_db.get_last_resumable_task()
    if last_finished:
        try:
            heartbeat = datetime.fromisoformat(last_finished["last_heartbeat"].replace("Z", "+00:00")).timestamp()
            last_finished["heartbeat_age_seconds"] = max(0, int(now - heartbeat))
        except Exception:
            last_finished["heartbeat_age_seconds"] = None
    return {"tasks": tasks, "last_finished_task": last_finished}


@app.get("/api/parse/scheduler")
async def get_parser_scheduler():
    return parser_state_db.get_scheduler_state()


@app.post("/api/parse/scheduler")
async def set_parser_scheduler(data: dict):
    active = bool(data.get("active", False))
    interval_hours = int(data.get("interval_hours", 24))
    if interval_hours <= 0:
        raise HTTPException(400, "interval_hours must be positive")
    return parser_state_db.set_scheduler_state(active, interval_hours=interval_hours)


@app.get("/api/parse/report/{task_id}")
async def parse_report(task_id: str):
    if not parser_state_db.get_task(task_id):
        raise HTTPException(404, "Parse task not found")
    return parser_state_db.task_report(task_id)


@app.get("/api/parse/{task_id}", response_model=ParseStatus)
async def get_parse_status(task_id: str):
    """Check parsing task status with detailed progress."""
    import json
    import urllib.parse
    from pathlib import Path
    
    # Try to get progress from file
    progress_file = Path("/root/karty-lab/parse_progress.json")
    file_progress = {}
    if progress_file.exists():
        try:
            with open(progress_file) as f:
                file_progress = json.load(f).get(task_id, {})
        except:
            pass

    stored_task = parser_state_db.get_task(task_id)
    if task_id not in parse_tasks and not file_progress and not stored_task:
        raise HTTPException(404, "Parse task not found")

    t = parse_tasks.get(task_id, {})
    if stored_task:
        t = {**t, **stored_task}
        file_progress = {}
    # file_progress takes priority over parse_tasks for live data
    status_map = {"running": "processing", "in_progress": "processing", "stalled": "processing"}
    raw_status = t.get("status") or "processing"
    live_stats = get_stats()
    return ParseStatus(
        task_id=task_id,
        status=status_map.get(raw_status, raw_status),
        realtors_found=file_progress.get("realtors_found", 0) or t.get("realtors_found", 0) or 0,
        total_in_db=live_stats.get("total", 0),
        by_source=live_stats.get("by_source", {}),
        error=t.get("error") or t.get("last_error") or "",
        current_site=file_progress.get("current_site") or t.get("current_site") or "",
        current_category=urllib.parse.unquote(file_progress.get("current_category") or t.get("current_category_url") or ""),
        current_url=file_progress.get("current_url") or t.get("current_url") or "",
        current_date=file_progress.get("current_date") or "",
        processed_count=file_progress.get("processed_count", 0) or t.get("processed_count", 0) or 0,
        total_urls=file_progress.get("total_urls", 0) or t.get("total_urls", 0) or 0,
        status_text=urllib.parse.unquote(file_progress.get("status") or "Обработка..."),
    )


@app.post("/api/parse/{task_id}/cancel")
async def cancel_parse(task_id: str):
    """Cancel a running parse task."""
    if task_id not in parse_tasks:
        raise HTTPException(404, "Parse task not found")
    
    t = parse_tasks[task_id]
    if t["status"] != "processing":
        raise HTTPException(400, f"Task is not processing (status: {t['status']})")
    
    # Signal cancel
    cancel_event = parse_cancel_events.get(task_id)
    if cancel_event:
        cancel_event.set()
    
    t["status"] = "cancelling"
    parser_state_db.update_task(task_id, status="cancelled")
    return {"status": "cancelling", "task_id": task_id}


@app.post("/api/parse/{task_id}/resume")
async def resume_parse(task_id: str):
    """Resume a failed/cancelled parse task from where it stopped."""
    stored_task = parser_state_db.get_task(task_id)
    if task_id not in parse_tasks and not stored_task:
        raise HTTPException(404, "Parse task not found")

    t = parse_tasks.get(task_id, {})
    if stored_task:
        t = {**t, **stored_task}

    status = t.get("status")
    if status not in ("failed", "cancelled", "completed"):
        raise HTTPException(400, f"Cannot resume task in status: {status}")

    # Create new task that continues from where the old one stopped
    new_task_id = str(uuid.uuid4())[:8]
    if stored_task:
        sites = json.loads(stored_task.get("sites_json") or "[]")
    else:
        sites = t["sites"]
    req = ParseRequest(
        mode=t.get("mode", "daily"),
        sites=sites,
        max_per_site=2000 if t.get("mode") == "full" else 50,
    )
    
    parse_tasks[new_task_id] = {
        "status": "processing",
        "realtors_found": 0,
        "total_in_db": 0,
        "by_source": {},
        "error": "",
        "mode": req.mode,
        "sites": req.sites,
        "started_at": datetime.now().isoformat(),
        "current_site": "",
        "current_url": "",
        "processed_count": 0,
        "total_urls": 0,
    }
    
    cancel_event = threading.Event()
    parse_cancel_events[new_task_id] = cancel_event
    parser_state_db.create_task(new_task_id, req.mode, req.sites)
    
    asyncio.create_task(_run_parse(new_task_id, req, cancel_event))
    
    return {"task_id": new_task_id, "status": "processing"}


@app.get("/api/realtors")
async def list_realtors(source: str = "", min_listings: int = 0, limit: int = 50):
    """List realtors from DB with optional filters."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_all_realtors, get_realtors_by_source

    if source:
        realtors = get_realtors_by_source(source)
    else:
        realtors = get_all_realtors()

    if min_listings > 0:
        realtors = [r for r in realtors if r.get("listings_count", 0) >= min_listings]

    return {"total": len(realtors), "realtors": realtors[:limit]}


@app.get("/api/realtors/stats")
async def realtor_stats():
    """Get parser statistics."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_stats, get_connection

    stats = get_stats()
    conn = get_connection()
    top = conn.execute(
        "SELECT name, phone, source, listings_count FROM realtors ORDER BY listings_count DESC LIMIT 10"
    ).fetchall()
    conn.close()

    return {
        "total": stats["total"],
        "by_source": stats["by_source"],
        "top_realtors": [dict(r) for r in top],
    }


@app.get("/api/realtors/categories/{task_id}")
async def get_category_progress(task_id: str):
    """Return per-category parsing progress for the frontend grid."""
    scheduler = parse_schedulers.get(task_id)
    if scheduler:
        return await scheduler.summary()

    # Fallback: read from parser_state checkpoints
    import sys
    sys.path.insert(0, PARSER_CODE_PATH)
    from parser_config import load_sources

    sources = load_sources()
    result = {}
    for site_name, cfg in sources.items():
        result[site_name] = {}
        for url in cfg.get("urls", []):
            checkpoint = parser_state_db.get_checkpoint(task_id, site_name, url)
            if checkpoint:
                result[site_name][url] = {
                    "status": checkpoint.get("status", "pending"),
                    "processed": checkpoint.get("processed_count", 0),
                    "found": 0,
                    "current_url": checkpoint.get("current_url", ""),
                    "pages_done": checkpoint.get("page_num", 1) - 1,
                    "error": checkpoint.get("last_error"),
                }
            else:
                result[site_name][url] = {
                    "status": "pending",
                    "processed": 0,
                    "found": 0,
                    "current_url": "",
                    "pages_done": 0,
                }
    return result


# ── Telegram Parser endpoints ──

def _telegram_parser_running() -> bool:
    """Check the same non-blocking lock used by tg_parser.py."""
    import fcntl
    lock_path = Path("/root/karty-lab/logs/tg_parser.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+")
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        return False
    finally:
        handle.close()


def _telegram_configuration_error() -> str | None:
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_connection
    conn = get_connection()
    try:
        accounts = conn.execute("SELECT COUNT(*) FROM telegram_accounts WHERE active=1").fetchone()[0]
        chats = conn.execute("SELECT COUNT(*) FROM telegram_chats WHERE active=1").fetchone()[0]
    finally:
        conn.close()
    if not accounts:
        return "Нет активных Telegram-аккаунтов"
    if not chats:
        return "Нет активных Telegram-чатов"
    return None

@app.get("/api/tg/chats")
async def get_tg_chats():
    """Get all Telegram chats being monitored."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_connection
    conn = get_connection()
    rows = conn.execute("SELECT id, chat_id, chat_title, chat_type, last_checked_id, active, added_at, chat_link, join_status, joined_at FROM telegram_chats ORDER BY id").fetchall()
    conn.close()
    return {"chats": [dict(r) for r in rows]}


@app.post("/api/tg/chats")
async def add_tg_chat(chat: dict):
    """Add a Telegram chat to monitor."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_connection
    from datetime import datetime
    conn = get_connection()
    try:
        chat_ref = str(chat.get("chat_id") or chat.get("chat_link") or "").strip()
        if not chat_ref:
            return {"success": False, "error": "chat_id or chat_link required"}
        conn.execute(
            "INSERT INTO telegram_chats (chat_id, chat_title, chat_type, chat_link, join_status, active, added_at) VALUES (?, ?, ?, ?, 'pending', 1, ?)",
            (chat_ref, chat.get("chat_title", ""), chat.get("chat_type", "group"), chat.get("chat_link", chat_ref), datetime.now().isoformat())
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()


@app.delete("/api/tg/chats/{chat_id}")
async def delete_tg_chat(chat_id: str):
    """Remove a Telegram chat from monitoring."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_connection
    conn = get_connection()
    conn.execute("DELETE FROM telegram_chats WHERE chat_id=?", (chat_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@app.get("/api/tg/accounts")
async def get_tg_accounts():
    """Get all Telegram accounts (hide session_string)."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_connection
    conn = get_connection()
    rows = conn.execute("SELECT id, account_name, user_id, username, display_name, active, created_at FROM telegram_accounts ORDER BY id").fetchall()
    conn.close()
    return {"accounts": [dict(r) for r in rows]}


@app.post("/api/tg/accounts/login")
async def tg_login(data: dict):
    """Start Telegram login: request code."""
    phone = data.get("phone")
    account_name = data.get("account_name")
    if not phone or not account_name:
        return {"success": False, "error": "phone and account_name required"}

    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    sys.path.insert(0, "/root/karty-lab/karty-core/server")
    try:
        from tgUserbot import request_code
        result = await request_code(phone)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/tg/accounts/confirm")
async def tg_confirm(data: dict):
    """Confirm code and complete login."""
    phone = data.get("phone")
    code = data.get("code")
    account_name = data.get("account_name")
    if not all([phone, code, account_name]):
        return {"success": False, "error": "phone, code, and account_name required"}

    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    sys.path.insert(0, "/root/karty-lab/karty-core/server")
    try:
        from tgUserbot import confirm_code
        result = await confirm_code(phone, code, account_name, data.get("password", ""))

        if result.get("success"):
            # Save account to DB
            from db import get_connection
            from datetime import datetime
            conn = get_connection()
            conn.execute(
                "INSERT OR REPLACE INTO telegram_accounts (account_name, session_string, user_id, username, display_name, active, created_at) "
                "VALUES (?, ?, ?, ?, ?, 1, ?)",
                (account_name, result.get("session_string"), str(result.get("user_id", "")),
                 result.get("username", ""), result.get("name", ""), datetime.now().isoformat())
            )
            conn.commit()
            conn.close()

        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/tg/stats")
async def get_tg_stats():
    """Get Telegram parser statistics."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_connection
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) FROM telegram_users").fetchone()[0]
    with_phone = conn.execute("SELECT COUNT(*) FROM telegram_users WHERE phone != '' AND phone IS NOT NULL").fetchone()[0]
    chats = conn.execute("SELECT COUNT(*) FROM telegram_chats WHERE active=1").fetchone()[0]
    accounts = conn.execute("SELECT COUNT(*) FROM telegram_accounts WHERE active=1").fetchone()[0]
    conn.close()
    return {"total_users": total, "with_phone": with_phone, "active_chats": chats, "active_accounts": accounts}


@app.get("/api/tg/status")
async def get_tg_status():
    status = {}
    status_path = Path("/root/karty-lab/logs/tg_parser_status.json")
    try:
        status = json.loads(status_path.read_text())
    except Exception:
        pass
    return {**status, "running": _telegram_parser_running()}


@app.get("/api/tg/users")
async def get_tg_users(limit: int = 100):
    """Get collected Telegram users."""
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from db import get_connection
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, user_id, username, phone, name, message_count, listing_count, listing_urls, source_chat, first_seen, last_seen "
        "FROM telegram_users ORDER BY listing_count DESC, message_count DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return {"users": [dict(r) for r in rows]}


@app.get("/api/tg/leads")
async def get_tg_leads(min_messages: int = 30):
    import sys
    sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
    from tg_parser import get_qualified_leads
    return {"leads": get_qualified_leads(min_messages)}


@app.post("/api/tg/start")
async def start_tg_monitoring():
    """Start Telegram monitoring in background."""
    import subprocess, threading
    configuration_error = _telegram_configuration_error()
    if configuration_error:
        raise HTTPException(400, configuration_error)
    if _telegram_parser_running():
        raise HTTPException(409, "Telegram parser is already running")
    def run():
        subprocess.Popen(
            ["/root/karty-lab/venv/bin/python3", "/root/karty-lab/karty-core/karty-lab-code/tg_parser.py", "--mode", "monitor"],
            stdout=open("/root/karty-lab/logs/tg_parser.log", "a"),
            stderr=subprocess.STDOUT
        )
    threading.Thread(target=run, daemon=True).start()
    return {"success": True, "message": "Telegram monitoring started"}


@app.post("/api/tg/scan")
async def tg_one_time_scan():
    """Run one-time scan of all chats."""
    import subprocess, threading
    configuration_error = _telegram_configuration_error()
    if configuration_error:
        raise HTTPException(400, configuration_error)
    if _telegram_parser_running():
        raise HTTPException(409, "Telegram parser is already running")
    def run():
        subprocess.Popen(
            ["/root/karty-lab/venv/bin/python3", "/root/karty-lab/karty-core/karty-lab-code/tg_parser.py", "--mode", "scan"],
            stdout=open("/root/karty-lab/logs/tg_parser.log", "a"),
            stderr=subprocess.STDOUT
        )
    threading.Thread(target=run, daemon=True).start()
    return {"success": True, "message": "One-time scan started"}


# ── Delete listing from platform ──

async def _delete_listing_isolated(data: dict):
    listing_id = data.get("listing_id")
    platforms = data.get("platforms", [])
    if not listing_id or not platforms:
        return {"success": False, "error": "listing_id and platforms required"}
    user_id = data.get("user_id")
    if not user_id:
        return {"success": False, "error": "user_id is required"}
    platform_map = {"ssge": "ss_ge", "korter": "korter_ge", "myhome": "myhome_ge"}
    listing_urls = data.get("listing_urls") or {}
    results = {}
    for platform in platforms:
        site_key = platform_map.get(platform, platform)
        listing_url = listing_urls.get(platform) or data.get("listing_url", "")
        if not listing_url:
            results[platform] = {"success": False, "error": "listing URL is missing"}
            continue
        request = json.dumps({"user_id": user_id, "site_key": site_key, "url": listing_url}, ensure_ascii=False)
        env = {
            "HOME": "/root",
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "PATH": "/root/karty-lab/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "PYTHONPATH": "/root/karty-lab",
            "PYTHONUNBUFFERED": "1",
            "PUBLISH_HEADLESS": os.getenv("PUBLISH_HEADLESS", "false"),
        }
        try:
            process = await asyncio.create_subprocess_exec(
                "xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x900x24",
                "/root/karty-lab/venv/bin/python3", "-m", "api.delete_worker",
                cwd="/root/karty-lab", env=env, stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(request.encode()), timeout=180)
            except asyncio.TimeoutError as exc:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                raise RuntimeError("Delete worker timed out after 180 seconds") from exc
            if stderr:
                print(f"[delete worker] {stderr.decode(errors='replace')[-2000:]}", flush=True)
            line = next((item.strip() for item in stdout.decode(errors="replace").splitlines() if item.strip().startswith("{")), "")
            if process.returncode != 0 or not line:
                raise RuntimeError(f"Delete worker exited with code {process.returncode}")
            results[platform] = json.loads(line)
        except Exception as exc:
            results[platform] = {"success": False, "url": listing_url, "error": str(exc)[:300]}
    return {"success": bool(results) and all(item.get("success") for item in results.values()), "results": results}

@app.post("/api/listings/delete")
async def delete_listing(data: dict):
    """Delete a listing from one or more platforms."""
    return await _delete_listing_isolated(data)
    import sys
    sys.path.insert(0, "/root/karty-lab")
    from api.publisher import _get_site_class, get_cookies, has_cookies, _build_cookies_for_context, get_storage_state
    
    listing_id = data.get("listing_id")
    platforms = data.get("platforms", [])
    
    if not listing_id or not platforms:
        return {"success": False, "error": "listing_id and platforms required"}
    
    # Map platform names to site keys
    PLATFORM_MAP = {"ssge": "ss_ge", "korter": "korter_ge", "myhome": "myhome_ge"}
    user_id = data.get("user_id")
    listing_urls = data.get("listing_urls") or {}
    if not user_id:
        return {"success": False, "error": "user_id is required"}
    
    results = {}
    for platform in platforms:
        try:
            site_key = PLATFORM_MAP.get(platform, platform)
            site_class = _get_site_class(site_key)
            site = site_class()
            
            from playwright.async_api import async_playwright
            pw = await async_playwright().start()
            site.browser = await pw.chromium.launch(
                headless=False,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                    "--use-gl=angle",
                    "--use-angle=swiftshader",
                    "--enable-unsafe-webgpu",
                    "--disable-gpu-sandbox",
                ],
            )
            
            user_cookies = get_cookies(user_id, site_key)
            storage_state = get_storage_state(user_id, site_key)
            
            if storage_state:
                site.context = await site.browser.new_context(
                    storage_state=storage_state,
                    viewport={"width": 1280, "height": 900},
                    locale="ru-RU",
                    timezone_id="Asia/Tbilisi",
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                )
            else:
                site.context = await site.browser.new_context(
                    viewport={"width": 1280, "height": 900},
                    locale="ru-RU",
                    timezone_id="Asia/Tbilisi",
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                )
                cookies_to_load = _build_cookies_for_context(user_cookies, site_key)
                if cookies_to_load:
                    await site.context.add_cookies(cookies_to_load)
            
            site.page = await site.context.new_page()
            
            listing_url = listing_urls.get(platform) or data.get("listing_url", "")
            if not listing_url:
                results[platform] = {"success": False, "error": "listing URL is missing"}
            else:
                success = await site._delete_listing(listing_url)
                results[platform] = {"success": success, "url": listing_url}
            
            await site.context.close()
            await site.browser.close()
            await pw.stop()
        except Exception as e:
            results[platform] = {"success": False, "error": str(e)[:200]}
    
    return {"success": bool(results) and all(item.get("success") for item in results.values()), "results": results}


@app.post("/api/listings/republish")
async def republish_listing(data: dict):
    """Republish a listing: delete then publish again."""
    listing_id = data.get("listing_id")
    platforms = data.get("platforms", [])
    listing_data = data.get("listing_data", {})
    
    if not listing_id or not platforms:
        return {"success": False, "error": "listing_id and platforms required"}
    
    # Step 1: Delete
    delete_result = await delete_listing({"listing_id": listing_id, "user_id": listing_data.get("user_id", ""), "platforms": platforms, "listing_urls": listing_data.get("listing_urls", {}), "listing_url": listing_data.get("listing_url", "")})
    if not delete_result.get("success"):
        return {"success": False, "delete": delete_result, "publish": {}}

    # Step 2: Re-publish
    publish_results = {}
    for platform in platforms:
        try:
            import sys
            sys.path.insert(0, "/root/karty-lab")
            sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
            from api.publisher import publish_to_sites
            site_key = {"ssge": "ss_ge", "korter": "korter_ge", "myhome": "myhome_ge"}.get(platform, platform)
            result = await publish_to_sites(
                user_id=listing_data.get("user_id", ""),
                sites=[site_key],
                listing=listing_data,
            )
            publish_results[platform] = result.get(site_key, {"status": "failed", "error": "No site result"})
        except Exception as e:
            publish_results[platform] = {"success": False, "error": str(e)[:100]}
    
    return {"success": bool(delete_result.get("success")), "delete": delete_result, "publish": publish_results}
