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

// Helper functions for geocoding
async function fetchFromNominatim(query: string): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KartyBot/1.0', 
        'Accept-Language': 'ru'       
      }
    });

    const data = await response.json();
    if (data && data.length > 0) {
      return data[0].display_name;
    }
    return null;
  } catch (error: any) {
    console.error(`⚠️ OSM Nominatim Error: ${error.message}`);
    return null;
  }
}

async function fetchFromPhoton(query: string): Promise<string | null> {
  try {
    const url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&lang=ru&limit=1`;
    const response = await fetch(url);
    const data = await response.json();

    const features = data?.features;
    if (features && features.length > 0) {
      const props = features[0].properties;
      const parts = [
        props.name,
        props.street ? `${props.street}${props.housenumber ? ', ' + props.housenumber : ''}` : null,
        props.city || props.town,
        props.country
      ].filter(Boolean);

      return parts.join(', ');
    }
    return null;
  } catch (error: any) {
    console.error(`⚠️ Photon API Error: ${error.message}`);
    return null;
  }
}

async function getComplexAddress(complexName: string, city: string = 'Батуми'): Promise<string | null> {
  const fullQuery = `Грузия, ${city}, ${complexName}`;
  const osmAddress = await fetchFromNominatim(fullQuery);
  if (osmAddress) return osmAddress;
  console.log(`🔄 OSM не справился с "${complexName}", подключаю План Б (Photon)...`);
  const photonAddress = await fetchFromPhoton(fullQuery);
  return photonAddress || null;
}

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

ОБЯЗАТЕЛЬНЫЕ ПОЛЯ для публикации:
- dealType: Тип сделки ("Продажа", "Долгосрочная аренда", "Посуточная аренда")
- propertyType: Тип недвижимости ("Квартира", "Дом", "Коммерческая недвижимость")
- city: город (например, "Батуми")
- area: площадь числом
- price: цена числом
- rooms: количество комнат

НЕОБЯЗАТЕЛЬНЫЕ ПОЛЯ (извлеките, если есть, иначе null):
- residential_complex: Название ЖК (например, "Orbi City")
- street: улица (например, "Важа Пшавела 53")
- district: район
- floor: этаж
- address: Полная строка адреса для геокодинга.

ПРАВИЛО ДЛЯ КОМНАТ: Если количество комнат не указано явно в тексте, но есть площадь объекта, ВЫСЧИТАЙТЕ количество комнат:
- до 35 м² -> 1
- от 36 до 55 м² -> 2
- от 56 до 80 м² -> 3
- свыше 80 м² -> 4

МАССИВ missing_fields:
Создайте свойство "missing_fields" (массив строк). 
Включите в него (НА РУССКОМ ЯЗЫКЕ) только ОБЯЗАТЕЛЬНЫЕ поля, которых не хватает и невозможно высчитать:
- Если нет dealType, добавьте "Тип сделки"
- Если нет propertyType, добавьте "Тип недвижимости"
- Если нет city, добавьте "Город"
- Если нет area, добавьте "Площадь"
- Если нет price, добавьте "Цена"
- Если нет ни street, ни residential_complex, ни address, добавьте "Адрес или название ЖК"
- Если комнат нет и нет площади, добавьте "Количество комнат"

Если все обязательные параметры есть (или могут быть высчитаны), верните пустой массив [].

Верните ТОЛЬКО JSON объект, где отсутствующие поля равны null.`;
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

    if (styleId === 'original') {
      // If address is missing but we have a residential complex, try to fetch the address
      if (!json.address && json.residential_complex) {
        console.log(`[AI] Address is missing, trying to find address for complex: ${json.residential_complex}`);
        const foundAddress = await getComplexAddress(json.residential_complex, json.city || 'Батуми');
        if (foundAddress) {
          json.address = foundAddress;
          // Remove "Улица" or "Адрес" from missing_fields if we successfully found it
          if (Array.isArray(json.missing_fields)) {
            json.missing_fields = json.missing_fields.filter((f: string) => 
               !f.toLowerCase().includes('улица') && !f.toLowerCase().includes('адрес')
            );
          }
        }
      }

      // If an address was parsed or found, try to geocode it for coordinates
      if (json.address) {
        const mapboxToken = process.env.VITE_MAPBOX_TOKEN;
        if (mapboxToken) {
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
      }
    }

    return json;
  } catch (error) {
    console.error("Deepseek parse error:", error);
    return null;
  }
}
