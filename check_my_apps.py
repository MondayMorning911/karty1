import asyncio
import argparse
import json
import os
from playwright.async_api import async_playwright
from api.cookie_manager import get_cookies
from api.publisher import _build_cookies_for_context

async def main():
    user_id = "test_user"
    site_name = "ss_ge"
    user_cookies = get_cookies(user_id, site_name)
    cookies_to_load = _build_cookies_for_context(user_cookies, site_name)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        if cookies_to_load:
            await context.add_cookies(cookies_to_load)
            
        page = await context.new_page()
        print("Navigating to my-applications...")
        await page.goto("https://home.ss.ge/ru/user/my-applications", wait_until="networkidle", timeout=60000)
        await asyncio.sleep(5)
        
        # Take screenshot
        await page.screenshot(path="artifacts/my_apps.png")
        print("Screenshot saved to artifacts/my_apps.png")
        
        # Extract HTML of the listings
        html = await page.content()
        with open("artifacts/my_apps.html", "w", encoding="utf-8") as f:
            f.write(html)
            
        # Extract first listing url
        hrefs = await page.evaluate("""() => {
            const links = document.querySelectorAll('a');
            return Array.from(links).map(a => a.href).filter(href => href.includes('/ru/недвижимость/') || href.includes('/ru/l/'));
        }""")
        print("Found listing links:", hrefs)
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
