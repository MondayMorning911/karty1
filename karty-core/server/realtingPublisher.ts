import { chromium } from 'playwright-core';
import type { Page, BrowserContext } from 'playwright-core';
import { supabaseServer } from './supabase.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function publishRealtingAsync(userId: string, objectId: string, text: string, photos?: string[]) {
  try {
    console.log(`[RealtingPublisher] Parsing data for ${objectId} ...`);
    
    // update status
    await supabaseServer.from('listings').update({ status: 'publishing' }).eq('id', objectId);

    const prompt = `
Вам предоставлен текст объявления: "${text}".
Для публикации на сайте realting.com нужно определить параметры. Извлеките их в формате JSON.
Если из текста непонятно, верните null для этого поля. НЕ ВЫДУМЫВАЙТЕ ДАННЫЕ.

Поля для JSON:
- dealType: "Продажа недвижимости" | "Краткосрочная аренда" | "Долгосрочная аренда" (если не понятно, null)
- mainType: "Квартира" | "Дом" | "Коммерческое помещение" | "Земельные участки" (если не понятно, null)
- subType: "Квартира" | "Студия" | "Многоуровневые квартиры" | "Кондо" | "Пентхаус" | "Дом" | "Замок" | "Бунгало" | "Шале" | "Особняк" | "Коттедж" | "Вилла" | "Таунхаус" | "Дуплекс" | "Комната" | "Ресторан, кафе" | "Отель" | "Офис" | "Производство" | "Доходный дом" | "Инвестиционная" | "Склад" | "Магазин" | "Готовый бизнес" | "Конференц-зал" (если не понятно, укажите наиболее подходящее из списка, или null)
- country: "Грузия" (или другая из текста, если нет - "Грузия")
- address: Полный адрес или город с улицей
- floor: Этаж (число, если нет, null)
- floorCount: Этажность дома (число, если нет, null)
- area: Общая площадь (число, если нет, null)
- price: Цена (число, если нет, null)
- description: Полное описание для публикации. Можно использовать исходный текст, приведя его в красивый вид.

Верните ТОЛЬКО JSON с этими ключами, без markdown-разметки.
`;

    const aiRes = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const rawResult = aiRes.choices[0].message.content || '{}';
    const parsed = JSON.parse(rawResult);
    console.log(`[RealtingPublisher] Parsed:`, parsed);

    // 2. Получаем сессию
    const { data: sessionData, error: sessionError } = await supabaseServer
      .from('platform_sessions')
      .select('state')
      .eq('user_id', userId)
      .eq('platform', 'realting')
      .single();

    if (sessionError || !sessionData) {
      throw new Error('Нет активной сессии Realting');
    }
    const state = sessionData.state;
    
    // 3. Запускаем свой Browserless браузер
    const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'karty-secret-token';
    const wsUrl = `ws://72.56.1.59:3010?token=${BROWSERLESS_TOKEN}&stealth=true&headless=false&timeout=600000&--disable-blink-features=AutomationControlled`;
    
    console.log('🚀 Подключаемся к self-hosted Browserless (CDP) для Realting...');
    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 0 });
    
    try {
      console.log(`[RealtingPublisher] Opened browser, applying state...`);
      const context = await browser.newContext({ 
        storageState: state, 
        locale: 'ru-RU',
        permissions: ['geolocation'],
        geolocation: { latitude: 41.6410, longitude: 41.6310 },
        timezoneId: 'Asia/Tbilisi',
        viewport: { width: 1280, height: 1024 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);
      
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      console.log(`[RealtingPublisher] Navigating to creation page...`);
      try {
          await page.goto('https://realting.com/ru/account/objects/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e: any) {
          if (e.message && e.message.includes('ERR_ABORTED')) {
              await delay(600);
              await page.goto('https://realting.com/ru/account/objects/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else {
              throw e;
          }
      }
      console.log(`[RealtingPublisher] Finished navigating.`);
      await delay(600);

      const currentUrl = await page.url();
      if (currentUrl.includes('login')) {
          throw new Error('Сессия недействительна. Требуется повторная авторизация (перенаправлено на логин)');
      }

      // 4. Заполняем форму

      // Тип сделки
      if (parsed.dealType) {
        let dealText = parsed.dealType;
        const dealBtn = page.locator('span', { hasText: new RegExp(`^\${dealText}\$`, 'i') }).first();
        if (await dealBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
            await dealBtn.click({ force: true }).catch(() => {});
            await delay(300);
        }
      }

      // Main type
      if (parsed.mainType) {
          const mainTypeSelect = page.locator('select.maintypeInput.form-control').first();
          if (await mainTypeSelect.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              // we can select by label
              await mainTypeSelect.selectOption({ label: parsed.mainType }).catch(() => {});
              await delay(300);
          }
      }

      // Sub type
      if (parsed.subType) {
          const typeSelect = page.locator('#estate-type_id').first();
          if (await typeSelect.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await typeSelect.selectOption({ label: parsed.subType }).catch(() => {});
              await delay(300);
          }
      }

      // Country and Address (Select2)
      if (parsed.country) {
          const countryContainer = page.locator('#select2-estate-country_code-container').first();
          if (await countryContainer.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await countryContainer.click({ force: true }).catch(()=>{});
              await delay(300);
              const searchInput = page.locator('input.select2-search__field').first();
              if (await searchInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                  await searchInput.fill('');
                  await searchInput.type(parsed.country, { delay: 100 });
                  await delay(600); // wait for suggestion
                  
                  // Try to click the suggestion
                  const option = page.locator('li.select2-results__option', { hasText: parsed.country }).first();
                  if (await option.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                      await option.click({ force: true, timeout: 5000 }).catch(()=>{});
                  } else {
                      await page.keyboard.press('Enter');
                  }
                  await delay(300);
              }
          }
      }

      if (parsed.address) {
          // there could be multiple search fields, but usually the active one appears
          // we can click region or city if there are standard dropdowns
          const regionPlaceholder = page.locator('span.select2-selection__placeholder', { hasText: 'Начните вводить адрес' }).first();
          if (await regionPlaceholder.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await regionPlaceholder.click({ force: true }).catch(()=>{});
              await delay(300);
              const searchInputs = page.locator('input.select2-search__field');
              // use the visible one
              for (let i = 0; i < await searchInputs.count(); i++) {
                 if (await searchInputs.nth(i).isVisible()) {
                     await searchInputs.nth(i).fill('');
                     await searchInputs.nth(i).type(parsed.address, { delay: 100 });
                     await delay(1000); // wait for suggestions
                     const option = page.locator('li.select2-results__option').first();
                     if (await option.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                         await option.click({ force: true, timeout: 5000 }).catch(()=>{});
                     } else {
                         await page.keyboard.press('Enter');
                     }
                     await delay(300);
                     break;
                 }
              }
          }
      }

      // Price
      if (parsed.price) {
          const priceInput = page.locator('#estate-price').first();
          if (await priceInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await priceInput.fill('');
              await priceInput.type(String(parsed.price), { delay: 100 });
              await delay(500);
          }
      }

      // Floor & Floor Count
      if (parsed.floor) {
          const floor = page.locator('#estate-floor_num').first();
          if (await floor.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await floor.fill(String(parsed.floor));
          }
      }
      if (parsed.floorCount) {
          const floorCnt = page.locator('#estate-floors_cnt').first();
          if (await floorCnt.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await floorCnt.fill(String(parsed.floorCount));
          }
      }

      // Area
      if (parsed.area) {
          const areaInput = page.locator('#estate-area-display').first();
          if (await areaInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await areaInput.fill('');
              await areaInput.type(String(parsed.area), { delay: 100 });
          }
      }

      // Description
      if (parsed.description) {
          const descInput = page.locator('textarea[name="Estate[description_ru]"], textarea[name="Estate[description]"], textarea.form-control').last();
          if (await descInput.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await descInput.fill('');
              await descInput.type(parsed.description, { delay: 20 });
          }
      }

      // Upload photos
      if (photos && photos.length > 0) {
          try {
              console.log(`[RealtingPublisher] Uploading ${photos.length} photos...`);
              const fileBuffers = photos.map((dataUrl: string, idx: number) => {
                  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
                  if (!match) return null;
                  const mimeType = match[1];
                  let ext = mimeType.split('/')[1] || 'jpg';
                  if (ext === 'jpeg') ext = 'jpg';
                  return {
                      name: `photo_\${idx}.\${ext}`,
                      mimeType,
                      buffer: Buffer.from(match[2], 'base64')
                  };
              }).filter(Boolean);
              
              if (fileBuffers.length > 0) {
                  const fileInput = page.locator('input[type="file"]').first();
                  if (await fileInput.count() > 0) {
                      await fileInput.setInputFiles(fileBuffers as any);
                      // wait for uploads to process
                      await delay(2000);
                  } else {
                      console.warn("[RealtingPublisher] Could not find file input for photos");
                  }
              }
          } catch (e: any) {
              console.error("[RealtingPublisher] Photo upload error:", e.message);
          }
      }

      console.log(`[RealtingPublisher] Filled form fields & photos, attempting publish...`);
      
      // Клик сохранить/опубликовать
      const saveBtns = [
          page.locator('button', { hasText: 'Сохранить' }).last(),
          page.locator('button', { hasText: 'Опубликовать' }).last(),
          page.locator('input[type="submit"]').last()
      ];
      for (const btn of saveBtns) {
          if (await btn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await btn.click({ force: true }).catch(()=>{});
              await delay(600);
              break;
          }
      }

      // Ждем перехода
      await page.waitForNavigation({ timeout: 15000 }).catch(()=>{});
      
      // Let's assume it succeeded if no major errors
      let hasError = false;
      const errorMsg = page.locator('.has-error .help-block').first();
      if (await errorMsg.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
         hasError = true;
         const text = await errorMsg.innerText();
         throw new Error('Ошибка заполнения: ' + text);
      }

      console.log(`[RealtingPublisher] Finished successfully!`);

      await supabaseServer.from('listings').update({ 
        status: 'published'
      }).eq('id', objectId);

      await browser.close().catch(()=>{});
      
      console.log(`[RealtingPublisher] Browserless session closed.`);

    } catch (e: any) {
      console.error(`[RealtingPublisher] Error:`, e);
      try { await browser.close(); } catch(err){}
      await supabaseServer.from('listings').update({ 
        status: 'error',
        error_details: e.message || 'Unknown Error'
      }).eq('id', objectId);
    }

  } catch (err: any) {
    console.error(`[RealtingPublisher] Critical Error:`, err);
    await supabaseServer.from('listings').update({ 
      status: 'error',
      error_details: err.message || 'Unknown Error'
    }).eq('id', objectId);
  }
}
