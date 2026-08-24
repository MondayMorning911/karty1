import asyncio
import traceback
from camoufox.async_api import AsyncCamoufox
from playwright.async_api import Page
from utils.cookies import load_cookies, cookies_to_playwright
from utils.browser import load_selectors
from utils.logger import setup_logger, screenshot_path
from config import HEADLESS, TIMEOUT


class BaseSite:
    name: str = ""
    base_url: str = ""

    def __init__(self):
        self.log = setup_logger(self.name)
        self.selectors = {}
        self.page: Page | None = None
        self.browser = None
        self.context = None

    async def _launch(self):
        self._cm = AsyncCamoufox(headless=HEADLESS)
        self.browser = await self._cm.start()
        await asyncio.sleep(5)
        self.context = await self.browser.new_context(viewport={"width": 1280, "height": 900})
        try:
            cookies = load_cookies(self.name)
            await self.context.add_cookies(cookies_to_playwright(cookies))
        except Exception as e:
            self.log.warning(f"Cookies load failed: {e}")
        self.page = await self.context.new_page()
        self.log.info(f"Browser launched for {self.name}")

    async def _close(self):
        import subprocess
        try:
            if self.page:
                await self.page.close()
        except Exception:
            pass
        self.page = None
        try:
            if self.context:
                await self.context.close()
        except Exception:
            pass
        self.context = None
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass
        self.browser = None
        try:
            if hasattr(self, '_cm') and self._cm:
                await self._cm.stop()
        except Exception:
            pass
        self._cm = None
        await asyncio.sleep(1)
        subprocess.run(["pkill", "-9", "-f", "firefox"], capture_output=True)
        subprocess.run(["pkill", "-9", "-f", "camoufox"], capture_output=True)
        await asyncio.sleep(2)

    async def _screenshot(self, label: str) -> str:
        try:
            path = screenshot_path(self.name, "", "", label)
            await self.page.screenshot(path=path, full_page=True)
            self.log.info(f"Screenshot: {path}")
            return path
        except Exception as e:
            self.log.warning(f"Screenshot failed: {e}")
            return ""

    async def _verify_auth(self) -> bool:
        return True

    async def _navigate_to_add(self, deal: str, type_: str):
        raise NotImplementedError

    async def _select_deal(self, deal: str, prop_type: str = ""):
        raise NotImplementedError

    async def _select_type(self, type_: str):
        raise NotImplementedError

    async def _fill_fields(self, listing: dict):
        raise NotImplementedError

    async def _upload_photos(self, photos: list[str]):
        raise NotImplementedError

    async def _publish(self) -> str:
        raise NotImplementedError

    async def _find_listing_url(self) -> str:
        raise NotImplementedError

    async def _delete_listing(self, url: str) -> bool:
        raise NotImplementedError

    async def _check_listing_alive(self, url: str) -> bool:
        raise NotImplementedError

    async def publish(self, listing: dict) -> dict:
        deal = listing.get("deal", "sale")
        type_ = listing.get("type", "apartment")
        result = {"success": False, "site": self.name, "deal": deal, "type": type_}

        for launch_attempt in range(3):
            try:
                await self._launch()
                self.selectors = load_selectors(self.name)

                self.log.info(f"Checking auth on {self.base_url}...")
                await self.page.goto(self.base_url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(8)
                if not await self._verify_auth():
                    await self._screenshot("auth_failed")
                    result["error"] = "Authentication failed"
                    return result
                break
            except Exception as e:
                self.log.warning(f"Launch attempt {launch_attempt+1} failed: {e}")
                try:
                    await self._close()
                except Exception:
                    pass
                if launch_attempt < 2:
                    import subprocess
                    subprocess.run(["pkill", "-9", "-f", "firefox"], capture_output=True)
                    subprocess.run(["pkill", "-9", "-f", "camoufox"], capture_output=True)
                    await asyncio.sleep(5)
                else:
                    result["error"] = f"Failed to launch after 3 attempts: {e}"
                    return result

        try:
            self.log.info(f"Navigating to add listing page...")
            await self._navigate_to_add(deal, type_)
            await asyncio.sleep(3)

            self.log.info(f"Selecting deal={deal}...")
            await self._select_deal(deal)
            await asyncio.sleep(2)

            self.log.info(f"Selecting type={type_}...")
            await self._select_type(type_)
            await asyncio.sleep(2)

            subtype = listing.get("subtype", "")
            if not subtype and type_ == "house":
                subtype = listing.get("house", {}).get("subtype", "Частный дом") if isinstance(listing.get("house"), dict) else "Частный дом"
            if not subtype and type_ == "commercial":
                subtype = listing.get("commercial", {}).get("subtype", "Коммерческое помещение") if isinstance(listing.get("commercial"), dict) else "Коммерческое помещение"
            if subtype:
                self.log.info(f"Selecting subtype={subtype}...")
                await self._select_subtype(type_, subtype)
                await asyncio.sleep(2)
            await self._select_deal(deal, type_)
            await asyncio.sleep(2)

            self.log.info("Filling fields...")
            await self._fill_fields(listing)
            await asyncio.sleep(1)

            self.log.info("Uploading photos...")
            await self._upload_photos(listing.get("photos", []))
            await asyncio.sleep(2)

            filled_path = await self._screenshot("filled")
            result["screenshot_filled"] = filled_path

            self.log.info("Publishing...")
            listing_url = await self._publish()

            if listing_url:
                result["success"] = True
                result["url"] = listing_url
                self.log.info(f"Published: {listing_url}")
            else:
                result["error"] = "No listing URL found after publish"
                return result

            self.log.info("Waiting 10s then verifying listing is alive...")
            await asyncio.sleep(10)
            alive = False
            try:
                alive = await self._check_listing_alive(listing_url)
            except Exception as e:
                self.log.warning(f"Alive check failed: {e}")
            result["alive_after_publish"] = alive

            try:
                await self._screenshot("published")
            except Exception:
                self.log.warning("Screenshot after publish failed")

            self.log.info("Publish complete (delete disabled)")
            result["deleted"] = False

            return result

        except Exception as e:
            self.log.error(f"Error: {traceback.format_exc()}")
            try:
                await self._screenshot("error")
            except Exception:
                pass
            result["error"] = str(e)
            return result

        finally:
            await self._close()
