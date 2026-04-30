import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

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
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      await page.goto('https://korter.ge/ru');
      
      // Wait for login button and click
      await page.waitForSelector('div.s1ipb8ld', { timeout: 10000 });
      await page.click('div.s1ipb8ld');
      
      // Fill login field
      await page.waitForSelector('input.sxb0tu9', { timeout: 10000 });
      await page.fill('input.sxb0tu9', phoneOrEmail);
      
      // Click confirm
      await page.waitForSelector('button.a1w2sthb.bjrwb8u', { timeout: 10000 });
      await page.click('button.a1w2sthb.bjrwb8u');

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
      // Вводим код в то самое поле
      await page.waitForSelector('input.s1mdnixp:nth-child(1)', { timeout: 10000 });
      // The snippet assumes pasting code might fill all fields or just type it
      await page.type('input.s1mdnixp:nth-child(1)', smsCode);
      
      // Ждем появления имени профиля (признак успеха) - we need a generic selector or just wait a bit, 
      // User says: 'div.sv0ienj.c7pdjhv'
      await page.waitForSelector('div.sv0ienj.c7pdjhv', { timeout: 15000 });

      // Сохраняем "Крепкие куки"
      const storageState = await context.storageState();
      fs.writeFileSync(path.join(SESSIONS_DIR, `auth_korter_${userId}.json`), JSON.stringify(storageState));

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
