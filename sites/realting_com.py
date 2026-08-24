import asyncio
from sites.base import BaseSite
from utils.browser import click_element, fill_field
from config import TIMEOUT


class RealtingComSite(BaseSite):
    name = "realting_com"
    base_url = "https://realting.com"

    async def _verify_auth(self) -> bool:
        try:
            await self.page.goto("https://realting.com/my", wait_until="networkidle", timeout=TIMEOUT)
            content = await self.page.content()
            if "login" in content.lower():
                return False
            return True
        except Exception as e:
            self.log.error(f"Auth check failed: {e}")
            return False

    async def _navigate_to_add(self, deal: str, type_: str):
        url = self.selectors.get("add_listing_url", "https://realting.com/new")
        await self.page.goto(url, wait_until="networkidle", timeout=TIMEOUT)

    async def _select_deal(self, deal: str, prop_type: str = ""):
        sel = self.selectors.get("deal_selector", {}).get(deal)
        if sel:
            await self.page.click(sel, timeout=TIMEOUT)

    async def _select_type(self, type_: str):
        sel = self.selectors.get("type_selector", {}).get(type_)
        if sel:
            await self.page.click(sel, timeout=TIMEOUT)

    async def _fill_fields(self, listing: dict):
        fields = self.selectors.get("fields", {})
        mapping = {
            "price": str(listing.get("price", "")),
            "area": str(listing.get("area", "")),
            "rooms": str(listing.get("rooms", "")),
            "floor": str(listing.get("floor", "")),
            "address": listing.get("address", ""),
            "description": listing.get("description", ""),
            "phone": listing.get("contact_phone", ""),
        }
        for key, value in mapping.items():
            if not value:
                continue
            sel = fields.get(key)
            if sel:
                try:
                    await fill_field(self.page, sel, value, key)
                except Exception as e:
                    self.log.warning(f"Failed to fill {key}: {e}")

    async def _upload_photos(self, photos: list[str]):
        photo_sel = self.selectors.get("photo_upload", {})
        if not photos or not photo_sel:
            return
        css = photo_sel.get("css")
        if css and photo_sel.get("type") == "input":
            try:
                await self.page.locator(css).set_input_files(photos)
            except Exception as e:
                self.log.warning(f"Photo upload failed: {e}")

    async def _publish(self) -> str:
        sel = self.selectors.get("publish_button", {})
        css = sel.get("css")
        if css:
            await self.page.click(css, timeout=TIMEOUT)
        await self.page.wait_for_load_state("networkidle", timeout=TIMEOUT)
        await asyncio.sleep(5)
        return await self._find_listing_url()

    async def _find_listing_url(self) -> str:
        current = self.page.url
        pattern = self.selectors.get("success_indicator", {}).get("url_pattern", "")
        if pattern and pattern in current:
            return current
        return current

    async def _delete_listing(self, url: str) -> bool:
        try:
            await self.page.goto(url, wait_until="networkidle", timeout=TIMEOUT)
            del_sel = self.selectors.get("delete_button", {})
            css = del_sel.get("css")
            if css:
                try:
                    await self.page.click(css, timeout=TIMEOUT)
                    await asyncio.sleep(2)
                    confirm = self.page.locator("button:has-text('Confirm'), button:has-text('კი')")
                    if await confirm.count() > 0:
                        await confirm.first.click()
                        await asyncio.sleep(3)
                    return True
                except Exception:
                    pass
            self.log.warning("Delete button not found")
            return False
        except Exception as e:
            self.log.error(f"Delete failed: {e}")
            return False

    async def _check_listing_alive(self, url: str) -> bool:
        try:
            resp = await self.page.goto(url, wait_until="networkidle", timeout=TIMEOUT)
            return resp.status == 200
        except Exception:
            return False
