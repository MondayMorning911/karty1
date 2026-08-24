import asyncio
import httpx
import json
import os
from pathlib import Path

from api.cookie_manager import get_cookies, has_cookies, get_storage_state

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


def _get_site_class(site_name: str):
    dotpath = SITE_CLASSES[site_name]
    module_path, class_name = dotpath.rsplit(".", 1)
    import importlib
    mod = importlib.import_module(module_path)
    return getattr(mod, class_name)


async def _download_photos(photo_urls: list[str], user_id: str) -> list[str]:
    """Download photos from URLs or use local paths. Returns local file paths."""
    paths = []
    for url in photo_urls:
        if url.startswith("/") and os.path.exists(url):
            paths.append(url)
            continue
        try:
            upload_dir = Path("/root/karty-lab/uploads") / user_id
            upload_dir.mkdir(parents=True, exist_ok=True)
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url)
                resp.raise_for_status()
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
        return {"status": "failed", "error": f"Cookies not found for {site_name}"}

    site_class = _get_site_class(site_name)
    site = site_class()

    user_cookies = get_cookies(user_id, site_name)
    storage_state = get_storage_state(user_id, site_name)

    original_launch = site._launch

    async def patched_launch():
        from playwright.async_api import async_playwright
        site._pw = await async_playwright().start()
        site.browser = await site._pw.chromium.launch(
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

        # Use storage_state if available (korter requires this), else use cookies
        if storage_state:
            site.context = await site.browser.new_context(
                storage_state=storage_state,
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            )
        else:
            site.context = await site.browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            )
            cookies_to_load = _build_cookies_for_context(user_cookies, site_name)
            if cookies_to_load:
                await site.context.add_cookies(cookies_to_load)

        site.page = await site.context.new_page()

    site._launch = patched_launch

    async def no_delete(url):
        return True
    site._delete_listing = no_delete

    try:
        result = await site.publish(listing)
        return {
            "status": "success" if result.get("success") else "failed",
            "url": result.get("url", ""),
            "error": result.get("error", ""),
        }
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        try:
            await site._close()
        except Exception:
            pass


async def publish_to_sites(user_id: str, sites: list[str], listing: dict) -> dict:
    """Publish to multiple sites in parallel. Returns results per site."""
    photo_urls = listing.pop("photo_urls", [])
    if photo_urls:
        local_photos = await _download_photos(photo_urls, user_id)
        listing["photos"] = local_photos
    else:
        listing["photos"] = []

    results = {}
    for site in sites:
        results[site] = await publish_to_site(site, user_id, dict(listing))

    upload_dir = Path("/root/karty-lab/uploads") / user_id
    if upload_dir.exists():
        for f in upload_dir.iterdir():
            f.unlink()
        upload_dir.rmdir()

    return results
