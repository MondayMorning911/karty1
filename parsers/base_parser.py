"""Base parser class for real estate sites."""
import asyncio
import random
import logging
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

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
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        LOGS_DIR.mkdir(parents=True, exist_ok=True)

    async def launch(self, cookies_path: str = None, headless: bool = True):
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
        # Apply stealth evasions
        stealth = Stealth()
        await stealth.apply_stealth_async(self.context)
        if cookies_path and Path(cookies_path).exists():
            import json
            with open(cookies_path) as f:
                raw = json.load(f)
            # Map source key to domain patterns
            domain_map = {
                "ssge": ["ss.ge"],
                "myhome": ["myhome.ge"],
                "korter": ["korter.ge"],
            }
            valid_domains = domain_map.get(self.source_key, [])
            cookies = []
            for c in raw:
                domain = c.get("domain", "")
                # Accept if any valid domain pattern is in the cookie domain
                if valid_domains and not any(d in domain for d in valid_domains):
                    continue
                entry = {
                    "name": c.get("name", ""),
                    "value": c.get("value", ""),
                    "domain": domain,
                    "path": c.get("path", "/"),
                }
                if "expirationDate" in c:
                    entry["expires"] = c["expirationDate"]
                ss = c.get("sameSite", "Lax")
                if ss in ("Strict", "Lax"):
                    entry["sameSite"] = ss
                else:
                    entry["sameSite"] = "None"
                    entry["secure"] = True
                cookies.append(entry)
            try:
                await self.context.add_cookies(cookies)
                self.log.info(f"Loaded {len(cookies)} cookies")
            except Exception as e:
                self.log.warning(f"Cookie load failed: {e}. Trying one by one...")
                loaded = 0
                for cookie in cookies:
                    try:
                        await self.context.add_cookies([cookie])
                        loaded += 1
                    except Exception:
                        pass
                self.log.info(f"Loaded {loaded}/{len(cookies)} cookies individually")
        self.page = await self.context.new_page()
        self.log.info(f"Browser launched for {self.name}")

    async def close(self):
        for obj in [self.page, self.context, self.browser]:
            try:
                if obj:
                    await obj.close()
            except Exception:
                pass
        self.page = self.context = self.browser = None
        try:
            if self.pw:
                await self.pw.stop()
        except Exception:
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

    async def human_delay(self, min_s=3, max_s=7):
        delay = random.uniform(min_s, max_s)
        await asyncio.sleep(delay)

    async def human_scroll(self):
        for _ in range(random.randint(2, 5)):
            scroll = random.randint(300, 800)
            await self.page.evaluate(f"window.scrollBy(0, {scroll})")
            await asyncio.sleep(random.uniform(0.3, 0.8))

    async def parse_listings(self, urls: list[str]) -> list[dict]:
        raise NotImplementedError

    async def get_listing_author(self, listing_url: str) -> dict | None:
        raise NotImplementedError

    async def get_author_profile(self, profile_url: str) -> dict | None:
        raise NotImplementedError

    @staticmethod
    def clean_name(raw: str) -> str:
        """Clean realtor name: keep only name or agency name."""
        import re
        name = raw.strip()
        
        # Remove common junk patterns
        junk = [
            'Все объявления пользователя', 'объявления пользователя',
            'РиелторРиелтор', 'Риелтор агентства', 'Риелтор',
            'Агент', 'Агентство', 'Агентства', 'Agent',
            'Premium Real', 'Real Estate', 'Property', 'Estate',
            'Consultant', 'Consultants',
            'Available s', 'Available Estates',
            'Golden Key', 'Золотые ключи',
            'Premium Real Estate Consultant',
        ]
        for j in junk:
            name = name.replace(j, '')
        
        # Remove emojis and unicode decorations
        name = re.sub(r'[✨🏠🏢🔷💎🏆⭐🔥💡🎯]', '', name)
        name = re.sub(r'\(\d+\)', '', name)  # (1), (15) etc
        name = re.sub(r'\|', '', name)  # pipe separators
        name = re.sub(r'\s+', ' ', name).strip()
        
        # Remove trailing "Риелтор"/"Агент" variants
        for suffix in ['Риелтор', 'Агент', 'Agent']:
            if name.endswith(suffix):
                name = name[:-len(suffix)].strip()
        
        return name if name else raw.strip()

    async def run(self, urls: list[str]) -> list[dict]:
        """Parse listings and extract realtor info."""
        results = []
        for url in urls:
            try:
                await self.human_delay()
                author = await self.get_listing_author(url)
                if not author or not author.get("phone"):
                    self.log.warning(f"No author/phone for {url}")
                    continue
                phone = author["phone"]
                self.log.info(f"Found author: {author.get('name', 'unknown')} ({phone})")

                if author.get("profile_url"):
                    await self.human_delay()
                    profile = await self.get_author_profile(author["profile_url"])
                    if profile and profile.get("listings_count", 0) > 15:
                        clean = self.clean_name(profile.get("name", author.get("name", "")))
                        results.append({
                            "phone": phone,
                            "name": clean,
                            "listing_url": url,
                            "profile_url": author["profile_url"],
                            "listings_count": profile["listings_count"],
                        })
                        self.log.info(f"Realtor found: {clean} ({phone}) - {profile['listings_count']} listings")
                    else:
                        self.log.info(f"Not a realtor: {phone} ({profile.get('listings_count', 0) if profile else 0} listings)")
                else:
                    self.log.warning(f"No profile URL for {phone}")
            except Exception as e:
                self.log.error(f"Error parsing {url}: {e}")
            await self.human_delay()
        return results
