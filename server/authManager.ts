import { chromium } from 'playwright-extra';
// @ts-ignore
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { Page, BrowserContext } from 'playwright-core';

chromium.use(stealthPlugin());

// Ensure Firebase is initialized
if (!getApps().length) {
  try {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'karty-app' });
  } catch (e: any) {
    console.error("Firebase admin initialization warning:", e.message);
  }
}

const db = getFirestore();

export class AuthManager {
  static async loginWithPassword(userId: string, platform: 'ssge' | 'myhome' | 'realting', loginStr: string, passwordStr: string) {
    console.log(`[AuthManager] Starting local browser login for ${platform} (User: ${userId})`);

    let targetUrl = 'https://example.com';
    if (platform === 'myhome') targetUrl = 'https://auth.tnet.ge/ru/user/login/?Continue=https://www.myhome.ge/';
    if (platform === 'ssge') targetUrl = 'https://account.ss.ge/ka/account/login?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Dssweb%26scope%3Dbanners%2520files%2520house_api%2520offline_access%2520openid%2520paid_services%2520profile%2520real_estate%2520statistics%2520user_registration%2520web_apigateway%26response_type%3Dcode%26redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%252Fapi%252Fauth%252Fcallback%252Fidentity-server4%26authority%3Dhttps%253A%252F%252Faccount.ss.ge%26post_logout_redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%26response_mode%3Dquery%26code_challenge%3DQlEwHPQ_sdS-Rka6pg4x-_HwCJm34R0o6Wsy928y7fs%26code_challenge_method%3DS256';
    if (platform === 'realting') targetUrl = 'https://realting.com/ru/login';

    const fingerprintGenerator = new FingerprintGenerator();
    const fingerprintInjector = new FingerprintInjector();
    
    // Generate browser fingerprint
    const fingerprint = fingerprintGenerator.getFingerprint({
      devices: ['desktop'],
      operatingSystems: ['windows', 'macos'],
      browsers: ['chrome'],
    });

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: fingerprint.fingerprint.navigator.userAgent,
        locale: fingerprint.fingerprint.navigator.language,
        viewport: {
          width: fingerprint.fingerprint.screen.width,
          height: fingerprint.fingerprint.screen.height,
        },
        extraHTTPHeaders: {
          'accept-language': fingerprint.fingerprint.navigator.language,
        }
      });
      
      await fingerprintInjector.attachFingerprintToPlaywright(context as any, fingerprint);
      
      const page = await context.newPage();
      
      // Блокируем лишние ресурсы для ускорения загрузки
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
      const typeWithDelay = async (locator: string, text: string) => {
        for (const char of text) {
          await page.type(locator, char, { delay: Math.floor(Math.random() * 100) + 50 });
        }
      };

      console.log(`[AuthManager] Navigating to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: 30000 }).catch(e => console.warn('goto timeout:', e.message));

      // Handle specific platform logins
      if (platform === 'ssge') {
        // ss.ge: fill login, wait for password, fill password, click login
        await page.waitForSelector('input.input[name="userName"]', { timeout: 10000 });
        await page.click('input.input[name="userName"]');
        await delay(Math.random() * 500 + 200);
        await typeWithDelay('input.input[name="userName"]', loginStr);
        await delay(Math.random() * 500 + 200);
        await page.click('input[name="password"]');
        await delay(Math.random() * 500 + 200);
        await typeWithDelay('input[name="password"]', passwordStr);
        await delay(Math.random() * 1000 + 500);
        await page.hover('button.primary-btn');
        await delay(Math.random() * 300 + 100);
        await page.click('button.primary-btn');
        
        // Wait for successful redirect back to home.ss.ge
        await page.waitForURL('**/home.ss.ge/**', { waitUntil: 'commit', timeout: 15000 }).catch(e => console.warn('ssge waitForURL:', e.message));
        await delay(2000);
      } else if (platform === 'myhome') {
        // auth.tnet.ge
        await page.waitForSelector('#_r_m_', { timeout: 10000 });
        await page.click('#_r_m_');
        await delay(Math.random() * 500 + 200);
        await typeWithDelay('#_r_m_', loginStr);
        await delay(Math.random() * 500 + 200);
        await page.click('#_r_n_');
        await delay(Math.random() * 500 + 200);
        await typeWithDelay('#_r_n_', passwordStr);
        
        await delay(Math.random() * 1000 + 500);
        await page.hover('button.bg-blue-100.hover\\:bg-blue-110');
        await delay(Math.random() * 300 + 100);
        await page.click('button.bg-blue-100.hover\\:bg-blue-110');

        // wait for successful login redirect
        await page.waitForURL('**/myhome.ge/**', { waitUntil: 'commit', timeout: 15000 }).catch(e => console.warn('myhome waitForURL:', e.message));
        await delay(2000);
      } else if (platform === 'realting') {
        await page.waitForSelector('#loginform-username', { timeout: 10000 });
        await page.click('#loginform-username');
        await delay(Math.random() * 500 + 200);
        await typeWithDelay('#loginform-username', loginStr);
        await delay(Math.random() * 500 + 200);
        await page.click('#loginform-password');
        await delay(Math.random() * 500 + 200);
        await typeWithDelay('#loginform-password', passwordStr);
        
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
      
      // Save origin localstorage in playwright state format
      pwStorageState.origins = [{
          origin: new URL(page.url()).origin,
          localStorage: Object.entries(localStorageData).map(([name, value]) => ({name, value})) as any
      }] as any;

      // Ensure save to Firestore
      await db.doc(`users/${userId}/sessions/${platform}`).set({
        state: pwStorageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.doc(`sessions/${userId}/platforms/${platform}`).set({
        state: pwStorageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      });
      
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

