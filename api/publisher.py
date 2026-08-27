import asyncio
import base64
import httpx
import json
import os
import re
import ipaddress
import socket
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

from api.cookie_manager import get_cookies, has_cookies, get_storage_state, save_storage_state

import sys
sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
from db import get_connection as _get_db

SITE_CLASSES = {
    "ss_ge": "sites.ss_ge.SsGeSite",
    "myhome_ge": "sites.myhome_ge.MyhomeGeSite",
    "korter_ge": "sites.korter_ge.KorterGeSite",
}

SITE_DOMAINS = {
    "ss_ge": ["ss.ge"],
    "myhome_ge": ["myhome.ge"],
    "korter_ge": ["korter.ge"],
}

_AUTH_CACHE: dict[tuple[str, str], tuple[float, str]] = {}
AUTH_CACHE_TTL = 300  # in-memory fallback
PERSISTENT_CACHE_TTL = 900  # 15 min — survives restarts
_STALE_REFRESHING: set[tuple[str, str]] = set()  # guards against duplicate background refreshes


def _read_persistent_auth(user_id: str, site: str) -> dict | None:
    """Read cached auth status from SQLite."""
    conn = _get_db()
    row = conn.execute(
        "SELECT status, error, checked_at, expires_at FROM auth_status_cache WHERE user_id=? AND site=?",
        (user_id, site),
    ).fetchone()
    conn.close()
    if not row:
        return None
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    return {
        "status": row["status"],
        "error": row["error"] if row["error"] else None,
        "checked_at": row["checked_at"],
        "is_stale": now > row["expires_at"],
    }


