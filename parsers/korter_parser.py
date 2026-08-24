"""Parser for korter.ge - extracts realtor info from listings."""
import asyncio
import random
import re
from parsers.base_parser import BaseParser


class KorterParser(BaseParser):
    name = "korter"
    source_key = "korter"

    CATEGORIES = [
        # Продажа
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B4%D0%BE%D0%BC%D0%BE%D0%B2-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B4%D0%BE%D0%BC%D0%BE%D0%B2-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B7%D0%B5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D1%85-%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BA%D0%BE%D0%B2-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B7%D0%B5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D1%85-%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BA%D0%BE%D0%B2-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        # Аренда
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
    ]

    async def collect_listing_urls(self, max_per_category=200, cutoff_months=3,
                                     task_id: str = None, parse_tasks: dict = None) -> list[dict]:
        """Collect listing URLs with pagination. Returns list of {url, date} dicts."""
        all_results = []
        for cat_url in self.CATEGORIES:
            try:
                cat_results = await self._collect_category_urls(cat_url, max_per_category, cutoff_months,
                                                                 task_id=task_id, parse_tasks=parse_tasks)
                all_results.extend(cat_results)
                self.log.info(f"Category: {len(cat_results)} URLs collected")
            except Exception as e:
                self.log.error(f"Error collecting from {cat_url[:60]}: {e}")
            await self.human_delay(2, 4)

        # Deduplicate by URL
        seen = set()
        unique = []
        for item in all_results:
            if item['url'] not in seen:
                seen.add(item['url'])
                unique.append(item)
        return unique

    async def _collect_category_urls(self, base_url: str, max_urls: int, cutoff_months: int = 3,
                                      task_id: str = None, parse_tasks: dict = None) -> list[dict]:
        """Paginate through a category and collect listing URLs.

        Sort by update_time_desc (newest first). Stop when actualizeTime is older than cutoff_months.
        """
        from datetime import datetime, timedelta
        results = []
        seen_ids = set()
        page = 1
        consecutive_empty = 0
        cutoff_date = datetime.now() - timedelta(days=cutoff_months * 30)

        while consecutive_empty < 3:
            try:
                sep = '&' if '?' in base_url else '?'
                page_url = f"{base_url}{sep}page={page}"
                await self.page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)
                await self.human_scroll()

                # Extract from window.INITIAL_STATE (structured JSON)
                page_data = await self.page.evaluate("""() => {
                    try {
                        const state = window.INITIAL_STATE;
                        if (!state || !state.apartmentListingStore || !state.apartmentListingStore.apartments) {
                            return null;
                        }
                        return state.apartmentListingStore.apartments.map(a => ({
                            url: 'https://korter.ge' + a.link,
                            date: a.actualizeTime || '',
                            objectId: a.objectId
                        }));
                    } catch(e) {
                        return null;
                    }
                }""")

                if not page_data:
                    # Fallback: extract from DOM time elements
                    page_data = await self.page.evaluate("""() => {
                        const results = [];
                        document.querySelectorAll('time[dateTime]').forEach(t => {
                            const link = t.closest('a');
                            if (link && /korter\\.ge\\/ru\\/[^/]+\\/\\d{4,}/.test(link.href)) {
                                results.push({
                                    url: link.href,
                                    date: t.getAttribute('dateTime') || '',
                                    objectId: link.href.match(/\\d{4,}$/)?.[0] || ''
                                });
                            }
                        });
                        return results;
                    }""")

                if not page_data or len(page_data) == 0:
                    consecutive_empty += 1
                    self.log.info(f"  Page {page}: no data found")
                else:
                    consecutive_empty = 0
                    new_count = 0
                    stop_early = False

                    for item in page_data:
                        oid = item.get('objectId', item.get('url', ''))
                        if oid in seen_ids:
                            continue
                        seen_ids.add(oid)

                        # Check date - actualizeTime is the listing's last update/bump time
                        date_str = item.get('date', '')
                        if date_str:
                            try:
                                listing_date = datetime.fromisoformat(date_str.replace('Z', '+00:00')).replace(tzinfo=None)
                                if listing_date < cutoff_date:
                                    self.log.info(f"  Page {page}: Reached old listing ({date_str[:10]}), stopping")
                                    stop_early = True
                                    break
                            except:
                                pass

                        results.append(item)
                        new_count += 1

                    self.log.info(f"  Page {page}: {len(page_data)} items ({new_count} new, total: {len(results)})")

                    # Update progress during collection
                    if task_id and parse_tasks and task_id in parse_tasks:
                        parse_tasks[task_id]["processed_count"] = len(results)
                        parse_tasks[task_id]["total_urls"] = len(results)  # update as we collect

                    if stop_early:
                        break

                page += 1
                await self.human_delay(2, 4)

            except Exception as e:
                self.log.error(f"  Page {page} error: {e}")
                consecutive_empty += 1
                await self.human_delay(3, 5)

        self.log.info(f"  Collected {len(results)} URLs with dates")
        return results[:max_urls]

    async def get_listing_author(self, listing_url: str) -> dict | None:
        try:
            await self.page.goto(listing_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            
            # Dismiss cookie consent if present
            try:
                await self.page.click('button:has-text("Принимаю")', timeout=2000)
                await asyncio.sleep(1)
            except:
                pass

            # Click "Показать номер" to reveal phone
            try:
                show_btn = self.page.locator('text="Показать номер"').first
                if await show_btn.count() > 0:
                    await show_btn.click(timeout=3000)
                    await asyncio.sleep(2)
            except:
                pass

            author = await self.page.evaluate("""() => {
                let profileUrl = null;
                let name = '';
                let phone = '';
                let listingDate = '';

                // Find author section - korter shows agent info
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    const href = link.href || '';
                    if (href.includes('/agent/') || href.includes('/user/') || href.includes('/realtor/')) {
                        profileUrl = href;
                        name = link.textContent.trim();
                        break;
                    }
                }

                // Find phone - look for tel: links or phone numbers
                const phoneEls = document.querySelectorAll('a[href^="tel:"]');
                for (const el of phoneEls) {
                    const href = el.href || '';
                    const match = href.match(/5\\d{8}/);
                    if (match) {
                        phone = match[0];
                        break;
                    }
                }

                // Fallback: look for phone in text
                if (!phone) {
                    const body = document.body.innerText;
                    const matches = body.match(/\\+995\\s*5\\d{2}\\s*\\d{2}\\s*\\d{2}\\s*\\d{2}/g);
                    if (matches && matches.length > 0) {
                        phone = matches[0].replace(/\\s/g, '').replace('+995', '');
                    }
                }

                // Find name from agent section
                if (!name) {
                    const h2s = document.querySelectorAll('h2, h3');
                    for (const h of h2s) {
                        const text = h.textContent.trim();
                        if (text.includes('риелтор') || text.includes('Риелтор')) {
                            const next = h.nextElementSibling;
                            if (next) name = next.textContent.trim().split('\\n')[0];
                        }
                    }
                }

                // Find listing date
                const body = document.body.innerText;
                const dateMatch = body.match(/(Обновлено|Добавлено|Дата):?\\s*(\\d{1,2}\\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\\s+\\d{4})/i);
                if (dateMatch) listingDate = dateMatch[2];
                
                // Also try ISO format
                if (!listingDate) {
                    const isoMatch = body.match(/(\\d{4}-\\d{2}-\\d{2})/);
                    if (isoMatch) listingDate = isoMatch[1];
                }

                return {profileUrl, name, phone, listingDate};
            }""")

            if author.get("profileUrl") or author.get("phone"):
                name = self.clean_name(author.get("name", ""))
                return {
                    "name": name,
                    "phone": author.get("phone", ""),
                    "profile_url": author.get("profileUrl", ""),
                    "listing_date": author.get("listingDate", ""),
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

                // Count listings on agent page
                const listingEls = document.querySelectorAll('a[href*="/l/"], [class*="listing"], [class*="card"]');
                listingsCount = new Set([...listingEls].map(a => a.href || a.textContent)).size;

                // Check for count text
                const countMatch = body.match(/(\\d+)\\s*(объявл|листинг|active|объ)/i);
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
                    "name": self.clean_name(info.get("name", "")),
                    "listings_count": info.get("listingsCount", 0),
                    "screenshot": screenshot_path,
                }
        except Exception as e:
            self.log.error(f"Error parsing profile {profile_url}: {e}")
        return None

    async def run(self, max_per_category=15, **kwargs):
        urls = await self.collect_listing_urls(max_per_category)
        self.log.info(f"Collected {len(urls)} unique listing URLs")
        return await super().run(urls)
