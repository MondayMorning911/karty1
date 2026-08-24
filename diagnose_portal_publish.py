import asyncio
import json
import os
import time
from pathlib import Path

from api.cookie_manager import get_cookies, get_storage_state
from api.publisher import _launch_authenticated_site
from sites.myhome_ge import MyhomeGeSite
from sites.ss_ge import SsGeSite


LISTING = {
    "deal": "sale",
    "type": "apartment",
    "price": 150000,
    "currency": "USD",
    "area": 75,
    "rooms": 3,
    "bedrooms": 2,
    "floor": 3,
    "floors_total": 10,
    "address": "Тбилиси, ул. Костава 12",
    "city": "Тбилиси",
    "district": "Сабуртало",
    "description": "Test listing for controlled portal diagnostics. Excellent location and view.",
    "contact_name": "TestUser",
    "photos": [
        "/root/karty-lab/test_photos/1.jpg",
        "/root/karty-lab/test_photos/2.jpg",
        "/root/karty-lab/test_photos/3.jpg",
    ],
}


async def snapshot(page):
    return await page.evaluate("""() => {
      const visible = el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const text = el => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
      const nodes = [...document.querySelectorAll('input, textarea, select, [role="combobox"], button, [class*="error"], [class*="invalid"]')]
        .filter(visible)
        .map(el => ({
          tag: el.tagName,
          testId: el.getAttribute('data-test-id'),
          name: el.getAttribute('name'),
          type: el.getAttribute('type'),
          placeholder: el.getAttribute('placeholder'),
          value: el.value ?? '',
          ariaInvalid: el.getAttribute('aria-invalid'),
          disabled: !!el.disabled,
          text: text(el).slice(0, 240),
          parentText: text(el.parentElement).slice(0, 300),
        }));
      const errors = [...document.querySelectorAll('*')]
        .filter(visible)
        .map(el => text(el))
        .filter(value => value && value.length < 240 && (
          /обяз|ошиб|невер|выбер|укаж|заполн|адрес|улиц|дом|этаж|оплат|баланс|фото|описан/i.test(value)
        ))
        .filter((value, index, all) => all.indexOf(value) === index)
        .slice(0, 200);
      return {url: location.href, title: document.title, nodes, errors, body: text(document.body).slice(-10000)};
    }""")


async def main():
    site_name = os.environ.get("DIAG_SITE", "myhome_ge")
    site_class = MyhomeGeSite if site_name == "myhome_ge" else SsGeSite
    site = site_class()
    responses = []

    await _launch_authenticated_site(
        site,
        get_storage_state("test_user", site_name),
        get_cookies("test_user", site_name),
        site_name,
        headless=False,
    )
    site.page.on("response", lambda response: responses.append({"url": response.url, "status": response.status}))
    try:
        await site.page.goto(site.base_url, wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(5)
        await site._verify_auth()
        await site._navigate_to_add(LISTING["deal"], LISTING["type"])
        await site._select_deal(LISTING["deal"], LISTING["type"])
        await site._select_type(LISTING["type"])
        await site._fill_fields(LISTING)
        await site._upload_photos(LISTING["photos"])
        before = await snapshot(site.page)
        await site.page.screenshot(path=f"/root/karty-lab/screenshots/{site_name}_diagnostic_before_submit.png", full_page=True)

        try:
            result = await site._publish()
        except Exception as exc:
            result = {"exception": str(exc), "stage": getattr(site, "_submit_clicked", False) and "submit" or "submit_precheck"}
        await asyncio.sleep(3)
        after = await snapshot(site.page)
        payload = {
            "site": site_name,
            "timestamp": time.time(),
            "result": result,
            "before": before,
            "after": after,
            "responses": responses[-300:],
        }
        path = Path(f"/root/karty-lab/artifacts/{site_name}_diagnostic_{int(time.time())}.json")
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print(json.dumps({"artifact": str(path), "result": result, "url": after["url"], "errors": after["errors"]}, ensure_ascii=False, indent=2))
    finally:
        await site._close()


if __name__ == "__main__":
    asyncio.run(main())
