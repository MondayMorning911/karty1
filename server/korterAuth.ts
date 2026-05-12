import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Browser, BrowserContext, Page } from 'playwright-core';

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
      const STEEL_API_KEY = process.env.STEEL_API_KEY || 'ste-S2WXkR2diAvFIHVgXUD5xwc35sa0VolIMSsnz6PU4SCIKNgWEwvRSH6EzlaCeT7P7jleUWCbrbZHLyFLWToNf7lDSE62nZjZ6A6';
      
      console.log(`[KorterAuth] Creating Steel.dev session...`);
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
      
      console.log(`[KorterAuth] Connected to Steel.dev browser context...`);
      const context = browser.contexts()[0];

      console.log(`[KorterAuth] Opening new page...`);
      const page = await context.newPage();

      // Блокируем лишние ресурсы для ускорения загрузки
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const type = route.request().resourceType();
        if (['image', 'font', 'media', 'other'].includes(type) || 
            url.includes('google-analytics') || url.includes('facebook') || url.includes('hotjar.com') || url.includes('googletagmanager.com')) {
          route.abort().catch(() => {});
        } else {
          route.continue().catch(() => {});
        }
      });

      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
      const fillWithDelay = async (locator: string, text: string) => {
        await page.click(locator);
        await delay(Math.random() * 200 + 200);
        await page.fill(locator, text);
      };

      console.log(`[KorterAuth] Navigating to https://korter.ge/ru`);
      await page.goto('https://korter.ge/ru', { waitUntil: 'commit', timeout: 30000 }).catch(e => console.warn('goto timeout:', e.message));
      
      // ЗАКРЫВАЕМ ОКНО ПРАВИЛ ЕСЛИ ЕСТЬ, И ПАПНЕЛИ ПЕРЕВОДА
      await page.evaluate(() => {
        const overlays = document.querySelectorAll('button, div[role="button"], a');
        overlays.forEach(el => {
          const text = el.textContent?.toLowerCase() || '';
          if (text.includes('принять') || text.includes('accept') || text.includes('got it') || text.includes('agree') || text.includes('понятно') || text.includes('закрыть')) {
            (el as HTMLElement).click();
          }
        });
        
        // Попробуем найти крестик гугл транслейта если он есть
        const closeTranslate = document.querySelector('.skiptranslate.goog-close-link, #goog-gt-tt .goog-close-link, .VIpgJd-Zvi9od-aZ2wEe-wOHMyf');
        if (closeTranslate) {
          (closeTranslate as HTMLElement).click();
        }
      }).catch(() => {});

      console.log(`[KorterAuth] Waiting for login button...`);
      // Wait for login button and click (force true to bypass cookie banner)
      await page.waitForSelector('div.s1ipb8ld', { state: 'visible', timeout: 10000 });
      await delay(Math.random() * 500 + 200);
      await page.hover('div.s1ipb8ld', { force: true });
      await delay(Math.random() * 300 + 100);
      await page.click('div.s1ipb8ld', { force: true });
      
      console.log(`[KorterAuth] Waiting for login field...`);
      // Fill login field
      await page.waitForSelector('input.sxb0tu9', { state: 'visible', timeout: 15000 });
      await fillWithDelay('input.sxb0tu9', phoneOrEmail);
      
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
      const fillWithDelay = async (locator: string, text: string) => {
        await page.click(locator);
        await delay(Math.random() * 200 + 200);
        await page.fill(locator, text);
      };

      console.log(`[KorterAuth] Verification started. Waiting for SMS code input field...`);
      // Вводим код в то самое поле
      await page.waitForSelector('input.s1mdnixp:nth-child(1)', { timeout: 10000 });
      await fillWithDelay('input.s1mdnixp:nth-child(1)', smsCode);
      
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

      // Ensure parent documents exist
      await db.collection('users').doc(userId).set({ lastActive: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection('sessions').doc(userId).set({ lastActive: FieldValue.serverTimestamp() }, { merge: true });

      storageState.origins = [{
          origin: new URL(page.url()).origin,
          localStorage: Object.entries(localStorageData).map(([name, value]) => ({name, value})) as any
      }] as any;

      await db.collection('users').doc(userId).collection('sessions').doc('korter').set({
        state: storageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await db.collection('sessions').doc(userId).collection('platforms').doc('korter').set({
        state: storageState,
        localStorage: localStorageData || {},
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      delete activeAuthSessions[userId];
      return { status: 'success' };
    } catch (error: any) {
      await browser.close().catch(() => {});
      delete activeAuthSessions[userId];
      console.error('Korter Verify Code Error:', error);
      return { status: 'error', message: error.message || "Failed to verify code" };
    }
  }
};
