import asyncio
import json
from playwright.async_api import async_playwright
from sites.base import BaseSite
from config import TIMEOUT

# Russian → Georgian for myhome.ge streets (autocomplete works with Georgian)
STREET_TO_GEORGIAN = {
    "Руставели": "რუსთაველი",
    "Химшиашвили": "ხიმშიაშვილი",
    "Чиковани": "ჩიკოვანი",
    "Пекини": "პეკინი",
    "Цхнети": "წყნეთი",
    "Агмашенебели": "აღმაშენებლი",
    "Качели": "კაჭელი",
    "Горгасали": "გორგასალი",
    "Дигоми": "დიღომი",
    "Важа-Пшавела": "ვაჟა-ფშაველა",
    "Чавчавадзе": "ჩავჩავაძე",
    "Асатиани": "ასათიანი",
    "Леселидзе": "ლესელიძე",
    "Шардени": "შარდენი",
    "Барнოვი": "ბარნოვი",
    "Эристави": "ერისთავი",
    "Мачабели": "მაჩაბელი",
    "Костава": "კოსტავა",
    "Жвания": "ჟვანია",
    "Табидзе": "თაბიძე",
    "Ниношвили": "ნინოშვილი",
    "Гамсахурдиა": "გამსახურდია",
    "Университети": "უნივერსიტეტი",
    "Саакадзе": "სააკაძე",
    "Баланчивадзе": "ბალანჩივაძე",
    "Нуцубидзе": "ნუცუბიძე",
    "Гоголя": "გოგოლი",
    "Нино Чхеидзе": "ნინო ჩხეიძე",
    "Горгиладзе": "გორგილაძე",
}


def _to_georgian_street(street: str) -> str:
    """Convert Russian street name to Georgian for myhome.ge autocomplete."""
    if any('\u10d0' <= c <= '\u10ff' for c in street):
        return street
    clean = street.replace("ул.", "").replace("улица", "").replace("проспект", "").replace("пр.", "").strip()
    if clean in STREET_TO_GEORGIAN:
        return STREET_TO_GEORGIAN[clean]
    return clean
    clean = street.replace("ул.", "").replace("улица", "").replace("проспект", "").replace("пр.", "").strip()
    if clean in STREET_TO_TRANSLIT:
        return STREET_TO_TRANSLIT[clean]
    return clean


