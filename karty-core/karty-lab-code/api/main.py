import asyncio
import uuid
import subprocess
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
from api.publisher import publish_to_sites
from api.cookie_manager import save_cookies, save_storage_state

app = FastAPI(title="Karty Publisher API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory task storage
tasks: dict[str, dict] = {}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/cookies/{user_id}/{site}")
async def upload_cookies(user_id: str, site: str, cookies: list[dict]):
    """Save cookies for a user+site after authentication."""
    valid_sites = ["ss_ge", "myhome_ge", "korter_ge"]
    if site not in valid_sites:
        raise HTTPException(400, f"Invalid site. Must be one of: {valid_sites}")
    save_cookies(user_id, site, cookies)
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
    save_storage_state(user_id, site, state)
    cookies_count = len(state.get("cookies", []))
    origins_count = len(state.get("origins", []))
    return {
        "status": "ok",
        "user_id": user_id,
        "site": site,
        "cookies": cookies_count,
        "origins": origins_count,
    }


@app.post("/api/publish", response_model=PublishResponse)
async def start_publish(req: PublishRequest):
    """Start publishing listing to specified sites. Returns task_id for polling."""
    valid_sites = {"ss_ge", "myhome_ge", "korter_ge"}
    invalid = set(req.sites) - valid_sites
    if invalid:
        raise HTTPException(400, f"Invalid sites: {invalid}")

    task_id = str(uuid.uuid4())[:8]
    tasks[task_id] = {
        "status": "processing",
        "results": {s: {"status": "pending"} for s in req.sites},
    }

    # Launch background task
    asyncio.create_task(_run_publish(task_id, req))

    return PublishResponse(task_id=task_id, status="processing")


async def _run_publish(task_id: str, req: PublishRequest):
    """Background task that runs the actual publishing."""
    try:
        results = await publish_to_sites(
            user_id=req.user_id,
            sites=req.sites,
            listing=req.listing.model_dump(),
        )
        tasks[task_id]["results"] = results
        tasks[task_id]["status"] = "completed"
    except Exception as e:
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)


@app.get("/api/publish/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """Check publishing task status."""
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    task = tasks[task_id]
    results = {}
    for site, data in task["results"].items():
        results[site] = SiteResult(**data)
    return TaskStatus(task_id=task_id, status=task["status"], results=results)


# ── Parser endpoints ──

parse_tasks: dict[str, dict] = {}


@app.post("/api/parse", response_model=ParseResponse)
async def start_parse(req: ParseRequest):
    """Start realtor parsing. Returns task_id for polling."""
    valid_sites = {"korter", "ssge"}
    invalid = set(req.sites) - valid_sites
    if invalid:
        raise HTTPException(400, f"Invalid sites: {invalid}. Must be one of: {valid_sites}")

    task_id = str(uuid.uuid4())[:8]
    parse_tasks[task_id] = {
        "status": "processing",
        "realtors_found": 0,
        "total_in_db": 0,
        "by_source": {},
        "error": "",
    }

    asyncio.create_task(_run_parse(task_id, req))

    return ParseResponse(task_id=task_id)


async def _run_parse(task_id: str, req: ParseRequest):
    """Background task that runs the parser in a thread to avoid event loop blocking."""
    import functools
    import os
    os.environ["DISPLAY"] = os.environ.get("DISPLAY", ":99")

    def _blocking_parse():
        import asyncio, sys
        sys.path.insert(0, "/root/karty-lab/karty-core/karty-lab-code")
        from realtor_parser import parse_site
        from db import init_db, get_stats

        init_db()
        results = {}
        for site in req.sites:
            try:
                count = asyncio.run(parse_site(site, mode=req.mode))
                results[site] = count
            except Exception as e:
                results[site] = str(e)

        stats = get_stats()
        return {
            "status": "completed",
            "realtors_found": sum(v for v in results.values() if isinstance(v, int)),
            "total_in_db": stats["total"],
            "by_source": stats["by_source"],
        }

    try:
        loop = asyncio.get_event_loop()
        data = await asyncio.wait_for(
            loop.run_in_executor(None, _blocking_parse),
            timeout=1800,
        )
        parse_tasks[task_id]["status"] = data.get("status", "completed")
        parse_tasks[task_id]["realtors_found"] = data.get("realtors_found", 0)
        parse_tasks[task_id]["total_in_db"] = data.get("total_in_db", 0)
        parse_tasks[task_id]["by_source"] = data.get("by_source", {})
    except asyncio.TimeoutError:
        parse_tasks[task_id]["status"] = "failed"
        parse_tasks[task_id]["error"] = "Parse timed out (30min)"
    except Exception as e:
        parse_tasks[task_id]["status"] = "failed"
        parse_tasks[task_id]["error"] = str(e)
    finally:
        pass


@app.get("/api/parse/{task_id}", response_model=ParseStatus)
async def get_parse_status(task_id: str):
    """Check parsing task status."""
    if task_id not in parse_tasks:
        raise HTTPException(404, "Parse task not found")
    t = parse_tasks[task_id]
    return ParseStatus(
        task_id=task_id,
        status=t["status"],
        realtors_found=t["realtors_found"],
        total_in_db=t["total_in_db"],
        by_source=t["by_source"],
        error=t["error"],
    )


@app.get("/api/realtors")
async def list_realtors(source: str = "", min_listings: int = 0, limit: int = 50):
    """List realtors from DB with optional filters."""
    import sys
    sys.path.insert(0, "/root/karty-lab")
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
    sys.path.insert(0, "/root/karty-lab")
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
