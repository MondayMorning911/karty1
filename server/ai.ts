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

// Since the user is editing, we debounce the input on frontend
export async function parseListingWithDeepSeek(text: string, styleId: string) {
  let systemPrompt = '';
  
  if (styleId === 'selling') {
    systemPrompt = `Ты — профессиональный копирайтер в сфере недвижимости. Твоя задача: брать сырые данные об объекте и превращать их в привлекательное, продающее объявление для социальных сетей и маркетплейсов.

ПРАВИЛА ФОРМАТИРОВАНИЯ:
1. Заголовок: Начинается с действия (Продается/Сдается), содержит тип недвижимости, главную фишку (вид, ремонт) и заканчивается одним подходящим эмодзи.
2. Тело объявления: Строгий список параметров. Используй только следующие эмодзи для соответствующих пунктов:
   📍 Адрес
   📍 Площадь
   🔥 Дом / Год постройки / Отопление (газ и т.д.)
   🛁 Состояние / Ремонт / Сантехника
   🌅 Видовые характеристики (если есть)
   🛒 Инфраструктура
3. Цена: Отдельной строкой, начинается с 💰 Цена: [Сумма] [Валюта]
4. Подвал: Одно-два предложения, описывающие главную выгоду или перспективу для покупателя/арендатора.
5. Запрещено добавлять выдуманные факты, которых нет в исходных данных. Если данных для пункта нет — пропускай его.

ВАЖНО: Верни результат СТРОГО в формате JSON с ключом "enhanced_text", содержащим готовое объявление.`;
  } else if (styleId === 'pro') {
    systemPrompt = `Ты — строгий оценщик и брокер по недвижимости. Твоя задача: переписать предоставленные данные об объекте в максимально сухой, профессиональный и структурированный формат. 

ПРАВИЛА ФОРМАТИРОВАНИЯ:
1. Полное отсутствие эмодзи, восклицательных знаков и оценочных прилагательных (запрещены слова вроде "шикарный", "уютный", "вкусный").
2. Текст должен выглядеть как технический паспорт объекта.
3. Структура:
   - ТИП СДЕЛКИ И ОБЪЕКТ: [Продажа/Аренда] — [Тип объекта]
   - ЛОКАЦИЯ: [Адрес максимально точно]
   - ПЛОЩАДЬ: [X] м²
   - СОСТОЯНИЕ: [Кратко о ремонте и коммуникациях]
   - ИНФРАСТРУКТУРА: [Сухое перечисление объектов поблизости]
   - СТОИМОСТЬ: [Сумма] [Валюта]
4. Форматирование параметров должно быть выполнено заглавными буквами с двоеточием.
5. Не выдумывай отсутствующие данные. Если параметра нет, напиши "Не указано".

ВАЖНО: Верни результат СТРОГО в формате JSON с ключом "enhanced_text", содержащим готовое объявление.`;
  } else if (styleId === 'short') {
    systemPrompt = `Ты — алгоритм-суммаризатор данных о недвижимости. Твоя задача: сжать исходный текст об объекте до абсолютного минимума, сохранив только критически важные факты, необходимые для принятия решения.

ПРАВИЛА ФОРМАТИРОВАНИЯ:
1. Длина: максимум 3-4 строки.
2. Используй общепринятые сокращения (кв.м., ул., г.п., этаж).
3. Удали все маркетинговые описания, вводные слова и описания инфраструктуры, если они не являются ключевым фактором цены.
4. Формат: [Тип], [Площадь] кв.м., [Адрес]. [Кратко состояние/ремонт]. Цена: [Сумма] [Валюта].

ВАЖНО: Верни результат СТРОГО в формате JSON с ключом "enhanced_text", содержащим готовое объявление.`;
  } else {
    systemPrompt = `Вам предоставлен черновик объявления о недвижимости. Пожалуйста, извлеките ключевые данные.

Обязательные поля для публикации (особенно для Korter):
- dealType: Тип сделки ("Продажа", "Долгосрочная аренда", "Посуточная аренда")
- propertyType: Тип недвижимости ("Квартира", "Дом", "Коммерческая недвижимость")
- city: город (например, Батуми)
- street: улица
- area: площадь числом
- price: цена числом
- rooms: количество комнат

Извлеките все эти параметры и дополнительно:
- floor: этаж
- district: район
- address: Полная строка адреса для геокодинга. Оставьте пустым, если адреса нет.

Если какие-то параметры отсутствуют, верните null для них.
Также добавьте массив "missing_fields", перечислив на русском языке те обязательные параметры, которых нет в тексте (например, ["Тип сделки", "Площадь", "Улица"]). Верните пустой массив, если все есть.
Верните ТОЛЬКО JSON объект.`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" }
    });

    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("Empty response");

    const json = JSON.parse(resultText);

    // If an address was parsed, try to geocode it (only needed for extraction step)
    if (json.address && styleId === 'original') {
      const mapboxToken = process.env.VITE_MAPBOX_TOKEN;
      try {
        const geoResponse = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(json.address)}&access_token=${mapboxToken}&limit=1`);
        const geoData = await geoResponse.json();
        if (geoData && geoData.features && geoData.features.length > 0) {
          const coords = geoData.features[0].geometry.coordinates; // [lng, lat]
          json.lng = coords[0];
          json.lat = coords[1];
        }
      } catch (geoError) {
        console.error("Mapbox geocoding error:", geoError);
      }
    }

    return json;
  } catch (error) {
    console.error("Deepseek parse error:", error);
    return null;
  }
}
