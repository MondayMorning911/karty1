import { chromium } from "playwright-core";
import { supabaseServer } from "./supabase.js";
import type { Page, BrowserContext } from "playwright-core";
import fs from "fs";
import path from "path";

export class AuthManager {
  static async loginWithPassword(
    userId: string,
    platform: "ssge" | "myhome" | "realting",
    loginStr: string,
    passwordStr: string,
  ) {
    console.log(
      `[AuthManager] Starting local browser login for ${platform} (User: ${userId})`,
    );

    let targetUrl = "https://example.com";
    if (platform === "myhome")
      targetUrl =
        "https://auth.tnet.ge/ru/user/login/?Continue=https://www.myhome.ge/";
    if (platform === "ssge")
      targetUrl =
        "https://account.ss.ge/ka/account/login?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Dssweb%26scope%3Dbanners%2520files%2520house_api%2520offline_access%2520openid%2520paid_services%2520profile%2520real_estate%2520statistics%2520user_registration%2520web_apigateway%26response_type%3Dcode%26redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%252Fapi%252Fauth%252Fcallback%252Fidentity-server4%26authority%3Dhttps%253A%252F%252Faccount.ss.ge%26post_logout_redirect_uri%3Dhttps%253A%252F%252Fhome.ss.ge%26response_mode%3Dquery%26code_challenge%3DQlEwHPQ_sdS-Rka6pg4x-_HwCJm34R0o6Wsy928y7fs%26code_challenge_method%3DS256";
    if (platform === "realting") targetUrl = "https://realting.com/ru/login";

    const BROWSERLESS_TOKEN =
      process.env.BROWSERLESS_TOKEN || "karty-secret-token";
    const wsUrl = `ws://72.56.1.59:3010?token=${BROWSERLESS_TOKEN}&stealth=true&headless=false&timeout=600000&--disable-blink-features=AutomationControlled`;
    console.log(
      `[AuthManager] Creating self-hosted Browserless session for ${platform}...`,
    );
    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 0 });

    try {
      console.log(
        `[AuthManager] Connected to Browserless context for ${platform}...`,
      );
      const context =
        browser.contexts()[0] ||
        (await browser.newContext({
          viewport: { width: 1280, height: 1024 },
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }));

      console.log(`[AuthManager] Opening new page for ${platform}...`);
      const page = await context.newPage();
      const sessionId =
        "browserless-" + Math.random().toString(36).substring(7);

      // Блокируем ЛИШЬ аналитику, без image/fonts (из-за Cloudflare/Captcha)
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (
          url.includes("google-analytics") ||
          url.includes("facebook") ||
          url.includes("hotjar.com") ||
          url.includes("googletagmanager.com")
        ) {
          route.abort().catch(() => {});
        } else {
          route.continue().catch(() => {});
        }
      });

      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const fillWithDelay = async (locator: string, text: string) => {
        await page.click(locator, { timeout: 10000 });
        await delay(Math.random() * 200 + 200);
        await page.locator(locator).pressSequentially(text, { delay: 100 });
      };

      const handleTurnstile = async () => {
        try {
          const cfFrame = page.frameLocator(
            'iframe[src*="challenges.cloudflare.com"]',
          );
          if (
            await cfFrame
              .locator("body")
              .waitFor({ state: "attached", timeout: 5000 })
              .catch(() => false)
          ) {
            console.log(
              `[AuthManager] Cloudflare Turnstile detected. Attempting to click...`,
            );
            await delay(2000);

            const checkbox = cfFrame
              .locator('input[type="checkbox"], .ctp-checkbox-label, .mark')
              .first();
            if (
              await checkbox
                .waitFor({ state: "visible", timeout: 3000 })
                .catch(() => false)
            ) {
              await checkbox.click({ force: true });
            } else {
              const frameEl = page
                .locator('iframe[src*="challenges.cloudflare.com"]')
                .first();
              const box = await frameEl.boundingBox();
              if (box) {
                await page.mouse.click(
                  box.x + box.width / 2 + (Math.random() * 10 - 5),
                  box.y + box.height / 2 + (Math.random() * 10 - 5),
                );
              }
            }
            console.log(
              `[AuthManager] Clicked Cloudflare. Waiting for resolution...`,
            );
            await delay(5000);
          }
        } catch (e) {}
      };

      console.log(`[AuthManager] Navigating to ${targetUrl}`);
      await page
        .goto(targetUrl, { waitUntil: "commit", timeout: 30000 })
        .catch((e) => console.warn("goto timeout:", e.message));

      await handleTurnstile();

      // Обработка логина для каждой платформы
      if (platform === "ssge") {
        const userSelector = 'input.input, input[name="userName"]';
        await page.waitForSelector(userSelector, { timeout: 15000 });
        await fillWithDelay(userSelector, loginStr);
        await delay(Math.random() * 500 + 200);

        const passSelector = 'input[type="password"], input[name="password"]';
        await fillWithDelay(passSelector, passwordStr);
        await delay(Math.random() * 1000 + 500);

        await page.hover("button.primary-btn");
        await delay(Math.random() * 300 + 100);
        await page.click("button.primary-btn");

        await page
          .waitForFunction(
            () =>
              window.location.hostname.includes("ss.ge") &&
              !window.location.href.includes("login"),
            { timeout: 60000 },
          )
          .catch((e) => console.warn("ssge redirect warning:", e.message));
        await delay(3000);
      } else if (platform === "myhome") {
        // Ждём загрузки формы
        await page.waitForSelector("#_r_u_", { timeout: 20000 });
        await delay(Math.random() * 800 + 600);

        // Симулируем движение мыши к полю логина
        const loginField = page.locator("#_r_u_");
        const loginBox = await loginField.boundingBox();
        if (loginBox) {
          await page.mouse.move(
            loginBox.x + loginBox.width * 0.3 + Math.random() * 20,
            loginBox.y + loginBox.height / 2 + Math.random() * 4,
            { steps: 8 },
          );
        }
        await delay(Math.random() * 300 + 200);
        await loginField.click();
        await delay(Math.random() * 400 + 200);
        await loginField.pressSequentially(loginStr, {
          delay: Math.random() * 80 + 80,
        });
        await delay(Math.random() * 600 + 400);

        // Переход к паролю
        const passField = page.locator("#_r_v_");
        const passBox = await passField.boundingBox();
        if (passBox) {
          await page.mouse.move(
            passBox.x + passBox.width * 0.3 + Math.random() * 20,
            passBox.y + passBox.height / 2 + Math.random() * 4,
            { steps: 6 },
          );
        }
        await delay(Math.random() * 300 + 150);
        await passField.click();
        await delay(Math.random() * 300 + 200);
        await passField.pressSequentially(passwordStr, {
          delay: Math.random() * 60 + 70,
        });
        await delay(Math.random() * 800 + 600);

        // Нажимаем кнопку «Войти»
        const submitBtn = page
          .locator(
            'button.p-4.rounded-lg.cursor-pointer.bg-blue-100, button[type="submit"]',
          )
          .first();
        const submitBox = await submitBtn.boundingBox().catch(() => null);
        if (submitBox) {
          await page.mouse.move(
            submitBox.x + submitBox.width / 2 + Math.random() * 6 - 3,
            submitBox.y + submitBox.height / 2 + Math.random() * 4 - 2,
            { steps: 10 },
          );
          await delay(Math.random() * 400 + 200);
          await submitBtn.click();
        } else {
          await passField.press("Enter");
        }

        // Проверяем ошибку неправильного пароля/логина
        const errorPopup = page.locator("div.go3958317564").first();
        const hasError = await errorPopup
          .waitFor({ state: "visible", timeout: 4000 })
          .then(() => true)
          .catch(() => false);
        if (hasError) {
          const errorText = await errorPopup.textContent().catch(() => "");
          throw new Error(
            `Неправильный номер телефона/почта или пароль: ${errorText?.trim()}`,
          );
        }

        // Ждём перехода на myhome.ge
        await page
          .waitForURL(/myhome\.ge/, { timeout: 60000 })
          .catch((e) =>
            console.warn("[AuthManager] myhome redirect warning:", e.message),
          );
        await delay(3000);

        // Проверяем что авторизация прошла — имя пользователя видно
        const userNameSpan = page
          .locator("span.max-w-\\[120px\\].truncate")
          .first();
        const loggedIn = await userNameSpan
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => true)
          .catch(() => false);
        if (!loggedIn) {
          throw new Error(
            "Авторизация не удалась: имя пользователя не появилось на сайте после входа.",
          );
        }
        const userName = await userNameSpan.textContent().catch(() => "");
        console.log(`[AuthManager] myhome logged in as: ${userName?.trim()}`);
      } else if (platform === "realting") {
        const userSelector = "#loginform-username";
        const passSelector = "#loginform-password";
        const submitSelector = '#login-form-submit, button:has-text("Войти")';

        await page.waitForSelector(userSelector, { timeout: 15000 });
        await fillWithDelay(userSelector, loginStr);
        await delay(Math.random() * 500 + 200);
        await fillWithDelay(passSelector, passwordStr);

        await delay(Math.random() * 1000 + 500);
        const submitBtn = page.locator(submitSelector).first();
        await submitBtn.hover();
        await delay(Math.random() * 300 + 100);
        await submitBtn.click({ force: true });

        await page.waitForFunction(
          () => !window.location.href.includes("/login"),
          { timeout: 60000 },
        );
        await delay(3000);
      }

      // Collect storage and cookies
      const pwStorageState = await context.storageState();

      let localStorageData = await page
        .evaluate(() => {
          let data: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
              const val = localStorage.getItem(key);
              if (val !== null) data[key] = val;
            }
          }
          return data;
        })
        .catch((e) => {
          console.error("Local storage extract error:", e);
          return {};
        });

      // Save origin localstorage in playwright state format
      pwStorageState.origins = [
        {
          origin: new URL(page.url()).origin,
          localStorage: Object.entries(localStorageData).map(
            ([name, value]) => ({ name, value }),
          ) as any,
        },
      ] as any;

      // Ensure save to Supabase
      const { error: sessionError } = await supabaseServer
        .from("platform_sessions")
        .upsert({
          user_id: userId,
          platform: platform,
          state: pwStorageState,
        });
      if (sessionError) {
        console.error("Supabase save error:", sessionError);
      }

      console.log(`[AuthManager] Session saved successfully for ${platform}.`);
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});

      console.log(`[AuthManager] Session ${sessionId} closed.`);

      return { success: true };
    } catch (error: any) {
      await browser.close().catch(() => {});
      console.error(`[AuthManager] Failed to login:`, error.message);
      throw error;
    }
  }
}
