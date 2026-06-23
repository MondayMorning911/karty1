import { supabaseServer } from './supabase.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // or use native fetch if available
import fs from 'fs';
import path from 'path';

dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const SKYVERN_API_URL = process.env.SKYVERN_API_URL || 'http://localhost:8000/api/v1';

export interface KartyPayload {
  deal_type: "sale" | "rent";
  property_type: "apartment" | "house" | "commercial" | "land";
  price: number;
  currency: "USD" | "GEL" | "EUR";
  area_total: number;
  area_living?: number;
  rooms: number;
  floor?: number;
  floors_total?: number;
  condition: "renovated" | "shell" | "old_renovated" | "new";
  city_ru: string;
  city_ge: string;
  address_ru: string;
  address_ge: string;
  district: string;
  complex_name?: string | null;
  description_ru: string;
  description_ge?: string;
  photos: string[];
  contact_phone: string;
  portal_targets: Array<"korter.ge" | "myhome.ge" | "ss.ge" | "realting.com">;
}

export interface SkyvernTask {
  portal?: string;
  url: string;
  webhook_callback_url?: string;
  navigation_goal: string;
  data_extraction_goal: string;
  navigation_payload: Partial<KartyPayload>;
  error_code_mapping?: Record<string, string>;
  max_steps_override?: number;
  browser_session_id?: string;
}

const ERROR_CODE_MAPPING = {
  "AUTH_REQUIRED": "Сессия истекла, требуется повторный логин",
  "DROPDOWN_FAILED": "Не удалось открыть или выбрать значение дропдауна",
  "ADDRESS_NOT_FOUND": "Адрес не найден в автокомплите портала",
  "VALIDATION_LOOP": "Форма не прошла валидацию после 2 попыток исправления",
  "PUBLISH_TIMEOUT": "Объявление не опубликовалось, URL не получен",
  "CAPTCHA_DETECTED": "Обнаружена капча, задача остановлена"
};

/**
 * 1. Получаем структурированный JSON-объект от парсера (Deepseek)
 */
export async function parseListingText(text: string): Promise<KartyPayload> {
  const prompt = `
# AI Studio — Системный промпт для генерации Skyvern-задач (Karty)

Ты — оркестратор автоматической публикации объявлений о недвижимости.
Тебе нужно извлечь данные из текста объявления и вернуть строго JSON-объект.

Входной текст: "${text}"

Структура, которую нужно вернуть (все поля обязательны, если нет данных — попробуй сделать логичный вывод, иначе укажи null):
{
  "deal_type": "sale | rent",
  "property_type": "apartment | house | commercial | land",
  "price": number,
  "currency": "USD | GEL | EUR",
  "area_total": number,
  "area_living": number или null,
  "rooms": number,
  "floor": number или null,
  "floors_total": number или null,
  "condition": "renovated | shell | old_renovated | new",
  "city_ru": "Город на русском, например Батуми или Тбилиси",
  "city_ge": "Город на грузинском, например ბათუმი или თბილისი",
  "address_ru": "адрес на русском",
  "address_ge": "адрес на грузинском",
  "district": "район",
  "complex_name": "название ЖК или null",
  "description_ru": "Красивое описание на русском",
  "description_ge": "Красивое описание на грузинском",
  "photos": [],
  "contact_phone": "+995XXXXXXXXX",
  "portal_targets": ["korter.ge", "myhome.ge", "ss.ge", "realting.com"]
}

Верните ТОЛЬКО валидный JSON, без markdown.
`;

  const aiRes = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  const rawResult = aiRes.choices[0].message.content || '{}';
  return JSON.parse(rawResult) as KartyPayload;
}

/**
 * 2. Скачивание фото локально для Skyvern
 */
