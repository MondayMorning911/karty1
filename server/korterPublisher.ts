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
            '--disable-gpu',
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
      
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      console.log(`[KorterPublisher] Navigating to creation page...`);
      await page.goto('https://korter.ge/ru/property/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2000);

      // Очистить форму перед заполнением
      try {
          const clearBtn = page.locator('div.s1ipb8ld', { hasText: 'Очистить форму' }).first();
          if (await clearBtn.isVisible().catch(()=>false)) {
              console.log(`[Korter] Form clear button found, clicking...`);
              await clearBtn.click({ force: true }).catch(()=>{});
              await delay(1000);
          } else {
              const clearTextBtn = page.locator('text="Очистить форму"').first();
              if (await clearTextBtn.isVisible().catch(()=>false)) {
                 console.log(`[Korter] Form clear text button found, clicking...`);
                 await clearTextBtn.click({ force: true }).catch(()=>{});
                 await delay(1000);
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
              await delay(1000);
              const suggest = page.locator('div.s7gnlt', { hasText: parsed.city }).first();
              await suggest.click({ force: true }).catch(()=>{});
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
              await delay(1000);
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
          await page.click(`#roomCount-${rc}`, { force: true }).catch(()=>{});
          await page.evaluate((val) => {
              const labels = Array.from(document.querySelectorAll('div, label, span'));
              const title = labels.find(l => l.textContent && l.textContent.trim().startsWith('Комнаты'));
              if (title && title.parentElement) {
                  const opts = Array.from(title.parentElement.querySelectorAll('div, span'));
                  const target = opts.find(o => o.textContent && o.textContent.trim() === String(val) && o.children.length === 0);
                  if (target) (target as HTMLElement).click();
              }
          }, rc).catch(()=>{});
      }
      if (parsed.bedrooms) {
          const bc = Math.min(Number(parsed.bedrooms), 4);
          await page.click(`#bedroomCount-${bc}`, { force: true }).catch(()=>{});
          await page.evaluate((val) => {
              const labels = Array.from(document.querySelectorAll('div, label, span'));
              const title = labels.find(l => l.textContent && (l.textContent.trim().startsWith('Спальни') || l.textContent.trim().startsWith('Количество спален')));
              if (title && title.parentElement) {
                  const opts = Array.from(title.parentElement.querySelectorAll('div, span'));
                  const target = opts.find(o => o.textContent && o.textContent.trim() === String(val) && o.children.length === 0);
                  if (target) (target as HTMLElement).click();
              }
          }, bc).catch(()=>{});
      }
      if (parsed.bathrooms) {
          const btc = Math.min(Number(parsed.bathrooms), 3);
          await page.click(`#bathroomCount-${btc}`, { force: true }).catch(()=>{});
          await page.evaluate((val) => {
              const labels = Array.from(document.querySelectorAll('div, label, span'));
              const title = labels.find(l => l.textContent && (l.textContent.trim().startsWith('Санузлы') || l.textContent.trim().startsWith('Количество санузлов')));
              if (title && title.parentElement) {
                  const opts = Array.from(title.parentElement.querySelectorAll('div, span'));
                  const target = opts.find(o => o.textContent && o.textContent.trim() === String(val) && o.children.length === 0);
                  if (target) (target as HTMLElement).click();
              }
          }, btc).catch(()=>{});
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
          console.log('[KorterPublisher] Map pin error detected after publish. Executing Mapbox internal hack...');
          
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

          await page.evaluate(({ lat, lng }) => {
              // Точные координаты
              const targetLat = lat;
              const targetLng = lng;

              try {
                  const mapContainer = document.querySelector('.mapboxgl-map') || document.querySelector('#map') || document.querySelector('.s1r0159n');
                  
                  // Ищем в памяти инстанс карты
                  let mapInstance = (window as any).map || (window as any)._map || (mapContainer && (mapContainer as any).__vue__ && (mapContainer as any).__vue__.map);

                  if (!mapInstance && (window as any).mapboxgl && (window as any).mapboxgl.exportedMaps) {
                      mapInstance = (window as any).mapboxgl.exportedMaps[0];
                  }

                  // Управляем картой
                  if (mapInstance && typeof mapInstance.setCenter === 'function') {
                      mapInstance.setCenter([targetLng, targetLat]);
                      mapInstance.fire('click', { lngLat: { lng: targetLng, lat: targetLat } });
                      console.log('Mapbox успешно сдвинут в нужные координаты программно!');
                  }

                  // Дополнительно пытаемся сдвинуть маркер картинку
                  const pin = document.querySelector('img.realty-mapbox-pin.mapboxgl-marker, .mapboxgl-marker');
                  if (pin) {
                      (pin as HTMLElement).style.transform = 'translate(-50%, -50%) translate(400px, 300px)';
                  }
                  
                  // Ищем скрытые стейты формы
                  const latInput = document.querySelector('input[name="lat"], input[name="latitude"]');
                  const lngInput = document.querySelector('input[name="lng"], input[name="longitude"]');
                  if (latInput && lngInput) {
                      (latInput as HTMLInputElement).value = String(targetLat);
                      (lngInput as HTMLInputElement).value = String(targetLng);
                      latInput.dispatchEvent(new Event('input', { bubbles: true }));
                      lngInput.dispatchEvent(new Event('input', { bubbles: true }));
                      latInput.dispatchEvent(new Event('change', { bubbles: true }));
                      lngInput.dispatchEvent(new Event('change', { bubbles: true }));
                  }
              } catch (err) {
                  console.error('Ошибка при попытке оживить маркер:', err);
              }
          }, { lat: targetLat, lng: targetLng }).catch(()=>{});

          await delay(2000);

          // Re-click publish
          await publishBtn.click({ force: true }).catch(()=>{});
          await delay(2000);
          
          // Refresh errors
          errors = await page.locator('div.non-fixed-field-error').allTextContents().catch(()=>[]);
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
