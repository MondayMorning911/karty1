import asyncio
import os

from api.cookie_manager import get_cookies, get_storage_state
from api.publisher import _launch_authenticated_site
from sites.myhome_ge import MyhomeGeSite
from sites.ss_ge import SsGeSite


async def main():
    site_name = os.environ["CHECK_SITE"]
    url = os.environ["CHECK_URL"]
    site_class = MyhomeGeSite if site_name == "myhome_ge" else SsGeSite
    site = site_class()
    await _launch_authenticated_site(site, get_storage_state("test_user", site_name), get_cookies("test_user", site_name), site_name, headless=False)
    try:
        cabinet_responses = []
        site.page.on("response", lambda response: cabinet_responses.append({"url": response.url, "status": response.status}))
        response = await site.page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(3)
        result = {"status": response.status if response else None, "url": site.page.url, "title": await site.page.title()}
        result["body_excerpt"] = (await site.page.locator("body").inner_text())[:2000]
        if os.environ.get("CHECK_DASHBOARD") == "1":
            dashboard = (
                "https://statements.myhome.ge/ru/user-profile/my-statements?referrer=myhome"
                if site_name == "myhome_ge"
                else "https://home.ss.ge/ru/user/my-applications"
            )
            await site.page.goto(dashboard, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(6)
            result["dashboard_url"] = site.page.url
            result["matching_links"] = await site.page.evaluate("""() => [...document.querySelectorAll("a[href]")]
              .map(a => ({href: a.href, text: (a.innerText || a.textContent || '').trim()}))
              .filter(item => item.href.includes('25667001') || item.text.includes('25667001') || item.text.includes('150000') || item.text.includes('Костава'))""")
            result["listing_links"] = await site.page.evaluate("""() => [...document.querySelectorAll("a[href]")]
              .map(a => ({href: a.href, text: (a.innerText || a.textContent || '').trim().replace(/\\s+/g, ' ')}))
              .filter(item => /\\/(l|недвижимость)\\//.test(item.href))""")
            result["dashboard_text"] = (await site.page.locator("body").inner_text())[-3000:]
            result["dashboard_buttons"] = await site.page.evaluate("""() => [...document.querySelectorAll("button, [role='button']")]
              .map(el => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' '))
              .filter(Boolean)""")
            result["status_tabs"] = {}
            for tab_name in ("Drafts", "Unpaid", "Blocked", "Expired"):
                tab = site.page.get_by_role("button", name=tab_name, exact=False).first
                if await tab.count() == 0:
                    continue
                await tab.click()
                await asyncio.sleep(2)
                result["status_tabs"][tab_name] = {
                    "text": (await site.page.locator("body").inner_text())[-1800:],
                    "links": await site.page.evaluate("""() => [...document.querySelectorAll("a[href]")]
                      .map(a => ({href: a.href, text: (a.innerText || a.textContent || '').trim()}))
                      .filter(item => /\\/(l|недвижимость|pr)\\//.test(item.href))""")
                }
            result["cabinet_responses"] = [item for item in cabinet_responses if "api-statements" in item["url"]][-100:]
        print(result)
    finally:
        await site._close()


if __name__ == "__main__":
    asyncio.run(main())
