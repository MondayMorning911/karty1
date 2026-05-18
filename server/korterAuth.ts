import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { supabaseServer } from './supabase.js';

interface AuthSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
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
      const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY || 'bb_live_5oJ0ciNxBPE2UuE1HbrC4JEvBDw';
      const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || '7f1b4130-5234-4500-b051-9f330df88506';
      
      console.log(`[KorterAuth] Creating Browserbase session...`);
      const sessionResponse = await fetch('https://api.browserbase.com/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BB-API-Key': BROWSERBASE_API_KEY
        },
        body: JSON.stringify({
          projectId: BROWSERBASE_PROJECT_ID
        })
      });
      
      if (!sessionResponse.ok) {
          throw new Error(`Browserbase session creation failed: ${await sessionResponse.text()}`);
      }
      const sessionData = await sessionResponse.json();
      const sessionId = sessionData.id;

      const params = new URLSearchParams({
        apiKey: BROWSERBASE_API_KEY,
        sessionId: sessionId,
        enableStealth: 'true', 
        enableWebGL: 'true',   
        viewport: JSON.stringify({ width: 1280, height: 1024 }) 
      });
      const wsUrl = `wss://connect.browserbase.com?${params.toString()}`;
      console.log('🚀 Подключаемся к Browserbase (Stealth + WebGL + Viewport)...');
      const browser = await chromium.connectOverCDP(wsUrl);
      
      console.log(`[KorterAuth] Connected to Browserbase browser context...`);
      const context = browser.contexts()[0];

      console.log(`[KorterAuth] Opening new page...`);
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 1024 });

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
      await page.goto('https://korter.ge/ru', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.warn('goto timeout:', e.message));
      
      // ЗАКРЫВАЕМ ОКНО ПРАВИЛ ЕСЛИ ЕСТЬ, И ПАПНЕЛИ ПЕРЕВОДА
      await delay(3000); // Give it a moment to render
      
      console.log(`[KorterAuth] Handling cookies banner if present...`);
      const cookiesBtn = page.locator('div.s1ipb8ld', { hasText: 'Принимаю Cookies' }).first();
      await cookiesBtn.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      if (await cookiesBtn.isVisible().catch(() => false)) {
        await cookiesBtn.click({ force: true }).catch(() => {});
      }

      console.log(`[KorterAuth] Waiting for login button...`);
      // Wait for login button and click
      const loginBtn = page.locator('div.s1ipb8ld', { hasText: 'Войти' }).first();
      await loginBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      if (!await loginBtn.isVisible().catch(() => false)) {
          // generic fallback
          const fallback = page.locator('button:has-text("Войти"), a[href*="login"], button[aria-label*="login" i], div:has-text("Войти")').filter({ hasNot: page.locator('div:has-text("Войти") div') }).first();
          await fallback.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
          await fallback.click({ force: true }).catch(() => {});
      } else {
          await loginBtn.click({ force: true }).catch(() => {});
      }
      
      console.log(`[KorterAuth] Waiting for login field...`);
      // Generic login field
      const inputLocator = page.locator('input[name="email-phone"], input.sxb0tu9').first();
      await inputLocator.waitFor({ state: 'visible', timeout: 15000 });
      await inputLocator.click();
      await delay(Math.random() * 200 + 100);
      await inputLocator.type(phoneOrEmail, { delay: 100 });
      
      console.log(`[KorterAuth] Wait for confirm button...`);
      // Click Войти button 
      const confirmBtn = page.locator('button.a1w2sthb.bjrwb8u:has-text("Войти"), button[type="submit"]').first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await delay(Math.random() * 500 + 200);
      await confirmBtn.click({ force: true }).catch(() => {});

      console.log(`[KorterAuth] Instance saved, awaiting SMS code.`);
      // Save instance to use it in code verification step
      activeAuthSessions[userId] = { browser, context, page, sessionId };
      return { status: 'awaiting_code' };
    } catch (error: any) {
      console.error('Korter Start Login Error:', error);
      try {
        console.log(`[KorterAuth] Releasing Browserbase session on error...`);
        const session = activeAuthSessions[userId];
        if (session) {
          await session.browser.close().catch(() => {});
          delete activeAuthSessions[userId];
        }
      } catch (e) {}
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
      const smsInput = page.locator('input[type="tel"], input.s1mdnixp').first();
      await smsInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      await smsInput.click();
      await delay(200);
      await smsInput.type(smsCode, { delay: 100 });
      
      console.log(`[KorterAuth] SMS code inputted. Waiting for success profile element...`);
      await delay(2000);
      
      // Ждем чтобы кнопка "Войти" исчезла, или появились другие кнопки профиля
      const hasLoginBtn = await page.locator('button.a1w2sthb.bjrwb8u:has-text("Войти")').isVisible().catch(() => false);
      if (hasLoginBtn) {
          throw new Error("Неверный код авторизации или ошибка");
      }
      
      await page.waitForLoadState('networkidle').catch(() => {});

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

      // Ensure parent documents exist -> This won't be needed with Supabase directly if we use foreign keys, but let's just insert
      storageState.origins = [{
          origin: new URL(page.url()).origin,
          localStorage: Object.entries(localStorageData).map(([name, value]) => ({name, value})) as any
      }] as any;

      const { error: sessionError } = await supabaseServer.from('platform_sessions').upsert({
        user_id: userId,
        platform: 'korter',
        state: storageState
      });
      if (sessionError) {
        console.error('Supabase save error:', sessionError);
      }

      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      console.log(`[KorterAuth] Browserbase session ${session.sessionId} closed.`);

      delete activeAuthSessions[userId];
      return { status: 'success' };
    } catch (error: any) {
      await browser.close().catch(() => {});
      try {
        console.log(`[KorterAuth] Releasing Browserbase session on error...`);
      } catch (e) {}
      delete activeAuthSessions[userId];
      console.error('Korter Verify Code Error:', error);
      return { status: 'error', message: error.message || "Failed to verify code" };
    }
  }
};
