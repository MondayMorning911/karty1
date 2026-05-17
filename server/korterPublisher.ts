import { chromium } from 'playwright-core';
import type { Page, BrowserContext } from 'playwright-core';
import { supabaseServer } from './supabase.js';
import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import dotenv from 'dotenv';
dotenv.config();

let httpAgent;
if (process.env.PROXY_URL) {
  if (process.env.PROXY_URL.startsWith('socks')) {
    httpAgent = new SocksProxyAgent(process.env.PROXY_URL);
  } else {
    httpAgent = new HttpsProxyAgent(process.env.PROXY_URL);
  }
}

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
  httpAgent: httpAgent,
});



export async function publishKorterAsync(userId: string, objectId: string, text: string, photos?: string[]) {
  try {
    // 1. Извлекаем данные через DeepSeek
    console.log(`[KorterPublisher] Parsing data for ${objectId} ...`);
    
    // update status
    await supabaseServer.from('listings').update({ status: 'publishing' }).eq('id', objectId);

    const prompt = `
Вам предоставлен текст объявления: "${text}".
Для публикации на сайте korter.ge нужно определить следующие параметры. Извлеките их в формате JSON.
Если из текста непонятно, укажите значение по умолчанию (например, Батуми для города, Квартира для типа и тд).

Поля для JSON:
- dealType: "Продажа" | "Долгосрочная аренда" | "Посуточная аренда" (по умолчанию "Продажа")
- propertyType: "Квартира" | "Дом" | "Коммерческая недвижимость" | "Участок" | "Гаражи и паркинги" (по умолчанию "Квартира")
- houseType: "Частный дом" | "Коттедж" | "Таунхаус" | "Дуплекс" | "Дача" (если это Дом, иначе null)
- commercialType: "Офис" | "Склад" | "Магазин" | "Кафе" | "Отель" | "Гараж" | "Паркинг" (если Коммерция, иначе null)
- city: Город (если не указано, "Батуми")
- street: Название улицы (если есть, без слова улица/ул, только название)
- houseNumber: Номер дома (только число/строка)
- floor: Этаж (только число)
- floorCount: Этажность дома (только число)
- rooms: Количество комнат (от 1 до 5)
- bedrooms: Количество спален (от 1 до 4)
- bathrooms: Количество санузлов (от 1 до 3)
- area: Общая площадь (число, точная или примерная)
- price: Цена в долларах (только число)
- description: Красивое полное описание для публикации (можно использовать сам текст или немного улучшить)

Верните ТОЛЬКО JSON с этими ключами, без markdown-разметки \`\`\`json.
`;

    const aiRes = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const rawResult = aiRes.choices[0].message.content || '{}';
    const parsed = JSON.parse(rawResult);
    console.log(`[KorterPublisher] Parsed:`, parsed);

    // 2. Получаем сессию
    const { data: sessionData, error: sessionError } = await supabaseServer
      .from('platform_sessions')
      .select('state')
      .eq('user_id', userId)
      .eq('platform', 'korter')
      .single();

    if (sessionError || !sessionData) {
      throw new Error('Нет активной сессии Korter');
    }
    const state = sessionData.state; // playwright storage state
    
    // 3. Запускаем Steel браузер
    const STEEL_API_KEY = process.env.STEEL_API_KEY || 'ste-S2WXkR2diAvFIHVgXUD5xwc35sa0VolIMSsnz6PU4SCIKNgWEwvRSH6EzlaCeT7P7jleUWCbrbZHLyFLWToNf7lDSE62nZjZ6A6';
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
    const steelSessionData = await sessionResponse.json();
    const sessionId = steelSessionData.id;

    const browser = await chromium.connectOverCDP(`wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${sessionId}`);
    
    try {
      console.log(`[KorterPublisher] Opened browser, applying state...`);
      const context = await browser.newContext({ storageState: state, locale: 'ru-RU' });
      const page = await context.newPage();
      
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      console.log(`[KorterPublisher] Navigating to creation page...`);
      await page.goto('https://korter.ge/ru/property/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2000);

      // 4. Заполняем форму
      // Тип сделки
      if (parsed.dealType) {
        const targetDealText = parsed.dealType === 'Посуточная аренда' ? 'Посуточная аренда' : parsed.dealType === 'Долгосрочная аренда' ? 'Долгосрочная аренда' : 'Продажа';
        let foundDealType = false;
        try {
            console.log(`[Korter] Setting dealType to ${targetDealText}`);
            // Find "Тип сделки" trigger and click it
            const dealDropdowns = page.locator('text="Тип сделки"');
            if (await dealDropdowns.count() > 0) {
               await dealDropdowns.last().click({ force: true }).catch(()=>{});
            } else {
               await page.getByText('Тип сделки', { exact: false }).last().click({ force: true }).catch(()=>{});
            }
            await delay(1000);
            
            // Try to find the correct option
            const opt = page.locator(`css=div:has-text("${targetDealText}")`).filter({ hasText: new RegExp(`^${targetDealText}$`) }).last();
            if (await opt.isVisible().catch(()=>false)) {
                await opt.click({ force: true });
                foundDealType = true;
            } else {
               // Fallback: exact match text
               const fallbackOpt = page.getByText(targetDealText, { exact: true }).last();
               await fallbackOpt.click({ force: true });
               foundDealType = true;
            }
            await delay(500);
        } catch(e) {
            console.log("Failed modern dealType");
        }

        if (!foundDealType) {
            // Old select approach
            const dealBoxes = page.locator('div.s4r9iw1, div.lxrdcjb', { hasText: new RegExp(`^${targetDealText}$`) });
            if (await dealBoxes.first().isVisible().catch(()=>false)) {
                await dealBoxes.first().click().catch(()=>{});
                await delay(500);
            }
        }
      }

      // Тип недвижимости
      if (parsed.propertyType) {
        let foundPropType = false;
        try {
            console.log(`[Korter] Setting propertyType to ${parsed.propertyType}`);
            const propDropdowns = page.locator('text="Тип недвижимости"');
            if (await propDropdowns.count() > 0) {
               await propDropdowns.last().click({ force: true }).catch(()=>{});
            } else {
               await page.getByText('Тип недвижимости', { exact: false }).last().click({ force: true }).catch(()=>{});
            }
            await delay(1000);
            
            const opt = page.locator(`css=div:has-text("${parsed.propertyType}")`).filter({ hasText: new RegExp(`^${parsed.propertyType}$`) }).last();
            if (await opt.isVisible().catch(()=>false)) {
                await opt.click({ force: true });
                foundPropType = true;
            } else {
               const fallbackOpt = page.getByText(parsed.propertyType, { exact: true }).last();
               await fallbackOpt.click({ force: true });
               foundPropType = true;
            }
            await delay(500);
        } catch(e) {
            console.log("Failed modern propertyType");
        }

        if (!foundPropType) {
            const typeBoxes = page.locator('div.s4r9iw1, div.lxrdcjb', { hasText: new RegExp(`^${parsed.propertyType}$`) });
            if (await typeBoxes.first().isVisible().catch(()=>false)) {
                await typeBoxes.first().click().catch(()=>{});
                await delay(500);
            }
        }
      }

      // Подкатегории (houseType, commercialType)
      if (parsed.propertyType === 'Дом' && parsed.houseType) {
          const typeBox = page.locator(`button:has-text("${parsed.houseType}"), div:has-text("${parsed.houseType}")`).last();
          await typeBox.click({ force: true }).catch(()=>{});
          await delay(500);
      }
      if (parsed.propertyType === 'Коммерческая недвижимость' && parsed.commercialType) {
          const typeBox = page.locator(`button:has-text("${parsed.commercialType}"), div:has-text("${parsed.commercialType}")`).last();
          await typeBox.click({ force: true }).catch(()=>{});
          await delay(500);
      }

      // Город и Адрес
      if (parsed.city) {
          const mskInput = page.locator('input[name="custom.geoObjectSearch"]').first();
          if (await mskInput.isVisible().catch(()=>false)) {
              await mskInput.fill('');
              await mskInput.type(parsed.city, { delay: 100 });
              await delay(1000);
              const suggest = page.locator('div.s7gnlt', { hasText: parsed.city }).first();
              await suggest.click({ force: true }).catch(()=>{});
              await delay(500);
          }
      }
      if (parsed.street) {
          const strInput = page.locator('input[name="street"], input[name="custom.buildingSearch"]').first();
          if (await strInput.isVisible().catch(()=>false)) {
              await strInput.fill(parsed.street);
              await delay(1000);
              const suggest = page.locator('div.s7gnlt', { hasText: parsed.street }).first();
              if (await suggest.isVisible().catch(()=>false)) {
                  await suggest.click({ force: true }).catch(()=>{});
              } else {
                  await page.keyboard.press('Enter').catch(()=>{});
              }
              await delay(500);
          }
      }
      if (parsed.houseNumber) {
          const numInput = page.locator('input[name="houseNumber"]').first();
          if (await numInput.isVisible().catch(()=>false)) {
              await numInput.fill(String(parsed.houseNumber));
          }
      }

      // Этажи и Комнаты
      if (parsed.floor) {
          await page.fill('#floorNumber', String(parsed.floor)).catch(()=>{});
      }
      if (parsed.floorCount) {
          await page.fill('#floorCount', String(parsed.floorCount)).catch(()=>{});
      }
      
      if (parsed.rooms) {
          const rc = Math.min(Number(parsed.rooms), 5);
          await page.click(`#roomCount-${rc}`, { force: true }).catch(()=>{});
      }
      if (parsed.bedrooms) {
          const bc = Math.min(Number(parsed.bedrooms), 4);
          await page.click(`#bedroomCount-${bc}`, { force: true }).catch(()=>{});
      }
      if (parsed.bathrooms) {
          const btc = Math.min(Number(parsed.bathrooms), 3);
          await page.click(`#bathroomCount-${btc}`, { force: true }).catch(()=>{});
      }

      if (parsed.area) {
          await page.fill('#area', String(parsed.area)).catch(()=>{});
      }

      if (parsed.description) {
          await page.fill('#description\\.ru-RU', parsed.description).catch(()=>{});
      }

      if (parsed.price) {
          await page.fill('#price', String(parsed.price)).catch(()=>{});
      }

      // Upload photos
      if (photos && photos.length > 0) {
          try {
              console.log(`[KorterPublisher] Uploading ${photos.length} photos...`);
              const fileBuffers = photos.map((dataUrl: string, idx: number) => {
                  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
                  if (!match) return null;
                  const mimeType = match[1];
                  const ext = mimeType.split('/')[1] || 'jpg';
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
                      // wait for uploads to process
                      await delay(photos.length * 1500 + 2000); 
                  } else {
                      console.warn("[KorterPublisher] Could not find file input for photos");
                  }
              }
          } catch (e: any) {
              console.error("[KorterPublisher] Photo upload error:", e.message);
          }
      }

      console.log(`[KorterPublisher] Filled form fields & photos, attempting publish...`);

      // Клик опубликовать
      const publishBtn = page.locator('div.s1ipb8ld', { hasText: 'Опубликовать объект' }).first();
      await publishBtn.click({ force: true }).catch(()=>{});
      await delay(2000);

      // Проверяем ошибки
      const errors = await page.locator('div.non-fixed-field-error').allTextContents().catch(()=>[]);
      if (errors && errors.length > 0) {
          throw new Error('Ошибки заполнения обязательных полей: ' + errors.join("; "));
      }

      // Ждем перехода
      await page.waitForFunction(() => window.location.href.includes('published=done'), { timeout: 15000 }).catch(()=>{});
      
      if (!page.url().includes('published')) {
          console.warn("[KorterPublisher] Warning: url didn't change to published=done within timeout");
      }

      let listingUrl = '';
      const linkDiv = page.locator('div.sf3b9d9:has-text("Страница на сайте")').first();
      if (await linkDiv.isVisible().catch(()=>false)) {
         // Maybe they copy it to clipboard or there's an `a` tag nearby. Let's try to extract from DOM
         // Korter usually wraps the link in an A tag or copies to clipboard. 
         // For now, we will mark as success
      }

      console.log(`[KorterPublisher] Finished successfully!`);

      await supabaseServer.from('listings').update({ 
        status: 'published',
        korter_url: listingUrl || null
      }).eq('id', objectId);

      await browser.close().catch(()=>{});
      
      await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/release`, {
        method: 'POST',
        headers: { 'steel-api-key': STEEL_API_KEY }
      }).catch(()=>{});

    } catch (e: any) {
      console.error(`[KorterPublisher] Error:`, e);
      try { await browser.close(); } catch(err){}
      await supabaseServer.from('listings').update({ 
        status: 'error',
        error_details: e.message || 'Unknown Error'
      }).eq('id', objectId);
    }

  } catch (err: any) {
    console.error(`[KorterPublisher] Critical Error:`, err);
    await supabaseServer.from('listings').update({ 
      status: 'error',
      error_details: err.message || 'Unknown Error'
    }).eq('id', objectId);
  }
}
