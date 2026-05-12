import { chromium } from 'playwright-core';
import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Page, BrowserContext } from 'playwright-core';
import fs from 'fs';
import path from 'path';

// Ensure Firebase Admin is initialized
if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.warn('⚠️ service-account.json not found! Falling back to application default credentials.');
      admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'karty-app' });
    }
  } catch (e: any) {
    console.error("Firebase admin initialization warning:", e.message);
  }
}
let firestoreDatabaseId: string | undefined = undefined;
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    firestoreDatabaseId = firebaseConfig.firestoreDatabaseId;
  }
} catch (e) {}

const db = firestoreDatabaseId ? getFirestore(admin.app(), firestoreDatabaseId) : getFirestore();

export class AuthManager {
  static async loginWithPassword(userId: string, platform: 'ssge' | 'myhome' | 'realting', loginStr: string, passwordStr: string) {
    console.log(`[AuthManager] Starting local browser login for ${platform} (User: ${userId})`);

    let targetUrl = 'https://example.com';
    if (platform === 'myhome') targetUrl = 'https://auth.tnet.ge/ru/user/login/?Continue=https://www.myhome.ge/';
    if (platform === 'ssge') targetUrl = 'https://account.ss.ge/ka/account/login?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Dssweb%26scope%3Dbanners%2520files%2520house_api%2520offline_access%2520openid%2520paid_services%2520profile%2520real_estate%2520statistics%2520user_registration%2520web_apigateway%26response_type%3Dcode%26redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%252Fapi%252Fauth%252Fcallback%252Fidentity-server4%26authority%3Dhttps%253A%252F%252Faccount.ss.ge%26post_logout_redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%26response_mode%3Dquery%26code_challenge%3DQlEwHPQ_sdS-Rka6pg4x-_HwCJm34R0o6Wsy928y7fs%26code_challenge_method%3DS256';
    if (platform === 'realting') targetUrl = 'https://realting.com/ru/login';

    const STEEL_API_KEY = process.env.STEEL_API_KEY || 'ste-S2WXkR2diAvFIHVgXUD5xwc35sa0VolIMSsnz6PU4SCIKNgWEwvRSH6EzlaCeT7P7jleUWCbrbZHLyFLWToNf7lDSE62nZjZ6A6';
    
    console.log(`[AuthManager] Creating Steel.dev session for ${platform}...`);
    const sessionResponse = await fetch('https://api.steel.dev/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'steel-api-key': STEEL_API_KEY
      },
      body: JSON.stringify({
        proxyUrl: 'http://d0e326028eb23797:vh6bDxAKJj7XUsSq@res.proxy-seller.com:10000',
        isStealth: true
      })
    });
    
    if (!sessionResponse.ok) {
        throw new Error(`Steel session creation failed: ${await sessionResponse.text()}`);
    }
    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.id;

    const browser = await chromium.connectOverCDP(`wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${sessionId}`);
    
    try {
      console.log(`[AuthManager] Connected to Steel.dev browser context for ${platform}...`);
      const context = browser.contexts()[0];
      
      console.log(`[AuthManager] Opening new page for ${platform}...`);
      const page = await context.newPage();
      
      // Блокируем лишние ресурсы для ускорения загрузки
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const type = route.request().resourceType();
        if (['image', 'font', 'media'].includes(type) || url.includes('google-analytics') || url.includes('facebook')) {
          route.abort();
        } else {
          route.continue();
        }
      });

      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
      const fillWithDelay = async (locator: string, text: string) => {
        await page.click(locator);
        await delay(Math.random() * 200 + 200);
        await page.fill(locator, text);
      };

      console.log(`[AuthManager] Navigating to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: 30000 }).catch(e => console.warn('goto timeout:', e.message));

      // Handle specific platform logins
      if (platform === 'ssge') {
        // ss.ge: fill login, wait for password, fill password, click login
        await page.waitForSelector('input.input[name="userName"]', { timeout: 10000 });
        await fillWithDelay('input.input[name="userName"]', loginStr);
        await delay(Math.random() * 500 + 200);
        await fillWithDelay('input[name="password"]', passwordStr);
        await delay(Math.random() * 1000 + 500);
        await page.hover('button.primary-btn');
        await delay(Math.random() * 300 + 100);
        await page.click('button.primary-btn');
        
        // Wait for successful redirect back to home.ss.ge
        await page.waitForFunction(() => window.location.hostname.includes('ss.ge') && !window.location.href.includes('login'), { timeout: 15000 }).catch(e => console.warn('ssge waitForFunction:', e.message));
        await delay(2000);
      } else if (platform === 'myhome') {
        // auth.tnet.ge
        await page.waitForSelector('#_r_m_', { timeout: 10000 });
        await fillWithDelay('#_r_m_', loginStr);
        await delay(Math.random() * 500 + 200);
        await fillWithDelay('#_r_n_', passwordStr);
        
        await delay(Math.random() * 1000 + 500);
        await page.hover('button.bg-blue-100.hover\\:bg-blue-110');
        await delay(Math.random() * 300 + 100);
        await page.click('button.bg-blue-100.hover\\:bg-blue-110');

        // wait for successful login redirect
        await Promise.race([
            page.waitForURL(/myhome\.ge/, { timeout: 30000 }),
            page.waitForSelector('a[href*="logout"], .user-profile', { timeout: 30000 })
        ]).catch(e => console.warn('myhome login wait warning:', e.message));
        await delay(2000);
      } else if (platform === 'realting') {
        await page.waitForSelector('#loginform-username', { timeout: 10000 });
        await fillWithDelay('#loginform-username', loginStr);
        await delay(Math.random() * 500 + 200);
        await fillWithDelay('#loginform-password', passwordStr);
        
        // click submit (find submit button)
        await delay(Math.random() * 1000 + 500);
        await page.hover('#login-form-submit');
        await delay(Math.random() * 300 + 100);
        await page.click('#login-form-submit');

        // wait for successful login redirect (url changes from /login)
        await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 15000 });
        await delay(2000); // give it a moment to fully set cookies after redirect
      }

      // Collect storage and cookies
      const pwStorageState = await context.storageState();
      
      let localStorageData = await page.evaluate(() => {
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
      
      // Ensure parent documents exist
      await db.collection('users').doc(userId).set({ lastActive: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection('sessions').doc(userId).set({ lastActive: FieldValue.serverTimestamp() }, { merge: true });

      // Save origin localstorage in playwright state format
      pwStorageState.origins = [{
          origin: new URL(page.url()).origin,
          localStorage: Object.entries(localStorageData).map(([name, value]) => ({name, value})) as any
      }] as any;

      // Ensure save to Firestore
      await db.collection('users').doc(userId).collection('sessions').doc(platform).set({
        state: pwStorageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await db.collection('sessions').doc(userId).collection('platforms').doc(platform).set({
        state: pwStorageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`[AuthManager] Session saved successfully for ${platform}.`);
      await browser.close();

      return { success: true };
    } catch (error: any) {
      await browser.close();
      console.error(`[AuthManager] Failed to login:`, error.message);
      throw error;
    }
  }
}

