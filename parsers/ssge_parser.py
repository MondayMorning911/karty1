"""Parser for ss.ge - extracts realtor info from listings."""
import asyncio
import random
import re
from parsers.base_parser import BaseParser


class SsGeParser(BaseParser):
    name = "ssge"
    source_key = "ssge"

    CATEGORIES = [
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0--%D0%B7%D0%B0-%D0%B4%D0%B5%D0%BD%D1%8C?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%94%D0%BE%D0%BC/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%94%D0%BE%D0%BC/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%97%D0%B5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9-%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BE%D0%BA/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&advancedSearch=%7B%22landType%22%3Anull%7D&order=1",
    ]

    async def collect_listing_urls(self, max_per_category=200, cutoff_months=3,
                                     task_id: str = None, parse_tasks: dict = None) -> list[dict]:
        """Collect listing URLs with pagination. Returns list of {url, date} dicts."""
        all_results = []
        for cat_url in self.CATEGORIES:
            try:
                cat_results = await self._collect_category_urls(cat_url, max_per_category, cutoff_months)
                all_results.extend(cat_results)
                self.log.info(f"Category: {len(cat_results)} URLs collected")
            except Exception as e:
                self.log.error(f"Error from {cat_url[:60]}: {e}")
            await self.human_delay(2, 4)

        # Deduplicate by URL
        seen = set()
        unique = []
        for item in all_results:
            if item['url'] not in seen:
                seen.add(item['url'])
                unique.append(item)
        return unique

    async def _collect_category_urls(self, base_url: str, max_urls: int, cutoff_months: int = 3) -> list[dict]:
        """Paginate through ss.ge category. Stop when createDate is older than cutoff_months."""
        from datetime import datetime, timedelta
        results = []
        seen_ids = set()
        page = 1
        consecutive_empty = 0
        cutoff_date = datetime.now() - timedelta(days=cutoff_months * 30)

        while consecutive_empty < 3 and len(results) < max_urls:
            try:
                sep = '&' if '?' in base_url else '?'
                page_url = f"{base_url}{sep}page={page}"
                self.log.info(f"  Loading page {page}: {page_url[:80]}...")
                await self.page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)
                await self.human_scroll()

                # Extract from __NEXT_DATA__ (structured JSON)
                page_data = await self.page.evaluate("""() => {
                    try {
                        const nextData = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
                        const items = nextData.props.pageProps.applicationList.realStateItemModel;
                        if (!items) return null;
                        return items.map(item => ({
                            url: 'https://home.ss.ge/' + (item.detailUrl || ''),
                            date: item.createDate || '',
                            applicationId: item.applicationId
                        }));
                    } catch(e) {
                        return null;
                    }
                }""")

                if not page_data:
                    # Fallback: extract from DOM
                    page_data = await self.page.evaluate("""() => {
                        const results = [];
                        document.querySelectorAll('a[href*="home.ss.ge"]').forEach(link => {
                            const href = link.href || '';
                            if (/\\d{4,}$/.test(href) && !href.includes('create')) {
                                const timeEl = link.querySelector('time') || link.closest('[datetime]');
                                const date = timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent) : '';
                                results.push({ url: href, date: date, applicationId: href.match(/\\d{4,}$/)?.[0] || '' });
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
                        oid = item.get('applicationId', item.get('url', ''))
                        if oid in seen_ids:
                            continue
                        seen_ids.add(oid)

                        # Check date
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

                    if stop_early:
                        break

                page += 1
                await self.human_delay(3, 5)

            except Exception as e:
                self.log.error(f"  Page {page} error: {e}")
                consecutive_empty += 1
                await self.human_delay(3, 5)

        self.log.info(f"  Collected {len(results)} URLs with dates")
        return results[:max_urls]

    async def get_listing_author(self, listing_url: str) -> dict | None:
        try:
            await self.page.goto(listing_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            author = await self.page.evaluate("""() => {
                let profileUrl = null;
                let name = '';
                let phone = '';

                // Look for profile link — ss.ge uses userlist?userId=
                document.querySelectorAll('a').forEach(l => {
                    const href = l.href || '';
                    if ((href.includes('/user/') || href.includes('/profile/') || href.includes('userlist?userId=')) && !href.includes('/l/')) {
                        profileUrl = href;
                        name = l.textContent.trim();
                    }
                });

                // Look for phone from tel: links
                document.querySelectorAll('a[href^="tel:"]').forEach(p => {
                    const match = p.href.match(/5\\d{8}/);
                    if (match) phone = match[0];
                });

                // Look for phone in HTML source (ss.ge embeds phone in page data)
                if (!phone) {
                    const html = document.documentElement.innerHTML;
                    const match = html.match(/tel:5(\\d{8})/);
                    if (match) phone = '5' + match[1];
                }

                // Look for phone pattern in any text node
                if (!phone) {
                    const body = document.body.innerText;
                    const match = body.match(/5\\d{2}\\s*\\d{2}\\s*\\d{2}\\s*\\d{2}/);
                    if (match) phone = match[0].replace(/\\s/g, '');
                }

                return {profileUrl, name, phone};
            }""")

            if author.get("profileUrl") or author.get("phone"):
                return {
                    "name": author.get("name", ""),
                    "phone": author.get("phone", ""),
                    "profile_url": author.get("profileUrl", ""),
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

                // Name from header
                const h1 = document.querySelector('h1, h2');
                if (h1) name = h1.textContent.trim();

                // Count listing links (ss.ge userlist page shows all user's listings)
                const listingEls = document.querySelectorAll('a[href*="/l/"], a[href*="недвижимость"]');
                listingsCount = new Set([...listingEls].map(a => a.href)).size;

                // Also check for count text
                const countMatch = body.match(/(\\d+)\\s*(объявл|листинг|active|объ)/i);
                if (countMatch) {
                    const c = parseInt(countMatch[1]);
                    if (c > listingsCount) listingsCount = c;
                }

                return {name, listingsCount};
            }""")

            if info.get("listingsCount", 0) > 0:
                screenshot_path = await self.screenshot(f"profile_{profile_url.split('/')[-1]}")
                return {
                    "name": self.clean_name(info.get("name", "")),
                    "listings_count": info.get("listingsCount", 0),
                    "screenshot": screenshot_path,
                }
        except Exception as e:
            self.log.error(f"Error parsing profile {profile_url}: {e}")
        return None

    async def run(self, max_per_category=50):
        urls = await self.collect_listing_urls(max_per_category)
        self.log.info(f"Collected {len(urls)} unique listing URLs")
        return await super().run(urls)
