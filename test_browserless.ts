import { chromium } from 'playwright-core';

async function run() {
  console.log("Starting Browserless test...");
  try {
    const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || '2UXs6i0fsLYWgh492b9b7402620fedfb4441d8bf1be1b25bc';
    
    // Playwright endpoint for browserless
    const wsUrl = `wss://chrome.browserless.io?token=${BROWSERLESS_API_KEY}&stealth=true`;
    
    console.log('🚀 Подключаемся к Browserless (CDP):', wsUrl.replace(BROWSERLESS_API_KEY, '***'));
    console.log('Awaiting connectOverCDP...');
    let browser;
    try {
      browser = await chromium.connectOverCDP(wsUrl);
      console.log('Connected!');
    } catch (err) {
      console.error('Connect failed:', err);
      process.exit(1);
    }
    
    console.time('newContext');
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1024 }
    });
    console.timeEnd('newContext');
    
    console.time('newPage');
    const page = await context.newPage();
    console.timeEnd('newPage');
    
    console.log("Navigating to example...");
    console.time('goto');
    await page.goto("https://korter.ge/ru", { waitUntil: "domcontentloaded", timeout: 30000 });
    
    const title = await page.title();
    console.log("Title: ", title);
    console.log("URL:", page.url());
    
    await browser.close();
  } catch (e) {
    console.error(e);
  }
}

run().then(() => {
  console.log("Exiting with 0");
  process.exit(0);
}).catch((e) => {
  console.error("Uncaught error:", e);
  process.exit(1);
});
