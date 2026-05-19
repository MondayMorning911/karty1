import { chromium } from 'playwright';

async function run() {
  console.log("Starting ScrapingAnt test...");
  try {
    const SCRAPINGANT_API_KEY = process.env.SCRAPINGANT_API_KEY || 'ef15bd20b93d49619e251c6b30164002';
    
    // Parse proxy if available
    const proxyUrl = process.env.PROXY_URL || 'http://d0e326028eb23797:vh6bDxAKJj7XUsSq@141.98.54.148:10000';
    let urlProps = '';
    if (proxyUrl) {
      try {
        const parsed = new URL(proxyUrl);
        urlProps += `&proxy_url=${encodeURIComponent(parsed.protocol + '//' + parsed.host)}`;
        if (parsed.username) urlProps += `&proxy_username=${encodeURIComponent(parsed.username)}`;
        if (parsed.password) urlProps += `&proxy_password=${encodeURIComponent(parsed.password)}`;
      } catch(e) {}
    }

    const wsUrl = `wss://api.scrapingant.com/playwright?token=${SCRAPINGANT_API_KEY}&stealth=true&browser=chrome${urlProps}`;
    console.log('WS URL (hidden token):', wsUrl.replace(SCRAPINGANT_API_KEY, '***'));

    console.log('🚀 Подключаемся к ScrapingAnt (Stealth)...');
    const browser = await chromium.connectOverCDP(wsUrl);
    
    console.log('Connected!');
    
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();
    console.log("Navigating...");
    await page.goto("https://korter.ge", { waitUntil: "domcontentloaded" });
    const content = await page.title();
    console.log("Title: ", content);
    console.log("URL:", page.url());
    await browser.close();
  } catch (e) {
    console.error(e);
  }
}

run();