async function downloadPhotosLocally(photosUrl: string[], objectId: string, portal: string): Promise<string[]> {
    const destDir = path.join(process.cwd(), 'downloads', `${objectId}_${portal}`);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const localPaths: string[] = [];
    for (let i = 0; i < photosUrl.length; i++) {
        let url = photosUrl[i];
        try {
            let buffer: Buffer;
            let ext = 'jpg';
            if (url.startsWith('data:image')) {
                const match = url.match(/^data:image\/(\w+);base64,(.+)$/);
                if (match) {
                    ext = match[1] === 'jpeg' ? 'jpg' : match[1];
                    buffer = Buffer.from(match[2], 'base64');
                } else {
                    continue; // Skip invalid base64
                }
            } else {
                const res = await fetch(url);
                if (!res.ok) continue;
                buffer = Buffer.from(await res.arrayBuffer());
            }

            const fileName = `photo_${i}.${ext}`;
            const filePath = path.join(destDir, fileName);
            fs.writeFileSync(filePath, buffer);
            // Skyvern увидит эти файлы по пути /app/downloads/... внутри контейнера
            localPaths.push(`/app/downloads/${objectId}_${portal}/${fileName}`);
        } catch (e) {
            console.error(`Failed to download photo ${i}:`, e);
        }
    }

    return localPaths;
}

function cleanupLocalPhotos(objectId: string, portal: string) {
    const destDir = path.join(process.cwd(), 'downloads', `${objectId}_${portal}`);
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
    }
}

/**
 * Генерация промпта для Skyvern (navigation_goal)
 */
function getSkyvernGoal(portal: string): string {
    const commonRules = `
ОБЩИЕ ПРАВИЛА:
Сессия уже активна через сохранённые cookies. Если видишь логин — СТОП, верни AUTH_REQUIRED.
Если на форме есть кнопка "Очистить форму" или открыт старый черновик — очисти её перед заполнением.
Сначала выбери тип сделки и тип недвижимости, чтобы форма полностью открылась.
Затем заполни остальные поля по navigation_payload, Обязательно выбери город из дропдауна (используя city_ru или city_ge).
Для загрузки фотографий используй локальные пути файлов из payload (поле local_photos). Эти файлы нужно загрузить в поле <input type="file" accept="image/*">.
Внимание: обязательно дождись окончания загрузки фото (появления миниатюр) перед публикацией!
Для дропдаунов: кликни, дождись списка, выбери подходящее. 2 неудачи = DROPDOWN_FAILED.
Перед публикацией проверь красные ошибки валидации. Максимум 2 попытки, потом VALIDATION_LOOP.
Если всё успешно — нажми Опубликовать, дождись URL страницы объявления и верни в data_extraction_goal.`;

    if (portal === 'korter.ge') {
        return `Добавление объекта на korter.ge. \n${commonRules}\nСпецифика: Тип сделки - первый дропдаун, Недвижимость - второй.`;
    } else if (portal === 'myhome.ge') {
        return `Добавление объекта на myhome.ge. \n${commonRules}\nСпецифика: Интерфейс на грузинском. Город и Улицу вводи на грузинском (city_ge, address_ge).`;
    } else if (portal === 'ss.ge') {
         return `Добавление объекта на ss.ge. \n${commonRules}\nСпецифика: Цену указывай в USD.`;
    } else if (portal === 'realting.com') {
         return `Добавление объекта на realting.com. \n${commonRules}\nСпецифика: Страна - Грузия, Город из city_ru.`;
    }
    return `Заполни форму публикации. ${commonRules}`;
}

/**
 * Получить URL добавления для портала
 */
function getPortalUploadUrl(portal: string): string {
    switch (portal) {
        case 'korter.ge': return 'https://korter.ge/ru/property/create'; // или https://korter.ge/add
        case 'myhome.ge': return 'https://www.myhome.ge/ka/profile/myadd/';
        case 'ss.ge': return 'https://home.ss.ge/ru/недвижимость/create';  // 'https://ss.ge/en/RealEstate/Add'
        case 'realting.com': return 'https://realting.com/add';
        default: return 'https://example.com/add';
    }
}

/**
 * 3. Skyvern Task API заполняет и сабмитит форму
 */
