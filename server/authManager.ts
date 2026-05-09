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
    if (platform === 'myhome') targetUrl = 'https://www.myhome.ge/';
    if (platform === 'ssge') targetUrl = 'https://ss.ge/ru';
    if (platform === 'korter') targetUrl = 'https://korter.ge/';
    if (platform === 'realting') targetUrl = 'https://realting.com/ru/';

    try {
      const response = await fetch(STEEL_API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'steel-api-key': STEEL_API_KEY
        },
        body: JSON.stringify({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          solveCaptcha: false,
          headless: false,
          debugConfig: { interactive: true }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start steel session: ${await response.text()}`);
      }
      
      const session = await response.json();
      const sessionId = session.id;
      console.log(`[AuthManager] Steel Session created: ${sessionId}`);

      // Navigate using Playwright CDP
      try {
        const browser = await chromium.connectOverCDP(session.websocketUrl);
        const context = browser.contexts()[0] || await browser.newContext();
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        const page = context.pages()[0] || await context.newPage();
        
        console.log(`[AuthManager] Navigating to ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        browser.disconnect();
      } catch (pwError) {
        console.error('Playwright navigation error, session might be empty:', pwError);
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
        const wsUrl = `wss://connect.steel.dev?sessionId=${sessionId}`;
        const browser = await chromium.connectOverCDP(wsUrl);
        const context = browser.contexts()[0];
        
        if (context) {
           pwStorageState = await context.storageState();
           const page = context.pages()[0];
           if (page) {
             localStorageData = await page.evaluate(() => {
                let data: any = {};
                for(let i=0; i<localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) data[key] = localStorage.getItem(key);
                }
                return data;
             }).catch(() => ({}));
           }
        }
        browser.disconnect();
      } catch (e) {
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
