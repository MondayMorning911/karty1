import { chromium } from 'playwright';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { Page, BrowserContext } from 'playwright-core';

// Ensure Firebase is initialized
if (!getApps().length) {
  try {
    initializeApp();
  } catch (e: any) {
    console.error("Firebase admin initialization warning:", e.message);
  }
}

const db = getFirestore();
const STEEL_API_URL = 'https://api.steel.dev/v1/sessions';
const STEEL_API_KEY = process.env.STEEL_API_KEY || 'ste-S2WXkR2diAvFIHVgXUD5xwc35sa0VolIMSsnz6PU4SCIKNgWEwvRSH6EzlaCeT7P7jleUWCbrbZHLyFLWToNf7lDSE62nZjZ6A6';

export class AuthManager {
  static async startSession(userId: string, platform: 'ssge' | 'myhome' | 'realting' | 'korter') {
    console.log(`[AuthManager] Starting Cloud Steel session for ${platform} (User: ${userId})`);

    let targetUrl = 'https://example.com';
    if (platform === 'myhome') targetUrl = 'https://auth.tnet.ge/ru/user/login/?Continue=https://www.myhome.ge/';
    if (platform === 'ssge') targetUrl = 'https://account.ss.ge/ka/account/login?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Dssweb%26scope%3Dbanners%2520files%2520house_api%2520offline_access%2520openid%2520paid_services%2520profile%2520real_estate%2520statistics%2520user_registration%2520web_apigateway%26response_type%3Dcode%26redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%252Fapi%252Fauth%252Fcallback%252Fidentity-server4%26authority%3Dhttps%253A%252F%252Faccount.ss.ge%26post_logout_redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%26response_mode%3Dquery%26code_challenge%3DQlEwHPQ_sdS-Rka6pg4x-_HwCJm34R0o6Wsy928y7fs%26code_challenge_method%3DS256';
    if (platform === 'korter') targetUrl = 'https://korter.ge/ru/';
    if (platform === 'realting') targetUrl = 'https://realting.com/ru/login';

    try {
      const response = await fetch(STEEL_API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'steel-api-key': STEEL_API_KEY
        },
        body: JSON.stringify({
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          solveCaptcha: false,
          headless: false,
          dimensions: { width: 375, height: 812 },
          deviceConfig: { device: 'mobile' },
          debugConfig: { interactive: true }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start steel session: ${await response.text()}`);
      }
      
      const session = await response.json();
      if (!session || !session.id) {
         throw new Error('Failed to create session: ' + JSON.stringify(session));
      }
      const sessionId = session.id;
      console.log(`[AuthManager] Steel Session created: ${sessionId}`);

      // connect and navigate using playwright
      try {
        const browser = await chromium.connectOverCDP(`wss://connect.steel.dev?sessionId=${sessionId}&apiKey=${STEEL_API_KEY}`);
        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        const pages = context.pages();
        const page = pages.length > 0 ? pages[0] : await context.newPage();
        
        console.log(`[AuthManager] Navigating to ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await browser.close();
      } catch (err: any) {
         console.error('Playwright navigation error:', err.message);
      }

      return { 
        interactiveUrl: session.debugUrl,
        sessionId: sessionId
      };
    } catch (error: any) {
      console.error(`[AuthManager] Failed to start Steel session:`, error.message);
      throw error;
    }
  }

  // Called when user clicks "I'm logged in"
  static async saveSession(userId: string, platform: string, sessionId: string) {
    try {
      console.log(`[AuthManager] Saving steel session for ${platform}...`);
      
      const stateRes = await fetch(`${STEEL_API_URL}/${sessionId}/context`, {
        headers: { 'steel-api-key': STEEL_API_KEY }
      });
      
      if (!stateRes.ok) {
        throw new Error(`Failed to get session context state: ${await stateRes.text()}`);
      }
      
      const sessionState = await stateRes.json();

      let pwStorageState = { cookies: [], origins: [] };
      let localStorageData = {};
      
      try {
        const wsUrl = `wss://connect.steel.dev?sessionId=${sessionId}&apiKey=${STEEL_API_KEY}`;
        const browser = await chromium.connectOverCDP(wsUrl);
        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : null;
        
        if (context) {
           pwStorageState = await context.storageState();
           const pages = context.pages();
           const page = pages.length > 0 ? pages[0] : null;
           
           if (page) {
             localStorageData = await page.evaluate(() => {
                let data: Record<string, string> = {};
                for(let i=0; i<localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        const val = localStorage.getItem(key);
                        if (val !== null) data[key] = val;
                    }
                }
                return data;
             }).catch((e) => {
                console.error("Local storage extract error:", e);
                return {};
             });
             
             // Save origin localstorage in playwright state format
             pwStorageState.origins = [{
                 origin: new URL(page.url()).origin || `https://${platform}.ge`,
                 localStorage: Object.entries(localStorageData).map(([name, value]) => ({name, value})) as any
             }] as any;
           }
        }
        await browser.close();
      } catch (e: any) {
        console.warn('Fallback to Steel Context due to CDP fail', e);
        pwStorageState = {
           cookies: sessionState.cookies || [],
           origins: [{
              origin: `https://${platform}.ge`,
              localStorage: Object.entries(sessionState.localStorage || {}).map(([name, value]) => ({name, value})) as any
           }]
        };
        localStorageData = sessionState.localStorage || {};
      }

      // Explicitly release session
      try {
         await fetch(`${STEEL_API_URL}/${sessionId}/release`, {
            method: 'POST',
            headers: { 'steel-api-key': STEEL_API_KEY }
         });
         console.log(`[AuthManager] Released session ${sessionId}`);
      } catch (e) {
         console.error('[AuthManager] Failed to release session', e);
      }

      // Сохраняем в Firestore
      await db.doc(`users/${userId}/sessions/${platform}`).set({
        state: pwStorageState,
        localStorage: localStorageData || {},
        sessionId: sessionId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.doc(`sessions/${userId}/platforms/${platform}`).set({
        state: pwStorageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      console.log(`[AuthManager] Session saved successfully for ${platform}. Releasing container...`);

      // Destroy session explicitly via steel API
      fetch(`${STEEL_API_URL}/${sessionId}/release`, {
        method: 'POST',
        headers: { 'steel-api-key': STEEL_API_KEY }
      }).catch(e => console.error("Error stopping steel container:", e));

      return { success: true };
    } catch (err: any) {
      console.error("[AuthManager] Save session error:", err.message);
      throw err;
    }
  }
}
