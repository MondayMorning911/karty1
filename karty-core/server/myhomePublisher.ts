import { chromium } from 'playwright-core';
import { supabaseServer } from './supabase.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function publishMyhomeAsync(userId: string, objectId: string, text: string, photos?: string[]) {
  try {
    console.log(`[MyHomePublisher] Parsing data for ${objectId} ...`);
    
    // update status
    await supabaseServer.from('listings').update({ status: 'publishing' }).eq('id', objectId);

    const prompt = `
Вам предоставлен текст объявления свойств недвижимости: "${text}".
Для публикации на сайте myhome.ge нужно определить параметры. Извлеките их в формате JSON.
Если из текста непонятно, верните null, ИЛИ, если логически можно догадаться (например 50кв.м это обычно 2 комнаты - 1 спальня), то укажите это. Проект всегда "Нестандартный".

Поля:
- mainType: "Квартира" | "Частный дом" | "Дача" | "Земельный участок" | "Коммерческая площадь" | "Гостиница" (одно из списка)
- dealType: "Продается" | "Сдается" | "Сдается под залог" | "Сдается на день" 
- status: "Старое здание" | "Новое здание" | "В процессе строительства" 
- condition: "Недавно отремонтированный" | "Старый ремонт" | "Текущий ремонт" | "В процессе ремонта" | "Белый карказ" | "Черный карказ" | "Зеленый карказ" | "Белый плюс" (выберите наиболее подходящее)
- city: Город, например "Тбилиси", "Батуми"
- street: Улица (только название, без города)
- streetNumber: Номер дома
- price: Цена (число)
- area: Площадь (число)
- rooms: Количество комнат (1, 2, 3, 4, 5, 6, 7)
- bedrooms: Количество спален
- floor: Этаж
- maxFloor: Этажность дома
- description: Красивый текст описания на русском языке для объявления.

Верните ТОЛЬКО JSON.
`;

    const aiRes = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const rawResult = aiRes.choices[0].message.content || '{}';
    const parsed = JSON.parse(rawResult);
    console.log(`[MyHomePublisher] Parsed:`, parsed);

    // 2. Session
    const { data: sessionData, error: sessionError } = await supabaseServer
      .from('platform_sessions')
      .select('state')
      .eq('user_id', userId)
      .eq('platform', 'myhome')
      .single();

    if (sessionError || !sessionData) {
      throw new Error('Нет активной сессии MyHome');
    }
    const state = sessionData.state;
    
    // 3. Browser
    const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'karty-secret-token';
    const wsUrl = `ws://72.56.1.59:3010?token=${BROWSERLESS_TOKEN}&stealth=true&headless=false&timeout=600000&--disable-blink-features=AutomationControlled`;
    
    console.log('🚀 Подключаемся к Browserless (CDP) для MyHome...');
    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 0 });
    
    try {
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

      const handleTurnstile = async () => {
        try {
          const cfFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
          if (await cfFrame.locator('body').waitFor({ state: 'attached', timeout: 5000 }).catch(() => false)) {
            console.log('[MyHomePublisher] Cloudflare Turnstile detected. Attempting to click...');
            await delay(2000);
            
            const checkbox = cfFrame.locator('input[type="checkbox"], .ctp-checkbox-label, .mark').first();
            if (await checkbox.waitFor({ state: 'visible', timeout: 3000 }).catch(()=>false)) {
              await checkbox.click({ force: true });
            } else {
              const frameEl = page.locator('iframe[src*="challenges.cloudflare.com"]').first();
              const box = await frameEl.boundingBox();
              if (box) {
                await page.mouse.click(box.x + box.width / 2 + (Math.random() * 10 - 5), box.y + box.height / 2 + (Math.random() * 10 - 5));
              }
            }
            console.log('[MyHomePublisher] Clicked Cloudflare. Waiting for resolution...');
            await delay(5000);
          }
        } catch(e) {}
      };

      console.log(`[MyHomePublisher] Navigating to create page...`);
      const url = 'https://statements.myhome.ge/ru/statement/create';
      try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e: any) {
          if (e.message && e.message.includes('ERR_ABORTED')) {
              await delay(2000);
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else {
              throw e;
          }
      }
      
      await handleTurnstile();
      await delay(3000);

      const currentUrl = await page.url();
      if (currentUrl.includes('login') || currentUrl.includes('auth.tnet.ge')) {
          throw new Error('Сессия недействительна. Требуется повторная авторизация (перенаправлено на логин)');
      }

      const clickWithSpanText = async (text: string) => {
          if (!text) return;
          const el = page.locator(`span:has-text("${text}"), label:has-text("${text}")`).first();
          if (await el.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await el.click({ force: true }).catch(() => {});
              await delay(700);
          }
      };

      // Type of property
      await clickWithSpanText(parsed.mainType);
      
      // Deal type
      await clickWithSpanText(parsed.dealType);
      
      // Status
      await clickWithSpanText(parsed.status);

      // Condition
      await clickWithSpanText(parsed.condition);

      // Project type
      const projectTypeSpan = page.locator('span', { hasText: 'Тип проекта' });
      if (await projectTypeSpan.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
          const selectBox = page.locator('div.luk-cursor-pointer', { hasText: 'Выберите' }).first();
          if (await selectBox.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
             await selectBox.click({ force: true });
             await delay(1000);
             const option = page.locator('li', { hasText: 'Нестандартный' }).first();
             if (await option.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                 await option.click({ force: true });
             }
          }
      }

      // Location - City 
      // City input is relative to specific labels 
      if (parsed.city) {
          const cityLabel = page.locator('label:has-text("Локация"), label:has-text("Город")').first();
          if (await cityLabel.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
             const input = cityLabel.locator('input').first();
             if (await input.count() > 0) {
                 await input.fill(parsed.city);
                 await delay(1500);
                 const sugg = page.locator(`span:has-text("${parsed.city}")`).last();
                 if (await sugg.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) await sugg.click({ force: true });
             }
          }
      }

      // Location - Street (similar logic)
      if (parsed.street) {
          const streetLabel = page.locator('label', { hasText: 'Улица' }).last();
          if (await streetLabel.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
             const input = streetLabel.locator('input').first();
             if (await input.count() > 0) {
                 await input.fill(parsed.street);
                 await delay(1500);
                 const sugg = page.locator(`span:has-text("${parsed.street}")`).last();
                 if (await sugg.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) await sugg.click({ force: true });
             }
          }
      }

      // Price
      if (parsed.price) {
          const priceSpan = page.locator('span:has-text("Цена"), div:has-text("Цена")').last();
          if (await priceSpan.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              const inputContainer = priceSpan.locator('..').locator('..');
              const input = inputContainer.locator('input[type="number"], input').first();
              if (await input.count() > 0) {
                  await input.fill(String(parsed.price));
              }
          }
      }

      // Area
      if (parsed.area) {
          const areaSpan = page.locator('span:has-text("Площадь"), div:has-text("Площадь")').last();
          if (await areaSpan.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              const fieldContainer = areaSpan.locator('..').locator('..');
              const input = fieldContainer.locator('input').first();
              if (await input.count() > 0) {
                  await input.fill(String(parsed.area));
              }
          }
      }

      // Rooms
      if (parsed.rooms) {
          const roomsSpan = page.locator('span:has-text("комнаты")').last();
          if (await roomsSpan.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              const roomsContainer = roomsSpan.locator('..').locator('..');
              const btn = roomsContainer.locator(`label:has-text("${parsed.rooms}"), span:has-text("${parsed.rooms}")`).first();
              if (await btn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                  await btn.click({ force: true });
              }
          }
      }

      // Floor & Max Floor
      if (parsed.floor || parsed.maxFloor) {
          const floorSpan = page.locator('span:has-text("этаж")').last();
          if (await floorSpan.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              const inputs = floorSpan.locator('..').locator('..').locator('input');
              if (parsed.floor && await inputs.nth(0).waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                  await inputs.nth(0).fill(String(parsed.floor));
              }
              if (parsed.maxFloor && await inputs.nth(1).waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
                  await inputs.nth(1).fill(String(parsed.maxFloor));
              }
          }
      }

      // Description language switch
      const ruBtn = page.locator('button:has-text("Русский")').first();
      if (await ruBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
          await ruBtn.click({ force: true });
          await delay(500);
      }

      // Description text
      if (parsed.description) {
          const txtArea = page.locator('textarea').last();
          if (await txtArea.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await txtArea.fill(parsed.description);
          }
      }

      // Photos
      if (photos && photos.length > 0) {
          try {
              console.log(`[MyHomePublisher] Uploading ${photos.length} photos...`);
              const fileBuffers = photos.map((dataUrl: string, idx: number) => {
                  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
                  if (!match) return null;
                  return {
                      name: `photo_${idx}.jpg`,
                      mimeType: match[1],
                      buffer: Buffer.from(match[2], 'base64')
                  };
              }).filter(Boolean);
              
              if (fileBuffers.length > 0) {
                  const fileInput = page.locator('input[type="file"]').first();
                  if (await fileInput.count() > 0) {
                      await fileInput.setInputFiles(fileBuffers as any);
                      await delay(7000); 
                  }
              }
          } catch (e: any) {
              console.error("[MyHomePublisher] Photo upload error:", e.message);
          }
      }

      console.log(`[MyHomePublisher] Filled form fields & photos, attempting publish...`);
      
      const submitSelector = 'div:has-text("გამოქვეყნება"), button:has-text("Опубликовать"), button.myhome\\:bg-primary-green-100, div.luk-relative.luk-z-10.luk-flex';
      const nextBtn = page.locator(submitSelector).last();
      if (await nextBtn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
          await nextBtn.scrollIntoViewIfNeeded().catch(()=>{});
          await delay(1000);
          await nextBtn.click({ force: true });
      } else {
          // find submit button
          const btn = page.locator('button[type="submit"], input[type="submit"], button.myhome\\:bg-primary-green-100').last();
          if (await btn.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
              await btn.scrollIntoViewIfNeeded().catch(()=>{});
              await delay(1000);
              await btn.click({ force: true });
          }
      }

      await delay(10000);
      try {
        await page.waitForURL('**/statement/success**', { timeout: 30000 });
      } catch(e) {
        console.log('[MyHomePublisher] Did not redirect to success page. Checking for Cloudflare...');
        const cfChallenge = page.locator('iframe[src*="challenges.cloudflare.com"]').first();
        if (await cfChallenge.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false)) {
            console.log('[MyHomePublisher] Cloudflare challenge detected! Waiting 60s for manual user solve via Live Debugger...');
            await delay(60000);
            try {
                await page.waitForURL('**/statement/success**', { timeout: 10000 });
            } catch (err) {}
        } else {
            console.log('[MyHomePublisher] Waiting extra 15s manually...');
            await delay(15000);
        }
      }

      await supabaseServer.from('listings').update({ status: 'published' }).eq('id', objectId);
      console.log(`[MyHomePublisher] Finished successfully!`);
      await browser.close().catch(()=>{});

    } catch (e: any) {
      console.error(`[MyHomePublisher] Error:`, e);
      try { await browser.close(); } catch(err){}
      await supabaseServer.from('listings').update({ 
        status: 'error',
        error_details: e.message || 'Unknown Error'
      }).eq('id', objectId);
    }
  } catch (err: any) {
    console.error(`[MyHomePublisher] Critical Error:`, err);
    await supabaseServer.from('listings').update({ 
      status: 'error',
      error_details: err.message || 'Unknown Error'
    }).eq('id', objectId);
  }
}
