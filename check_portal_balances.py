import asyncio
import json

from api.cookie_manager import get_cookies, get_storage_state
from api.publisher import _launch_authenticated_site
from sites.korter_ge import KorterGeSite
from sites.myhome_ge import MyhomeGeSite
from sites.ss_ge import SsGeSite


TARGETS = {
    "myhome_ge": (MyhomeGeSite, "https://statements.myhome.ge/ru/user-profile/my-statements?referrer=myhome"),
    "korter_ge": (KorterGeSite, "https://korter.ge/ru/profile"),
    "ss_ge": (SsGeSite, "https://home.ss.ge/ru/user/my-applications"),
}


async def main():
    results = {}
    for site_name, (site_class, url) in TARGETS.items():
        site = site_class()
        try:
            await _launch_authenticated_site(
                site,
                get_storage_state("test_user", site_name),
                get_cookies("test_user", site_name),
                site_name,
                headless=False,
            )
            response = await site.page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(6)
            body = await site.page.locator("body").inner_text()
            results[site_name] = {
                "url": site.page.url,
                "status": response.status if response else None,
                "balance_lines": [
                    line.strip() for line in body.splitlines()
                    if any(word in line.lower() for word in ("баланс", "balance", "₾", "$", "лари"))
                ][:40],
                "excerpt": body[:5000],
            }
        except Exception as exc:
            results[site_name] = {"error": str(exc)}
        finally:
            try:
                await site._close()
            except Exception:
                pass
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
