"""Base parser class for real estate sites. Uses Playwright Chromium."""
import asyncio
import random
import logging
from pathlib import Path
from playwright.async_api import async_playwright

SCREENSHOTS_DIR = Path("/root/karty-lab/screenshots/parser")
LOGS_DIR = Path("/root/karty-lab/logs/parser")


class BaseParser:
    name = "base"
    source_key = "base"

    def __init__(self):
        self.log = logging.getLogger(f"parser.{self.name}")
        self.pw = None
        self.browser = None
        self.context = None
        self.page = None
        self._cookies_path = None
        self._headless = True
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        LOGS_DIR.mkdir(parents=True, exist_ok=True)

    async def launch(self, cookies_path: str = None, headless: bool = True):
        self._cookies_path = cookies_path
        self._headless = headless
        import os
        for var in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']:
            os.environ.pop(var, None)

        self.pw = await async_playwright().start()
        self.browser = await self.pw.chromium.launch(
            headless=headless,
            args=[
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--use-gl=angle',
                '--use-angle=swiftshader',
            ]
        )
        self.context = await self.browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
        if cookies_path and Path(cookies_path).exists():
            import json
            with open(cookies_path) as f:
                raw = json.load(f)
            domain_map = {"ssge": ["ss.ge"], "myhome": ["myhome.ge", "tnet.ge"], "korter": ["korter.ge"]}
            valid_domains = domain_map.get(self.source_key, [])
            cookies = []
            for c in raw:
                domain = c.get("domain", "")
                if valid_domains and not any(d in domain for d in valid_domains):
                    continue
                entry = {"name": c.get("name", ""), "value": c.get("value", ""), "domain": domain, "path": c.get("path", "/")}
                expires = c.get("expirationDate") or c.get("expires")
                if isinstance(expires, (int, float)) and expires > 0:
                    entry["expires"] = expires
                ss = c.get("sameSite", "Lax")
                if ss in ("Strict", "Lax"):
                    entry["sameSite"] = ss
                else:
                    entry["sameSite"] = "None"
                    entry["secure"] = True
                if c.get("secure"):
                    entry["secure"] = True
                if c.get("httpOnly"):
                    entry["httpOnly"] = True
                cookies.append(entry)
            try:
                await self.context.add_cookies(cookies)
                self.log.info(f"Loaded {len(cookies)} cookies")
            except Exception as e:
                self.log.warning(f"Cookie load failed: {e}")
        self.page = await self.context.new_page()
        self.log.info(f"Playwright Chromium launched for {self.name}")

    async def relaunch(self, cookies_path: str = None, headless: bool = True):
        """Recreate browser after crash. Destroys old, launches new."""
        self.log.warning("Relaunching browser...")
        cp = cookies_path or self._cookies_path
        hl = headless if headless is not None else self._headless
        await self.close()
        await asyncio.sleep(2)
        await self.launch(cp, hl)
        self.log.info("Browser relaunched successfully")

    async def close(self):
        for obj in [self.page, self.context, self.browser]:
            try:
                if obj:
                    await obj.close()
            except:
                pass
        self.page = self.context = self.browser = None
        try:
            if self.pw:
                await self.pw.stop()
        except:
            pass
        self.pw = None

    async def screenshot(self, label: str) -> str:
        path = str(SCREENSHOTS_DIR / f"{self.source_key}_{label}.png")
        try:
            await self.page.screenshot(path=path, full_page=False)
            return path
        except Exception as e:
            self.log.warning(f"Screenshot failed: {e}")
            return ""

    async def human_delay(self, min_s=2, max_s=5):
        await asyncio.sleep(random.uniform(min_s, max_s))

    async def human_scroll(self):
        for _ in range(random.randint(2, 4)):
            await self.page.evaluate(f"window.scrollBy(0, {random.randint(300, 700)})")
            await asyncio.sleep(random.uniform(0.3, 0.7))

    async def get_listing_author(self, listing_url: str) -> dict | None:
        raise NotImplementedError

    async def get_author_profile(self, profile_url: str) -> dict | None:
        raise NotImplementedError
