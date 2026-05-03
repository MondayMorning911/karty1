import { chromium } from 'playwright';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import type { Page, BrowserContext } from 'playwright-core';

// Ensure Firebase is initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (e: any) {
    console.error("Firebase admin initialization warning:", e.message);
  }
}

const db = getFirestore();
const BROWSERLESS_WS_URL = 'ws://72.56.1.59:3001/chromium?token=KartyMustPassword';
const BROWSERLESS_DEBUG_URL = 'http://72.56.1.59:3001/?token=KartyMustPassword';

export class AuthManager {
  static async startSession(userId: string, platform: 'ssge' | 'myhome' | 'realting' | 'korter') {
    console.log(`[AuthManager] Starting browserless session for ${platform} (User: ${userId})`);

    try {
      // Connect to Browserless
      const browser = await chromium.connectOverCDP(BROWSERLESS_WS_URL);
      
      const context = browser.contexts()[0] || await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      const page = await context.newPage();

      // Navigate to the respective login page
      switch (platform) {
        case 'ssge':
          await page.goto('https://ss.ge/ru/real-estate/Login', { timeout: 60000 });
          break;
        case 'myhome':
          await page.goto('https://www.myhome.ge/ru/login', { timeout: 60000 });
          break;
        case 'realting':
          await page.goto('https://realting.com/ru/login', { timeout: 60000 });
          break;
        case 'korter':
          await page.goto('https://korter.ge/ru/', { timeout: 60000, waitUntil: 'domcontentloaded' });
          break;
        default:
          throw new Error('Unknown platform: ' + platform);
      }

      // Start watching for login in the background
      this.watchForLogin(page, context, userId, platform, browser);

      // Return the interactive URL so the user can open it in iframe
      return { interactiveUrl: BROWSERLESS_DEBUG_URL };
    } catch (error: any) {
      console.error(`[AuthManager] Failed to start session:`, error.message);
      throw error;
    }
  }

  static async watchForLogin(page: Page, context: BrowserContext, userId: string, platform: string, browser: any) {
    let isSuccess = false;
    let timeoutId: NodeJS.Timeout;

    // 5 minutes timeout
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve('timeout');
      }, 5 * 60 * 1000);
    });

    try {
      const waitPromise = (async () => {
        switch (platform) {
          case 'ssge':
            await page.waitForURL(/^https:\/\/(home\.)?ss\.ge.*/);
            break;
          case 'myhome':
            await page.waitForFunction(() => {
              return window.location.href.includes('myhome.ge') && !window.location.href.includes('login');
            });
            break;
          case 'realting':
            await page.waitForURL((url) => !url.href.includes('/login'));
            break;
          case 'korter':
            await page.waitForSelector('.user-avatar, .profile-menu', { state: 'visible' });
            break;
        }
        return 'success';
      })();

      const result = await Promise.race([waitPromise, timeoutPromise]);

      if (result === 'success') {
        isSuccess = true;
        console.log(`[AuthManager] Login successful on ${platform}. Saving storage state...`);
        const storageState = await context.storageState();

        // user wants it at: users/${userId}/sessions/${platform}
        await db.doc(`users/${userId}/sessions/${platform}`).set({
          state: storageState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Also save to the original path used by the UI just in case
        await db.doc(`sessions/${userId}/platforms/${platform}`).set({
          state: storageState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[AuthManager] Session saved successfully for ${platform}`);
      } else {
        console.log(`[AuthManager] Timeout reached for ${platform} authorization.`);
      }
    } catch (error: any) {
      console.error(`[AuthManager] Error watching login for ${platform}:`, error.message);
    } finally {
      clearTimeout(timeoutId!);
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }
}
