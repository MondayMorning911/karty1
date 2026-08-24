import asyncio
import json
import re
from playwright.async_api import async_playwright
from sites.base import BaseSite
from config import TIMEOUT


class KorterGeSite(BaseSite):
    name = "korter_ge"
    base_url = "https://korter.ge/ru/"

    async def _launch(self):
        self._pw = await async_playwright().start()
        self.browser = await self._pw.chromium.launch(
            headless=False,
            args=[
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--enable-unsafe-webgpu',
                '--disable-gpu-sandbox',
            ]
        )
        # Try storage_state first, then cookies, then empty
        import os, json
        state_path = os.path.join(os.path.dirname(__file__), '..', 'cookies', 'korter_ge_state.json')
        cookie_path = os.path.join(os.path.dirname(__file__), '..', 'cookies', 'korter_ge.json')
        try:
            if os.path.exists(state_path):
                with open(state_path) as f:
                    state = json.load(f)
                self.context = await self.browser.new_context(
                    storage_state=state,
                    viewport={"width": 1280, "height": 900},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                )
                self.log.info(f"Loaded storage_state from {state_path}")
            else:
                raise FileNotFoundError("no state file")
        except Exception:
            self.context = await self.browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            )
            try:
                if os.path.exists(cookie_path):
                    with open(cookie_path) as f:
                        raw = json.load(f)
                    cookies = [c for c in raw if 'korter.ge' in c.get('domain', '')]
                    if cookies:
                        await self.context.add_cookies(cookies)
                        self.log.info(f"Loaded {len(cookies)} cookies")
            except Exception as e:
                self.log.warning(f"Cookie load failed: {e}")
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
            if hasattr(self, '_pw') and self._pw:
                await self._pw.stop()
        except Exception:
            pass
        self._pw = None

    async def _verify_auth(self) -> bool:
        try:
            await self.page.goto("https://korter.ge/ru/", wait_until="domcontentloaded", timeout=TIMEOUT)
            await asyncio.sleep(5)

            is_logged = await self.page.evaluate("""() => {
                const text = document.body.innerText;
                return !text.includes('Войти');
            }""")
            if is_logged:
                self.log.info("Auth OK on korter.ge")
                return True
            else:
                self.log.warning("Not logged in on korter.ge")
                return False
        except Exception as e:
            self.log.error(f"Auth check failed: {e}")
            return False

    async def _dismiss_overlays(self):
        for text in ["I accept Cookies", "Accept", "მისაღებია Cookies", "Принимаю Cookies", "Закрыть"]:
            try:
                btn = self.page.locator(f"button:has-text('{text}')")
                if await btn.count() > 0:
                    await btn.first.click(timeout=3000)
                    await asyncio.sleep(1)
            except Exception:
                pass

    async def _navigate_to_add(self, deal: str, type_: str):
        await self.page.goto("https://korter.ge/ru/", wait_until="domcontentloaded", timeout=TIMEOUT)
        await asyncio.sleep(5)

        cookies_btn = self.page.locator("button:has-text('Принимаю Cookies')")
        if await cookies_btn.count() > 0:
            await cookies_btn.click(timeout=5000)
            await asyncio.sleep(1)

        btn = self.page.locator("button:has-text('Добавить')").first
        if await btn.count() > 0:
            await btn.click(timeout=5000, no_wait_after=True)
            self.log.info("Clicked Добавить")
            await asyncio.sleep(3)
        else:
            self.log.warning("Добавить button not found")
            return

        await self._dismiss_overlays()
        await asyncio.sleep(2)

        clear = self.page.locator("button:has-text('Очистить форму'), button:has-text('Clear form')").first
        if await clear.count() > 0:
            await clear.click(timeout=5000, force=True)
            self.log.info("Clicked Очистить форму")
            await asyncio.sleep(2)

        deal_button = self.page.locator("button:has-text('Тип сделки'), button:has-text('Deal type')").first
        await deal_button.wait_for(timeout=30000)

        await self._screenshot("form_ready")

    async def _select_deal(self, deal: str, prop_type: str = ""):
        deal_map = {"sale": ["Продажа", "Sale"], "rent": ["Долгосрочная аренда", "Rent"]}
        deal_texts = deal_map.get(deal, ["Продажа", "Sale"])

        # First scroll past header
        await self.page.evaluate("window.scrollTo(0, 300)")
        await asyncio.sleep(1)
        
        # Try clicking the deal button directly
        try:
            btn = self.page.locator("button:has-text('Тип сделки'), button:has-text('Deal type')").first
            if await btn.count() > 0:
                await btn.scroll_into_view_if_needed()
                await btn.click(timeout=5000)
                await asyncio.sleep(2)
        except: pass

        # Find and click the deal option using mouse coordinates
        coords = None
        deal_text = deal_texts[0]
        for candidate in deal_texts:
            coords = await self.page.evaluate(f"""(text) => {{
            const allEls = document.querySelectorAll('div, span, li, button');
            let best = null;
            let bestArea = 999999;
            for (const el of allEls) {{
                const t = el.textContent.trim();
                const rect = el.getBoundingClientRect();
                if (t === text && rect.width > 50 && rect.width < 400 && rect.y > 200) {{
                    const area = rect.width * rect.height;
                    if (area < bestArea) {{
                        bestArea = area;
                        best = el;
                    }}
                }}
            }}
            if (best) {{
                const r = best.getBoundingClientRect();
                return {{x: r.x + r.width/2, y: r.y + r.height/2}};
            }}
            return null;
            }}""", candidate)
            if coords:
                deal_text = candidate
                break
        if not coords:
            for candidate in deal_texts:
                option = self.page.get_by_role("button", name=candidate, exact=True).last
                if await option.count() > 0:
                    await option.click(timeout=5000, force=True)
                    deal_text = candidate
                    coords = {"x": 0, "y": 0}
                    break
        if coords:
            await self.page.mouse.click(coords['x'], coords['y'])
            self.log.info(f"Selected deal: {deal_text}")
        else:
            self.log.warning(f"Deal option '{deal_text}' not found")
        await asyncio.sleep(2)

    async def _click_dropdown_option(self, option_text: str, description: str = "") -> bool:
        role_option = self.page.get_by_role("button", name=option_text, exact=True).last
        if await role_option.count() > 0:
            await role_option.click(timeout=5000, force=True)
            self.log.info(f"Selected by role: {option_text} ({description})")
            await asyncio.sleep(2)
            return True
        clicked = await self.page.evaluate(f"""(text) => {{
            const allEls = document.querySelectorAll('div, span, li');
            let best = null;
            let bestArea = 999999;
            for (const el of allEls) {{
                const t = el.textContent.trim();
                const rect = el.getBoundingClientRect();
                if (t === text && rect.width > 50 && rect.width < 400 && rect.height > 20 && rect.height < 80 && rect.y > 0) {{
                    const area = rect.width * rect.height;
                    if (area < bestArea) {{
                        bestArea = area;
                        best = el;
                    }}
                }}
            }}
            if (best) {{
                best.scrollIntoView({{block: 'center'}});
                const x = best.getBoundingClientRect().x + best.getBoundingClientRect().width / 2;
                const y = best.getBoundingClientRect().y + best.getBoundingClientRect().height / 2;
                ['pointerdown', 'mousedown'].forEach(type => {{
                    best.dispatchEvent(new PointerEvent(type, {{ bubbles: true, clientX: x, clientY: y, pointerId: 1 }}));
                }});
                ['pointerup', 'mouseup'].forEach(type => {{
                    best.dispatchEvent(new PointerEvent(type, {{ bubbles: true, clientX: x, clientY: y, pointerId: 1 }}));
                }});
                best.dispatchEvent(new MouseEvent('click', {{ bubbles: true, clientX: x, clientY: y }}));
                return true;
            }}
            return false;
        }}""", option_text)
        if clicked:
            self.log.info(f"Selected: {option_text} ({description})")
        else:
            self.log.warning(f"Option '{option_text}' not found ({description})")
        await asyncio.sleep(2)
        return clicked


    async def _handle_map_pin(self):
        """Place a pin on the Korter map."""
        try:
            # Click "Ручной режим" (manual mode)
            await self.page.evaluate("""() => {
                for (const el of document.querySelectorAll('button, span, a')) {
                    if (el.textContent.includes('ручной') || el.textContent.includes('Ручной')) {
                        el.click(); return;
                    }
                }
            }""")
            await asyncio.sleep(2)
            # Find map and click center
            rect = await self.page.evaluate("""() => {
                const el = document.querySelector('.leaflet-container, [class*="map"], [class*="Map"], canvas');
                if (el) { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; }
                return null;
            }""")
            if rect:
                await self.page.mouse.click(rect['x'] + rect['w']//2, rect['y'] + rect['h']//2)
                self.log.info("Map pin placed")
                await asyncio.sleep(2)
        except Exception as e:
            self.log.warning(f"Map pin failed: {e}")

    async def _click_button(self, button_text: str) -> bool:
        btn = self.page.get_by_role("button", name=button_text, exact=False)
        if await btn.count() > 0:
            await btn.first.click(timeout=5000)
            await asyncio.sleep(1)
            return True
        self.log.warning(f"Button '{button_text}' not found")
        return False

    async def _select_type(self, type_: str):
        type_map = {
            "apartment": ["Квартира", "Apartment"],
            "house": ["Дом", "House"],
            "land": ["Участок", "Land"],
            "commercial": ["Коммерческая недвижимость", "Commercial property"],
        }
        type_texts = type_map.get(type_, ["Квартира", "Apartment"])

        type_text = type_texts[0]
        opened = await self._click_button("Тип недвижимости")
        if not opened:
            opened = await self._click_button("Property type")
        for candidate in type_texts:
            if await self._click_dropdown_option(candidate, "property type"):
                type_text = candidate
                break

    async def _select_subtype(self, type_: str, subtype: str = ""):
        if type_ == "house" and not subtype:
            subtype = "Частный дом"
        if type_ == "commercial" and not subtype:
            subtype = "Коммерческое помещение"
        if not subtype:
            return

        if type_ == "house":
            opened = await self._click_button("Тип дома")
            if not opened:
                opened = await self._click_button("Type of house")
            subtype_options = [subtype, "Частный дом", "Private house", "House"]
        elif type_ == "commercial":
            opened = await self._click_button("Тип помещения")
            if not opened:
                opened = await self._click_button("Type of premises")
            subtype_options = [subtype, "Коммерческое помещение", "Commercial premises", "Commercial property"]
        else:
            subtype_options = [subtype]

        for option in dict.fromkeys(item for item in subtype_options if item):
            if await self._click_dropdown_option(option, f"subtype for {type_}"):
                break

    async def _fill_fields(self, listing: dict):
        prop_type = listing.get("type", "apartment")

        city = listing.get("city", "Тбилиси")
        # Try new approach: type in the geo search input and use keyboard to select
        city_input = self.page.locator("input[name='custom.geoObjectSearch']").first
        if await city_input.count() > 0:
            await city_input.click(timeout=5000, force=True)
            await asyncio.sleep(0.5)
            await city_input.fill("")
            await asyncio.sleep(0.3)
            await city_input.type(city, delay=80)
            await asyncio.sleep(3)
            city_option = self.page.get_by_text(city, exact=True).last
            if await city_option.count() > 0:
                await city_option.click(timeout=5000)
            else:
                await self.page.keyboard.press("ArrowDown")
                await asyncio.sleep(0.5)
                await self.page.keyboard.press("Enter")
            await asyncio.sleep(2)
            self.log.info(f"Selected city via keyboard: {city}")
        else:
            # Old approach fallback
            city_btn = self.page.locator("[placeholder='Не выбрано']").first
            if await city_btn.count() > 0:
                await city_btn.click(timeout=5000)
                await asyncio.sleep(1)
                city_opt = self.page.locator(f"div:text-is('{city}')").first
                if await city_opt.count() > 0:
                    await city_opt.click(timeout=5000)
                    self.log.info(f"Selected city: {city}")
                else:
                    self.log.warning(f"City '{city}' not found")
                await asyncio.sleep(2)

        address = listing.get("address", "")
        if address:
            parts = [p.strip() for p in address.split(",")]
            street_part = parts[-1] if len(parts) > 1 else address
            house_num = ""
            
            # Don't split "район X" into street/house — it's a district name
            district_prefixes = ("район", "р-н", "district")
            if any(street_part.lower().startswith(dp) for dp in district_prefixes):
                street = street_part
                house_num = ""
            elif " " in street_part:
                tokens = street_part.split()
                # Only treat last token as house number if it looks like one (digits or digit+letter)
                last = tokens[-1]
                if last.isdigit() or (last[:-1].isdigit() and last[-1].isalpha()):
                    street = " ".join(tokens[:-1])
                    house_num = last
                else:
                    street = street_part
            else:
                street = street_part

            street_input = self.page.locator("input[name='street']")
            if await street_input.count() > 0:
                clean_street = street
                for prefix in ("ул. ", "улица ", "пр. ", "просп. ", "пер. "):
                    if clean_street.lower().startswith(prefix):
                        clean_street = clean_street[len(prefix):]
                
                await street_input.click(timeout=5000)
                await asyncio.sleep(0.5)
                await street_input.fill("")
                await asyncio.sleep(0.3)
                await street_input.type(clean_street, delay=100)
                await asyncio.sleep(3)
                
                # Find and click autocomplete suggestion via Playwright (not raw JS click)
                input_box = await street_input.bounding_box()
                if input_box:
                    suggestion_y = await self.page.evaluate("""(inputBox) => {
                        const els = document.querySelectorAll('div');
                        for (const el of els) {
                            const rect = el.getBoundingClientRect();
                            if (rect.height > 10 && rect.height < 80 && rect.width > 100
                                && rect.y > inputBox.y + inputBox.height
                                && rect.y < inputBox.y + inputBox.height + 200
                                && rect.x < inputBox.x + 100
                                && el.textContent.trim().length > 5
                                && el.textContent.trim().length < 100
                                && el.children.length === 0) {
                                return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 40)};
                            }
                        }
                        return null;
                    }""", input_box)
                    if suggestion_y:
                        await self.page.mouse.click(suggestion_y['x'], suggestion_y['y'])
                        self.log.info(f"Mouse clicked autocomplete: {suggestion_y['text']}")
                    else:
                        await self.page.keyboard.press("ArrowDown")
                        await asyncio.sleep(0.5)
                        await self.page.keyboard.press("Enter")
                        self.log.info(f"Selected street via keyboard: {clean_street}")
                
                await asyncio.sleep(2)
                val = await street_input.input_value()
                if val and len(val) > 2:
                    self.log.info(f"Street selected: {val}")
                else:
                    self.log.warning(f"Street selection may have failed: '{val}'")
                await asyncio.sleep(2)

            if house_num:
                house_input = self.page.locator("input[name='houseNumber']")
                if await house_input.count() > 0:
                    await house_input.click(timeout=5000)
                    await asyncio.sleep(0.5)
                    await house_input.fill("")
                    await asyncio.sleep(0.3)
                    await house_input.type(house_num, delay=100)
                    await asyncio.sleep(3)
                    
                    # Select first suggestion using keyboard
                    await self.page.keyboard.press("ArrowDown")
                    await asyncio.sleep(0.5)
                    await self.page.keyboard.press("Enter")
                    await asyncio.sleep(2)
                    
                    val = await house_input.input_value()
                    self.log.info(f"House selected: {val}")

        if prop_type in ("apartment", "house"):
            rooms = listing.get("rooms", "")
            if rooms:
                rooms_id = f"#roomCount-{rooms}"
                room_el = self.page.locator(rooms_id)
                if await room_el.count() > 0:
                    await room_el.click(timeout=5000, force=True)
                    self.log.info(f"Clicked rooms: {rooms}")
                else:
                    self.log.warning(f"Room selector '{rooms_id}' not found")
                await asyncio.sleep(1)

        if prop_type in ("apartment", "house"):
            bedrooms = listing.get("bedrooms", "")
            if bedrooms:
                beds_id = f"#bedroomCount-{bedrooms}"
                bed_el = self.page.locator(beds_id)
                if await bed_el.count() > 0:
                    await bed_el.click(timeout=5000, force=True)
                    self.log.info(f"Clicked bedrooms: {bedrooms}")
                else:
                    self.log.warning(f"Bedroom selector '{beds_id}' not found")
                await asyncio.sleep(1)

        area = listing.get("area", "")
        if area:
            if prop_type == "land":
                area_input = self.page.locator("[placeholder='м²']").first
            elif prop_type == "house":
                area_input = self.page.locator("label:has-text('Площадь дома') input, [placeholder='Например, 50.55 м²']").first
            else:
                area_input = self.page.locator("[placeholder='Например, 50.55 м²'], [placeholder='м²']").first
            if await area_input.count() > 0:
                await area_input.fill(str(area), timeout=5000)
                self.log.info(f"Set area: {area}")
            else:
                self.log.warning("Area input not found")
            await asyncio.sleep(1)

        land_area = listing.get("land_area", "")
        if not land_area and prop_type == "house":
            land_area = listing.get("house", {}).get("land_area", "") if isinstance(listing.get("house"), dict) else ""
        if land_area and prop_type == "house":
            land_input = self.page.locator("input[placeholder='м²']").last
            if await land_input.count() > 0:
                await land_input.fill(str(land_area), timeout=5000)
                self.log.info(f"Set land area: {land_area}")
            else:
                self.log.warning("Land area input not found")
            await asyncio.sleep(1)

        floor = listing.get("floor", "")
        if floor and prop_type not in ("land", "house"):
            floor_input = self.page.locator("#floorNumber, input[name='floorNumber']").first
            if await floor_input.count() > 0:
                await floor_input.fill(str(floor), timeout=5000)
                self.log.info(f"Set floor: {floor}")
            else:
                self.log.warning("Floor input not found")
            await asyncio.sleep(1)

        floors_total = listing.get("floors_total", "")
        if floors_total and prop_type not in ("land",):
            floors_input = self.page.locator("#floorCount, input[name='floorCount']").first
            if await floors_input.count() > 0:
                await floors_input.fill(str(floors_total), timeout=5000)
                self.log.info(f"Set floors_total: {floors_total}")
            else:
                self.log.warning("Floors total input not found")
            await asyncio.sleep(1)

        desc = listing.get("description", "")
        if desc:
            desc_input = self.page.locator("#description\\.ru-RU, textarea[name='description.ru-RU'], textarea").first
            if await desc_input.count() > 0:
                await desc_input.click(timeout=5000)
                await desc_input.fill(desc, timeout=5000)
                self.log.info("Set description")
            else:
                self.log.warning("Description textarea not found")
            await asyncio.sleep(1)

        price = listing.get("price", "")
        if price:
            price_input = self.page.locator("#price, input[name='price'], [placeholder='$']").first
            if await price_input.count() > 0:
                await price_input.fill(str(int(price)), timeout=5000)
                self.log.info(f"Set price: {price}")
            else:
                self.log.warning("Price input not found")
            await asyncio.sleep(1)

    async def _upload_photos(self, photos: list[str]):
        if not photos:
            return
        try:
            el = self.page.locator("input[type='file'][accept*='image'], input[type='file']").first
            if await el.count() > 0:
                await el.set_input_files(photos)
                self.log.info(f"Uploaded {len(photos)} photos")
                await asyncio.sleep(5)
        except Exception as e:
            self.log.warning(f"Photo upload failed: {e}")

    async def _publish(self) -> str:
        await self._screenshot("before_publish")

        await self.page.evaluate("""() => {
            // Bypass map pin validation by enabling publish button
            const btns = document.querySelectorAll('button');
            for (const btn of btns) {
                if (btn.textContent.includes('Опубликовать объект')) {
                    btn.disabled = false;
                    btn.removeAttribute('disabled');
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                }
            }
        }""")
        await asyncio.sleep(1)

        btn = self.page.get_by_role("button", name="Опубликовать объект", exact=True)
        if await btn.count() > 0:
            self._submit_clicked = True
            await btn.click(timeout=10000, force=True)
            self.log.info("Clicked Опубликовать объект")
            await asyncio.sleep(10)
        else:
            self.log.warning("Publish button not found")
            return ""

        await self._screenshot("after_publish")

        new_url = self.page.url
        self.log.info(f"After publish URL: {new_url}")

        if "/profile/" in new_url:
            try:
                await self.context.grant_permissions(["clipboard-read", "clipboard-write"], origin="https://korter.ge")
                public_button = self.page.locator(
                    "button:has-text('Страница на сайте'), button:has-text('Page on the website')"
                ).last
                if await public_button.count() > 0:
                    await public_button.click(timeout=5000)
                    await asyncio.sleep(1)
                    copied_url = await self.page.evaluate("() => navigator.clipboard.readText()")
                    if copied_url and "/profile/" not in copied_url and re.search(r"/\d{4,}(?:\?|$)", copied_url):
                        return copied_url.split("?")[0]
            except Exception as e:
                self.log.warning(f"Could not recover public URL from Korter dashboard: {e}")

        if "/new" not in new_url and "/create" not in new_url and "/profile/" not in new_url and re.search(r"/\d{4,}(?:\?|$)", new_url):
            return new_url

        listing_url = await self.page.evaluate("""() => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = link.href;
                if (/\\/\\d{4,}/.test(href) && !href.includes('new') && !href.includes('create') && !href.includes('?')) {
                    return href;
                }
            }
            return null;
        }""")
        if listing_url:
            self.log.info(f"Found listing URL: {listing_url}")
            return listing_url

        self.log.warning("Could not find listing URL after publish")
        return ""

    async def _find_listing_url(self) -> str:
        return self.page.url

    async def _find_recent_listing_url(self, listing: dict) -> str:
        await self.page.goto("https://korter.ge/ru/profile", wait_until="domcontentloaded", timeout=TIMEOUT)
        await asyncio.sleep(6)
        address = str(listing.get("address") or listing.get("city") or "").strip()
        price = str(listing.get("price") or "").strip()
        if not address or not price:
            return ""
        return await self.page.evaluate(r"""({ address, price }) => {
            const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            const addressText = normalize(address);
            const priceText = normalize(price);
            const links = [...document.querySelectorAll('a[href]')];
            for (const link of links) {
                const href = link.href;
                if (!/\/\d{4,}/.test(href) || href.includes('/profile') || href.includes('/new') || href.includes('/create')) continue;
                const card = link.closest('article, li, [class*="card"], [class*="item"], div') || link.parentElement;
                const text = normalize(card?.textContent || link.textContent);
                if (addressText.length >= 4 && text.includes(addressText) && text.includes(priceText)) {
                    return href.split('?')[0];
                }
            }
            return '';
        }""", {"address": address, "price": price})

    async def _delete_listing(self, url: str) -> bool:
        try:
            match = re.search(r"/(\d{4,})(?:\?|$)", url or "")
            if not match:
                self.log.warning(f"Cannot safely delete URL without listing ID: {url}")
                return False
            listing_id = match.group(1)
            dashboard = "https://korter.ge/ru/profile/my-apartments/published"
            await self.page.goto(dashboard, wait_until="domcontentloaded", timeout=TIMEOUT)
            await asyncio.sleep(10)
            id_locator = self.page.get_by_text(listing_id, exact=True)
            if await id_locator.count() == 0:
                self.log.warning(f"Korter listing ID {listing_id} not found in published dashboard")
                return False
            card = id_locator.first.locator("xpath=ancestor::div[contains(@class, 'swixhnf')]").first
            if await card.count() == 0:
                self.log.warning(f"Korter card for ID {listing_id} not found")
                return False
            hide = card.get_by_text("Скрыть", exact=True)
            if await hide.count() == 0:
                self.log.warning(f"Korter hide control for ID {listing_id} not found")
                return False
            await hide.click(timeout=5000)
            await asyncio.sleep(1)
            delete = card.get_by_text("Удалить", exact=True)
            if await delete.count() == 0:
                self.log.warning(f"Korter delete control for ID {listing_id} not found")
                return False
            await delete.click(timeout=5000)
            await asyncio.sleep(8)
            await self.page.reload(wait_until="domcontentloaded", timeout=TIMEOUT)
            await asyncio.sleep(3)
            if await self.page.get_by_text(listing_id, exact=True).count() > 0:
                self.log.warning(f"Korter listing ID {listing_id} is still in published dashboard")
                return False
            response = await self.page.request.get(url, timeout=TIMEOUT)
            if response.status < 400:
                self.log.warning(f"Korter public URL still returns HTTP {response.status}: {url}")
                return False
            self.log.info(f"Korter exact delete confirmed for ID {listing_id}: HTTP {response.status}")
            return True
        except Exception as e:
            self.log.error(f"Delete failed: {e}")
            return False

    async def _check_listing_alive(self, url: str) -> bool:
        try:
            resp = await self.page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT)
            await asyncio.sleep(2)
            return resp.status == 200
        except Exception:
            return False
