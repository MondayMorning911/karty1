"""Parser for myhome.ge - extracts realtor info from listings."""
import asyncio
import random
import re
from datetime import datetime
from parsers.base_parser import BaseParser


class MyhomeParser(BaseParser):
    name = "myhome"
    source_key = "myhome"

    CITIES = ["Тбилиси", "Батуми"]

    async def collect_listing_urls(self, max_per_city=20) -> list[str]:
        """Collect paginated listings for both cities and deal types."""
        all_urls = []
        city_params = {'Тбилиси': '', 'Батуми': '&city_id=2'}
        for city, city_param in city_params.items():
            for deal, deal_type in [('sale', '1'), ('rent', '2')]:
                base_url = f"https://www.myhome.ge/ru/nedvizhimost/?deal_types={deal_type}&CardView=1{city_param}"
                page = 1
                empty_pages = 0
                while len(all_urls) < max_per_city * len(city_params) * 2 and empty_pages < 2:
                    try:
                        await self.page.goto(f"{base_url}&page={page}", wait_until='domcontentloaded', timeout=30000)
                        await asyncio.sleep(4)
                        await self.human_scroll()
                        urls = await self.page.evaluate("""() => [...new Set([...document.querySelectorAll('a')].map(a => a.href).filter(h => /myhome\\.ge\\/ru\\/nedvizhimost\\/\\d{4,}/.test(h) && !h.includes('create')))]""")
                        new_urls = [url for url in urls if url not in all_urls]
                        all_urls.extend(new_urls)
                        empty_pages = empty_pages + 1 if not new_urls else 0
                        page += 1
                    except Exception as exc:
                        self.log.error(f"MyHome {city}/{deal} page {page}: {exc}")
                        empty_pages += 1
                        await self.human_delay(2, 4)
                self.log.info(f"{city}/{deal}: collected {len(all_urls)} total URLs")
        return list(dict.fromkeys(all_urls))

    async def get_listing_date(self, listing_url: str) -> datetime | None:
        try:
            value = await self.page.evaluate("""() => {
                const body = document.body.innerText;
                const m = body.match(/(?:Обновлено|Опубликовано|Добавлено)[:\\s]*(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})/i);
                return m ? m[1] : document.querySelector('time[datetime]')?.getAttribute('datetime') || null;
            }""")
            if not value: return None
            for fmt in ('%d.%m.%Y', '%d/%m/%Y', '%Y-%m-%d'):
                try: return datetime.strptime(value.split()[0], fmt)
                except ValueError: pass
        except Exception as exc:
            self.log.debug(f"MyHome date parse failed for {listing_url}: {exc}")
        return None

    async def get_listing_author(self, listing_url: str) -> dict | None:
        try:
            await self.page.goto(listing_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            consent = self.page.locator('button:visible').filter(has_text='Принять все').first
            consent_visible = False
            try: consent_visible = await consent.is_visible()
            except Exception: pass
            if await consent.count() and consent_visible:
                await consent.click(force=True)
                await asyncio.sleep(1)
            await self.page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await asyncio.sleep(2)
            listing_date = await self.get_listing_date(listing_url)
            
            # Click "Показать номер" via JS
            phone_buttons = self.page.locator('button:visible').filter(has_text='Показать номер')
            for index in range(min(await phone_buttons.count(), 3)):
                await phone_buttons.nth(index).scroll_into_view_if_needed()
                await phone_buttons.nth(index).click(force=True)
                await asyncio.sleep(1)
            await asyncio.sleep(2)

            author = await self.page.evaluate("""() => {
                let profileUrl = null;
                let name = '';
                let phone = '';

                // Find author profile link
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    const href = link.href || '';
                    if (href.includes('/user-profile/') || href.includes('/users/')) {
                        profileUrl = href;
                        name = link.textContent.trim();
                        break;
                    }
                }

                // Find phone from tel: links
                const phoneEls = document.querySelectorAll('a[href^="tel:"]');
                for (const el of phoneEls) {
                    const href = el.href || '';
                    const match = href.match(/5\\d{8}/);
                    if (match) {
                        phone = match[0];
                        break;
                    }
                }

                // Fallback: look for +995 pattern
                if (!phone) {
                    const body = document.body.innerText;
                    const matches = body.match(/\\+995\\s*5\\d{2}\\s*\\d{2}\\s*\\d{2}\\s*\\d{2}/g);
                    if (matches && matches.length > 0) {
                        phone = matches[0].replace(/\\s/g, '').replace('+995', '');
                    }
                }

                // Find name from page
                if (!name) {
                    const h1 = document.querySelector('h1');
                    if (h1) name = h1.textContent.trim().split('\\n')[0];
                }

                return {profileUrl, name, phone};
            }""")

            if author.get("profileUrl") or author.get("phone"):
                return {
                    "name": author.get("name", ""),
                    "phone": author.get("phone", ""),
                    "profile_url": author.get("profileUrl", ""),
                    "listing_date": listing_date,
                }
        except Exception as e:
            self.log.error(f"Error getting author from {listing_url}: {e}")
        return None

    async def get_author_profile(self, profile_url: str) -> dict | None:
        try:
            await self.page.goto(profile_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)

            info = await self.page.evaluate("""() => {
                const body = document.body.innerText;
                let name = '';
                let listingsCount = 0;

                const h1 = document.querySelector('h1, h2');
                if (h1) name = h1.textContent.trim();

                // Count listings on profile page
                const listingEls = document.querySelectorAll('a[href*="/l/"], [class*="listing"], [class*="card"]');
                listingsCount = new Set([...listingEls].map(a => a.href || a.textContent)).size;

                // Check for count in text
                const countMatch = body.match(/(\\d+)\\s*(объявл|активн)/i);
                if (countMatch) {
                    const c = parseInt(countMatch[1]);
                    if (c > listingsCount) listingsCount = c;
                }

                return {name, listingsCount};
            }""")

            if info.get("listingsCount", 0) > 0:
                slug = profile_url.rstrip("/").split("/")[-1]
                screenshot_path = await self.screenshot(f"profile_{slug}")
                return {
                    "name": info.get("name", ""),
                    "listings_count": info.get("listingsCount", 0),
                    "screenshot": screenshot_path,
                }
        except Exception as e:
            self.log.error(f"Error parsing profile {profile_url}: {e}")
        return None

    async def run(self, max_per_city=15, **kwargs):
        urls = await self.collect_listing_urls(max_per_city)
        self.log.info(f"Collected {len(urls)} unique listing URLs")
        return await super().run(urls)
