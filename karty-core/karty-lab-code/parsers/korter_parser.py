"""Parser for korter.ge - extracts realtor info from listings."""
import os
import asyncio
import random
import re
from datetime import datetime, timedelta
from parsers.base_parser import BaseParser
from parser_config import load_sources


class KorterParser(BaseParser):
    name = "korter"
    source_key = "korter"

    LEGACY_CATEGORIES = [
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B4%D0%BE%D0%BC%D0%BE%D0%B2-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B4%D0%BE%D0%BC%D0%BE%D0%B2-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B7%D0%B5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D1%85-%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BA%D0%BE%D0%B2-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%B7%D0%B5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D1%85-%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BA%D0%BE%D0%B2-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
        "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B8-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
    ]
    CATEGORIES = load_sources()["korter"]["urls"]

    async def collect_listing_urls(self, max_per_category=20) -> list[dict]:
        """Collect listing URLs from korter.ge with pagination until old listing found."""
        all_results = []
        for cat_url in self.CATEGORIES:
            try:
                page_num = 1
                while True:
                    sep = '&' if '?' in cat_url else '?'
                    page_url = f"{cat_url}{sep}page={page_num}"
                    
                    await self.page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
                    await asyncio.sleep(2)

                    page_data = await self.page.evaluate("""() => {
                        try {
                            const state = window.INITIAL_STATE;
                            if (!state || !state.apartmentListingStore || !state.apartmentListingStore.apartments) return [];
                            return state.apartmentListingStore.apartments.map(a => ({
                                url: 'https://korter.ge' + a.link,
                                date: a.actualizeTime || ''
                            }));
                        } catch(e) { return []; }
                    }""")

                    if not page_data:
                        self.log.info(f"No data on page {page_num}, stopping category")
                        break

                    # Check dates - stop if any listing is older than 3 months
                    cutoff = datetime.now() - timedelta(days=90)
                    stop_category = False
                    for item in page_data:
                        date_str = item.get('date', '')
                        if date_str:
                            try:
                                listing_date = datetime.fromisoformat(date_str.replace('Z', '+00:00')).replace(tzinfo=None)
                                if listing_date < cutoff:
                                    self.log.info(f"Old listing found ({listing_date.date()}), stopping category at page {page_num}")
                                    stop_category = True
                                    break
                            except:
                                pass
                        all_results.append(item)

                    cat_name = cat_url.split("/")[-1][:40]
                    self.log.info(f"{cat_name} p{page_num}: {len(page_data)} URLs")

                    if stop_category or len(page_data) < 20:
                        break

                    page_num += 1
                    await self.human_delay(1, 2)

            except Exception as e:
                self.log.error(f"Error from {cat_url[:60]}: {e}")
            await self.human_delay(1, 3)

        # Deduplicate
        seen = set()
        unique = []
        for item in all_results:
            oid = item.get('objectId', item.get('url', ''))
            if oid not in seen:
                seen.add(oid)
                unique.append(item)
        return unique

    async def get_listing_date(self, listing_url: str) -> datetime | None:
        try:
            date_str = await self.page.evaluate("""() => {
                const body = document.body.innerText;
                const patterns = [
                    /(?:Обновлено|Дата|опубликовано)[:\\s]*(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})/i,
                    /(\\d{1,2}\\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\\s+\\d{4})/i,
                    /(\\d{4}-\\d{2}-\\d{2})/,
                ];
                for (const pat of patterns) {
                    const m = body.match(pat);
                    if (m) return m[1];
                }
                const timeEl = document.querySelector('time[datetime]');
                if (timeEl) return timeEl.getAttribute('datetime');
                return null;
            }""")
            if not date_str:
                return None
            for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
                try:
                    return datetime.strptime(date_str.split()[0], fmt)
                except ValueError:
                    continue
            ru_months = {
                'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
                'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
                'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
            }
            parts = date_str.split()
            if len(parts) >= 3:
                day = int(parts[0])
                month = ru_months.get(parts[1].lower())
                year = int(parts[2])
                if month:
                    return datetime(year, month, day)
        except Exception as e:
            self.log.debug(f"Date parse error: {e}")
        return None

    async def get_listing_author(self, listing_url: str) -> dict | None:
        """Extract realtor info with retries. Returns dict with phone or None."""
        for attempt in range(3):
            try:
                # Check browser health — try a simple evaluate
                try:
                    await self.page.evaluate("1+1")
                except:
                    self.log.warning("Browser dead, relaunching...")
                    await self.relaunch()
                    await asyncio.sleep(2)

                await self.page.goto(listing_url, wait_until="domcontentloaded", timeout=25000)
                await asyncio.sleep(1)

                # Click phone reveal buttons — try multiple label variants
                try:
                    await self.page.evaluate("""() => {
                        const labels = ['Показать номер', 'Показать телефон', 'Показать контакт', 'Show phone', 'Show number'];
                        document.querySelectorAll('*').forEach(el => {
                            const text = (el.textContent || '').trim();
                            if (labels.some(l => text.includes(l)) && el.children.length === 0) {
                                el.parentElement.click();
                            }
                        });
                    }""")
                    await asyncio.sleep(1)
                except:
                    pass

                listing_date = await self.get_listing_date(listing_url)

                author = await self.page.evaluate("""() => {
                    let profileUrl = null;
                    let name = '';
                    let phone = '';
                    let role = '';

                    // Find profile link
                    const links = document.querySelectorAll('a');
                    for (const link of links) {
                        const href = link.href || '';
                        if (href.includes('/agent/') || href.includes('/user/') || href.includes('/realtor/')) {
                            profileUrl = href;
                            name = link.textContent.trim();
                            if (/риелтор|realtor|agent/i.test(link.textContent)) role = 'realtor';
                            break;
                        }
                    }

                    const roleNode = [...document.querySelectorAll('*')].find(el => {
                        const text = (el.textContent || '').trim().toLowerCase();
                        return ['владелец', 'владелица', 'риелтор', 'realtor', 'agent'].includes(text);
                    });
                    if (roleNode) role = (roleNode.textContent || '').trim().toLowerCase();

                    // Method 1: tel links, including Georgian landlines.
                    for (const el of document.querySelectorAll('a[href^="tel:"]')) {
                        const digits = el.href.replace(/\\D/g, '');
                        if (digits.startsWith('995') && digits.length === 12) phone = digits.slice(3);
                        else if (digits.startsWith('0') && digits.length === 10) phone = digits.slice(1);
                        else if (digits.length === 9 && /^[35]/.test(digits)) phone = digits;
                        if (phone) break;
                    }

                    // Method 2: text pattern 5XX XX XX XX
                    if (!phone || phone[0] === '3') {
                        const body = document.body.innerText;
                        const m = body.match(/(?:\\+995\\s*)?(?:[35]\\d{2}(?:\\s+\\d{2}){3}|0?3\\d\\s+\\d{3}\\s+\\d{3})/);
                        if (m) phone = m[0].replace(/\\s/g, '');
                    }

                    // Method 3: +995 pattern
                    if (!phone || phone[0] === '3') {
                        const body = document.body.innerText;
                        const matches = body.match(/\\+995\\s*(?:[35]\\d{2}(?:\\s+\\d{2}){3}|0?3\\d\\s+\\d{3}\\s+\\d{3})/g);
                        if (matches && matches.length > 0) {
                            phone = matches[0].replace(/\\s/g, '').replace('+995', '');
                        }
                    }

                    // Method 4: international number revealed in a contact button.
                    if (!phone) {
                        const contactText = [...document.querySelectorAll('button, a, [role="button"]')]
                            .map(el => el.innerText || el.textContent || '').join(' ');
                        const match = contactText.match(/\\+\\d{1,3}(?:[\\s()\\-]*\\d){8,14}/);
                        if (match) phone = match[0].trim();
                    }

                    // Method 5: any 9-digit number starting with 5
                    if (!phone) {
                        const body = document.body.innerText;
                        const match = body.match(/(?<!\\d)5\\d{8}(?!\\d)/);
                        if (match) phone = match[0];
                    }

                    // Method 6: div with phone class
                    if (!phone) {
                        const phoneDivs = document.querySelectorAll('[class*="phone"], [class*="Phone"]');
                        for (const el of phoneDivs) {
                            const m = el.textContent.match(/5\\d{2}\\s*\\d{2}\\s*\\d{2}\\s*\\d{2}/);
                            if (m) { phone = m[0].replace(/\\s/g, ''); break; }
                        }
                    }

                    // Method 7: meta tags and JSON-LD schema
                    if (!phone) {
                        const metaPhone = document.querySelector('meta[name="phone"], meta[property="phone"], meta[itemprop="telephone"]');
                        if (metaPhone) phone = metaPhone.getAttribute('content') || '';
                    }
                    if (!phone) {
                        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                        for (const s of scripts) {
                            try {
                                const data = JSON.parse(s.textContent);
                                if (data.telephone) { phone = data.telephone; break; }
                                if (data.contactPoint && data.contactPoint.telephone) { phone = data.contactPoint.telephone; break; }
                            } catch(e) {}
                        }
                    }

                    // Find name
                    if (!name) {
                        const h2s = document.querySelectorAll('h2, h3');
                        for (const h of h2s) {
                            const text = h.textContent.trim();
                            if (text.includes('риелтор') || text.includes('Риелтор') || text.includes('Агент')) {
                                const next = h.nextElementSibling;
                                if (next) name = next.textContent.trim().split('\\n')[0];
                            }
                        }
                    }

                    // Owners often have no profile link, but their name is in the
                    // same contact block as the role label.
                    if (!name) {
                        const lines = (roleNode?.parentElement?.innerText || '')
                            .split('\\n').map(x => x.trim()).filter(Boolean);
                        name = lines.find(x => !/^(владелец|владелица|owner)$/i.test(x)) || '';
                    }

                    return {profileUrl, name, phone, role};
                }""")

                if author and author.get("phone"):
                    return {
                        "name": author.get("name", ""),
                        "phone": author.get("phone", ""),
                        "profile_url": author.get("profileUrl", ""),
                        "role": author.get("role", ""),
                        "listing_date": listing_date,
                    }
                else:
                    self.log.warning(
                        "Phone extraction failed after all fallbacks: %s", listing_url[:80]
                    )
                    if attempt < 2:
                        await asyncio.sleep(3)
                        continue
                    return None

            except Exception as e:
                self.log.warning(f"  Error (attempt {attempt+1}): {str(e)[:60]}")
                if attempt < 2:
                    await asyncio.sleep(3)
                    continue
                return None
        return None

    async def get_author_profile(self, profile_url: str) -> dict | None:
        """Lightweight profile check — just grab listings count from page text."""
        try:
            await self.page.goto(profile_url, wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(1)
            info = await self.page.evaluate("""() => {
                const body = document.body.innerText;
                let name = '';
                const h1 = document.querySelector('h1, h2');
                if (h1) name = h1.textContent.trim();
                // Find "N объявлений" in text
                const m = body.match(/(\\d+)\\s*(объявл|листинг|active|объ)/i);
                const listingsCount = m ? parseInt(m[1]) : 0;
                return {name, listingsCount};
            }""")
            if info.get("listingsCount", 0) > 0:
                screenshot_path = ""
                if os.getenv("PARSER_SAVE_PROFILE_SCREENSHOTS", "false").lower() == "true":
                    screenshot_path = await self.screenshot(f"profile_{profile_url.split('/')[-1]}")
                return {
                    "name": info.get("name", ""),
                    "listings_count": info.get("listingsCount", 0),
                    "screenshot": screenshot_path,
                }
        except Exception as e:
            self.log.debug(f"Profile check failed: {e}")
        return None
