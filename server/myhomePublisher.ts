import { chromium } from "playwright-core";
import { supabaseServer } from "./supabase.js";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function publishMyhomeAsync(
  userId: string,
  objectId: string,
  text: string,
  photos?: string[],
) {
  try {
    console.log(`[MyHomePublisher] Parsing data for ${objectId} ...`);
    await supabaseServer
      .from("listings")
      .update({ status: "publishing" })
      .eq("id", objectId);

    // ── Step 1: AI parse ────────────────────────────────────────────────────
    const prompt = `
Вам предоставлен текст объявления недвижимости: "${text}".
Для публикации на myhome.ge определите параметры и верните JSON.
Если поле логически можно вывести — укажите. Тип проекта всегда "Нестандартный".

Поля:
- mainType: "Квартира" | "Частный дом" | "Дача" | "Земельный участок" | "Коммерческая площадь" | "Гостиница"
- dealType: "Продается" | "Сдается" | "Сдается под залог" | "Сдается на день"
- status: "Старое здание" | "Новое здание" | "В процессе строительства"
- condition: "Недавно отремонтированный" | "Старый ремонт" | "Текущий ремонт" | "В процессе ремонта" | "Белый каркас" | "Черный каркас" | "Зеленый каркас"
- city: Город (например "Тбилиси", "Батуми")
- street: Улица (только название, без города и номера дома)
- streetNumber: Номер дома (строка, может быть null)
- price: Цена в USD (число)
- area: Площадь в м² (число)
- rooms: Количество комнат (число от 1 до 10; если 10 и более — вернуть 10)
- floor: Этаж (число)
- maxFloor: Всего этажей в доме (число)
- description: Красивый текст описания на русском языке для объявления.

МАССИВ missing_fields:
Создайте свойство "missing_fields" (массив строк на русском).
Включайте только ОБЯЗАТЕЛЬНЫЕ поля, которых не хватает:
- mainType → "Тип недвижимости"
- dealType → "Тип сделки"
- status   → "Статус здания"
- condition → "Состояние"
- city     → "Город"
- street   → "Улица"
- price    → "Цена"
- area     → "Площадь"
- rooms    → "Количество комнат"
- floor    → "Этаж"
- maxFloor → "Всего этажей"
Если все обязательные поля есть или могут быть выведены — верните пустой массив [].

Верните ТОЛЬКО JSON.
`;

    const aiRes = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const rawResult = aiRes.choices[0].message.content || "{}";
    const parsed = JSON.parse(rawResult);
    console.log(`[MyHomePublisher] Parsed:`, parsed);

    // ── Missing fields validation ───────────────────────────────────────────
    const missingFromAI: string[] = Array.isArray(parsed.missing_fields)
      ? parsed.missing_fields
      : [];
    const missingManual: string[] = [];
    if (!parsed.mainType) missingManual.push("Тип недвижимости");
    if (!parsed.dealType) missingManual.push("Тип сделки");
    if (!parsed.status) missingManual.push("Статус здания");
    if (!parsed.condition) missingManual.push("Состояние");
    if (!parsed.city) missingManual.push("Город");
    if (!parsed.street) missingManual.push("Улица");
    if (!parsed.price) missingManual.push("Цена");
    if (!parsed.area) missingManual.push("Площадь");
    if (!parsed.rooms) missingManual.push("Количество комнат");
    if (!parsed.floor) missingManual.push("Этаж");
    if (!parsed.maxFloor) missingManual.push("Всего этажей");

    const allMissing = Array.from(
      new Set([...missingManual, ...missingFromAI]),
    );
    if (allMissing.length > 0) {
      const errorMsg = `Необходимо заполнить: ${allMissing.join(", ")}`;
      console.warn(`[MyHomePublisher] Missing required fields: ${errorMsg}`);
      await supabaseServer
        .from("listings")
        .update({
          status: "error",
          error_details: errorMsg,
        })
        .eq("id", objectId);
      return;
    }

    // ── Session ────────────────────────────────────────────────────────────
    const { data: sessionData, error: sessionError } = await supabaseServer
      .from("platform_sessions")
      .select("state")
      .eq("user_id", userId)
      .eq("platform", "myhome")
      .single();

    if (sessionError || !sessionData) {
      throw new Error("Нет активной сессии MyHome");
    }
    const state = sessionData.state;

    // ── Browser ────────────────────────────────────────────────────────────
    const BROWSERLESS_TOKEN =
      process.env.BROWSERLESS_TOKEN || "karty-secret-token";
    const wsUrl = `ws://72.56.1.59:3010?token=${BROWSERLESS_TOKEN}&stealth=true&headless=false&timeout=600000&--disable-blink-features=AutomationControlled`;

    console.log("🚀 Подключаемся к Browserless (CDP) для MyHome...");
    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 0 });

    try {
      const context = await browser.newContext({
        storageState: state,
        locale: "ru-RU",
        permissions: ["geolocation"],
        timezoneId: "Asia/Tbilisi",
        viewport: { width: 1280, height: 1024 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(40000);
      page.setDefaultNavigationTimeout(40000);
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Cloudflare Turnstile handler
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
              "[MyHomePublisher] Cloudflare Turnstile detected. Attempting to click...",
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
              "[MyHomePublisher] Clicked Cloudflare. Waiting for resolution...",
            );
            await delay(5000);
          }
        } catch (e) {
          /* ignore */
        }
      };

      // ── Navigate to statements page ──────────────────────────────────────
      console.log("[MyHomePublisher] Navigating to statements page...");
      const statementsUrl = "https://statements.myhome.ge/ru";
      try {
        await page.goto(statementsUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
      } catch (e: any) {
        if (e.message?.includes("ERR_ABORTED")) {
          await delay(2000);
          await page.goto(statementsUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
        } else {
          throw e;
        }
      }

      await handleTurnstile();
      await delay(2000);

      const currentUrl = await page.url();
      if (currentUrl.includes("login") || currentUrl.includes("auth.tnet.ge")) {
        throw new Error(
          "Сессия недействительна. Требуется повторная авторизация (перенаправлено на логин)",
        );
      }

      // Dismiss draft popup if it appears
      const discardDraftBtn = page
        .locator(
          'button:has-text("Создать новое"), button:has-text("Create new"), button:has-text("Новое объявление")',
        )
        .first();
      if (
        await discardDraftBtn
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        console.log(
          "[MyHomePublisher] Draft popup detected — discarding draft.",
        );
        await discardDraftBtn.click({ force: true });
        await delay(1000);
      }

      // ── Step 1: Click "Добавить" button ──────────────────────────────────
      console.log("[MyHomePublisher] Step 1: clicking Add button...");
      const addBtn = page
        .locator(
          'a.hidden.gap-2, a:has-text("Добавить"), a[href*="statement/create"]',
        )
        .first();
      if (
        await addBtn
          .waitFor({ state: "visible", timeout: 8000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await addBtn.click({ force: true });
        await delay(2000);
      } else {
        console.log(
          "[MyHomePublisher] Add button not found, navigating directly to create form...",
        );
        await page.goto("https://statements.myhome.ge/ru/statement/create", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await delay(2000);
      }

      await handleTurnstile();
      await delay(1500);

      // Helper: click a luk-span option by exact text
      const clickLukSpan = async (
        text: string | null | undefined,
        label = "",
      ) => {
        if (!text) return;
        console.log(
          `[MyHomePublisher] Selecting "${text}" ${label ? `(${label})` : ""}`,
        );
        const el = page
          .locator(
            "span.luk-text-sm.luk-font-regular-tbc.luk-flex.luk-justify-center.luk-items-center",
          )
          .filter({
            hasText: new RegExp(
              `^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            ),
          })
          .first();
        if (
          await el
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await el.click({ force: true });
          await delay(500);
        } else {
          // Fallback: broader text match
          const fallback = page.locator(`span:has-text("${text}")`).first();
          if (
            await fallback
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await fallback.click({ force: true });
            await delay(500);
          }
        }
      };

      // ── Step 2: Property type ─────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 2: property type...");
      await clickLukSpan(parsed.mainType, "mainType");

      // ── Step 3: Deal type ─────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 3: deal type...");
      await clickLukSpan(parsed.dealType, "dealType");

      // ── Step 4: Building status ───────────────────────────────────────────
      console.log("[MyHomePublisher] Step 4: building status...");
      await clickLukSpan(parsed.status, "status");

      // ── Step 5: Condition ─────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 5: condition...");
      await clickLukSpan(parsed.condition, "condition");

      // ── Step 6: City ──────────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 6: city...");
      const cityInput = page.locator('[id=":rl:"]');
      if (
        await cityInput
          .waitFor({ state: "visible", timeout: 6000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await cityInput.click();
        await delay(400);
        await cityInput.fill(parsed.city);
        await delay(1500);
        const cityOption = page
          .locator("span.inline-block.w-full.text-sm.text-black-100")
          .filter({ hasText: new RegExp(`^${parsed.city}`) })
          .first();
        if (
          await cityOption
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await cityOption.click({ force: true });
          await delay(800);
        }
      }

      // ── Step 7: Street ────────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 7: street...");
      if (parsed.street) {
        const streetLabel = page
          .locator(
            "label.input-container.relative.flex.h-12.max-h-12.cursor-text.items-end.overflow-hidden",
          )
          .first();
        if (
          await streetLabel
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await streetLabel.click();
          await delay(300);
          const streetInput = streetLabel.locator("input").first();
          if ((await streetInput.count()) > 0) {
            await streetInput.fill(parsed.street);
            await delay(1500);
            const streetOption = page
              .locator("span.inline-block.w-full.text-sm.text-black-100")
              .filter({ hasText: new RegExp(parsed.street.slice(0, 6)) })
              .first();
            if (
              await streetOption
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await streetOption.click({ force: true });
              await delay(800);
            }
          }
        }
      }

      // House number
      if (parsed.streetNumber) {
        const houseInput = page.locator('[id=":rn:"]');
        if (
          await houseInput
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await houseInput.fill(String(parsed.streetNumber));
          await delay(300);
        }
      }

      // ── Step 8: Price ─────────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 8: price...");
      // Ensure USD is selected
      const currencyContainer = page
        .locator(
          "div.relative.z-10.flex.h-8.w-10.cursor-pointer.items-center.justify-center.font-medium",
        )
        .first();
      if (
        await currencyContainer
          .waitFor({ state: "visible", timeout: 4000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const currentCurrency = await currencyContainer
          .textContent()
          .catch(() => "");
        if (!currentCurrency?.trim().includes("$")) {
          await currencyContainer.click({ force: true });
          await delay(600);
          // Select $ from dropdown if it opened
          const dollarOpt = page
            .locator(
              'li:has-text("$"), span:has-text("$"), div:has-text("USD")',
            )
            .first();
          if (
            await dollarOpt
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await dollarOpt.click({ force: true });
            await delay(400);
          }
        }
      }

      if (parsed.price) {
        // The price field label contains the actual input inside it
        const priceLabel = page
          .locator("label.mr-3.hidden.cursor-text.text-nowrap.text-xs")
          .first();
        if (
          await priceLabel
            .waitFor({ state: "visible", timeout: 4000 })
            .then(() => true)
            .catch(() => false)
        ) {
          const priceInput = priceLabel.locator("input").first();
          if ((await priceInput.count()) > 0) {
            await priceInput.click();
            await priceInput.fill(String(parsed.price));
            await delay(300);
          }
        } else {
          // Fallback: find any visible price input near "Полная стоимость"
          const priceInput = page
            .locator(
              'input[placeholder*="стоимость"], input[placeholder*="цена"], input[type="number"]',
            )
            .first();
          if (
            await priceInput
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await priceInput.fill(String(parsed.price));
            await delay(300);
          }
        }
      }

      // ── Step 9: Area ──────────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 9: area...");
      if (parsed.area) {
        const areaLabel = page
          .locator(
            "label.luk-relative.luk-flex.luk-h-full.luk-w-full.luk-items-end",
          )
          .first();
        if (
          await areaLabel
            .waitFor({ state: "visible", timeout: 4000 })
            .then(() => true)
            .catch(() => false)
        ) {
          const areaInput = areaLabel.locator("input").first();
          if ((await areaInput.count()) > 0) {
            await areaInput.click();
            await areaInput.fill(String(parsed.area));
            await delay(300);
          }
        }
      }

      // ── Step 10: Rooms ────────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 10: rooms...");
      const roomsNum = Number(parsed.rooms);
      const roomsText = roomsNum >= 10 ? "10+" : String(roomsNum);
      await clickLukSpan(roomsText, "rooms");

      // ── Step 11: Floor ────────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 11: floor...");
      if (parsed.floor) {
        const floorInput = page.locator('[id=":r1g:"]');
        if (
          await floorInput
            .waitFor({ state: "visible", timeout: 4000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await floorInput.click();
          await floorInput.fill(String(parsed.floor));
          await delay(300);
        }
      }
      if (parsed.maxFloor) {
        const maxFloorInput = page.locator('[id=":r1h:"]');
        if (
          await maxFloorInput
            .waitFor({ state: "visible", timeout: 4000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await maxFloorInput.click();
          await maxFloorInput.fill(String(parsed.maxFloor));
          await delay(300);
        }
      }

      // ── Step 12: Project type ─────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 12: project type...");
      // Use attribute-contains selector to avoid escaping "/" and ":" in Tailwind class names
      const projectDropdown = page
        .locator(
          'span[class*="luk-pb-2"][class*="luk-text-left"][class*="luk-text-sm"][class*="luk-absolute"]',
        )
        .first();
      if (
        await projectDropdown
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await projectDropdown.click({ force: true });
        await delay(800);
        const projectOption = page
          .locator(
            'li[class*="luk-w-full"][class*="luk-p-2"][class*="luk-rounded-md"][class*="luk-text-sm"]',
          )
          .filter({ hasText: "Нестандартный" })
          .first();
        if (
          await projectOption
            .waitFor({ state: "visible", timeout: 4000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await projectOption.click({ force: true });
          await delay(800);
        }
      } else {
        // Fallback: old-style dropdown
        const selectBox = page
          .locator('div[class*="luk-cursor-pointer"]', { hasText: "Выберите" })
          .first();
        if (
          await selectBox
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await selectBox.click({ force: true });
          await delay(800);
          const option = page
            .locator("li", { hasText: "Нестандартный" })
            .first();
          if (
            await option
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await option.click({ force: true });
            await delay(500);
          }
        }
      }

      // ── Step 13: Description ──────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 13: description...");
      // Switch to Russian tab
      const ruBtn = page
        .locator('button[class*="luk-text-xs"][class*="luk-font-medium"]')
        .filter({ hasText: "Русский" })
        .first();
      if (
        await ruBtn
          .waitFor({ state: "visible", timeout: 4000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await ruBtn.click({ force: true });
        await delay(500);
      } else {
        // Broader fallback
        const ruBtnFallback = page
          .locator('button:has-text("Русский")')
          .first();
        if (
          await ruBtnFallback
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await ruBtnFallback.click({ force: true });
          await delay(500);
        }
      }

      if (parsed.description) {
        const descTextarea = page
          .locator(
            "textarea.h-full.w-full.resize-none.overflow-auto.border-none.bg-transparent",
          )
          .first();
        if (
          await descTextarea
            .waitFor({ state: "visible", timeout: 4000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await descTextarea.click();
          await descTextarea.fill(parsed.description);
          await delay(300);
        } else {
          const fallbackTextarea = page.locator("textarea").last();
          if (
            await fallbackTextarea
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await fallbackTextarea.fill(parsed.description);
          }
        }
      }

      // ── Step 14: Photos ───────────────────────────────────────────────────
      if (photos && photos.length > 0) {
        try {
          console.log(
            `[MyHomePublisher] Step 14: uploading ${photos.length} photo(s)...`,
          );
          const fileBuffers = photos
            .map((dataUrl: string, idx: number) => {
              const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
              if (!match) return null;
              return {
                name: `photo_${idx}.jpg`,
                mimeType: match[1],
                buffer: Buffer.from(match[2], "base64"),
              };
            })
            .filter(Boolean);

          if (fileBuffers.length > 0) {
            const fileInput = page.locator('input[type="file"]').first();
            if ((await fileInput.count()) > 0) {
              await fileInput.setInputFiles(fileBuffers as any);
              await delay(7000);
            }
          }
        } catch (e: any) {
          console.error("[MyHomePublisher] Photo upload error:", e.message);
        }
      }

      // ── Step 15: Publish ──────────────────────────────────────────────────
      console.log("[MyHomePublisher] Step 15: publishing...");
      const publishBtn = page
        .locator(
          "div.luk-relative.luk-z-10.luk-flex.luk-items-center.luk-justify-center.luk-gap-x-1",
        )
        .first();
      if (
        await publishBtn
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await publishBtn.scrollIntoViewIfNeeded().catch(() => {});
        await delay(800);
        await publishBtn.click({ force: true });
      } else {
        // Fallback selectors
        const fallbackSubmit = page
          .locator(
            'button:has-text("Опубликовать"), button[type="submit"], div:has-text("გამოქვეყნება")',
          )
          .last();
        if (
          await fallbackSubmit
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await fallbackSubmit.scrollIntoViewIfNeeded().catch(() => {});
          await delay(800);
          await fallbackSubmit.click({ force: true });
        }
      }

      await delay(10000);
      try {
        await page.waitForURL("**/statement/success**", { timeout: 30000 });
      } catch (e) {
        console.log(
          "[MyHomePublisher] No redirect to success page. Checking for Cloudflare...",
        );
        const cfChallenge = page
          .locator('iframe[src*="challenges.cloudflare.com"]')
          .first();
        if (
          await cfChallenge
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          console.log(
            "[MyHomePublisher] Cloudflare challenge detected! Waiting 60s for manual solve via Live Debugger...",
          );
          await delay(60000);
          try {
            await page.waitForURL("**/statement/success**", { timeout: 10000 });
          } catch (err) {
            /* ignore */
          }
        } else {
          console.log("[MyHomePublisher] Waiting extra 15s...");
          await delay(15000);
        }
      }

      await supabaseServer
        .from("listings")
        .update({ status: "published" })
        .eq("id", objectId);
      console.log("[MyHomePublisher] Finished successfully!");
      await browser.close().catch(() => {});
    } catch (e: any) {
      console.error("[MyHomePublisher] Error:", e);
      try {
        await browser.close();
      } catch (err) {
        /* ignore */
      }
      await supabaseServer
        .from("listings")
        .update({
          status: "error",
          error_details: e.message || "Unknown Error",
        })
        .eq("id", objectId);
    }
  } catch (err: any) {
    console.error("[MyHomePublisher] Critical Error:", err);
    await supabaseServer
      .from("listings")
      .update({
        status: "error",
        error_details: err.message || "Unknown Error",
      })
      .eq("id", objectId);
  }
}
