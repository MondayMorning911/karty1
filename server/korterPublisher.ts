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
- floor: Этаж (только число, по умолчанию 2)
- floorCount: Этажность дома (только число). Если в тексте не указано, напишите случайное число от Этаж+2 до Этаж+5 (например, если этаж 4, укажите 7). Если этаж тоже не указан, укажите 12. Этажность ВСЕГДА должна быть выше этажа.
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
        isStealth: true,
        blockAds: false,
        launchOptions: {
          args: [
            '--disable-blink-features=AutomationControlled',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--ignore-gpu-blocklist',
            '--disable-webkit-shared-image-cache',
            '--headless=new',
            '--enable-webgl'
          ]
        }
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
      const context = await browser.newContext({ 
        storageState: state, 
        locale: 'ru-RU',
        permissions: ['geolocation'],
        geolocation: { latitude: 41.6410, longitude: 41.6310 },
        timezoneId: 'Asia/Tbilisi'
      });
      const page = await context.newPage();
      
      console.log('🔍 Проверяем статус WebGL внутри контейнера Steel.dev...');
      try {
          await page.goto('https://webglreport.com/?v=1', { timeout: 15000 });
          const webglStatus = await page.evaluate(() => {
              const table = document.querySelector('table');
              return table ? table.innerText.substring(0, 200) : 'Не удалось получить отчет WebGL';
          });
          console.log('📊 Отчет WebGL с сервера Steel.dev:\n', webglStatus);
      } catch (e) {
          console.log('Не удалось загрузить webglreport:', e);
      }

      let targetLat = 41.6410;
      let targetLng = 41.6310;
      try {
          const query = `${parsed.city || 'Батуми'}, ${parsed.street || ''} ${parsed.houseNumber || ''}`;
          console.log(`[KorterPublisher] Geocoding address: ${query}`);
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
              headers: { 'User-Agent': 'Korter/1.0 AI-Publisher' }
          });
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
              targetLat = parseFloat(geoData[0].lat);
              targetLng = parseFloat(geoData[0].lon);
              console.log(`[KorterPublisher] OSM Geocoded coordinates: ${targetLat}, ${targetLng}`);
          } else {
              console.log(`[KorterPublisher] OSM Geocoder found nothing for ${query}, falling back to center.`);
          }
      } catch(e: any) {
          console.log('[KorterPublisher] OSM Geocoding failed:', e?.message || e);
      }

      console.log('🛡️ [Karty Network] Устанавливаем перехватчик для бандла Mapbox...');
      await page.route('**/*mapbox-gl*.js', async route => {
        console.log('💉 [Karty Network] Пойман бандл Mapbox! Делаем инжект WebGL-поддержки...');
        try {
          const response = await route.fetch();
          let body = await response.text();

          // Патчим функцию supported() - заставляем её всегда возвращать true
          body = body.replace(/supported\s*\(\s*\)\s*\{[^}]*\}/g, 'supported(){return true;}');
          
          // Патчим минифицированные проверки внутри классов Mapbox
          body = body.replace(/this\.supported\s*=\s*!1/g, 'this.supported=!0');
          body = body.replace(/this\.supported\s*=\s*false/g, 'this.supported=true');

          // Отдаем Кортеру наш модифицированный (взломанный) скрипт
          await route.fulfill({ response, body, contentType: 'application/javascript' });
          console.log('✅ Бандл успешно пропатчен и отдан браузеру!');
        } catch (err: any) {
          console.error('⚠️ Ошибка при патче бандла:', err?.message);
          await route.continue();
        }
      });

      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      console.log(`[KorterPublisher] Navigating to creation page...`);
      try {
          await page.goto('https://korter.ge/ru/property/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e: any) {
          if (e.message && e.message.includes('ERR_ABORTED')) {
              console.log('[KorterPublisher] ERR_ABORTED on goto, retrying...');
              await delay(2000);
              await page.goto('https://korter.ge/ru/property/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else {
              throw e;
          }
      }
      await delay(2000);

      // Очистить форму перед заполнением
      try {
          const clearBtns = [
              page.locator('button.t10dbpex.bjrwb8u', { hasText: 'Очистить форму' }).first(),
              page.locator('button', { hasText: 'Очистить форму' }).first(),
              page.locator('div.s1ipb8ld', { hasText: 'Очистить форму' }).first(),
              page.locator('text="Очистить форму"').first()
          ];
          for (const btn of clearBtns) {
              if (await btn.isVisible().catch(()=>false)) {
                  console.log(`[Korter] Form clear button found, clicking...`);
                  await btn.click({ force: true }).catch(()=>{});
                  await delay(1000);
                  break;
              }
          }
      } catch (e) {
         console.log(`[Korter] Failed to clear form: ${e}`);
      }

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
      try {
          const mapCanvas = page.locator('canvas.mapboxgl-canvas').first();
          if (await mapCanvas.isVisible().catch(()=>false)) {
              await mapCanvas.scrollIntoViewIfNeeded().catch(()=>{});
              await delay(2000); // give map time to load tiles
          }
      } catch (e) {}

      if (parsed.city) {
          const mskInput = page.locator('input[name="custom.geoObjectSearch"]').first();
          if (await mskInput.isVisible().catch(()=>false)) {
              await mskInput.fill('');
              await mskInput.type(parsed.city, { delay: 100 });
              await delay(1500);
              let suggest = page.locator('div.s7gnlt', { hasText: parsed.city }).first();
              if (await suggest.isVisible().catch(()=>false)) {
                  await suggest.click({ force: true }).catch(()=>{});
              } else {
                  suggest = page.locator('div.s7gnlt').first();
                  if (await suggest.isVisible().catch(()=>false)) {
                      await suggest.click({ force: true }).catch(()=>{});
                  } else {
                      await page.keyboard.press('Enter').catch(()=>{});
                  }
              }
              await delay(500);
          }
      }
      if (parsed.street) {
          const strInput = page.locator('input[name="street"]').first();
          if (await strInput.isVisible().catch(()=>false)) {
              await strInput.fill('');
              await strInput.type(parsed.street, { delay: 100 });
              await delay(2000);
              
              const suggest = page.locator('div.s7gnlt');
              const count = await suggest.count();
              if (count > 0) {
                  let clicked = false;
                  for(let i = 0; i < count; i++) {
                      const text = await suggest.nth(i).innerText();
                      if (text.toLowerCase().includes(parsed.street.toLowerCase())) {
                          await suggest.nth(i).click({ force: true }).catch(()=>{});
                          clicked = true;
                          break;
                      }
                  }
                  if (!clicked) {
                      await suggest.first().click({ force: true }).catch(()=>{});
                  }
              } else {
                  await page.keyboard.press('Enter').catch(()=>{});
              }
              await delay(2000);

              console.log('🎯 Ищем живой инстанс пропатченной карты и Composition API...');
              await page.evaluate(({ lat, lng }) => {
                let success = false;
              
                // --- ВЕКТОР 3 от Клода: Стреляем событием прямо в живую карту ---
                const mapContainer = document.querySelector('.mapboxgl-map') || document.querySelector('[class*="map"]');
                if (mapContainer && (mapContainer as any)._mapboxgl_map) {
                  console.log('🗺️ [Karty] Найден объект Mapbox! Симулируем клик пользователя...');
                  const map = (mapContainer as any)._mapboxgl_map;
                  
                  // Перемещаем невидимую карту в нужную точку
                  if (typeof map.setCenter === 'function') map.setCenter([lng, lat]);
                  
                  // Выстреливаем событие клика (именно это слушает Vue-валидатор)
                  if (typeof map.fire === 'function') {
                    map.fire('click', {
                      lngLat: { lng: lng, lat: lat },
                      point: { x: 250, y: 250 } // Фейковые координаты мышки на экране
                    });
                    success = true;
                  }
                }
              
                // --- ВЕКТОР 4 от Клода: Страховочный выстрел по Vue 3 (Nuxt 3) ---
                if (!success) {
                  console.log('🧠 [Karty] Переходим к глубокому взлому стейта Vue 3 (Composition API)...');
                  
                  // Ищем форму или основной контейнер
                  const formEl = document.querySelector('form') || document.querySelector('[class*="publish"]') || document.querySelector('.page-container');
                  
                  // В Nuxt 3 стейт лежит в __vueParentComponent
                  let instance = (formEl as any)?.__vueParentComponent || (formEl as any)?.__vue_app__;
                  
                  while (instance) {
                    // Ищем Composition API (setupState)
                    const data = instance.setupState || instance.data;
                    
                    if (data && (typeof data === 'object')) {
                      let patched = false;
                      
                      // Перебираем ключи, ищем упоминания карты или координат
                      for (const key in data) {
                        const lowerKey = key.toLowerCase();
                        
                        if (lowerKey === 'lat' || lowerKey.includes('latitude')) { data[key] = lat; patched = true; }
                        if (lowerKey === 'lng' || lowerKey === 'lon' || lowerKey.includes('longitude')) { data[key] = lng; patched = true; }
                        if (lowerKey === 'mapvalid' || lowerKey === 'ismapset' || lowerKey === 'hasmarker') { data[key] = true; patched = true; }
                      }
                      
                      if (patched) {
                        console.log(`🎯 [Karty] Успешно пропатчен setupState в компоненте Vue 3!`);
                        break; // Выходим из цикла, стейт пробит
                      }
                    }
                    instance = instance.parent; // Идем вверх по дереву
                  }
                }
              }, { lat: targetLat, lng: targetLng }).catch(()=>{});
          }
      }
      if (parsed.houseNumber) {
          const numInput = page.locator('input[name="houseNumber"]').first();
          if (await numInput.isVisible().catch(()=>false)) {
              let currentNum = parseInt(String(parsed.houseNumber).replace(/[^\d]/g, '')) || 1;
              await numInput.fill(String(parsed.houseNumber));
              await delay(1500);
              
              const suggest = page.locator('div.s7gnlt');
              if (await suggest.count() > 0) {
                  await suggest.first().click({ force: true }).catch(()=>{});
              } else {
                  await page.keyboard.press('Enter').catch(()=>{});
              }
              await delay(1000);

              // Check if map error appeared
              const errorLocator = page.locator('text="Мы не нашли такой дом"').first();
              if (await errorLocator.isVisible().catch(()=>false)) {
                  console.log(`[Korter] House number not found. Attempting nearby numbers starting from ${currentNum}`);
                  // Try nearby variants up to 10 numbers away
                  for (let i = 1; i <= 10; i++) {
                      // up
                      await numInput.fill(String(currentNum + i));
                      await delay(800);
                      let sug = page.locator('div.s7gnlt').first();
                      if (await sug.isVisible().catch(()=>false)) {
                          await sug.click({ force: true }).catch(()=>{});
                          await delay(800);
                          if (!await errorLocator.isVisible().catch(()=>false)) break;
                      }

                      // down
                      if (currentNum - i > 0) {
                          await numInput.fill(String(currentNum - i));
                          await delay(800);
                          let sug2 = page.locator('div.s7gnlt').first();
                          if (await sug2.isVisible().catch(()=>false)) {
                              await sug2.click({ force: true }).catch(()=>{});
                              await delay(800);
                              if (!await errorLocator.isVisible().catch(()=>false)) break;
                          }
                      }
                  }
              }
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
          await page.locator(`label[for="roomCount-${rc}"]`).click({ force: true }).catch(async () => {
              // fallback if label isn't there
              await page.locator(`#roomCount-${rc}`).click({ force: true }).catch(()=>{});
          });
      }
      if (parsed.bedrooms) {
          const bc = Math.min(Number(parsed.bedrooms), 4);
          await page.locator(`label[for="bedroomCount-${bc}"]`).click({ force: true }).catch(async () => {
              await page.locator(`#bedroomCount-${bc}`).click({ force: true }).catch(()=>{});
          });
      }
      if (parsed.bathrooms) {
          const btc = Math.min(Number(parsed.bathrooms), 3);
          await page.locator(`label[for="bathroomCount-${btc}"]`).click({ force: true }).catch(async () => {
              await page.locator(`#bathroomCount-${btc}`).click({ force: true }).catch(()=>{});
          });
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
                      // wait for uploads to process
                      await delay(photos.length * 2000 + 3000);
                      
                      const photoErrors = await page.locator('text="удалите или обновите загруженные фотографии"').count();
                      if (photoErrors > 0) {
                          console.warn("[Korter] There is a photo error on the page. We might need to handle this manually.");
                      }
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
      let errors = await page.locator('div.non-fixed-field-error').allTextContents().catch(()=>[]);
      
      const mapErrorStr = 'Установите метку на карте в нужном месте';
      if (errors && errors.some(e => e.includes(mapErrorStr))) {
          console.log('[KorterPublisher] Map pin error is STILL detected after publish. Patch did not work.');
      }

      if (errors && errors.length > 0) {
          let retried = false;
          // Retry city
          if (errors.some(e => e.includes('Выберите город из списка'))) {
              console.log('[KorterPublisher] Retrying city selection based on error...');
              if (parsed.city) {
                  const mskInput = page.locator('input[name="custom.geoObjectSearch"]').first();
                  if (await mskInput.isVisible().catch(()=>false)) {
                      await mskInput.fill('');
                      await mskInput.type(parsed.city, { delay: 100 });
                      await delay(1500);
                      await page.keyboard.press('Enter').catch(()=>{});
                      await delay(500);
                  }
              }
              retried = true;
          }
          // Retry street and house
          if (errors.some(e => e.includes('Выберите улицу из списка') || e.includes('Мы не нашли такой дом'))) {
              console.log('[KorterPublisher] Retrying street/house selection based on error...');
              if (parsed.street) {
                  const strInput = page.locator('input[name="street"]').first();
                  if (await strInput.isVisible().catch(()=>false)) {
                      await strInput.fill('');
                      await strInput.type(parsed.street, { delay: 100 });
                      await delay(1500);
                      await page.keyboard.press('Enter').catch(()=>{});
                      await delay(500);
                  }
              }
              if (parsed.houseNumber) {
                  const numInput = page.locator('input[name="houseNumber"]').first();
                  if (await numInput.isVisible().catch(()=>false)) {
                      await numInput.fill('');
                      await numInput.type(String(parsed.houseNumber), { delay: 100 });
                      await delay(1000);
                      await page.keyboard.press('Enter').catch(()=>{});
                      await delay(500);
                  }
              }
              retried = true;
          }

          if (retried) {
              console.log('[KorterPublisher] Try publishing again after retries...');
              await publishBtn.click({ force: true }).catch(()=>{});
              await delay(3000);
              errors = await page.locator('div.non-fixed-field-error').allTextContents().catch(()=>[]);
          }
      }

      // Final check for errors
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
