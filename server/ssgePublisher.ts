import { chromium } from 'playwright-core';
import { supabaseServer } from './supabase.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function publishSsgeAsync(userId: string, objectId: string, text: string, photos?: string[]) {
  try {
    console.log(`[SSgePublisher] Parsing data for ${objectId} ...`);
    
    // update status
    await supabaseServer.from('listings').update({ status: 'publishing' }).eq('id', objectId);

    const prompt = `
Вам предоставлен текст объявления: "${text}".
Для публикации на сайте ss.ge нужно определить параметры. Извлеките их в формате JSON.
Если из текста непонятно, верните null для этого поля. НЕ ВЫДУМЫВАЙТЕ ДАННЫЕ.

Поля для JSON:
- dealType: "Купить" (если продается) или "Снять" (если сдается) (строка или null)
- mainType: "Квартира" | "Дом" | "Загородный дом" | "Участок" | "Коммерческая недвижимость" | "Гостиница" (выберите одно, если не понятно - null)
- city: Город, например "Батуми" или "Тбилиси" (если не понятно, null)
- houseNumber: Номер дома (если есть, строка или null)
- rooms: Количество комнат (1, 2, 3, 4, 5, если больше 5 то 5) (число или null)
- bedrooms: Количество спален (1, 2, 3, 4, 5) (число или null)
- totalArea: Общая площадь (число, если нет, null)
- floor: Этаж (число, если нет, null)
- floors: Этажность дома (число, если нет, null)
- status: "Новостроика" | "Старая постройка" | "В стадии строительства" (если не понятно, null)
- description: Полное описание для публикации. Можно использовать исходный текст, приведя его в красивый вид. (строка или null)
- price: Цена (число, если нет, null)

Верните ТОЛЬКО JSON с этими ключами, без markdown-разметки.
`;

    const aiRes = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const rawResult = aiRes.choices[0].message.content || '{}';
    const parsed = JSON.parse(rawResult);
    console.log(`[SSgePublisher] Parsed:`, parsed);

    // 2. Получаем сессию
    const { data: sessionData, error: sessionError } = await supabaseServer
      .from('platform_sessions')
      .select('state')
      .eq('user_id', userId)
      .eq('platform', 'ssge')
      .single();

    if (sessionError || !sessionData) {
      throw new Error('Нет активной сессии SS.ge');
    }
    const state = sessionData.state;
    
    // 3. Запускаем браузер
    const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'karty-secret-token';
    const wsUrl = `ws://72.56.1.59:3010?token=${BROWSERLESS_TOKEN}&stealth=true&headless=false&timeout=600000&--disable-blink-features=AutomationControlled`;
    
    console.log('🚀 Подключаемся к self-hosted Browserless (CDP) для SS.ge...');
    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 0 });
    
    try {
      console.log(`[SSgePublisher] Opened browser, applying state...`);
      const context = await browser.newContext({ 
        storageState: state, 
        locale: 'ru-RU',
        permissions: ['geolocation'],
        timezoneId: 'Asia/Tbilisi',
        viewport: { width: 1280, height: 1024 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      page.setDefaultTimeout(40000);
      page.setDefaultNavigationTimeout(40000);
      
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      console.log(`[SSgePublisher] Navigating to creation page...`);
      // SS.ge creation URL: 
      const url = encodeURI('https://home.ss.ge/ru/недвижимость/create');
      try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e: any) {
          if (e.message && e.message.includes('ERR_ABORTED')) {
              await delay(600);
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else {
              throw e;
          }
      }
      console.log(`[SSgePublisher] Finished navigating.`);
      await delay(1000);

      const currentUrl = await page.url();
      if (currentUrl.includes('login') || currentUrl.includes('account.ss.ge')) {
          throw new Error('Сессия недействительна. Требуется повторная авторизация (перенаправлено на логин)');
      }

      // Check for auth button to confirm if cookies failed
      const authBtn = page.locator('a[href*="login"], a:has-text("Войти"), a:has-text("ავტორიზაცია"), a:has-text("Авторизация"), button:has-text("Войти"), button:has-text("Авторизация")').first();
      if (await authBtn.isVisible().catch(()=>false)) {
          console.log(`[SSgePublisher] Auth button found. Attempting to click it...`);
          await authBtn.click({ force: true }).catch(()=>{});
          await delay(5000);

          const afterClickUrl = await page.url();
          if (afterClickUrl.includes('account.ss.ge/ka/account/login') || afterClickUrl.includes('login') || afterClickUrl.includes('account.ss.ge')) {
              throw new Error('Сессия недействительна. Требуется повторная авторизация (перенаправлено на логин).');
          }

          if (await authBtn.isVisible().catch(()=>false)) {
              throw new Error('Сессия недействительна. Кнопка авторизации все еще видна (куки не сработали).');
          }

          console.log(`[SSgePublisher] Seems auto-logged in! Trying to navigate to create page from UI...`);
          const createNavBtn = page.locator('a[href*="create"], button:has-text("Разместить объявление")').first();
          if (await createNavBtn.isVisible().catch(()=>false)) {
              await createNavBtn.click({ force: true }).catch(()=>{});
              await delay(2000);
          } else {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
              await delay(2000);
          }
      }

      console.log(`[SSgePublisher] Checking for draft popup...`);
      const draftPopupBtn = page.locator('button:has-text("Добавить новое заявление"), button:has-text("ახალი განცხადების დამატება")').first();
      if (await draftPopupBtn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => false)) {
          console.log(`[SSgePublisher] Found draft popup. Clicking "Добавить новое заявление"...`);
          await draftPopupBtn.click({ force: true }).catch(() => {});
          await delay(1000);
      }

      // 4. Заполняем форму
      
      const fillWithRetry = async (label: string, action: () => Promise<boolean>) => {
          for (let i = 0; i < 3; i++) {
              if (await action()) return true;
              await delay(300);
          }
          return false;
      };

      // Шаг 1: Тип недвижимости, Тип сделки
      if (parsed.mainType) {
          const typeBtn = page.locator(`div:has-text("${parsed.mainType}")`).last();
          if (await typeBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await typeBtn.click({ force: true }).catch(()=>{});
              await delay(300);
          }
      }

      if (parsed.dealType) {
          const dealBtn = page.locator(`div:has-text("${parsed.dealType}")`).last();
          if (await dealBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await dealBtn.click({ force: true }).catch(()=>{});
              await delay(300);
          }
      }

      // Функция для перехода на следующий шаг
      const clickNext = async () => {
          const nextBtn = page.locator('button.btn-next, button:has-text("Дальше"), button:has-text("Следующий")').last();
          if (await nextBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await nextBtn.click({ force: true });
              await delay(600);
              return true;
          }
          return false;
      };

      await clickNext(); // Переходим к адресу

      // City (trying react-select inputs)
      if (parsed.city) {
          const inputContainer = page.locator('.select__input-container').first();
          if (await inputContainer.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await inputContainer.click();
              await delay(500);
              await page.keyboard.type(parsed.city, { delay: 100 });
              await delay(600); // wait for suggestion
              await page.keyboard.press('Enter');
              await delay(300);
          }
      }

      // House Number
      if (parsed.houseNumber) {
          const houseInput = page.locator('input[name="house-number"]').first();
          if (await houseInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await houseInput.fill(String(parsed.houseNumber));
          }
      }

      await clickNext(); // Переходим к деталям

      // Rooms
      if (parsed.rooms) {
          const roomLabel = page.locator('span', { hasText: 'Комнаты*' }).first();
          if (await roomLabel.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              const roomsContainer = roomLabel.locator('..');
              const roomBtn = roomsContainer.locator('div', { hasText: new RegExp(`^${parsed.rooms}$`) }).first();
              if (await roomBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                  await roomBtn.click({ force: true }).catch(()=>{});
              } else {
                  const roomP = roomsContainer.locator('p', { hasText: new RegExp(`^${parsed.rooms}$`) }).first();
                  if (await roomP.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) await roomP.click({ force: true }).catch(()=>{});
              }
          }
      }

      // Bedrooms
      if (parsed.bedrooms) {
          const bedLabel = page.locator('span', { hasText: 'Спальня*' }).first();
          if (await bedLabel.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              const bedContainer = bedLabel.locator('..');
              const bedBtn = bedContainer.locator('div', { hasText: new RegExp(`^${parsed.bedrooms}$`) }).first();
              if (await bedBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                  await bedBtn.click({ force: true }).catch(()=>{});
              } else {
                  const bedP = bedContainer.locator('p', { hasText: new RegExp(`^${parsed.bedrooms}$`) }).first();
                  if (await bedP.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) await bedP.click({ force: true }).catch(()=>{});
              }
          }
      }

      // Total Area
      if (parsed.totalArea) {
          const areaInput = page.locator('input[name="totalArea"]').first();
          if (await areaInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await areaInput.fill('');
              await areaInput.type(String(parsed.totalArea), { delay: 100 });
          }
      }

      // Floor & Floors
      if (parsed.floor) {
          const floor = page.locator('input[name="floor"]').first();
          if (await floor.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await floor.fill(String(parsed.floor));
          }
      }
      if (parsed.floors) {
          const floors = page.locator('input[name="floors"]').first();
          if (await floors.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await floors.fill(String(parsed.floors));
          }
      }

      // Status
      if (parsed.status) {
          const statusP = page.locator('p', { hasText: parsed.status }).first();
          if (await statusP.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await statusP.click({ force: true }).catch(()=>{});
          }
      }

      await clickNext(); // Переходим к описанию и фото

      // Description
      if (parsed.description) {
          const descInput = page.locator('textarea').last();
          if (await descInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await descInput.fill(parsed.description);
          }
      }

      // Price
      if (parsed.price) {
          const priceInput = page.locator('input[type="number"]').last();
          if (await priceInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await priceInput.fill(String(parsed.price));
          }
      }

      // Photos
      if (photos && photos.length > 0) {
          try {
              console.log(`[SSgePublisher] Uploading ${photos.length} photos...`);
              const fileBuffers = photos.map((dataUrl: string, idx: number) => {
                  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
                  if (!match) return null;
                  const mimeType = match[1];
                  let ext = mimeType.split('/')[1] || 'jpg';
                  if (ext === 'jpeg') ext = 'jpg';
                  return {
                      name: `photo_${idx}.${ext}`,
                      mimeType,
                      buffer: Buffer.from(match[2], 'base64')
                  };
              }).filter(Boolean);
              
              if (fileBuffers.length > 0) {
                  const fileInput = page.locator('input[type="file"]').first();
                  if (await fileInput.count() > 0) {
                      await fileInput.setInputFiles(fileBuffers as any);
                      await delay(8000); // wait for upload
                  }
              }
          } catch (e: any) {
              console.error("[SSgePublisher] Photo upload error:", e.message);
          }
      }

      console.log(`[SSgePublisher] Filled form fields & photos, attempting publish...`);
      
      // Submit / Publish button
      const publishBtns = [
          page.locator('button:has-text("Гамокекнеба"), button:has-text("Опубликовать"), button:has-text("Подтвердить")').last(),
          page.locator('button.btn-next').last()
      ];
      
      for (const btn of publishBtns) {
          if (await btn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await btn.scrollIntoViewIfNeeded().catch(()=>{});
              await delay(300);
              await btn.click({ force: true });
              await delay(1000);
              break;
          }
      }

      await delay(10000); // wait for success page redirect
      console.log(`[SSgePublisher] Finished successfully!`);

      await supabaseServer.from('listings').update({ 
        status: 'published'
      }).eq('id', objectId);

      await browser.close().catch(()=>{});
      
      console.log(`[SSgePublisher] Browserless session closed.`);

    } catch (e: any) {
      console.error(`[SSgePublisher] Error:`, e);
      try { await browser.close(); } catch(err){}
      await supabaseServer.from('listings').update({ 
        status: 'error',
        error_details: e.message || 'Unknown Error'
      }).eq('id', objectId);
    }

  } catch (err: any) {
    console.error(`[SSgePublisher] Critical Error:`, err);
    await supabaseServer.from('listings').update({ 
      status: 'error',
      error_details: err.message || 'Unknown Error'
    }).eq('id', objectId);
  }
}

