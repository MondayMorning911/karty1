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

    async def _check_balance(self) -> str:
        """Return a user-facing error when the portal balance blocks publishing."""
        return ""

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

    async def _recover_submitted_url(self) -> str:
        """Recover a URL when submit succeeded but response parsing failed."""
        try:
            candidate = self.page.url if self.page else ""
            if not candidate.startswith("http"):
                return ""
            lowered = candidate.lower()
            if any(marker in lowered for marker in ("login", "signin", "/add", "/create", "/profile", "/help", "/error", "/auth", "checkout", "draft")):
                return ""
            if await self._check_listing_alive(candidate):
                return candidate
        except Exception:
            pass
        try:
            recovered = await self._find_recent_listing_url(self._active_listing)
            if recovered and await self._check_listing_alive(recovered):
                return recovered
        except Exception as exc:
            self.log.warning(f"Recent listing lookup failed: {exc}")
        return ""

    async def _find_recent_listing_url(self, listing: dict) -> str:
        """Optional site-specific lookup after an ambiguous submit."""
        return ""

    async def _is_bot_protection_page(self) -> bool:
        try:
            text = (await self.page.locator("body").inner_text()).lower()
            return any(marker in text for marker in (
                "cloudflare", "turnstile", "verify you are human", "checking your browser", "captcha", "access denied"
            ))
        except Exception:
            return False

    async def publish(self, listing: dict) -> dict:
        deal = listing.get("deal", "sale")
        type_ = listing.get("type", "apartment")
        result = {"success": False, "site": self.name, "deal": deal, "type": type_}
        self._active_listing = listing
        self._submit_clicked = False

        for launch_attempt in range(3):
            try:
                await self._launch()
                self.selectors = load_selectors(self.name)

                self.log.info(f"Checking auth on {self.base_url}...")
                await self.page.goto(self.base_url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(8)
                if await self._is_bot_protection_page():
                    result["error"] = "BOT_PROTECTION: site security challenge detected"
                    result["stage"] = "auth"
                    return result
                if not await self._verify_auth():
                    await self._screenshot("auth_failed")
                    result["error"] = "Authentication failed"
                    result["stage"] = "auth"
                    return result
                balance_error = await self._check_balance()
                if balance_error:
                    result["error"] = balance_error
                    result["stage"] = "balance_precheck"
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
            result["stage"] = "navigation"
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

            result["stage"] = "form"
            self.log.info("Filling fields...")
            await self._fill_fields(listing)
            await asyncio.sleep(1)

            if hasattr(self, "_handle_map_pin"):
                await self._handle_map_pin()
                await asyncio.sleep(1)

            result["stage"] = "photos"
            self.log.info("Uploading photos...")
            await self._upload_photos(listing.get("photos", []))
            await asyncio.sleep(2)

            filled_path = await self._screenshot("filled")
            result["screenshot_filled"] = filled_path

            result["stage"] = "submit_precheck"
            self.log.info("Publishing...")
            listing_url = await self._publish()

            if listing_url:
                result["stage"] = "submit"
                result["success"] = True
                result["url"] = listing_url
                self.log.info(f"Published: {listing_url}")
            else:
                result["stage"] = "submit" if self._submit_clicked else "submit_precheck"
                recovered_url = await self._recover_submitted_url()
                if recovered_url:
                    result["success"] = True
                    result["url"] = recovered_url
                    result["alive_after_publish"] = True
                    result["stage"] = "verification_recovered"
                    return result
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
            if not alive:
                result["success"] = False
                result["stage"] = "verification"
                result["error"] = "Listing URL found but listing is not alive/verified"
                return result

            try:
                await self._screenshot("published")
            except Exception:
                self.log.warning("Screenshot after publish failed")

            self.log.info("Publish complete (delete disabled)")
            result["deleted"] = False

            return result

        except Exception as e:
            self.log.error(f"Error: {traceback.format_exc()}")
            error_text = str(e).lower()
            recovery_blocked = any(marker in error_text for marker in (
                "balance", "недостаточно", "insufficient", "payment", "оплат",
                "authentication", "cookie", "captcha", "cloudflare", "validation",
            ))
            if result.get("stage") in {"submit", "submit_precheck"} and not recovery_blocked:
                recovered_url = await self._recover_submitted_url()
                if recovered_url:
                    result["success"] = True
                    result["url"] = recovered_url
                    result["alive_after_publish"] = True
                    result["stage"] = "verification_recovered"
                    return result
            try:
                result["screenshot_error"] = await self._screenshot("error")
            except Exception:
                pass
            result["error"] = str(e)
            if self._submit_clicked:
                result["stage"] = "submit"
            result["stage"] = result.get("stage", "form_or_publish")
            return result

        finally:
            await self._close()
