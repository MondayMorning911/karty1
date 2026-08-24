"""Parser for myhome.ge - extracts realtor info from listings via __NEXT_DATA__ JSON."""
import asyncio
import json
import re
import random
from config import MYHOME_EMAIL, MYHOME_PASSWORD
from parsers.base_parser import BaseParser


class MyhomeParser(BaseParser):
    name = "myhome"
    source_key = "myhome"

    CITIES = ["Тбилиси", "Батуми"]
    MYHOME_EMAIL = MYHOME_EMAIL
    MYHOME_PASSWORD = MYHOME_PASSWORD
    _logged_in = False

    async def ensure_logged_in(self):
        """Login to myhome if not already logged in."""
        if self._logged_in:
            return
        try:
            self.log.info("Logging in to myhome...")
            await self.page.goto(
                'https://auth.tnet.ge/ru/user/login/?Continue=https://www.myhome.ge/',
                wait_until='domcontentloaded', timeout=20000
            )
            await asyncio.sleep(3)

            # Fill email/phone
            await self.page.fill('#_r_m_', self.MYHOME_EMAIL)
            await asyncio.sleep(0.5)
            # Fill password
            await self.page.fill('#_r_n_', self.MYHOME_PASSWORD)
            await asyncio.sleep(0.5)
            # Click login button
            await self.page.click('button:has-text("Войти"), button[type="submit"]')
            await asyncio.sleep(5)

            # Check if login succeeded (redirect to myhome)
            if 'myhome.ge' in self.page.url:
                self._logged_in = True
                self.log.info("myhome login successful")
            else:
                self.log.warning(f"myhome login may have failed, URL: {self.page.url}")
        except Exception as e:
            self.log.error(f"myhome login error: {e}")

    # Tbilisi district IDs (1-14+) and Batumi (city_id=2)
    TBILISI_DISTRICTS = list(range(1, 15))

    async def collect_listing_urls(self, max_per_city=20, daily=False) -> list[str]:
        """Collect listing URLs. daily=True uses district-level for fresh listings."""
        all_urls = []
        city_params = {
            "Тбилиси": "",
            "Батуми": "&city_id=2",
        }
        for city, city_param in city_params.items():
            for deal, deal_type in [("sale", "1"), ("rent", "2")]:
                if daily and city == "Тбилиси":
                    # Daily mode: parse by districts for fresh listings
                    for district_id in self.TBILISI_DISTRICTS:
                        try:
                            base_url = f"https://www.myhome.ge/ru/nedvizhimost/?deal_types={deal_type}&CardView=1&district_id={district_id}"
                            cat_urls = await self._collect_category_urls(base_url, max_per_city)
                            all_urls.extend(cat_urls)
                            self.log.info(f"Тбилиси/d{district_id}/{deal}: {len(cat_urls)} URLs")
                        except Exception as e:
                            self.log.error(f"Error Тбилиси/d{district_id}/{deal}: {e}")
                        await self.human_delay(1, 2)
                else:
                    try:
                        base_url = f"https://www.myhome.ge/ru/nedvizhimost/?deal_types={deal_type}&CardView=1{city_param}"
                        cat_urls = await self._collect_category_urls(base_url, max_per_city)
                        all_urls.extend(cat_urls)
                        self.log.info(f"{city}/{deal}: {len(cat_urls)} URLs")
                    except Exception as e:
                        self.log.error(f"Error {city}/{deal}: {e}")
                    await self.human_delay(2, 4)
        return list(set(all_urls))

    async def _collect_category_urls(self, base_url: str, max_urls: int) -> list[str]:
        """Paginate through myhome category."""
        urls = []
        page = 1
        consecutive_empty = 0

        while len(urls) < max_urls and consecutive_empty < 2:
            try:
                sep = '&' if '?' in base_url else '?'
                page_url = f"{base_url}{sep}page={page}"
                await self.page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(5)
                await self.human_scroll()
                await asyncio.sleep(2)

                page_urls = await self.page.evaluate("""() => {
                    const links = document.querySelectorAll('a');
                    const urls = [];
                    for (const link of links) {
                        const href = link.href;
                        if (/myhome\\.ge\\/ru\\/nedvizhimost\\/\\d{4,}/.test(href) && !href.includes('create')) {
                            urls.push(href);
                        }
                    }
                    return [...new Set(urls)];
                }""")

                new_count = 0
                for u in page_urls:
                    if u not in urls:
                        urls.append(u)
                        new_count += 1

                if new_count == 0:
                    consecutive_empty += 1
                else:
                    consecutive_empty = 0

                self.log.info(f"  Page {page}: {len(page_urls)} URLs ({new_count} new, total: {len(urls)})")
                page += 1
                await self.human_delay(2, 4)

            except Exception as e:
                self.log.error(f"  Page {page} error: {e}")
                consecutive_empty += 1
                await self.human_delay(3, 5)

        return urls[:max_urls]

    async def _human_mouse_move(self):
        """Random mouse movements to look human."""
        for _ in range(random.randint(2, 4)):
            x = random.randint(100, 1100)
            y = random.randint(100, 800)
            await self.page.mouse.move(x, y)
            await asyncio.sleep(random.uniform(0.1, 0.4))

    async def _human_scroll(self):
        """Random scroll to look like reading."""
        for _ in range(random.randint(1, 3)):
            direction = random.choice([-1, 1])
            amount = random.randint(100, 400) * direction
            await self.page.evaluate(f"window.scrollBy(0, {amount})")
            await asyncio.sleep(random.uniform(0.3, 0.8))

    async def _click_phone_button(self):
        """Click phone button with human-like behavior."""
        # Move mouse around randomly
        await self._human_mouse_move()
        await asyncio.sleep(random.uniform(0.5, 1.5))

        # Scroll to find the button area
        await self._human_scroll()
        await asyncio.sleep(random.uniform(0.5, 1.0))

        # Find the visible phone button
        btns = await self.page.query_selector_all('button')
        for btn in btns:
            text = await btn.text_content()
            if text and 'Показать номер' in text:
                box = await btn.bounding_box()
                if box and box['width'] > 0:
                    # Move mouse to button area gradually
                    target_x = box['x'] + box['width'] / 2
                    target_y = box['y'] + box['height'] / 2
                    await self.page.mouse.move(target_x, target_y)
                    await asyncio.sleep(random.uniform(0.3, 0.8))
                    # Click
                    await btn.click()
                    return True
        return False

    async def get_listing_author(self, listing_url: str) -> dict | None:
        """Extract author info and phone from myhome statement API."""
        try:
            await self.page.goto(listing_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(random.uniform(4, 7))

            # Human-like behavior on page load
            await self._human_mouse_move()
            await self._human_scroll()
            await asyncio.sleep(random.uniform(1, 3))

            # Extract statement UUID from __NEXT_DATA__
            uuid = await self.page.evaluate("""() => {
                const el = document.getElementById('__NEXT_DATA__');
                if (!el) return null;
                try {
                    const d = JSON.parse(el.textContent);
                    const q = d?.props?.pageProps?.dehydratedState?.queries || [];
                    for (const qq of q) {
                        const s = qq.state?.data?.data?.statement;
                        if (s) return {uuid: s.uuid, owner: s.owner_name, user_id: s.user_id, count: s.user_statements_count};
                    }
                } catch(e) {}
                return null;
            }""")

            if not uuid or not uuid.get("uuid"):
                return None

            # Call statement details API (no reCAPTCHA required)
            import urllib.request
            api_url = f"https://api-statements.tnet.ge/v1/statements/{uuid['uuid']}"
            req = urllib.request.Request(api_url, headers={
                "X-Website-Key": "myhome",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
            stmt = resp.get("data", {}).get("statement", {})

            if not stmt:
                return None

            # Extract phone from comment field (full 9-digit number)
            comment = stmt.get("comment", "")
            phone_match = re.search(r'(5\d{8})', comment)
            phone = phone_match.group(1) if phone_match else ""

            if not phone or len(phone) < 9:
                return None

            return {
                "name": stmt.get("owner_name", uuid.get("owner", "")),
                "phone": phone,
                "profile_url": "",
                "user_id": stmt.get("user_id", uuid.get("user_id")),
                "statements_count": stmt.get("user_statements_count", uuid.get("count", 0)),
            }
        except Exception as e:
            self.log.error(f"Error parsing {listing_url}: {e}")
        return None

    async def get_author_profile(self, profile_url: str) -> dict | None:
        """myhome has no public profiles — return count from listing data."""
        return None

    async def run(self, max_per_city=20, daily=False, **kwargs):
        urls = await self.collect_listing_urls(max_per_city, daily=daily)
        self.log.info(f"Collected {len(urls)} unique listing URLs")
        results = []
        seen_users = set()

        for url in urls:
            try:
                await self.human_delay()
                author = await self.get_listing_author(url)
                if not author or not author.get("phone"):
                    self.log.warning(f"No author/phone for {url}")
                    continue

                user_id = author.get("user_id")
                if user_id in seen_users:
                    continue
                seen_users.add(user_id)

                statements_count = author.get("statements_count", 0)
                if statements_count < 15:
                    continue

                clean = self.clean_name(author.get("name", ""))
                results.append({
                    "phone": author["phone"],
                    "name": clean,
                    "listing_url": url,
                    "profile_url": "",
                    "listings_count": statements_count,
                })
                self.log.info(f"Realtor found: {clean} ({author['phone']}) - {statements_count} listings")
            except Exception as e:
                self.log.error(f"Error parsing {url}: {e}")
            await self.human_delay()

        return results