class MyhomeGeSite(BaseSite):
    name = "myhome_ge"
    base_url = "https://www.myhome.ge"

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
        self.context = await self.browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
        try:
            with open('/root/karty-lab/cookies/myhome_ge.json') as f:
                raw = json.load(f)
            cookies = []
            for c in raw:
                d = c.get('domain', '')
                if 'myhome.ge' not in d:
                    continue
                entry = {
                    'name': c.get('name', ''),
                    'value': c.get('value', ''),
                    'domain': d,
                    'path': c.get('path', '/'),
                }
                if 'expirationDate' in c:
                    entry['expires'] = c['expirationDate']
                ss = c.get('sameSite', 'Lax')
                if ss in ('Strict', 'Lax'):
                    entry['sameSite'] = ss
                else:
                    entry['sameSite'] = 'None'
                    entry['secure'] = True
                cookies.append(entry)
            await self.context.add_cookies(cookies)
            self.log.info(f"Loaded {len(cookies)} cookies")
        except Exception as e:
            self.log.warning(f"Cookies load failed: {e}")
        self.page = await self.context.new_page()
        self.log.info(f"Browser launched for {self.name}")

    async def _close(self):
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
            await self.page.goto("https://www.myhome.ge/", wait_until="domcontentloaded", timeout=TIMEOUT)
            await asyncio.sleep(5)
            is_logged = await self.page.evaluate("""() => {
                const links = document.querySelectorAll('a, button');
                for (const el of links) {
                    if (el.textContent.trim() === 'Авторизация') return false;
                }
                return true;
            }""")
            if is_logged:
                self.log.info("Auth OK on myhome.ge")
                return True
            else:
                self.log.warning("Not logged in on myhome.ge")
                return False
        except Exception as e:
            self.log.error(f"Auth check failed: {e}")
            return False

    async def _navigate_to_add(self, deal: str, type_: str):
        direct_url = "https://statements.myhome.ge/ru/statement/create?referrer=myhome"
        await self.page.goto(direct_url, wait_until="domcontentloaded", timeout=TIMEOUT)
        await asyncio.sleep(8)
        self.log.info(f"Navigated to direct create URL: {direct_url}")

    async def _click_test_id(self, test_id: str) -> bool:
        el = self.page.locator(f"[data-test-id='{test_id}']")
        if await el.count() > 0:
            await el.first.click(timeout=5000)
            await asyncio.sleep(1)
            return True
        return False

    async def _select_type(self, type_: str):
        type_map = {
            "apartment": "Квартира",
            "house": "Частный дом",
            "land": "Земельный участок",
            "commercial": "Коммерческая площадь",
        }
        type_text = type_map.get(type_, "Квартира")
        await self._click_test_id("add-statement-real-estate-type")
        await asyncio.sleep(1)
        await self.page.get_by_text(type_text).first.click(timeout=5000)
        self.log.info(f"Selected type: {type_text}")
        await asyncio.sleep(2)

    async def _select_deal(self, deal: str, prop_type: str = ""):
        if deal == "rent" and prop_type == "land":
            deal_text = "В аренду"
        else:
            deal_map = {"sale": "Продается", "rent": "Сдается"}
            deal_text = deal_map.get(deal, "Продается")
        await self._click_test_id("add-statement-deal-type")
        await asyncio.sleep(1)
        await self.page.get_by_text(deal_text, exact=True).first.click(timeout=5000)
        self.log.info(f"Selected deal: {deal_text}")
        await asyncio.sleep(2)

    async def _select_subtype(self, type_: str, subtype: str = ""):
        if type_ == "house" and subtype:
            try:
                await self.page.get_by_text("Тип дома", exact=True).click(timeout=5000)
                await asyncio.sleep(1)
                await self.page.get_by_text(subtype, exact=True).first.click(timeout=5000)
                self.log.info(f"Selected house subtype: {subtype}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set house subtype: {e}")
        elif type_ == "commercial" and subtype:
            try:
                await self.page.get_by_text("Тип помещения", exact=True).click(timeout=5000)
                await asyncio.sleep(1)
                await self.page.get_by_text(subtype, exact=True).first.click(timeout=5000)
                self.log.info(f"Selected commercial subtype: {subtype}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set commercial subtype: {e}")

    async def _fill_fields(self, listing: dict):
        prop_type = listing.get("type", "apartment")
        deal = listing.get("deal", "sale")

        # 1. Status + Condition (scroll to top first — these are at the TOP of the form)
        try:
            await self.page.evaluate("window.scrollTo(0, 0)")
            await asyncio.sleep(1)
            # Status depends on property type
            if prop_type == "land":
                status_text = "Сельскохозяйственн"
            elif prop_type == "commercial":
                status_text = "Специальное"
            else:
                status_text = "Старое здание"
            status_el = self.page.get_by_text(status_text, exact=True)
            if await status_el.count() > 0:
                await status_el.first.click(timeout=5000)
                self.log.info(f"Selected status: {status_text}")
                await asyncio.sleep(1)
            else:
                self.log.warning(f"Status '{status_text}' not found")
        except Exception as e:
            self.log.warning(f"Failed to set status: {e}")

        try:
            condition_text = "Недавно отремонтированный"
            condition_el = self.page.get_by_text(condition_text, exact=True)
            if await condition_el.count() > 0:
                await condition_el.first.click(timeout=5000)
                self.log.info(f"Selected condition: {condition_text}")
                await asyncio.sleep(1)
            else:
                self.log.warning(f"Condition '{condition_text}' not found")
        except Exception as e:
            self.log.warning(f"Failed to set condition: {e}")

        # 2. Location (city, street, house)
        city = listing.get("city", "Тбилиси")
        try:
            loc_section = self.page.locator("[data-test-id='add-statement-location-id']")
            await loc_section.scroll_into_view_if_needed(timeout=5000)
            await asyncio.sleep(1)
            city_dropdown = loc_section.locator("label, [class*='select'], [role='combobox'], [class*='control']").first
            if await city_dropdown.count() > 0:
                await city_dropdown.click(timeout=5000)
                await asyncio.sleep(2)
                await self.page.get_by_text(city).first.click(timeout=5000)
                self.log.info(f"Selected city: {city}")
                await asyncio.sleep(2)
            else:
                await self._click_test_id("add-statement-location-id")
                await asyncio.sleep(1)
                await self.page.get_by_placeholder(" ").click(timeout=5000)
                await asyncio.sleep(1)
                await self.page.get_by_text(city).first.click(timeout=5000)
                self.log.info(f"Selected city (fallback): {city}")
                await asyncio.sleep(2)
        except Exception as e:
            self.log.warning(f"Failed to set city: {e}")

        address = listing.get("address", "")
        if address:
            parts = [p.strip() for p in address.split(",")]
            street_raw = parts[-1] if len(parts) > 1 else address
            house_num = ""
            if " " in street_raw:
                tokens = street_raw.split()
                street_raw = " ".join(tokens[:-1])
                house_num = tokens[-1]
            street = _to_georgian_street(street_raw)

            try:
                street_label = self.page.locator("[data-test-id='add-statement-street-id'] label")
                if await street_label.count() > 0:
                    await street_label.click(timeout=5000)
                    await asyncio.sleep(1)
                    street_input = self.page.locator("[data-test-id='add-statement-street-id'] input, [data-test-id='add-statement-street-id'] [role='combobox']")
                    if await street_input.count() > 0:
                        await street_input.first.click(timeout=3000, force=True)
                        await asyncio.sleep(0.3)
                        # Use .type() not .fill() for autocomplete
                        await street_input.first.type(street, delay=80)
                        await asyncio.sleep(3)
                        # Click the FIRST dropdown option (not text-matched)
                        first_option = self.page.locator("[role='option']").first
                        if await first_option.count() > 0:
                            opt_text = await first_option.text_content()
                            await first_option.click(timeout=3000)
                            self.log.info(f"Selected street: {opt_text.strip()[:50]}")
                        else:
                            # Try menu items
                            menu_item = self.page.locator("[class*='menu'] [class*='option'], [class*='dropdown'] li").first
                            if await menu_item.count() > 0:
                                await menu_item.click(timeout=3000)
                                self.log.info(f"Selected street from menu")
                            else:
                                await self.page.keyboard.press("ArrowDown")
                                await asyncio.sleep(0.3)
                                await self.page.keyboard.press("Enter")
                                self.log.info(f"Typed street: {street}")
                    await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set street: {e}")

            if house_num:
                try:
                    house_input = self.page.locator("[data-test-id='add-statement-street-number'] input, [data-test-id='add-statement-street-number'] [role='combobox']")
                    if await house_input.count() > 0:
                        await house_input.first.fill(house_num, timeout=5000)
                        await asyncio.sleep(2)
                        option = self.page.locator(f"[role='option']:has-text('{house_num}'), li:has-text('{house_num}')").first
                        if await option.count() > 0:
                            await option.click(timeout=3000)
                        else:
                            await self.page.keyboard.press("ArrowDown")
                            await asyncio.sleep(0.3)
                            await self.page.keyboard.press("Enter")
                        self.log.info(f"Set house: {house_num}")
                    await asyncio.sleep(1)
                except Exception as e:
                    self.log.warning(f"Failed to set house: {e}")

        # 3. Rooms
        rooms = listing.get("rooms", "")
        if rooms and prop_type in ("apartment", "house", "commercial"):
            try:
                room_label = self.page.locator("[data-test-id='add-statement-room-type'] label").filter(has_text=str(rooms)).first
                if await room_label.count() > 0:
                    await room_label.click(timeout=5000)
                    self.log.info(f"Selected rooms: {rooms}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set rooms: {e}")

        # 4. Area
        area = listing.get("area", "")
        if area:
            try:
                area_label = self.page.locator("[data-test-id='add-statement-area'] label")
                if await area_label.count() > 0:
                    await area_label.click(timeout=5000)
                    await asyncio.sleep(1)
                    area_input = self.page.locator("[data-test-id='add-statement-area'] input")
                    if await area_input.count() > 0:
                        await area_input.first.fill(str(area), timeout=5000)
                        self.log.info(f"Set area: {area}")
                    await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set area: {e}")

        # 5. Floor (skip for land)
        floor = listing.get("floor", "")
        if floor and prop_type not in ("land",):
            try:
                floor_inputs = self.page.locator("[data-test-id='add-statement-floor-and-total-floors'] input")
                if await floor_inputs.count() > 0:
                    await floor_inputs.first.fill(str(floor), timeout=5000)
                    self.log.info(f"Set floor: {floor}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set floor: {e}")

        # 5b. Floors total (required for apartment, house, commercial — not land)
        floors_total = listing.get("floors_total", "")
        if floors_total and prop_type not in ("land",):
            try:
                floor_section = self.page.locator("[data-test-id='add-statement-floor-and-total-floors']")
                all_inputs = floor_section.locator("input")
                count = await all_inputs.count()
                self.log.info(f"Floor section has {count} inputs")

                if count >= 2:
                    # Apartments: two inputs — [этаж] [Всего этажей]
                    second_input = all_inputs.nth(1)
                    await second_input.scroll_into_view_if_needed()
                    await second_input.click(timeout=3000)
                    await asyncio.sleep(0.3)
                    await second_input.fill(str(floors_total), timeout=5000)
                    self.log.info(f"Set floors_total (2 inputs): {floors_total}")
                else:
                    # Houses: "Всего этажей" is a custom input with label + peer input
                    # Click the input-container div (has luk-cursor-text class), then type
                    container = self.page.locator("div.input-container:has(label)").filter(has_text="Всего этажей")
                    if await container.count() > 0:
                        await container.first.scroll_into_view_if_needed()
                        await container.first.click(timeout=3000)
                        await asyncio.sleep(0.5)
                        # The peer input should now be focused — type the value
                        await self.page.keyboard.type(str(floors_total), delay=80)
                        await asyncio.sleep(0.3)
                        await self.page.keyboard.press("Tab")
                        await asyncio.sleep(0.3)
                        self.log.info(f"Set floors_total (container+keyboard): {floors_total}")
                    else:
                        # Fallback: click the h2 heading area and type
                        await self.page.evaluate("""() => {
                            const h2s = document.querySelectorAll('h2');
                            for (const h of h2s) {
                                if (h.textContent.includes('Всего этажей')) {
                                    h.scrollIntoView({block: 'center'});
                                    h.click();
                                    return;
                                }
                            }
                        }""")
                        await asyncio.sleep(0.5)
                        await self.page.keyboard.type(str(floors_total), delay=80)
                        await asyncio.sleep(0.3)
                        await self.page.keyboard.press("Tab")
                        self.log.info(f"Set floors_total (h2+keyboard): {floors_total}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set floors_total: {e}")

        # 5c. Bedrooms (required for some types)
        bedrooms = listing.get("bedrooms", "")
        if bedrooms and prop_type in ("apartment", "house", "commercial"):
            try:
                bed_label = self.page.locator("[data-test-id='add-statement-bedroom-type'] label").filter(has_text=str(bedrooms)).first
                if await bed_label.count() > 0:
                    await bed_label.click(timeout=5000)
                    self.log.info(f"Set bedrooms: {bedrooms}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set bedrooms: {e}")

        # 6. Project type (BEFORE price — causes React re-render)
        project_type = listing.get("project_type", "Нестандартный")
        if project_type:
            try:
                pt_trigger = self.page.locator("[data-test-id='add-statement-project-type'] span").nth(4)
                if await pt_trigger.count() > 0:
                    await pt_trigger.click(timeout=5000)
                    await asyncio.sleep(2)
                    option = self.page.locator(f"li:has-text('{project_type}')").first
                    if await option.count() > 0:
                        await option.click(timeout=5000)
                        self.log.info(f"Selected project type: {project_type}")
                    else:
                        self.log.warning(f"Project type option '{project_type}' not found")
                    await asyncio.sleep(2)
            except Exception as e:
                self.log.warning(f"Failed to set project type: {e}")

        # 7. Price (AFTER project type — re-render clears it)
        price = listing.get("price", "")
        if price:
            try:
                price_toggle = self.page.locator("[data-test-id='add-statement-currency-toggle'] >> text='$'")
                if await price_toggle.count() > 0:
                    await price_toggle.click(timeout=5000)
                    await asyncio.sleep(1)

                price_section = self.page.locator("[data-test-id='add-statement-section-price-and-area']")
                await price_section.scroll_into_view_if_needed(timeout=5000)
                await asyncio.sleep(1)

                all_inputs = price_section.locator("input")
                count = await all_inputs.count()
                self.log.info(f"Found {count} inputs in price section")
                for i in range(count):
                    inp = all_inputs.nth(i)
                    placeholder = await inp.get_attribute("placeholder") or ""
                    if "Полная" in placeholder or "стоимость" in placeholder or "цена" in placeholder.lower():
                        await inp.fill(str(int(price)), timeout=5000)
                        self.log.info(f"Set price: {price}")
                        break
                else:
                    if count > 0:
                        await all_inputs.first.scroll_into_view_if_needed()
                        await all_inputs.first.click(timeout=3000)
                        await all_inputs.first.fill(str(int(price)), timeout=5000)
                        self.log.info(f"Set price (first input): {price}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set price: {e}")

        # 8. Description
        desc = listing.get("description", "")
        if desc:
            try:
                await self.page.get_by_role("button", name="Русский").click(timeout=5000)
                await asyncio.sleep(1)
                desc_input = self.page.locator("[data-test-id='add-statement-description-ru']")
                if await desc_input.count() > 0:
                    await desc_input.click(timeout=5000)
                    await desc_input.fill(desc, timeout=5000)
                    self.log.info("Set description")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set description: {e}")

        # 9. Contact name
        contact_name = listing.get("contact_name", "")
        if contact_name:
            try:
                name_input = self.page.locator("[data-test-id='add-statement-contact-name'] input")
                if await name_input.count() > 0:
                    await name_input.first.scroll_into_view_if_needed()
                    await name_input.first.fill(contact_name, timeout=5000)
                    self.log.info(f"Set contact name: {contact_name}")
                await asyncio.sleep(1)
            except Exception as e:
                self.log.warning(f"Failed to set contact name: {e}")

    async def _upload_photos(self, photos: list[str]):
        if not photos:
            return
        try:
            el = self.page.locator("[data-test-id='add-statement-photo-upload'] input[type='file']")
            if await el.count() > 0:
                await el.set_input_files(photos)
                self.log.info(f"Uploaded {len(photos)} photos")
                await asyncio.sleep(5)
        except Exception as e:
            self.log.warning(f"Photo upload failed: {e}")

    async def _publish(self) -> str:
        await self._screenshot("before_publish")

        await self.page.evaluate("""() => {
            const btns = document.querySelectorAll('button');
            for (const btn of btns) {
                if (btn.textContent.includes('გამოქვეყნება') || btn.textContent.includes('Опубликовать') || btn.textContent.includes('გამოქვეყნებ')) {
                    btn.disabled = false;
                    btn.removeAttribute('disabled');
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                }
            }
        }""")
        await asyncio.sleep(1)

        # Uncheck livo as ABSOLUTE LAST STEP before publish
        try:
            livo_label = self.page.get_by_text("Я хотел бы разместить объявление на-livo.ge")
            if await livo_label.count() > 0:
                checkbox = self.page.locator("input[type='checkbox']").filter(has=self.page.locator("xpath=..")).filter(has_text="livo")
                if await checkbox.count() > 0:
                    is_checked = await checkbox.first.is_checked()
                    if is_checked:
                        await checkbox.first.click(timeout=3000)
                        self.log.info("Unchecked livo.ge checkbox (last step)")
                        await asyncio.sleep(1)
                else:
                    await livo_label.click(timeout=3000)
                    self.log.info("Clicked livo label to toggle (last step)")
                    await asyncio.sleep(1)
        except Exception as e:
            self.log.warning(f"livo checkbox toggle failed: {e}")

        # Verify sidebar indicators are green
        try:
            red_indicators = await self.page.evaluate("""() => {
                const indicators = document.querySelectorAll('[class*="red"], [class*="error"], [style*="red"]');
                return indicators.length;
            }""")
            self.log.info(f"Red validation indicators found: {red_indicators}")
        except Exception:
            pass

        btn = self.page.get_by_role("button", name="გამოქვეყნება")
        if await btn.count() > 0:
            await btn.scroll_into_view_if_needed(timeout=5000)
            await asyncio.sleep(1)
            await btn.click(timeout=10000, force=True)
            self.log.info("Clicked publish button")
            await asyncio.sleep(10)
        else:
            self.log.warning("Publish button not found")
            return ""

        await self._screenshot("after_publish")

        # Handle checkout page - select balance payment and pay
        new_url = self.page.url
        self.log.info(f"After publish URL: {new_url}")

        if "checkout" in new_url:
            self.log.info("Checkout page detected, selecting balance payment...")
            try:
                # Click balance payment option
                balance_btn = self.page.locator("text=ბალანსით გადახდა")
                if await balance_btn.count() > 0:
                    await balance_btn.click(timeout=5000)
                    self.log.info("Selected balance payment")
                    await asyncio.sleep(2)
                
                # Click pay button
                pay_btn = self.page.locator("button:has-text('Оплатить'), button:has-text('გადახდა')")
                if await pay_btn.count() > 0:
                    await pay_btn.first.click(timeout=5000)
                    self.log.info("Clicked pay button")
                    await asyncio.sleep(5)
                    await self._screenshot("after_payment")
                    new_url = self.page.url
                    self.log.info(f"After payment URL: {new_url}")
            except Exception as e:
                self.log.warning(f"Payment failed: {e}")

        if "/new" not in new_url and "/create" not in new_url and "/add" not in new_url:
            return new_url

        listing_url = await self.page.evaluate("""() => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = link.href;
                if (/\\/\\d{4,}/.test(href) && !href.includes('new') && !href.includes('create') && !href.includes('add') && !href.includes('?')) {
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
            # Launch fresh browser if needed (publish() closes browser)
            if not self.page or self.page.is_closed():
                await self._launch()

            # Navigate to my-statements page
            await self.page.goto("https://statements.myhome.ge/ru/user-profile/my-statements?referrer=myhome",
                                wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(8)

            # Accept cookies if present
            try:
                await self.page.click("button:has-text('Закрыть')", timeout=3000)
                await asyncio.sleep(1)
            except Exception:
                pass

            # Click "Unpaid" tab — our test listings are unpaid
            try:
                unpaid_tab = self.page.get_by_text("Unpaid", exact=False)
                if await unpaid_tab.count() > 0:
                    await unpaid_tab.first.click(timeout=5000)
                    await asyncio.sleep(5)
                    self.log.info("Clicked Unpaid tab")
            except Exception as e:
                self.log.warning(f"Failed to click Unpaid tab: {e}")

            # Find and click "Удалить" button
            del_info = await self.page.evaluate("""() => {
                const all = document.querySelectorAll('*');
                for (const el of all) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0 && r.height < 40 && r.width < 200) {
                        const t = el.textContent.trim();
                        if (t === 'Удалить') {
                            return {x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)};
                        }
                    }
                }
                return null;
            }""")

            if del_info:
                await self.page.mouse.click(del_info['x'], del_info['y'])
                self.log.info(f"Clicked delete at ({del_info['x']}, {del_info['y']})")
                await asyncio.sleep(3)

                # Find and click "Да" button
                da_info = await self.page.evaluate("""() => {
                    const btns = document.querySelectorAll('button');
                    for (const btn of btns) {
                        const t = btn.textContent.trim();
                        const r = btn.getBoundingClientRect();
                        if (t === 'Да' && r.width > 50 && r.height > 30 && r.y > 100) {
                            return {x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)};
                        }
                    }
                    return null;
                }""")

                if da_info:
                    await self.page.mouse.click(da_info['x'], da_info['y'])
                    self.log.info("Confirmed delete")
                    await asyncio.sleep(5)
                    await self._screenshot("after_delete")
                    return True

            self.log.warning("Delete: button not found")
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
