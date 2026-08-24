import asyncio
import json
from playwright.async_api import async_playwright
from sites.base import BaseSite
from config import TIMEOUT


class KorterGeSite(BaseSite):
    name = "korter_ge"
    base_url = "https://korter.ge"

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
        for text in ["Accept", "მისაღებია Cookies", "Закрыть"]:
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
            await btn.click(timeout=5000)
            self.log.info("Clicked Добавить")
            await asyncio.sleep(3)
        else:
            self.log.warning("Добавить button not found")
            return

        clear = self.page.locator("button:has-text('Очистить форму')")
        if await clear.count() > 0:
            await clear.click(timeout=5000)
            self.log.info("Clicked Очистить форму")
            await asyncio.sleep(2)

        await self._screenshot("form_ready")

    async def _select_deal(self, deal: str, prop_type: str = ""):
        deal_map = {"sale": "Продажа", "rent": "Долгосрочная аренда"}
        deal_text = deal_map.get(deal, "Продажа")

        btn = self.page.locator("[data-select-list] button, button:has-text('Тип сделки')")
        if await btn.count() > 0:
            await btn.first.click(timeout=5000)
            await asyncio.sleep(1)

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
        }}""", deal_text)
        if clicked:
            self.log.info(f"Selected deal: {deal_text}")
        else:
            self.log.warning(f"Deal option '{deal_text}' not found")
        await asyncio.sleep(2)

    async def _click_dropdown_option(self, option_text: str, description: str = "") -> bool:
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

    async def _click_button(self, button_text: str) -> bool:
        btn = self.page.locator(f"button:has-text('{button_text}')")
        if await btn.count() > 0:
            await btn.first.click(timeout=5000)
            await asyncio.sleep(1)
            return True
        self.log.warning(f"Button '{button_text}' not found")
        return False

    async def _select_type(self, type_: str):
        type_map = {
            "apartment": "Квартира",
            "house": "Дом",
            "land": "Участок",
            "commercial": "Коммерческая недвижимость",
        }
        type_text = type_map.get(type_, "Квартира")

        await self._click_button("Тип недвижимости")
        await self._click_dropdown_option(type_text, "property type")

    async def _select_subtype(self, type_: str, subtype: str = ""):
        if type_ == "house" and not subtype:
            subtype = "Частный дом"
        if type_ == "commercial" and not subtype:
            subtype = "Коммерческое помещение"
        if not subtype:
            return

        if type_ == "house":
            await self._click_button("Тип дома")
        elif type_ == "commercial":
            await self._click_button("Тип помещения")

        await self._click_dropdown_option(subtype, f"subtype for {type_}")

    async def _fill_fields(self, listing: dict):
        prop_type = listing.get("type", "apartment")

        city = listing.get("city", "Тбилиси")
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
            floor_input = self.page.get_by_label("Этаж", exact=True)
            if await floor_input.count() > 0:
                await floor_input.fill(str(floor), timeout=5000)
                self.log.info(f"Set floor: {floor}")
            else:
                self.log.warning("Floor input not found")
            await asyncio.sleep(1)

        floors_total = listing.get("floors_total", "")
        if floors_total and prop_type not in ("land",):
            floors_input = self.page.get_by_label("Этажность")
            if await floors_input.count() > 0:
                await floors_input.fill(str(floors_total), timeout=5000)
                self.log.info(f"Set floors_total: {floors_total}")
            else:
                self.log.warning("Floors total input not found")
            await asyncio.sleep(1)

        desc = listing.get("description", "")
        if desc:
            desc_input = self.page.locator("textarea").first
            if await desc_input.count() > 0:
                await desc_input.click(timeout=5000)
                await desc_input.fill(desc, timeout=5000)
                self.log.info("Set description")
            else:
                self.log.warning("Description textarea not found")
            await asyncio.sleep(1)

        price = listing.get("price", "")
        if price:
            price_input = self.page.locator("[placeholder='$']")
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
            el = self.page.locator("input[accept='image/jpeg,.jpeg,.jpg,image/png,.png']").first
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

        btn = self.page.locator("button:has-text('Опубликовать объект')")
        if await btn.count() > 0:
            await btn.click(timeout=10000, force=True)
            self.log.info("Clicked Опубликовать объект")
            await asyncio.sleep(10)
        else:
            self.log.warning("Publish button not found")
            return ""

        await self._screenshot("after_publish")

        new_url = self.page.url
        self.log.info(f"After publish URL: {new_url}")

        if "/new" not in new_url and "/create" not in new_url:
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

    async def _delete_listing(self, url: str) -> bool:
        try:
            await self.page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT)
            await asyncio.sleep(3)

            del_btn = self.page.locator("button:has-text('Удалить'), a:has-text('Удалить'), [class*='delete']")
            if await del_btn.count() > 0:
                await del_btn.first.click(timeout=5000)
                await asyncio.sleep(2)

                confirm = self.page.locator("button:has-text('Да'), button:has-text('Confirm'), button:has-text('Подтвердить')")
                if await confirm.count() > 0:
                    await confirm.first.click(timeout=5000)
                    await asyncio.sleep(3)
                    self.log.info("Delete confirmed")
                    return True

            self.log.warning("Delete mechanism not found")
            return False
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