def _write_persistent_auth(user_id: str, site: str, status: str, error: str | None = None):
    """Persist auth status to SQLite."""
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=PERSISTENT_CACHE_TTL)
    conn = _get_db()
    conn.execute(
        """INSERT OR REPLACE INTO auth_status_cache (user_id, site, status, error, checked_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (user_id, site, status, error or "", now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    conn.close()


async def _do_browser_auth_check(user_id: str, site_name: str) -> dict:
    """Launch browser and verify auth — the slow path."""
    site_class = _get_site_class(site_name)
    site = site_class()
    try:
        await _launch_authenticated_site(site, get_storage_state(user_id, site_name), get_cookies(user_id, site_name), site_name, headless=True)
        await site.page.goto(site.base_url, wait_until="domcontentloaded", timeout=45000)
        await asyncio.sleep(3)
        valid = await site._verify_auth()
        if valid:
            save_storage_state(user_id, site_name, await site.context.storage_state())
        status = "valid" if valid else "expired"
        _AUTH_CACHE[(user_id, site_name)] = (time.monotonic(), status)
        _write_persistent_auth(user_id, site_name, status)
        return {"status": status, "site": site_name}
    except Exception as exc:
        error_text = str(exc)
        transient = any(marker in error_text.lower() for marker in ("timeout", "timed out", "connection", "targetclosed", "browser"))
        status = "unknown" if transient else "expired"
        _write_persistent_auth(user_id, site_name, status, error_text)
        return {"status": status, "site": site_name, "error": error_text}
    finally:
        try:
            await site._close()
        except Exception:
            pass


async def check_site_auth(user_id: str, site_name: str) -> dict:
    """Verify that the stored browser state still authenticates on the site.

    Returns cached status instantly (stale-while-revalidate).
    Only launches a browser when cache is missing or expired.
    """
    if site_name not in SITE_CLASSES:
        return {"status": "unsupported", "site": site_name}
    if not has_cookies(user_id, site_name):
        return {"status": "missing", "site": site_name}

    # 1. In-memory cache (fastest)
    cache_key = (user_id, site_name)
    cached = _AUTH_CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < AUTH_CACHE_TTL:
        return {"status": cached[1], "site": site_name, "cached": True}

    # 2. Persistent SQLite cache (survives restarts)
    persistent = _read_persistent_auth(user_id, site_name)
    if persistent:
        if not persistent["is_stale"]:
            # Fresh cache — return immediately
            _AUTH_CACHE[cache_key] = (time.monotonic(), persistent["status"])
            return {"status": persistent["status"], "site": site_name, "cached": True}
        # Stale — return old value but trigger background refresh
        if cache_key not in _STALE_REFRESHING:
            _STALE_REFRESHING.add(cache_key)
            asyncio.create_task(_refresh_auth_background(user_id, site_name))
        return {"status": persistent["status"], "site": site_name, "cached": True, "stale": True}

    # 3. Cold cache — must do real browser check (first time only)
    return await _do_browser_auth_check(user_id, site_name)


async def _refresh_auth_background(user_id: str, site_name: str):
    """Background refresh of stale auth cache."""
    try:
        await _do_browser_auth_check(user_id, site_name)
    except Exception:
        pass
    finally:
        _STALE_REFRESHING.discard((user_id, site_name))


def classify_publish_error(error: str) -> tuple[str, str]:
    text = str(error or '').lower()
    if any(marker in text for marker in ('cloudflare', 'turnstile', 'captcha', 'verify you are human', 'access denied', 'bot protection')):
        return 'BOT_PROTECTION', 'Площадка временно недоступна — администратор уже уведомлён автоматически'
    if 'cookie' in text or 'authentication' in text or 'auth' in text:
        return 'AUTH_EXPIRED', 'Повторно войдите в аккаунт площадки'
    if 'balance' in text or 'баланс' in text or 'денег' in text:
        return 'BALANCE_ERROR', 'Пополните баланс площадки'
    if 'photo' in text or 'фото' in text or 'upload' in text:
        return 'PHOTO_UPLOAD_ERROR', 'Проверьте фотографии и повторите публикацию'
    if 'timeout' in text or 'timed out' in text:
        return 'PUBLISH_TIMEOUT', 'Повторите публикацию позже'
    if 'validation' in text or 'обязатель' in text or 'field' in text:
        return 'SITE_VALIDATION_ERROR', 'Проверьте обязательные поля объявления'
    if 'not alive' in text or 'not verified' in text or 'url' in text:
        return 'PUBLISH_NOT_VERIFIED', 'Объявление создано, но сайт не подтвердил его доступность. Проверьте раздел объектов перед повтором'
    if 'closed' in text or 'browser' in text or 'connection' in text:
        return 'BROWSER_TEMPORARY_ERROR', 'Повторите публикацию, браузер будет перезапущен'
    return 'UNKNOWN_PUBLISH_ERROR', 'Обратитесь в поддержку с этим Task ID'


def is_skyvern_fallback_eligible(error: str, stage: str = '') -> bool:
    """Only UI/browser failures may go to a second automation engine."""
    text = str(error or '').lower()
    if stage not in {"navigation", "form", "photos", "submit_precheck"}:
        return False
    blocked = ("authentication", "captcha", "balance", "cookie", "photo", "validation", "not alive")
    if any(marker in text for marker in blocked):
        return False
    return any(marker in text for marker in (
        "locator", "selector", "strict mode", "targetclosed", "browser", "connection", "timeout", "timed out", "no listing url"
    ))


def user_publish_message(site_name: str, code: str, error: str, action: str) -> str:
    site = {'ss_ge': 'SS.ge', 'korter_ge': 'Korter', 'myhome_ge': 'MyHome'}.get(site_name, site_name)
    if code == 'AUTH_EXPIRED':
        return f'Публикация на {site} не выполнена: сессия площадки отсутствует или истекла. Откройте раздел авторизации {site}, войдите в аккаунт и повторите публикацию.'
    if code == 'BALANCE_ERROR':
        return f'Публикация на {site} не выполнена: на балансе недостаточно средств. Пополните баланс площадки и повторите публикацию.'
    if code == 'PHOTO_UPLOAD_ERROR':
        return f'Публикация на {site} не выполнена: не удалось загрузить все фотографии. Проверьте фото и повторите публикацию.'
    if code == 'BOT_PROTECTION':
        return f'Публикация на {site} приостановлена: площадка включила проверку безопасности. Администратор уже уведомлён автоматически — проблема решается без вашего участия. Повторите попытку через несколько минут.'
    if code == 'SITE_VALIDATION_ERROR':
        return f'Публикация на {site} не выполнена: сайт отклонил обязательные поля. Проверьте данные объявления и повторите публикацию.'
    if code == 'PUBLISH_TIMEOUT':
        return f'Публикация на {site} заняла слишком много времени. Проверьте раздел объектов и повторите попытку через минуту.'
    if code == 'PUBLISH_NOT_VERIFIED':
        return f'Публикация на {site} не подтверждена: сайт не показал доступное объявление. Проверьте раздел объектов перед повторной попыткой.'
    return f'Публикация на {site} не выполнена из-за временной ошибки. Попробуйте ещё раз. Если ошибка повторится, обратитесь в поддержку.'


def _get_site_class(site_name: str):
    dotpath = SITE_CLASSES[site_name]
    module_path, class_name = dotpath.rsplit(".", 1)
    import importlib
    mod = importlib.import_module(module_path)
    return getattr(mod, class_name)


async def _download_photos(photo_urls: list[str], user_id: str, upload_key: str) -> list[str]:
    """Download photos from URLs or use local paths. Returns local file paths."""
    max_photo_bytes = 12 * 1024 * 1024
    allowed_local_roots = [Path("/root/karty-lab/uploads").resolve(), Path("/root/karty-lab/test_photos").resolve()]

    def public_http_url(value: str) -> bool:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        try:
            addresses = socket.getaddrinfo(parsed.hostname, None)
            return all(not ipaddress.ip_address(item[4][0]).is_private and not ipaddress.ip_address(item[4][0]).is_loopback and not ipaddress.ip_address(item[4][0]).is_link_local and not ipaddress.ip_address(item[4][0]).is_reserved for item in addresses)
        except (OSError, ValueError):
            return False

    paths = []
    for url in photo_urls:
        if url.startswith("/") and os.path.exists(url):
            local_path = Path(url).resolve()
            if any(local_path == root or root in local_path.parents for root in allowed_local_roots) and local_path.is_file() and local_path.stat().st_size <= max_photo_bytes:
                paths.append(str(local_path))
            else:
                print(f"Rejected local photo path: {url}", flush=True)
            continue
        try:
            upload_dir = Path("/root/karty-lab/uploads") / user_id / upload_key
            upload_dir.mkdir(parents=True, exist_ok=True)
            if url.startswith("data:"):
                header, encoded = url.split(",", 1)
                if len(encoded) > max_photo_bytes * 2:
                    raise ValueError("data photo exceeds 12 MB limit")
                mime = header.split(";", 1)[0].split(":", 1)[-1]
                ext = {"image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(mime, ".jpg")
                filepath = upload_dir / f"photo_{len(paths)}{ext}"
                filepath.write_bytes(base64.b64decode(encoded))
                paths.append(str(filepath))
                continue
            if not public_http_url(url):
                raise ValueError("photo URL must resolve to a public HTTP(S) address")
            async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                if len(resp.content) > max_photo_bytes:
                    raise ValueError("photo exceeds 12 MB limit")
                ext = ".jpg"
                ct = resp.headers.get("content-type", "")
                if "png" in ct:
                    ext = ".png"
                elif "webp" in ct:
                    ext = ".webp"
                filepath = upload_dir / f"photo_{len(paths)}{ext}"
                filepath.write_bytes(resp.content)
                paths.append(str(filepath))
        except Exception as e:
            print(f"Failed to download photo {url}: {e}")
    return paths


def _build_cookies_for_context(user_cookies: list[dict], site_name: str) -> list[dict]:
    """Convert browser-exported cookies to Playwright context format."""
    domains = SITE_DOMAINS.get(site_name, [])
    cookies_to_load = []
    for c in user_cookies:
        d = c.get("domain", "")
        if not any(dom in d for dom in domains):
            continue
        entry = {
            "name": c.get("name", ""),
            "value": c.get("value", ""),
            "domain": d,
            "path": c.get("path", "/"),
        }
        exp = c.get("expirationDate") or c.get("expires")
        if exp and isinstance(exp, (int, float)) and exp > 0:
            entry["expires"] = exp
        ss = c.get("sameSite", "Lax")
        if ss in ("Strict", "Lax"):
            entry["sameSite"] = ss
        else:
            entry["sameSite"] = "None"
        if c.get("secure", False):
            entry["secure"] = True
        if c.get("httpOnly", False):
            entry["httpOnly"] = True
        cookies_to_load.append(entry)
    return cookies_to_load


async def publish_to_site(site_name: str, user_id: str, listing: dict) -> dict:
    """Publish a listing to a single site. Returns result dict."""
    if not has_cookies(user_id, site_name):
        error = f"Cookies not found for {site_name}"
        code, action = classify_publish_error(error)
        return {"status": "failed", "stage": "auth_precheck", "error": error, "error_code": code, "user_action": action, "user_message": user_publish_message(site_name, code, error, action)}

    site_class = _get_site_class(site_name)
    site = site_class()

    if os.getenv("PUBLISH_AUTH_PREFLIGHT", "true").lower() == "true":
        auth = await check_site_auth(user_id, site_name)
        if auth.get("status") not in {"valid", "unknown"}:
            error = f"Authentication failed: {auth.get('status', 'unknown')}"
            code, action = classify_publish_error(error)
            return {"status": "failed", "stage": "auth_precheck", "error": error, "error_code": code, "user_action": action, "user_message": user_publish_message(site_name, code, error, action)}

    user_cookies = get_cookies(user_id, site_name)
    storage_state = get_storage_state(user_id, site_name)
    print(
        f"[publisher] pid={os.getpid()} site={site_name} auth files: "
        f"storage_state={bool(storage_state)} cookies={len(user_cookies)} "
        f"display={os.getenv('DISPLAY', '')} publish_headless={os.getenv('PUBLISH_HEADLESS', 'false')}",
        flush=True,
    )

    async def patched_launch():
        await _launch_authenticated_site(site, storage_state, user_cookies, site_name)

    site._launch = patched_launch

    async def no_delete(url):
        return True
    site._delete_listing = no_delete

    try:
        result = None
        for attempt in range(2):
            result = await site.publish(listing)
            if result.get("success"):
                break
            error_text = str(result.get("error", "")).lower()
            # Never repeat after submit or verification: the portal may have
            # accepted the listing even when URL capture failed.
            retryable = result.get("stage") not in {"submit", "verification"} and any(
                marker in error_text for marker in ("targetclosed", "browser", "timeout", "timed out", "connection", "failed to launch")
            )
            if not retryable or attempt == 1:
                break
            await asyncio.sleep(3)
        result = result or {"success": False, "error": "Publisher returned no result"}
        error = result.get("error", "")
        code, action = classify_publish_error(error)
        return {
            "status": "success" if result.get("success") else "failed",
            "url": result.get("url", ""),
            "error": error,
            "error_code": "" if result.get("success") else code,
            "user_action": "" if result.get("success") else action,
            "user_message": "" if result.get("success") else user_publish_message(site_name, code, error, action),
            "screenshot_error": result.get("screenshot_error", ""),
            "stage": result.get("stage", "completed" if result.get("success") else "publish"),
            "alive_after_publish": result.get("alive_after_publish"),
            "fallback_eligible": is_skyvern_fallback_eligible(error, result.get("stage", "")) if not result.get("success") else False,
        }
    except Exception as e:
        code, action = classify_publish_error(str(e))
        return {"status": "failed", "stage": "publisher_exception", "error": str(e), "error_code": code, "user_action": action, "user_message": user_publish_message(site_name, code, str(e), action), "fallback_eligible": False}
    finally:
        try:
            await site._close()
        except Exception:
            pass


async def publish_to_sites(user_id: str, sites: list[str], listing: dict, progress_callback=None) -> dict:
    """Publish to multiple sites in parallel. Returns results per site."""
    upload_key = str(listing.pop("_publish_task_id", "") or uuid.uuid4().hex)
    photo_urls = listing.pop("photo_urls", [])
    if not photo_urls:
        return {
            site: {
                "status": "failed",
                "stage": "preflight",
                "error": "At least one photo is required",
                "error_code": "SITE_VALIDATION_ERROR",
                "user_action": "Добавьте фотографии перед публикацией",
                "user_message": "Публикация не выполнена: добавьте хотя бы одну фотографию.",
            }
            for site in sites
        }
    if photo_urls:
        if "korter_ge" in sites and len(photo_urls) < 3:
            return {
                site: {
                    "status": "failed",
                    "stage": "preflight",
                    "error": "Korter requires at least 3 photos",
                    "error_code": "SITE_VALIDATION_ERROR",
                    "user_action": "Добавьте минимум 3 фотографии для Korter",
                    "user_message": "Публикация на Korter не выполнена: добавьте минимум 3 фотографии.",
                }
                for site in sites
            }
        local_photos = await _download_photos(photo_urls, user_id, upload_key)
        if len(local_photos) != len(photo_urls):
            error = f"Фото загружены не полностью: {len(local_photos)} из {len(photo_urls)}"
            return {
                site: {
                    "status": "failed",
                    "stage": "photo_download",
                    "error": error,
                    "error_code": "PHOTO_UPLOAD_ERROR",
                    "user_action": "Проверьте фотографии и повторите публикацию",
                    "user_message": "Не удалось подготовить все фотографии. Проверьте файлы и повторите публикацию.",
                }
                for site in sites
            }
        listing["photos"] = local_photos
    else:
        listing["photos"] = []

    results = {}
    for site in sites:
        if progress_callback:
            await progress_callback(site, {"status": "processing", "stage": "queued"})
        results[site] = await publish_to_site(site, user_id, dict(listing))
        if progress_callback:
            await progress_callback(site, results[site])

    upload_dir = Path("/root/karty-lab/uploads") / user_id / upload_key
    if upload_dir.exists():
        for f in upload_dir.iterdir():
            f.unlink()
        upload_dir.rmdir()
    user_upload_dir = upload_dir.parent
    if user_upload_dir.exists() and not any(user_upload_dir.iterdir()):
        user_upload_dir.rmdir()

    return results


async def _launch_authenticated_site(site, storage_state: dict | None, user_cookies: list[dict], site_name: str, headless: bool | None = None):
    """Launch the same authenticated context used by publishing and health checks."""
    from playwright.async_api import async_playwright

    if headless is None:
        headless = os.getenv("PUBLISH_HEADLESS", "false").lower() == "true"
    print(f"[publisher] launching chromium site={site_name} headless={headless}", flush=True)
    site._pw = await async_playwright().start()
    site.browser = await site._pw.chromium.launch(
        headless=headless,
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
    context_kwargs = {
        "viewport": {"width": 1280, "height": 900},
        "locale": "ru-RU",
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    }
    if storage_state:
        site.context = await site.browser.new_context(storage_state=storage_state, **context_kwargs)
    else:
        site.context = await site.browser.new_context(**context_kwargs)
        cookies_to_load = _build_cookies_for_context(user_cookies, site_name)
        if cookies_to_load:
            await site.context.add_cookies(cookies_to_load)
    site.page = await site.context.new_page()


async def check_site_preflight(user_id: str, site_name: str) -> dict:
    """Validate credentials and paid-site balance before creating a publish task."""
    result = {
        "site": site_name,
        "auth": "missing" if not has_cookies(user_id, site_name) else "unknown",
        "balance": {"checked": site_name not in {"ss_ge", "myhome_ge"}, "amount": None, "currency": "GEL"},
        "errors": [],
        "warnings": [],
    }
    if site_name not in SITE_CLASSES:
        result["auth"] = "unsupported"
        result["errors"].append("Площадка не поддерживается")
        return result
    if not has_cookies(user_id, site_name):
        result["errors"].append("Сессия площадки не найдена. Войдите в аккаунт заново.")
        return result

    site = _get_site_class(site_name)()
    try:
        await _launch_authenticated_site(site, get_storage_state(user_id, site_name), get_cookies(user_id, site_name), site_name, headless=True)
        await site.page.goto(site.base_url, wait_until="domcontentloaded", timeout=45000)
        await asyncio.sleep(3)
        if not await site._verify_auth():
            result["auth"] = "expired"
            result["errors"].append("Сессия площадки истекла. Войдите заново.")
            return result
        result["auth"] = "valid"
        if site_name in {"ss_ge", "myhome_ge"}:
            balance_error = ""
            balance_check = getattr(site, "_check_balance", None)
            if callable(balance_check):
                balance_error = await balance_check()
            else:
                balance_url = (
                    "https://home.ss.ge/ru/user/my-applications"
                    if site_name == "ss_ge"
                    else "https://statements.myhome.ge/ru/user-profile/my-statements?referrer=myhome"
                )
                await site.page.goto(balance_url, wait_until="domcontentloaded", timeout=45000)
                await asyncio.sleep(4)
            body = await site.page.locator("body").inner_text()
            match = re.search(r"Баланс\s*([\d\s,.]+)\s*₾", body, re.IGNORECASE)
            result["balance"]["checked"] = bool(match)
            if match:
                result["balance"]["amount"] = float(match.group(1).replace(" ", "").replace(",", "."))
            elif not balance_error:
                result["errors"].append("Не удалось проверить баланс площадки. Повторите попытку позже.")
            if balance_error:
                result["errors"].append("Недостаточный баланс площадки. Пополните баланс и повторите.")
    except Exception as exc:
        result["warnings"].append(f"Не удалось проверить площадку сейчас: {str(exc)[:180]}")
    finally:
        try:
            await site._close()
        except Exception:
            pass
    return result


async def check_promotion_preflight(user_id: str, site_name: str, listing_url: str | None = None) -> dict:
    """Inspect promotion controls without clicking or creating a paid order."""
    dashboard_urls = {
        "ss_ge": "https://home.ss.ge/ru/user/my-applications",
        "myhome_ge": "https://statements.myhome.ge/ru/user-profile/my-statements?referrer=myhome",
        "korter_ge": "https://korter.ge/ru/profile",
    }
    result = {
        "site": site_name,
        "auth": "missing" if not has_cookies(user_id, site_name) else "unknown",
        "balance": {"checked": False, "amount": None, "currency": "GEL"},
        "promotion_available": False,
        "promotion_controls": [],
        "dashboard_url": dashboard_urls.get(site_name),
        "errors": [],
    }
    if site_name not in SITE_CLASSES:
        result["auth"] = "unsupported"
        result["errors"].append("Площадка не поддерживается")
        return result
    if not has_cookies(user_id, site_name):
        result["errors"].append("Сессия площадки не найдена")
        return result

    site = _get_site_class(site_name)()
    try:
        await _launch_authenticated_site(site, get_storage_state(user_id, site_name), get_cookies(user_id, site_name), site_name, headless=True)
        await site.page.goto(dashboard_urls[site_name], wait_until="domcontentloaded", timeout=45000)
        await asyncio.sleep(3)
        if not await site._verify_auth():
            result["auth"] = "expired"
            result["errors"].append("Сессия площадки истекла")
            return result
        result["auth"] = "valid"
        result["promotion_controls"] = await site.page.evaluate("""() => {
            const terms = /(продвин|продвиж|поднять|увеличение просмотров|реклам|купить|boost|promot)/i;
            return [...document.querySelectorAll('a, button, [role="button"]')]
                .map(el => ({text: (el.innerText || el.textContent || '').trim(), href: el.href || ''}))
                .filter(item => item.text && terms.test(item.text))
                .slice(0, 30);
        }""")
        result["promotion_available"] = len(result["promotion_controls"]) > 0
        body = await site.page.locator("body").inner_text()
        match = re.search(r"Баланс\s*([\d\s,.]+)\s*₾", body, re.IGNORECASE)
        if match:
            result["balance"] = {"checked": True, "amount": float(match.group(1).replace(" ", "").replace(",", ".")), "currency": "GEL"}
    except Exception as exc:
        result["errors"].append(str(exc)[:240])
    finally:
        try:
            await site._close()
        except Exception:
            pass
    return result
