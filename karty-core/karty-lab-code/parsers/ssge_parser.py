"""Parser for ss.ge - extracts realtor info from listings."""
import os
import asyncio
import random
import re
from datetime import datetime
from parsers.base_parser import BaseParser
from parser_config import load_sources


class SsGeParser(BaseParser):
    name = "ssge"
    source_key = "ssge"
    SYSTEM_PHONE_DIGITS = {"322121661"}

    LEGACY_CATEGORIES = [
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%97%D0%B5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9-%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BE%D0%BA/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&advancedSearch=%7B%22landType%22%3Anull%7D&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%94%D0%BE%D0%BC/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%BE%D0%BC%D0%B5%D1%80%D1%87%D0%B5%D1%81%D0%BA%D0%B0%D1%8F-%D0%BF%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D1%8C/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0?currencyId=1&order=1",
        "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0--%D0%B7%D0%B0-%D0%B4%D0%B5%D0%BD%D1%8C?currencyId=1&order=1",
    ]
    CATEGORIES = load_sources()["ssge"]["urls"]

    async def collect_listing_urls(self, max_per_category=20) -> list[str]:
        """Collect listing URLs from all categories."""
        all_urls = []
        for cat_url in self.CATEGORIES:
            try:
                await self.page.goto(cat_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)
                await self.human_scroll()

                urls = await self.page.evaluate("""() => {
                    const links = document.querySelectorAll('a');
                    const urls = [];
                    for (const link of links) {
                        const href = link.href;
                        if (href.includes('home.ss.ge') && /\\d{4,}$/.test(href) && !href.includes('create')) {
                            urls.push(href);
                        }
                    }
                    return [...new Set(urls)];
                }""")
                self.log.info(f"Category {cat_url.split('/')[-1][:30]}: found {len(urls)} listings")
                all_urls.extend(urls[:max_per_category])
            except Exception as e:
                self.log.error(f"Error collecting from {cat_url[:60]}: {e}")
            await self.human_delay(2, 4)
        return list(set(all_urls))

    async def get_listing_date(self, listing_url: str) -> datetime | None:
        """Extract listing date from page."""
        try:
            date_str = await self.page.evaluate(r"""() => {
                const body = document.body.innerText;
                const patterns = [
                    /(?:Обновлено|Дата|опубликовано|Добавлено)[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i,
                    /(\d{1,2}\s+(?:янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)\.?\s+\d{4})/i,
                    /(\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4})/i,
                    /(\d{4}-\d{2}-\d{2})/,
                ];
                for (const pat of patterns) {
                    const m = body.match(pat);
                    if (m) return m[1];
                }
                const timeEl = document.querySelector('time[datetime]');
                if (timeEl) return timeEl.getAttribute('datetime');
                const meta = document.querySelector('meta[property="article:published_time"], meta[name="date"]');
                if (meta) return meta.getAttribute('content');
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
            short_ru_months = {
                'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'май': 5, 'июн': 6,
                'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12,
            }
            parts = date_str.split()
            if len(parts) >= 3:
                day = int(parts[0])
                month_name = parts[1].lower().rstrip('.')
                month = ru_months.get(month_name) or short_ru_months.get(month_name)
                year = int(parts[2])
                if month:
                    return datetime(year, month, day)
        except Exception as e:
            self.log.debug(f"Date parse error for {listing_url}: {e}")
        return None

    async def get_listing_author(self, listing_url: str) -> dict | None:
        """Extract realtor info with retries."""
        for attempt in range(3):
            try:
                await self.page.goto(listing_url, wait_until="domcontentloaded", timeout=25000)
                await asyncio.sleep(2)

                # Click phone reveal buttons — try multiple label variants
                try:
                    await self.page.evaluate("""() => {
                        const labels = ['Показать номер', 'Показать телефон', 'Показать контакт', 'Show phone', 'Show number'];
                        document.querySelectorAll('button, a, [role="button"], span, div').forEach(el => {
                            const text = (el.textContent || '').trim();
                            if (labels.some(l => text.includes(l))) el.click();
                        });
                    }""")
                    await asyncio.sleep(2)
                except:
                    pass

                listing_date = await self.get_listing_date(listing_url)

                author = await self.page.evaluate("""() => {
                    let profileUrl = null;
                    let name = '';
                    let phone = '';
                    let role = '';
                    const isCountLabel = (value) => /^(?:\d+[\s-]*)?(?:объявлен|объявление|листинг|listing|active)/i.test((value || '').trim()) || /^\d+$/.test((value || '').trim());

                    document.querySelectorAll('a').forEach(l => {
                        const href = l.href || '';
                        if ((href.includes('/user/') || href.includes('/userlist') || href.includes('/profile/')) && !href.includes('/l/')) {
                            profileUrl = href;
                             const linkName = l.textContent.trim();
                             if (!isCountLabel(linkName)) name = linkName;
                            if (/агент|агентство|риелтор|agent|realtor/i.test(l.textContent)) role = 'agent';
                        }
                    });

                    // Method 1: tel links, including Georgian landlines.
                    document.querySelectorAll('a[href^="tel:"]').forEach(p => {
                        const digits = p.href.replace(/\\D/g, '');
                        const localDigits = digits.startsWith('995') && digits.length === 12 ? digits.slice(3) : (digits.startsWith('0') ? digits.slice(1) : digits);
                        if (localDigits === '322121661') return;
                        if (digits.startsWith('995') && digits.length === 12) phone = digits.slice(3);
                        else if (digits.startsWith('0') && digits.length === 10) phone = digits.slice(1);
                        else if (digits.length === 9 && /^[35]/.test(digits)) phone = digits;
                    });

                    // Method 2: text pattern — mobile 5XX XX XX XX
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

                    // Method 5: meta tags and JSON-LD schema
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

                    // Method 6: any 9-digit number starting with 5 visible in body
                    if (!phone) {
                        const body = document.body.innerText;
                        const m = body.match(/(?<!\\d)5\\d{2}\\s+\\d{2}\\s+\\d{2}\\s+\\d{2}(?!\\d)/);
                        if (m) phone = m[0].replace(/\\s/g, '');
                    }

                    return {profileUrl, name, phone, role};
                }""")

                if not (author and author.get("phone")):
                    self.log.warning(
                        "Phone extraction failed after all fallbacks (attempt %d): %s",
                        attempt + 1, listing_url[:80],
                    )

                if author and author.get("phone"):
                    return {
                        "name": author.get("name", ""),
                        "phone": author.get("phone", ""),
                        "profile_url": author.get("profileUrl", ""),
                        "role": author.get("role", ""),
                        "listing_date": listing_date,
                    }
                else:
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
        try:
            await self.page.goto(profile_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)

            info = await self.page.evaluate("""() => {
                const body = document.body.innerText;
                let name = '';
                let listingsCount = 0;
                const isCountLabel = (value) => /^(?:\d+[\s-]*)?(?:объявлен|объявление|листинг|listing|active)/i.test((value || '').trim()) || /^\d+$/.test((value || '').trim());

                for (const heading of document.querySelectorAll('h1, h2, [class*="user"] [class*="name"]')) {
                     const headingName = (heading.textContent || '').trim();
                     if (headingName && !isCountLabel(headingName)) { name = headingName; break; }
                 }

                const listingEls = document.querySelectorAll('a[href*="/l/"]');
                listingsCount = new Set([...listingEls].map(a => a.href)).size;

                const countMatch = body.match(/(\\d+)\\s*(объявл|листинг|active)/i);
                if (countMatch) {
                    const c = parseInt(countMatch[1]);
                    if (c > listingsCount) listingsCount = c;
                }

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
            self.log.error(f"Error parsing profile {profile_url}: {e}")
        return None
