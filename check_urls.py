import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://home.ss.ge/ru")
        await page.wait_for_timeout(5000)
        links = await page.evaluate("() => Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.match(/\\/ru\\/.*\\d{7,}/))")
        print(json.dumps(list(set(links))[:10], indent=2))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
