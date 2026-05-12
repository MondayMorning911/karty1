import { chromium } from 'playwright-extra';
// @ts-ignore
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import fs from 'fs';
import path from 'path';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Browser, BrowserContext, Page } from 'playwright-core';

chromium.use(stealthPlugin());

interface AuthSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const activeAuthSessions: Record<string, AuthSession> = {};

const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export const korterAuthManager = {
  // ШАГ 1: Инициация входа
  async startLogin(userId: string, phoneOrEmail: string) {
    try {
      const fingerprintGenerator = new FingerprintGenerator();
      const fingerprintInjector = new FingerprintInjector();
      
      const fingerprint = fingerprintGenerator.getFingerprint({
        devices: ['desktop'],
        operatingSystems: ['windows', 'macos'],
        browsers: ['chrome'],
      });

      const browser = await chromium.launch({ 
        headless: true,
        proxy: {
          server: 'http://res.proxy-seller.com:10000',
          username: 'd0e326028eb23797',
          password: 'vh6bDxAKJj7XUsSq'
        }
      });
      console.log(`[KorterAuth] Creating new browser context...`);
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

      console.log(`[KorterAuth] Opening new page...`);
      const page = await context.newPage();

      // Блокируем лишние ресурсы для ускорения загрузки
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'media'].includes(type)) { // Не блокируем CSS/шрифты, чтобы не "спалиться" ботом
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

      console.log(`[KorterAuth] Navigating to https://korter.ge/ru`);
      await page.goto('https://korter.ge/ru', { waitUntil: 'commit', timeout: 30000 }).catch(e => console.warn('goto timeout:', e.message));
      
      console.log(`[KorterAuth] Waiting for login button...`);
      // Wait for login button and click
      await page.waitForSelector('div.s1ipb8ld', { timeout: 10000 });
      await delay(Math.random() * 500 + 200);
      await page.hover('div.s1ipb8ld');
      await delay(Math.random() * 300 + 100);
      await page.click('div.s1ipb8ld');
      
      console.log(`[KorterAuth] Waiting for login field...`);
      // Fill login field
      await page.waitForSelector('input.sxb0tu9', { timeout: 10000 });
      await delay(Math.random() * 500 + 200);
      await page.click('input.sxb0tu9');
      await typeWithDelay('input.sxb0tu9', phoneOrEmail);
      
      console.log(`[KorterAuth] Waiting for confirm button...`);
      // Click confirm
      await page.waitForSelector('button.a1w2sthb.bjrwb8u', { timeout: 10000 });
      await delay(Math.random() * 500 + 200);
      await page.hover('button.a1w2sthb.bjrwb8u');
      await delay(Math.random() * 300 + 100);
      await page.click('button.a1w2sthb.bjrwb8u');

      console.log(`[KorterAuth] Instance saved, awaiting SMS code.`);
      // Save instance to use it in code verification step
      activeAuthSessions[userId] = { browser, context, page };
      return { status: 'awaiting_code' };
    } catch (error: any) {
      console.error('Korter Start Login Error:', error);
      return { status: 'error', message: error.message };
    }
  },

  // ШАГ 2: Ввод SMS-кода
  async verifyCode(userId: string, smsCode: string) {
    const session = activeAuthSessions[userId];
    if (!session) throw new Error("Сессия не найдена. Начните сначала.");

    const { page, context, browser } = session;

    try {
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
      const typeWithDelay = async (locator: string, text: string) => {
        for (const char of text) {
          await page.type(locator, char, { delay: Math.floor(Math.random() * 100) + 50 });
        }
      };

      console.log(`[KorterAuth] Verification started. Waiting for SMS code input field...`);
      // Вводим код в то самое поле
      await page.waitForSelector('input.s1mdnixp:nth-child(1)', { timeout: 10000 });
      await delay(Math.random() * 500 + 200);
      await page.click('input.s1mdnixp:nth-child(1)');
      await typeWithDelay('input.s1mdnixp:nth-child(1)', smsCode);
      
      console.log(`[KorterAuth] SMS code inputted. Waiting for success profile element...`);
      // Ждем появления имени профиля (признак успеха) - we need a generic selector or just wait a bit, 
      // User says: 'div.sv0ienj.c7pdjhv'
      await page.waitForSelector('div.sv0ienj.c7pdjhv', { timeout: 15000 });

      console.log(`[KorterAuth] Profile element found. Authentication successful! Extracting storage state...`);
      // Сохраняем "Крепкие куки"
      const storageState = await context.storageState();
      
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

      storageState.origins = [{
          origin: new URL(page.url()).origin,
          localStorage: Object.entries(localStorageData).map(([name, value]) => ({name, value})) as any
      }] as any;

      const db = getFirestore();
      await db.doc(`users/${userId}/sessions/korter`).set({
        state: storageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.doc(`sessions/${userId}/platforms/korter`).set({
        state: storageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      });

      await browser.close();
      delete activeAuthSessions[userId];
      return { status: 'success' };
    } catch (error: any) {
      await browser.close();
      delete activeAuthSessions[userId];
      console.error('Korter Verify Code Error:', error);
      return { status: 'error', message: error.message || "Failed to verify code" };
    }
  }
};