async function runSkyvernTask(task: SkyvernTask) {
    console.log(`[Skyvern] Submitting task for ${task.url}...`);
    const response = await fetch(`${SKYVERN_API_URL}/tasks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.SKYVERN_API_KEY || ''
        },
        body: JSON.stringify(task)
    });

    if (!response.ok) {
         throw new Error(`Skyvern API error: ${response.statusText}`);
    }

    const { task_id } = await response.json() as { task_id: string };
    console.log(`[Skyvern] Task created. ID: ${task_id}. Polling...`);

    // Polling 
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        
        const statusRes = await fetch(`${SKYVERN_API_URL}/tasks/${task_id}`);
        if (!statusRes.ok) continue;

        const data = await statusRes.json() as any;
        
        if (data.status === 'completed') {
            return {
                portal: task.portal,
                success: true,
                listing_url: data.extracted_information?.url || null
            };
        } else if (data.status === 'failed') {
             return {
                portal: task.portal,
                success: false,
                error: data.failure_reason
            };
        }
    }

    return { portal: task.portal, success: false, error: 'TIMEOUT' };
}

/**
 * Основной флоу публикации на все порталы
 */
export async function executePortalPublishing(userId: string, objectId: string, payload: KartyPayload) {
    // Лимит одновременных задач для 8 GB RAM. (Каждый сеанс браузера с нейросетями в Skyvern съедает памяти).
    const MAX_CONCURRENT_SKYVERN_TASKS = 2; 

    const tasksFuncs = payload.portal_targets.map(portal => async () => {
        let portalDbKey = portal.replace('.ge', '').replace('.com', '');
        console.log(`====================================`);
        console.log(`Starting pipeline for ${portal}...`);
        
        try {
            // 1. Извлекаем сессию
            const { data: sessionData } = await supabaseServer
                .from('platform_sessions')
                .select('state')
                .eq('user_id', userId)
                .eq('platform', portalDbKey)
                .single();

            if (!sessionData || !sessionData.state) {
                 console.warn(`No session state for ${portal}, skipping.`);
                 return;
            }

            let state = sessionData.state;

            // Записываем куки для Skyvern (volume ./cookies:/app/cookies)
            const cookiesFilePath = path.join(process.cwd(), 'cookies', `cookies_${portal}.json`);
            if (!fs.existsSync(path.join(process.cwd(), 'cookies'))) {
                fs.mkdirSync(path.join(process.cwd(), 'cookies'), { recursive: true });
            }
            fs.writeFileSync(cookiesFilePath, JSON.stringify(state));

            // 2. Скачиваем фото локально
            const localPhotos = await downloadPhotosLocally(payload.photos, objectId, portal);
            const skyvernPayload = { ...payload, local_photos: localPhotos };
            
            const uploadUrl = getPortalUploadUrl(portal);

            // 3. Skyvern Task
            const task: SkyvernTask = {
                portal,
                url: uploadUrl,
                navigation_goal: getSkyvernGoal(portal),
                data_extraction_goal: "Extract the URL of the published listing after successful submission.",
                navigation_payload: skyvernPayload,
                error_code_mapping: ERROR_CODE_MAPPING,
                max_steps_override: 50,
                browser_session_id: `/app/cookies/cookies_${portal}.json`, // Passing the local mount path for Skyvern
            };

            const result = await runSkyvernTask(task);
            console.log(`Task Result for ${portal}:`, result);

            if (result.success) {
                 await supabaseServer.from('listings').update({ 
                    status: 'published',
                    [`${portalDbKey}_url`]: result.listing_url
                 }).eq('id', objectId);
            } else {
                 await supabaseServer.from('listings').update({ 
                    status: 'error',
                    error_details: `${portal} error: ${result.error}`
                 }).eq('id', objectId);
            }

        } catch (e: any) {
            console.error(`Failed pipeline for ${portal}:`, e);
        } finally {
            // 4. Очистка загруженных фото (чтобы не засирать сервер)
            cleanupLocalPhotos(objectId, portal);
        }
    });

    const executing = new Set<Promise<void>>();
    for (const task of tasksFuncs) {
        const p = task().finally(() => executing.delete(p));
        executing.add(p);
        if (executing.size >= MAX_CONCURRENT_SKYVERN_TASKS) {
            await Promise.race(executing);
        }
    }
    
    await Promise.all(executing);
}
