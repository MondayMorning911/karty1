import asyncio
import json
import re
import requests
from sites.base import BaseSite
from config import TIMEOUT, TELEGRAM_BOT_TOKEN, TELEGRAM_NOTIFY_CHAT_ID


def _send_tg_notify(text: str):
    """Send Telegram notification if bot token and chat ID are configured."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_NOTIFY_CHAT_ID:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_NOTIFY_CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
    except Exception:
        pass

CREATE_URL = "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/create"

# Russian → Georgian street name transliteration
STREET_TO_GEORGIAN = {
    "Руставели": "რუსთაველი",
    "Химшиашвили": "ხიმშიაშვილი",
    "Чикованი": "ჩიკოვანი",
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
    "Ладо Асатиани": "ლადო ასათიანი",
    "Костава": "კოსტავა",
    "Жвания": "ჟვანია",
    "Табидзе": "თაბიძე",
    "Ниношвили": "ნინოშვილი",
    "Гамсахурдиа": "გამსახურდია",
    "Университети": "უნივერსიტეტი",
    "Саакадзе": "სააკაძე",
    "Давит Асатიაни": "დავით ასათიანი",
    "Баланчивадзе": "ბალანჩივაძე",
    "Пирвели Дигомი": "პირველი დიღომი",
    "Меоре Дигოми": "მეორე დიღომი",
    "Сабуртало": "საბურთალო",
    "Вера": "ვერა",
    "Мтацминდა": "მთაწმინდა",
    "Крцанисი": "კრწანისი",
    "Чугурეти": "ჭუგურეთი",
    "Сталини": "სტალინი",
}


def _to_georgian_street(street: str) -> str:
    """Convert Russian street name to Georgian. If already Georgian, return as-is."""
    if any('\u10d0' <= c <= '\u10ff' for c in street):
        return street
    clean = street.replace("ул.", "").replace("улица", "").replace("проспект", "").replace("пр.", "").strip()
    if clean in STREET_TO_GEORGIAN:
        return STREET_TO_GEORGIAN[clean]
    return clean


class SsGeSite(BaseSite):
    name = "ss_ge"
    base_url = "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C"

    async def _launch(self):
        from playwright.async_api import async_playwright
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
            with open('/root/karty-lab/cookies/ss_ge.json') as f:
                raw = json.load(f)
            cookies = []
            for c in raw:
                d = c.get('domain', '')
                if 'ss.ge' not in d:
                    continue
                entry = {
                    'name': c.get('name', ''),
                    'value': c.get('value', ''),
                    'domain': d,
                    'path': c.get('path', '/'),
                }
                # Handle expires: skip -1 (session cookies) or use valid timestamps
                exp = c.get('expirationDate') or c.get('expires')
                if exp and isinstance(exp, (int, float)) and exp > 0:
                    entry['expires'] = exp
                # Handle sameSite
                ss = c.get('sameSite', 'Lax')
                if ss in ('Strict', 'Lax'):
                    entry['sameSite'] = ss
                else:
                    entry['sameSite'] = 'None'
                # Handle secure flag
                if c.get('secure', False):
                    entry['secure'] = True
                # Handle httpOnly
                if c.get('httpOnly', False):
                    entry['httpOnly'] = True
                cookies.append(entry)
            await self.context.add_cookies(cookies)
            self.log.info(f"Loaded {len(cookies)} cookies")
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
            if hasattr(self, '_pw') and self._pw:
                await self._pw.stop()
        except Exception:
            pass
        self._pw = None

    async def _verify_auth(self) -> bool:
        try:
            await self.page.goto(CREATE_URL, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(10)
            # Check if "Авторизация" button is visible = NOT logged in
            is_logged = await self.page.evaluate("""() => {
                const links = document.querySelectorAll('a, button, span');
                for (const el of links) {
                    const text = el.textContent.trim();
                    if (text === 'Авторизация' || text === 'Войти' || text === 'Login') {
                        return false;
                    }
                }
                return true;
            }""")
            if is_logged:
                self.log.info("Auth OK on ss.ge")
                return True
            else:
                self.log.warning("Not authenticated on ss.ge - Авторизация visible")
                return False
        except Exception as e:
            self.log.error(f"Auth check failed: {e}")
            return False

    async def _check_balance(self) -> str:
        try:
            await self.page.goto("https://home.ss.ge/ru/user/my-applications", wait_until="domcontentloaded", timeout=TIMEOUT)
            await asyncio.sleep(4)
            body = await self.page.locator("body").inner_text()
            match = re.search(r"Баланс\s*([\d\s,.]+)\s*₾", body, re.IGNORECASE)
            if not match:
                self.log.warning("SS.ge balance was not visible; continuing to publish")
                return ""
            amount = float(match.group(1).replace(" ", "").replace(",", "."))
            self.log.info(f"SS.ge balance precheck: {amount:.2f} GEL")
            if amount <= 0:
                return f"SS.ge balance is insufficient: {amount:.2f} GEL"
        except Exception as exc:
            self.log.warning(f"SS.ge balance precheck failed; continuing to publish: {exc}")
        return ""

    async def _dismiss_draft_modal(self):
        result = await self.page.evaluate("""() => {
            const allEls = document.querySelectorAll('button, a, div, span');
            for (const el of allEls) {
                const text = el.textContent.trim();
                if (text === 'Добавить новое заявление' && el.getBoundingClientRect().width > 0) {
                    el.click();
                    return 'clicked_new';
                }
            }
            return 'not_found';
        }""")
        if result == 'clicked_new':
            self.log.info("Dismissed draft modal: clicked 'Добавить новое заявление'")
            await asyncio.sleep(3)
        else:
            self.log.info("No draft modal found")

    async def _mouse_click_text(self, text: str, description: str = "") -> bool:
        try:
            coords = await self.page.evaluate("""(text) => {
                const allEls = document.querySelectorAll('div, span, button, a, label, p');
                let best = null;
                let bestArea = 999999;
                for (const el of allEls) {
                    const t = el.textContent.trim();
                    const rect = el.getBoundingClientRect();
                    if (t === text && rect.width > 0 && rect.height > 0 && rect.height < 80 && rect.width < 400) {
                        const area = rect.width * rect.height;
                        if (area < bestArea) {
                            bestArea = area;
                            best = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, tag: el.tagName, w: rect.width, h: rect.height};
                        }
                    }
                }
                return best;
            }""", text)
            if coords:
                self.log.info(f"Found '{text}' as {coords['tag']} ({coords['w']:.0f}x{coords['h']:.0f})")
                await asyncio.sleep(0.3)
                await self.page.mouse.click(coords['x'], coords['y'])
                self.log.info(f"Mouse clicked '{text}' for {description}")
                return True
            else:
                self.log.warning(f"Element with text '{text}' not found")
        except Exception as e:
            self.log.warning(f"Mouse click failed for '{text}': {e}")
        return False

    async def _navigate_to_add(self, deal: str, type_: str):
        await self.page.goto(CREATE_URL, wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(10)
        await self._dismiss_draft_modal()
        await asyncio.sleep(2)

    async def _select_deal(self, deal: str, prop_type: str = ""):
        deal_texts = {"sale": ["Купить"], "rent": ["Снять"], "daily": ["Посуточно"]}
        await asyncio.sleep(1)
        for text in deal_texts.get(deal, []):
            clicked = await self.page.evaluate("""(text) => {
                const allEls = document.querySelectorAll('div, span, p');
                let best = null;
                let bestArea = 999999;
                for (const el of allEls) {
                    const t = el.textContent.trim();
                    const rect = el.getBoundingClientRect();
                    if (t === text && rect.width > 50 && rect.width < 300 && rect.height > 30 && rect.height < 120 && rect.y < 1200) {
                        const area = rect.width * rect.height;
                        if (area < bestArea) {
                            bestArea = area;
                            best = el;
                        }
                    }
                }
                if (best) {
                    best.scrollIntoView({block: 'center'});
                    best.click();
                    return true;
                }
                return false;
            }""", text)
            if clicked:
                self.log.info(f"Selected deal: {text}")
            else:
                self.log.warning(f"Deal '{text}' not found")
            await asyncio.sleep(2)

    async def _select_subtype(self, type_: str, subtype: str):
        self.log.info(f"ss.ge has no subtypes, skipping: {type_}/{subtype}")

    async def _select_type(self, type_: str):
        type_texts = {
            "apartment": ["Квартира"],
            "house": ["Дом"],
            "land": ["Участок", "Учеток"],
            "commercial": ["Коммерческая"],
        }
        await asyncio.sleep(1)
        for text in type_texts.get(type_, []):
            clicked = await self.page.evaluate("""(text) => {
                const allEls = document.querySelectorAll('div, span, p');
                let best = null;
                let bestArea = 999999;
                for (const el of allEls) {
                    const t = el.textContent.trim();
                    const rect = el.getBoundingClientRect();
                    if ((t === text || t.includes(text)) && rect.width > 50 && rect.width < 300 && rect.height > 20 && rect.height < 150 && rect.y < 1200) {
                        const area = rect.width * rect.height;
                        if (area < bestArea) {
                            bestArea = area;
                            best = el;
                        }
                    }
                }
                if (best) {
                    best.scrollIntoView({block: 'center'});
                    best.click();
                    return true;
                }
                return false;
            }""", text)
            if clicked:
                self.log.info(f"Selected type: {text}")
            else:
                self.log.warning(f"Type '{text}' not found")
            await asyncio.sleep(2)

    async def _fill_fields(self, listing: dict):
        prop_type = listing.get("type", "apartment")

        for scroll_y in range(0, 8000, 1000):
            await self.page.evaluate(f"window.scrollTo(0, {scroll_y})")
            await asyncio.sleep(0.3)
        await self.page.evaluate("window.scrollTo(0, 0)")
        await asyncio.sleep(1)

        city = listing.get("city", "")
        if city:
            try:
                clicked = await self.page.evaluate("""(city) => {
                    const controls = document.querySelectorAll('.select__control');
                    for (const c of controls) {
                        const rect = c.getBoundingClientRect();
                        if (rect.width > 100 && rect.height > 30 && rect.y > 0 && rect.y < 3000) {
                            c.click();
                            return {x: rect.x + rect.width/2, y: rect.y + rect.height/2};
                        }
                    }
                    return null;
                }""", city)
                if clicked:
                    await self.page.mouse.click(clicked['x'], clicked['y'])
                    await asyncio.sleep(0.5)
                city_input = self.page.locator('input[id*="react-select"]').first
                await city_input.click(timeout=3000, force=True)
                await city_input.fill(city, timeout=5000)
                await asyncio.sleep(2)
                await self._screenshot("city_dropdown")
                option = self.page.locator(f"[class*='option']:has-text('{city}')").first
                if await option.count() > 0:
                    await option.click(timeout=3000)
                    self.log.info(f"Selected city: {city}")
                else:
                    await self.page.keyboard.press("Enter")
                await asyncio.sleep(2)
                await self._screenshot("city_selected")
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
            # ss.ge streets are in Russian transliterated format: "ул. Руставели", "ул. Костава"
            # Use the original Russian name, not Georgian
            street_search = street_raw
            try:
                clicked = await self.page.evaluate("""() => {
                    const controls = document.querySelectorAll('.select__control');
                    for (const c of controls) {
                        const rect = c.getBoundingClientRect();
                        const text = c.textContent.trim();
                        if (text === 'Улица' && rect.width > 50 && rect.y > 0) {
                            c.click();
                            return {x: rect.x + rect.width/2, y: rect.y + rect.height/2};
                        }
                    }
                    for (const c of controls) {
                        const rect = c.getBoundingClientRect();
                        if (rect.width > 50 && rect.y > 1500 && rect.y < 3000) {
                            c.click();
                            return {x: rect.x + rect.width/2, y: rect.y + rect.height/2};
                        }
                    }
                    return null;
                }""")
                if clicked:
                    await self.page.mouse.click(clicked['x'], clicked['y'])
                    await asyncio.sleep(0.5)
                street_input = self.page.locator('input[id*="react-select"]').nth(1)
                await street_input.click(timeout=3000, force=True)
                # IMPORTANT: use .type() not .fill() — React Select needs keystroke events
                await street_input.type(street_search, delay=80)
                await asyncio.sleep(3)
                await self._screenshot("street_dropdown")
                # Try to find option containing the street name
                option = await self.page.evaluate("""(street) => {
                    const opts = document.querySelectorAll('[class*="option"]');
                    for (const o of opts) {
                        const t = o.textContent.trim();
                        if (t.includes(street) && o.getBoundingClientRect().width > 0) {
                            o.click();
                            return t.substring(0, 60);
                        }
                    }
                    // Try first option if nothing matches exactly
                    for (const o of opts) {
                        if (o.getBoundingClientRect().width > 0 && !o.textContent.includes('не найдено')) {
                            o.click();
                            return 'first: ' + o.textContent.trim().substring(0, 60);
                        }
                    }
                    return null;
                }""", street_search)
                if option:
                    self.log.info(f"Selected street: {option}")
                else:
                    self.log.warning(f"No street option found for '{street_search}'")
                    await self.page.keyboard.press("Escape")
                await asyncio.sleep(2)
                await self._screenshot("street_selected")
            except Exception as e:
                self.log.warning(f"Failed to set street: {e}")

            if house_num:
                try:
                    await self.page.evaluate("""(val) => {
                        const inputs = document.querySelectorAll('input');
                        for (const el of inputs) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                const ph = el.placeholder || '';
                                if (ph.includes('номер дома') || ph.includes('дом')) {
                                    el.scrollIntoView({block: 'center'});
                                    el.focus();
                                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                    nativeSetter.call(el, val);
                                    el.dispatchEvent(new Event('input', {bubbles: true}));
                                    el.dispatchEvent(new Event('change', {bubbles: true}));
                                    return true;
                                }
                            }
                        }
                        return false;
                    }""", house_num)
                    self.log.info(f"Set house number: {house_num}")
                except Exception as e:
                    self.log.warning(f"Failed to set house number: {e}")

        await asyncio.sleep(1)

        rooms = listing.get("rooms", "")
        if rooms and prop_type in ("apartment", "house"):
            rooms_str = str(rooms)
            clicked = await self.page.evaluate("""(text) => {
                const divs = document.querySelectorAll('div.sc-9e0391b6-0');
                for (const div of divs) {
                    const p = div.querySelector('p');
                    if (p && p.textContent.trim() === text) {
                        div.scrollIntoView({block: 'center'});
                        div.click();
                        return true;
                    }
                }
                return false;
            }""", rooms_str)
            if clicked:
                self.log.info(f"Selected rooms: {rooms_str}")
            else:
                self.log.warning(f"Rooms '{rooms_str}' not found")
            await asyncio.sleep(1)
            await self._screenshot("rooms_selected")

        area = listing.get("area", "")
        if area:
            try:
                total_input = self.page.locator('input[name="totalArea"]')
                if await total_input.count() > 0:
                    await total_input.scroll_into_view_if_needed()
                    await total_input.click(force=True)
                    await total_input.fill(str(area))
                    self.log.info(f"Set totalArea via Playwright: {area}")
                else:
                    await self.page.evaluate("""(val) => {
                        const inputs = document.querySelectorAll('input');
                        for (const el of inputs) {
                            const label = el.closest('[class*="field"], [class*="row"]')?.textContent || '';
                            const ph = el.placeholder || '';
                            if ((label.includes('площадь дома') || label.includes('площадь участка') || ph.includes('площадь')) && el.getBoundingClientRect().width > 0) {
                                el.scrollIntoView({block: 'center'});
                                el.focus();
                                const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                ns.call(el, val);
                                el.dispatchEvent(new Event('input', {bubbles: true}));
                                el.dispatchEvent(new Event('change', {bubbles: true}));
                                return true;
                            }
                        }
                        return false;
                    }""", str(area))
                    self.log.info(f"Set area via JS label match: {area}")
            except Exception as e:
                self.log.warning(f"area fill failed: {e}")

            if prop_type == "house":
                land_area = listing.get("yard_area", "")
                if not land_area:
                    land_area = listing.get("house", {}).get("land_area", "") if isinstance(listing.get("house"), dict) else ""
                if land_area:
                    try:
                        # Use Playwright fill for React forms
                        yard_input = self.page.get_by_placeholder("Площадь двора")
                        if await yard_input.count() > 0:
                            await yard_input.scroll_into_view_if_needed()
                            await yard_input.click(force=True)
                            await yard_input.fill(str(land_area))
                            self.log.info(f"Set yard area via Playwright: {land_area}")
                        else:
                            # Fallback: find label "Площадь двора" and fill adjacent input
                            filled = await self.page.evaluate("""(val) => {
                                const allInputs = document.querySelectorAll('input');
                                for (const inp of allInputs) {
                                    const r = inp.getBoundingClientRect();
                                    if (r.width < 30 || r.height < 10) continue;
                                    let node = inp;
                                    for (let i = 0; i < 10 && node; i++) {
                                        const prev = node.previousElementSibling;
                                        if (prev) {
                                            const txt = prev.textContent.trim();
                                            if (txt.includes('Площадь двора')) {
                                                inp.scrollIntoView({block: 'center'});
                                                inp.focus();
                                                inp.value = val;
                                                inp.dispatchEvent(new Event('input', {bubbles: true}));
                                                inp.dispatchEvent(new Event('change', {bubbles: true}));
                                                return true;
                                            }
                                        }
                                        node = node.parentElement;
                                    }
                                }
                                return false;
                            }""", str(land_area))
                            if filled:
                                self.log.info(f"Set yard area via JS: {land_area}")
                            else:
                                self.log.warning("Could not find yard area input")
                    except Exception as e:
                        self.log.warning(f"yardArea fill failed: {e}")

            kitchen_area = str(int(area) // 6) if area and prop_type == "apartment" else ""
            if kitchen_area:
                try:
                    kitchen_input = self.page.locator('input[name="kitchenArea"]')
                    await kitchen_input.scroll_into_view_if_needed()
                    await kitchen_input.click(force=True)
                    await kitchen_input.fill(kitchen_area)
                    self.log.info(f"Set kitchenArea via Playwright: {kitchen_area}")
                except Exception as e:
                    self.log.warning(f"kitchenArea Playwright fill failed: {e}, trying JS")
                    await self.page.evaluate("""(val) => {
                        const el = document.querySelector('input[name="kitchenArea"]');
                        if (el) {
                            el.scrollIntoView({block: 'center'});
                            el.focus();
                            const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                            ns.call(el, val);
                            el.dispatchEvent(new Event('input', {bubbles: true}));
                            el.dispatchEvent(new Event('change', {bubbles: true}));
                        }
                    }""", kitchen_area)
            await asyncio.sleep(1)
            await self._screenshot("area_set")

        floor = listing.get("floor", "")
        if floor and prop_type not in ("land", "house"):
            try:
                floor_input = self.page.locator('input[name="floor"]')
                if await floor_input.count() == 0:
                    floor_input = self.page.locator('input').filter(has_text="").nth(0)
                floor_locator = self.page.locator('input[name="floor"]')
                await floor_locator.scroll_into_view_if_needed()
                await floor_locator.click(force=True)
                await floor_locator.fill(str(floor))
                self.log.info(f"Set floor via Playwright: {floor}")
            except Exception as e:
                self.log.warning(f"floor Playwright fill failed: {e}")
                await self.page.evaluate("""(val) => {
                    const inputs = document.querySelectorAll('input');
                    for (const el of inputs) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            const name = el.name || '';
                            if (name.includes('floor') && !name.includes('floors') && !name.includes('total')) {
                                el.scrollIntoView({block: 'center'});
                                el.focus();
                                const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                ns.call(el, val);
                                el.dispatchEvent(new Event('input', {bubbles: true}));
                                el.dispatchEvent(new Event('change', {bubbles: true}));
                                return true;
                            }
                        }
                    }
                    return false;
                }""", str(floor))
            self.log.info(f"Set floor: {floor}")

        floors_total = listing.get("floors_total", "")
        if floors_total and prop_type not in ("land", "house"):
            try:
                ft_input = self.page.locator('input[name="totalFloors"]')
                if await ft_input.count() == 0:
                    ft_input = self.page.locator('input[name="floors"]')
                await ft_input.scroll_into_view_if_needed()
                await ft_input.click(force=True)
                await ft_input.fill(str(floors_total))
                self.log.info(f"Set floors via Playwright: {floors_total}")
            except Exception as e:
                self.log.warning(f"floors Playwright fill failed: {e}")
                await self.page.evaluate("""(val) => {
                    const inputs = document.querySelectorAll('input');
                    for (const el of inputs) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            const name = el.name || '';
                            if (name.includes('floors') || name.includes('totalFloor')) {
                                el.scrollIntoView({block: 'center'});
                                el.focus();
                                const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                ns.call(el, val);
                                el.dispatchEvent(new Event('input', {bubbles: true}));
                                el.dispatchEvent(new Event('change', {bubbles: true}));
                                return true;
                            }
                        }
                    }
                    return false;
                }""", str(floors_total))
            self.log.info(f"Set floors: {floors_total}")

        await asyncio.sleep(1)

        bedrooms = listing.get("bedrooms", "")
        if bedrooms and prop_type in ("apartment", "house"):
            bedrooms_str = str(bedrooms)
            clicked = await self.page.evaluate("""(text) => {
                const headings = document.querySelectorAll('p, span, div, label');
                for (const h of headings) {
                    const ht = h.textContent.trim();
                    if ((ht === 'Спальни' || ht === 'Спальни*' || ht === 'Спальня' || ht === 'Спальня*') && h.getBoundingClientRect().width > 0) {
                        let container = h.parentElement;
                        for (let i = 0; i < 5; i++) {
                            if (!container) break;
                            const btns = container.querySelectorAll('div.sc-9e0391b6-0, div[class*="pill"], div[role="button"]');
                            for (const btn of btns) {
                                const p = btn.querySelector('p');
                                if (p && p.textContent.trim() === text) {
                                    btn.scrollIntoView({block: 'center'});
                                    btn.click();
                                    return true;
                                }
                            }
                            const allDivs = container.querySelectorAll('div');
                            for (const d of allDivs) {
                                const dp = d.querySelector('p');
                                const dt = dp ? dp.textContent.trim() : d.textContent.trim();
                                const rect = d.getBoundingClientRect();
                                if (dt === text && rect.width > 20 && rect.width < 80 && rect.height > 20 && rect.height < 60 && rect.y > 0 && rect.y < 4000) {
                                    d.scrollIntoView({block: 'center'});
                                    d.click();
                                    return true;
                                }
                            }
                            container = container.parentElement;
                        }
                        break;
                    }
                }
                return false;
            }""", bedrooms_str)
            if clicked:
                self.log.info(f"Selected bedrooms: {bedrooms_str}")
            else:
                self.log.warning(f"Bedrooms '{bedrooms_str}' not found")
            await asyncio.sleep(1)
            await self._screenshot("bedrooms_selected")

        # Status: click first pill under "Статус*" heading by DOM position
        clicked = await self.page.evaluate("""() => {
            const headings = document.querySelectorAll('p, span, div, label, h2, h3, h4, h5, h6');
            for (const h of headings) {
                const ht = h.textContent.trim();
                if ((ht === 'Статус*' || ht === 'Статус') && h.getBoundingClientRect().width > 0) {
                    let container = h.parentElement;
                    for (let i = 0; i < 10; i++) {
                        if (!container) break;
                        const pills = container.querySelectorAll('.sc-9e0391b6-0');
                        if (pills.length > 0) {
                            const firstPill = pills[0];
                            firstPill.scrollIntoView({block: 'center'});
                            const rect = firstPill.getBoundingClientRect();
                            return {x: rect.x + rect.width/2, y: rect.y + rect.height/2, text: firstPill.textContent.trim()};
                        }
                        container = container.parentElement;
                    }
                    break;
                }
            }
            return null;
        }""")
        if clicked:
            await self.page.mouse.click(clicked['x'], clicked['y'])
            self.log.info(f"Selected status: {clicked['text']}")
        else:
            self.log.warning("Status pills not found")
        await asyncio.sleep(1)
        await self._screenshot("status_selected")

        # Condition (Состояние*) — required for house
        if prop_type == "house":
            condition_text = "Отремонтированный"
            clicked = await self.page.evaluate("""(text) => {
                const headings = document.querySelectorAll('p, span, div, label');
                for (const h of headings) {
                    const ht = h.textContent.trim();
                    if ((ht === 'Состояние*' || ht === 'Состояние') && h.getBoundingClientRect().width > 0) {
                        let container = h.parentElement;
                        for (let i = 0; i < 10; i++) {
                            if (!container) break;
                            const pills = container.querySelectorAll('.sc-9e0391b6-0');
                            if (pills.length > 0) {
                                for (const pill of pills) {
                                    const p = pill.querySelector('p');
                                    if (p && p.textContent.trim() === text) {
                                        pill.scrollIntoView({block: 'center'});
                                        pill.click();
                                        return true;
                                    }
                                }
                                const allDivs = container.querySelectorAll('div');
                                for (const d of allDivs) {
                                    const dp = d.querySelector('p');
                                    const dt = dp ? dp.textContent.trim() : d.textContent.trim();
                                    const rect = d.getBoundingClientRect();
                                    if (dt === text && rect.width > 20 && rect.width < 200 && rect.height > 20 && rect.height < 60) {
                                        d.scrollIntoView({block: 'center'});
                                        d.click();
                                        return true;
                                    }
                                }
                            }
                            container = container.parentElement;
                        }
                        break;
                    }
                }
                return false;
            }""", condition_text)
            if clicked:
                self.log.info(f"Selected condition: {condition_text}")
            else:
                self.log.warning(f"Condition pill '{condition_text}' not found")
            await asyncio.sleep(1)
            await self._screenshot("condition_selected")

        # Price type: click radio "Полная стоимость" via JS
        await self.page.evaluate("""() => {
            const radios = document.querySelectorAll('input[type="radio"]');
            for (const r of radios) {
                const label = r.closest('label');
                if (label && label.textContent.includes('Полная стоимость')) {
                    r.click();
                    return true;
                }
            }
            const allEls = document.querySelectorAll('span, div, label, p');
            for (const el of allEls) {
                if (el.textContent.trim() === 'Полная стоимость' && el.getBoundingClientRect().width > 30) {
                    el.click();
                    return true;
                }
            }
            return false;
        }""")
        await asyncio.sleep(2)
        await self._screenshot("price_type_selected")

        price = listing.get("price", "")
        currency = listing.get("currency", "USD")
        if price:
            try:
                # Scroll to price section
                await self.page.evaluate("""() => {
                    const allEls = document.querySelectorAll('p, h2, h3, h4, h5, h6, span, div');
                    for (const h of allEls) {
                        const text = h.textContent.trim();
                        if (text.startsWith('Цена') && h.getBoundingClientRect().width > 30 && h.getBoundingClientRect().height < 50) {
                            h.scrollIntoView({block: 'start'});
                            return true;
                        }
                    }
                    window.scrollTo(0, document.body.scrollHeight);
                    return false;
                }""")
                await asyncio.sleep(2)

                # Find price inputs: look for ALL inputs on page, filter by y position after Цена heading
                price_inputs = await self.page.evaluate("""() => {
                    let headingY = 0;
                    let headingText = '';
                    const allEls = document.querySelectorAll('p, h2, h3, h4, h5, h6, span, div');
                    for (const h of allEls) {
                        const text = h.textContent.trim();
                        const r = h.getBoundingClientRect();
                        if (text.startsWith('Цена') && r.width > 30 && r.height > 5 && r.height < 50) {
                            if (r.y > headingY) {
                                headingY = r.y;
                                headingText = text.substring(0, 30);
                            }
                        }
                    }
                    if (headingY === 0) return [];

                    const results = [];
                    const inputs = document.querySelectorAll('input');
                    for (const inp of inputs) {
                        const r = inp.getBoundingClientRect();
                        if (r.width > 30 && r.height > 10 && r.y > headingY && r.y < headingY + 100) {
                            results.push({
                                x: Math.round(r.x), y: Math.round(r.y),
                                w: Math.round(r.width), h: Math.round(r.height),
                                name: inp.name || '', type: inp.type || '',
                                placeholder: inp.placeholder || '',
                            });
                        }
                    }
                    return results;
                }""")

                self.log.info(f"Price inputs found: {len(price_inputs)}")
                for pi in price_inputs:
                    self.log.info(f"  Input: x={pi['x']} y={pi['y']} w={pi['w']} name={pi['name']} ph={pi['placeholder']}")
                if len(price_inputs) == 0:
                    debug = await self.page.evaluate("""() => {
                        const allEls = document.querySelectorAll('p, h2, h3, h4, h5, h6, span, div');
                        let headingY = 0;
                        let headingText = '';
                        for (const h of allEls) {
                            const text = h.textContent.trim();
                            const r = h.getBoundingClientRect();
                            if (text.startsWith('Цена') && r.width > 30 && r.height < 50 && r.height > 5) {
                                headingY = r.y;
                                headingText = text.substring(0, 30);
                                break;
                            }
                        }
                        const allInputs = [];
                        for (const inp of document.querySelectorAll('input')) {
                            const r = inp.getBoundingClientRect();
                            if (r.width > 0 && r.height > 0) {
                                allInputs.push({x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), name: inp.name || '', ph: (inp.placeholder || '').substring(0, 20)});
                            }
                        }
                        return {headingY: Math.round(headingY), headingText, inputCount: allInputs.length, inputs: allInputs.slice(-10)};
                    }""")
                    self.log.info(f"Price debug: headingY={debug['headingY']} text='{debug['headingText']}' inputs={debug['inputCount']}")
                    for inp in debug['inputs']:
                        self.log.info(f"  Last inputs: x={inp['x']} y={inp['y']} name='{inp['name']}' ph='{inp['ph']}'")

                # Find the GEL input (type=number) and USD div
                # GEL = standard <input type="number">, USD = custom <div class="sc-c963185b-3">
                price_data = await self.page.evaluate("""() => {
                    let headingY = 0;
                    const allEls = document.querySelectorAll('p, h2, h3, h4, h5, h6, span, div');
                    for (const h of allEls) {
                        const text = h.textContent.trim();
                        const r = h.getBoundingClientRect();
                        if (text.startsWith('Цена') && r.width > 30 && r.height > 5 && r.height < 50) {
                            if (r.y > headingY) headingY = r.y;
                        }
                    }
                    if (headingY === 0) return null;

                    // Find GEL input (type=number near headingY)
                    let gelInput = null;
                    for (const inp of document.querySelectorAll('input[type="number"]')) {
                        const r = inp.getBoundingClientRect();
                        if (r.width > 30 && r.height > 10 && r.y > headingY - 20 && r.y < headingY + 150) {
                            gelInput = {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
                            break;
                        }
                    }

                    // Find USD div (sc-c963185b-3 class near headingY)
                    let usdDiv = null;
                    for (const d of document.querySelectorAll('div[class*="sc-c963185b-3"]')) {
                        const r = d.getBoundingClientRect();
                        if (r.width > 50 && r.height > 15 && r.y > headingY - 20 && r.y < headingY + 150) {
                            usdDiv = {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
                            break;
                        }
                    }

                    return {headingY: Math.round(headingY), gelInput, usdDiv};
                }""")

                self.log.info(f"Price data: {json.dumps(price_data, ensure_ascii=False)[:200]}")

                # If currency is USD, click USD label first to switch mode
                if currency == "USD":
                    clicked_usd = await self.page.evaluate("""() => {
                        const labels = document.querySelectorAll('label');
                        for (const label of labels) {
                            const text = label.textContent.trim();
                            if (text.includes('$') && !text.includes('₾')) {
                                label.click();
                                return true;
                            }
                        }
                        return false;
                    }""")
                    if clicked_usd:
                        self.log.info("Switched to USD mode")
                        await asyncio.sleep(1)

                # Fill price - find the active input (after USD switch, input moves to x~479)
                price_input = self.page.locator('input[type="number"]')
                if await price_input.count() > 0:
                    # Find the input closest to USD label position (x>400) or just use the last one
                    for i in range(await price_input.count()):
                        inp = price_input.nth(i)
                        box = await inp.bounding_box()
                        if box and box['x'] > 400 and currency == "USD":
                            await inp.scroll_into_view_if_needed()
                            await inp.click(force=True)
                            await asyncio.sleep(0.3)
                            await inp.fill(str(price))
                            self.log.info(f"Price USD={price} filled in USD field (x={box['x']:.0f})")
                            break
                        elif box and box['x'] < 300 and currency != "USD":
                            await inp.scroll_into_view_if_needed()
                            await inp.click(force=True)
                            await asyncio.sleep(0.3)
                            await inp.fill(str(price))
                            self.log.info(f"Price GEL={price} filled in GEL field")
                            break
                    else:
                        # Fallback: fill the first number input
                        first_input = price_input.first
                        await first_input.scroll_into_view_if_needed()
                        await first_input.click(force=True)
                        await asyncio.sleep(0.3)
                        await first_input.fill(str(price))
                        self.log.info(f"Price {currency}={price} filled in first input")
                elif price_inputs:
                    # Fallback: sort standard inputs by X
                    price_inputs.sort(key=lambda p: p['x'])
                    target = price_inputs[1] if currency == "USD" and len(price_inputs) > 1 else price_inputs[0]
                    x = target['x'] + target['w'] // 2
                    y = target['y'] + target['h'] // 2
                    await self.page.mouse.click(x, y)
                    await asyncio.sleep(0.5)
                    await self.page.keyboard.press("Control+a")
                    await self.page.keyboard.type(str(price), delay=30)
                    self.log.info(f"Price {currency}={price} at ({x},{y}) via fallback")
                else:
                    self.log.warning("Price inputs NOT found by any method")
            except Exception as e:
                self.log.warning(f"price fill failed: {e}")
            await asyncio.sleep(2)
            await self._screenshot("price_set")

        desc = listing.get("description", "")
        if desc:
            try:
                desc_input = self.page.locator("textarea")
                if await desc_input.count() > 0:
                    await desc_input.first.scroll_into_view_if_needed()
                    await desc_input.first.click(force=True)
                    await asyncio.sleep(0.3)
                    await desc_input.first.fill(desc)
                    self.log.info("Filled description via Playwright fill()")
                else:
                    self.log.warning("No textarea found for description")
            except Exception as e:
                self.log.warning(f"Description fill failed: {e}")
                # Fallback: JS approach
                await self.page.evaluate("""(desc) => {
                    const el = document.querySelector('textarea');
                    if (el) {
                        el.scrollIntoView({block: 'center'});
                        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                        nativeSetter.call(el, desc);
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                        el.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                }""", desc)
                self.log.info("Filled description via JS fallback")
            await asyncio.sleep(1)
            await self._screenshot("description_set")

        name_val = listing.get("contact_name", "")
        if name_val:
            await self.page.evaluate("""(name) => {
                const el = document.querySelector('input[placeholder*="Имя"]');
                if (el && !el.readOnly && !el.disabled) {
                    el.scrollIntoView({block: 'center'});
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeSetter.call(el, name);
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                }
            }""", str(name_val))
            self.log.info("Filled name")

        phone = listing.get("contact_phone", "")
        if phone:
            phone_clean = phone.replace("+", "").replace(" ", "")
            await self.page.evaluate("""(phone) => {
                const inputs = document.querySelectorAll('input');
                for (const el of inputs) {
                    const rect = el.getBoundingClientRect();
                    const ph = el.placeholder || '';
                    const name = el.name || '';
                    const label = el.closest('[class*="field"], [class*="row"]')?.textContent || '';
                    if (rect.width > 0 && rect.height > 0 && (
                        ph.includes('телефон') || ph.includes('phone') || ph.includes('Номер') ||
                        name.includes('phone') || label.includes('Номер телефона')
                    )) {
                        el.scrollIntoView({block: 'center'});
                        el.focus();
                        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        nativeSetter.call(el, phone);
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                        el.dispatchEvent(new Event('change', {bubbles: true}));
                        return true;
                    }
                }
                return false;
            }""", phone_clean)
            self.log.info(f"Filled phone: {phone_clean}")

    async def _upload_photos(self, photos: list[str]):
        if not photos:
            return
        for selector in [
            "input[type='file'][accept='image/*']",
            "input[type='file'][accept*='image']",
            "input[type='file']",
        ]:
            try:
                el = self.page.locator(selector)
                if await el.count() > 0:
                    await el.set_input_files(photos)
                    self.log.info(f"Uploaded {len(photos)} photos via {selector}")
                    await asyncio.sleep(5)
                    return
            except Exception as e:
                self.log.warning(f"Photo upload failed ({selector}): {e}")
        self.log.warning("No file input found for photo upload")

    async def _publish(self) -> str:
        captured_responses = []

        async def on_response(response):
            url = response.url
            if any(kw in url for kw in ['/api/', '/graphql', 'listing', 'post', 'ad', 'create', 'publish', 'RealEstate', 'draft']):
                try:
                    body = await response.text()
                    captured_responses.append({"url": url, "status": response.status, "body": body[:2000]})
                    self.log.info(f"API response: {url} status={response.status}")
                except Exception:
                    pass

        self.page.on("response", on_response)

        await self._screenshot("before_publish")

        # Check for validation errors before clicking
        errors_before = await self.page.evaluate("""() => {
            const errors = [];
            const redEls = document.querySelectorAll('[class*="error"], [class*="invalid"], [style*="red"], .text-red-500, .text-red-600');
            for (const el of redEls) {
                const text = el.textContent.trim();
                if (text && text.length < 200) errors.push(text);
            }
            const requiredMsgs = document.querySelectorAll('*');
            for (const el of requiredMsgs) {
                const text = el.textContent.trim();
                if (text.includes('обязательно') && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height < 30) {
                    errors.push(text);
                }
            }
            return [...new Set(errors)];
        }""")
        if errors_before:
            self.log.warning(f"Validation errors BEFORE publish: {errors_before}")

        # Dismiss draft modal BEFORE clicking Продолжать
        await self._dismiss_draft_modal()
        await asyncio.sleep(1)

        # Scroll to bottom and click "Продолжать" button
        await self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(2)

        clicked = False
        # Try exact btn-next class first with force=True to bypass overlays
        try:
            btn = self.page.locator("button.btn-next").last
            if await btn.count() > 0:
                await btn.scroll_into_view_if_needed()
                await asyncio.sleep(0.5)
                await btn.click(timeout=5000, force=True)
                clicked = True
                self.log.info("Clicked Продолжать via .btn-next class (force)")
        except Exception as e:
            self.log.warning(f"btn-next click failed: {e}")
        
        # Try Playwright click with force
        if not clicked:
            for btn_text in ["Продолжить →", "Продолжить", "Продолжать", "Далее"]:
                btn = self.page.get_by_text(btn_text, exact=False)
                btn_count = await btn.count()
                if btn_count > 0:
                    try:
                        last_btn = btn.last
                        bbox = await last_btn.bounding_box()
                        if bbox and bbox['width'] > 30 and bbox['height'] > 20:
                            await last_btn.scroll_into_view_if_needed()
                            await last_btn.click(timeout=5000, force=True)
                            clicked = True
                            self.log.info(f"Clicked '{btn_text}' via Playwright (force)")
                            break
                    except Exception as e:
                        self.log.warning(f"Playwright click on '{btn_text}' failed: {e}")

        # Fallback: JS click
        if not clicked:
            clicked_js = await self.page.evaluate("""() => {
                const allEls = document.querySelectorAll('button, a, div[role=button]');
                for (const el of allEls) {
                    const text = el.textContent.trim();
                    if ((text.includes('Продолжить') || text.includes('Продолжать')) && el.getBoundingClientRect().width > 80) {
                        el.scrollIntoView({block: 'center'});
                        el.click();
                        return 'clicked: ' + text.substring(0, 30);
                    }
                }
                return 'not_found';
            }""")
            self.log.info(f"JS publish click: {clicked_js}")
            if 'clicked' in clicked_js:
                clicked = True

        if not clicked:
            self.log.warning("Could not find publish button")
            await self._screenshot("publish_button_not_found")
            return ""

        await asyncio.sleep(8)
        
        # Handle "Обратите внимание!" modal (price validation warning)
        try:
            leave_btn = self.page.get_by_text("Оставить как есть", exact=False)
            if await leave_btn.count() > 0:
                await leave_btn.first.click(timeout=5000)
                self.log.info("Dismissed price warning modal")
                await asyncio.sleep(3)
        except Exception:
            pass
        
        await self._screenshot("after_step1")

        # ── Check payment page after "Продолжить" ──
        page_text = await self.page.evaluate("() => document.body.innerText")
        if "На балансе недостаточно денег" in page_text:
            self.log.warning("Insufficient balance on ss.ge!")
            _send_tg_notify("⚠️ <b>ss.ge — недостаточно баланса</b>\n\nНа аккаунте Даниэль (PIN: 9458836) недостаточно средств для публикации объявления.\nПополните баланс: https://home.ss.ge/ru/user/my-applications")
            await self._screenshot("insufficient_balance")
            raise Exception("На балансе ss.ge недостаточно денег. Пополните баланс: https://home.ss.ge/ru/user/my-applications")

        # Step 2: Click "Размещение заявки" (exact text match)
        self.log.info("Looking for 'Размещение заявки' button...")
        clicked_step2 = False
        
        # Try exact button text first
        try:
            btn = self.page.locator("button:has-text('Размещение заявки')").last
            if await btn.count() > 0:
                await btn.scroll_into_view_if_needed()
                await btn.click(timeout=5000)
                clicked_step2 = True
                self.log.info("Clicked 'Размещение заявки' via exact text")
        except Exception as e:
            self.log.warning(f"Размещение заявки click failed: {e}")
        
        if not clicked_step2:
            for btn_text in ["Размещение заявки", "Разместить", "Опубликовать"]:
                btn = self.page.get_by_text(btn_text, exact=False)
                if await btn.count() > 0:
                    try:
                        last_btn = btn.last
                        bbox = await last_btn.bounding_box()
                        if bbox and bbox['width'] > 30:
                            await last_btn.scroll_into_view_if_needed()
                            await last_btn.click(timeout=5000)
                            clicked_step2 = True
                            self.log.info(f"Clicked '{btn_text}' (step 2)")
                            break
                    except Exception as e:
                        self.log.warning(f"Click '{btn_text}' failed: {e}")

        if not clicked_step2:
            clicked_step2_js = await self.page.evaluate("""() => {
                // First try "Размещение заявки" — the exact text of the modal button
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    const text = btn.textContent.trim();
                    const r = btn.getBoundingClientRect();
                    if (text === 'Размещение заявки' && r.width > 50 && r.y > 0) {
                        btn.scrollIntoView({block: 'center'});
                        btn.click();
                        return 'clicked_exact: ' + text;
                    }
                }
                // Then try "Разместить" (without "объявление") — exclude header links
                for (const btn of btns) {
                    const text = btn.textContent.trim();
                    const r = btn.getBoundingClientRect();
                    if (text === 'Разместить' && r.width > 50 && r.y > 0 && r.height < 60) {
                        btn.scrollIntoView({block: 'center'});
                        btn.click();
                        return 'clicked_btn: ' + text;
                    }
                }
                // Fallback: any button with "Размещение" but NOT "объявление"
                for (const btn of btns) {
                    const text = btn.textContent.trim();
                    const r = btn.getBoundingClientRect();
                    if (text.includes('Размещение') && !text.includes('объявление') && r.width > 30 && r.y > 0) {
                        btn.scrollIntoView({block: 'center'});
                        btn.click();
                        return 'clicked_fallback: ' + text.substring(0, 30);
                    }
                }
                return 'not_found';
            }""")
            self.log.info(f"JS step2: {clicked_step2_js}")
            if 'clicked' in clicked_step2_js:
                clicked_step2 = True

        if clicked_step2:
            self._submit_clicked = True
            await asyncio.sleep(8)
            await self._dismiss_draft_modal()

        await self._screenshot("after_publish")

        new_url = self.page.url
        self.log.info(f"After publish: URL = {new_url}")

        # Check if we left the create page (success)
        if "/create" not in new_url:
            # Validate it's a real listing URL, not a help/error page
            if any(x in new_url for x in ['/help', '/error', '/login', '/auth', 'checkout']):
                self.log.warning(f"Redirected to non-listing page: {new_url}")
            else:
                return new_url

        # Still on create page — check for validation errors
        errors_after = await self.page.evaluate("""() => {
            const errors = [];
            const redEls = document.querySelectorAll('[class*="error"], [class*="invalid"], [style*="red"], .text-red-500, .text-red-600');
            for (const el of redEls) {
                const text = el.textContent.trim();
                if (text && text.length < 200) errors.push(text);
            }
            const requiredMsgs = document.querySelectorAll('*');
            for (const el of requiredMsgs) {
                const text = el.textContent.trim();
                if (text.includes('обязательно') && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height < 30) {
                    errors.push(text);
                }
            }
            return [...new Set(errors)];
        }""")
        if errors_after:
            self.log.warning(f"Validation errors AFTER publish: {errors_after}")

        # Check API responses for listing URL
        for resp in reversed(captured_responses):
            try:
                data = json.loads(resp["body"])
                self.log.info(f"API: {json.dumps(data, ensure_ascii=False)[:300]}")
                for key in ["url", "link", "id", "slug", "postId", "listingId", "applicationId"]:
                    if key in data:
                        val = data[key]
                        if isinstance(val, str) and val.startswith("http"):
                            return val
                        if isinstance(val, (int, str)):
                            return f"https://home.ss.ge/ru/недвижимость/{val}"
            except Exception:
                pass

        # Check for listing link on page
        listing_url = await self.page.evaluate("""() => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = link.href;
                if (href.includes('/недвижимость/') && /\\d{4,}/.test(href) && !href.includes('create') && !href.includes('?')) {
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
        await self.page.goto("https://home.ss.ge/ru/user/my-applications", wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(8)
        address = str(listing.get("address") or listing.get("city") or "").strip()
        price = str(listing.get("price") or "").strip()
        if not address or not price:
            return ""
        return await self.page.evaluate(r"""({ address, price }) => {
            const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            const addressText = normalize(address);
            const priceText = normalize(price);
            const links = [...document.querySelectorAll('a[href*="/недвижимость/"]')];
            for (const link of links) {
                const card = link.closest('article, li, [class*="card"], [class*="item"], div') || link.parentElement;
                const text = normalize(card?.textContent || link.textContent);
                if (addressText.length >= 4 && text.includes(addressText) && text.includes(priceText)) {
                    return link.href;
                }
            }
            return '';
        }""", {"address": address, "price": price})

    async def _delete_listing(self, url: str) -> bool:
        try:
            self.log.info("Navigating to my-applications...")
            await self.page.goto("https://home.ss.ge/ru/user/my-applications",
                                wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(10)
            await self._dismiss_draft_modal()
            await asyncio.sleep(2)
            await self._screenshot("my_applications")

            # Step 1: Find the exact card by listing ID and click its delete control.
            clicked_trash = await self.page.evaluate("""(targetUrl) => {
                const target = String(targetUrl || '').split('?')[0].replace(/\\/$/, '');
                const match = target.match(/(?:\\/|-)\\s*(\\d+)$/);
                const listingId = match && match[1];
                if (!listingId) return 'invalid_listing_id';
                const idNode = [...document.querySelectorAll('*')].find(el =>
                    el.children.length === 0 && el.textContent.trim() === listingId
                );
                if (!idNode) return 'target_id_not_found';
                let card = idNode;
                for (let level = 0; level < 10 && card; level++, card = card.parentElement) {
                    const btn = [...card.querySelectorAll('button')].find(button =>
                        button.textContent.trim() === 'Удалить'
                    );
                    const r = btn?.getBoundingClientRect();
                    if (btn && r && r.width > 20 && r.height > 20 && r.y > 0) {
                        btn.scrollIntoView({block: 'center'});
                        btn.click();
                        return 'target_delete_button';
                    }
                }
                return 'target_delete_not_found';
            }""", url)
            self.log.info(f"Trash icon: {clicked_trash}")

            if clicked_trash != 'target_delete_button':
                self.log.warning(f"Could not find trash icon for exact target: {url}")
                await self._screenshot("delete_failed")
                return False

            await asyncio.sleep(2)
            await self._screenshot("delete_modal")

            # Step 2: Select a reason checkbox in the modal
            reason_selected = await self.page.evaluate("""() => {
                const labels = document.querySelectorAll('label, [class*="checkbox"]');
                for (const label of labels) {
                    const text = label.textContent.trim();
                    if (text.includes('Я передумал') || text.includes('Другое')) {
                        const checkbox = label.querySelector('input[type="checkbox"]') || label;
                        checkbox.click();
                        return text.substring(0, 30);
                    }
                }
                // Try clicking any visible checkbox
                const checks = document.querySelectorAll('input[type="checkbox"]');
                for (const c of checks) {
                    const r = c.getBoundingClientRect();
                    if (r.width > 0 && r.y > 0) {
                        c.click();
                        return 'checkbox_at_' + Math.round(r.y);
                    }
                }
                return 'no_reason';
            }""")
            self.log.info(f"Reason selected: {reason_selected}")
            await asyncio.sleep(1)

            # Step 3: Click the red "Удалить" button in the modal
            deleted = await self.page.evaluate("""() => {
                const btns = [...document.querySelectorAll('button')].reverse();
                for (const btn of btns) {
                    const text = btn.textContent.trim().toLowerCase();
                    const r = btn.getBoundingClientRect();
                    if (!btn.disabled && (text === 'удалить' || text === 'да' || text === 'подтвердить' || text === 'delete' || text === 'წაშლა') && r.width > 50 && r.height > 20 && r.y > 0) {
                        btn.scrollIntoView({block: 'center'});
                        btn.click();
                        return 'clicked_' + text.substring(0, 20);
                    }
                }
                return 'not_found';
            }""")
            self.log.info(f"Delete confirm: {deleted}")

            if 'clicked' in deleted:
                listing_id = (re.search(r"(?:/|-)(\d+)(?:\?|$)", url or "") or [None, ""])[1]
                cabinet_present = True
                for attempt in range(6):
                    await asyncio.sleep(3 if attempt else 1)
                    await self.page.goto(
                        "https://home.ss.ge/ru/user/my-applications",
                        wait_until="domcontentloaded",
                        timeout=60000,
                    )
                    await asyncio.sleep(3)
                    cabinet_present = await self.page.get_by_text(listing_id, exact=True).count() > 0 if listing_id else True
                    if not cabinet_present:
                        break
                self.log.info(f"SS.ge exact delete verification: cabinet_id_present={cabinet_present}")
                await self._screenshot("after_delete")
                return not cabinet_present

            self.log.warning("Could not confirm delete")
            await self._screenshot("delete_failed")
            return False
        except Exception as e:
            self.log.error(f"Delete failed: {e}")
            return False

    async def _check_listing_alive(self, url: str) -> bool:
        if not url or "/create" in url:
            return False
        try:
            resp = await self.page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(2)
            return resp.status == 200
        except Exception:
            return False
