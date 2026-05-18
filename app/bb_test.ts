import { chromium } from 'playwright';

async function run() {
  console.log("Starting Browserbase test...");
  try {
    const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY || 'bb_live_5oJ0ciNxBPE2UuE1HbrC4JEvBDw';
    const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || '7f1b4130-5234-4500-b051-9f330df88506';

    const sessionResponse = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_API_KEY
      },
      body: JSON.stringify({
        projectId: BROWSERBASE_PROJECT_ID,
        proxies: true
      })
    });
    
    if (!sessionResponse.ok) {
        throw new Error(`Browserbase session creation failed: ${await sessionResponse.text()}`);
    }
    const bbSessionData = await sessionResponse.json();
    console.log("Session created:", bbSessionData.id);
    const sessionId = bbSessionData.id;

    const browser = await chromium.connectOverCDP(`wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&sessionId=${sessionId}`);
    
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();
    console.log("Navigating...");
    await page.goto("https://korter.ge/ru/property/create", { waitUntil: "domcontentloaded" });
    const content = await page.title();
    console.log("Title: ", content);
    await browser.close();
  } catch (e) {
    console.error(e);
  }
}

run();
