import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || 'sk-placeholder',
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
    systemPrompt = `Ты — копирайтер по недвижимости. Перепиши исходные данные объекта в продающем, эмоциональном стиле: продавай не только квадратные метры, но и образ жизни и ощущения от владения объектом.

ТРЕБОВАНИЯ:
- Начни с сильного заголовка-крючка, основанного на фактах: вид, локация, атмосфера или другая выгода. Не начинай с шаблонного "Продается квартира".
- Используй эмодзи-иконки как визуальные маркеры (📍 🏢 💰 🌊 и другие уместные), по одному перед каждым ключевым параметром.
- Раскрой 1-2 эмоциональных преимущества словами, но только если они следуют из исходных данных. Не выдумывай вид, инфраструктуру или характеристики.
- Упомяни готовность к проживанию или сдаче без дополнительных вложений только если это указано во входных данных.
- Обязательно сохрани цену, валюту, площадь и другие факты из исходных данных. Не меняй числа.
- Заверши призывом написать в личные сообщения за подробностями или фото.
- Длина: 80-120 слов.

Если какого-либо факта нет во входных данных, не добавляй его. Верни результат СТРОГО в формате JSON с ключом "enhanced_text", содержащим готовое объявление.`;
  } else if (styleId === 'pro') {
    systemPrompt = `Ты — редактор объявлений о недвижимости. Перепиши исходные данные в максимально сжатом деловом стиле, ориентированном на быстрое сканирование глазами.

ТРЕБОВАНИЯ:
- Без эмоциональных эпитетов, рекламных обещаний и восклицательных знаков.
- Перед списком добавь одно короткое предложение: что за объект и где он расположен.
- Далее используй структуру по пунктам: Тип объекта / Комплекс, блок / Площадь / Этаж / Цена / Состояние / Меблировка / Особенности. Показывай только факты, которые есть во входных данных.
- Допустим максимум один эмодзи как разделитель, но лучше без эмодзи.
- Обязательно сохрани цену, валюту, площадь и другие числа из исходных данных. Не меняй числа и не добавляй отсутствующие параметры.
- Заверши точной фразой: "Подробности и фото — по запросу".
- Длина: 50-70 слов.

Если параметра нет во входных данных, пропусти его. Верни результат СТРОГО в формате JSON с ключом "enhanced_text", содержащим готовое объявление.`;
  } else if (styleId === 'short') {
    systemPrompt = `Ты — редактор коротких объявлений о недвижимости. Сожми исходные данные до компактного текста, который можно быстро прочитать в Telegram, сохранив факты, важные для принятия решения.

ТРЕБОВАНИЯ:
- Длина: 50-70 слов, короткие предложения или строки.
- Сохрани тип объекта, локацию, площадь, этаж, цену и валюту, если они есть во входных данных.
- Добавь состояние, меблировку или ключевую особенность только если они указаны.
- Удали повторы, вводные слова и рекламную "воду".
- Не выдумывай факты и не меняй числа.
- Заверши кратким призывом: "Подробности и фото — по запросу".

Верни результат СТРОГО в формате JSON с ключом "enhanced_text", содержащим готовое объявление.`;
  } else {
    systemPrompt = `Вам предоставлен черновик объявления о недвижимости. Пожалуйста, извлеките ключевые данные.

 ОБЯЗАТЕЛЬНЫЕ ПОЛЯ для публикации (извлекай только то, что явно есть в тексте; не выдумывай значения):
- dealType: Тип сделки ("Продажа", "Долгосрочная аренда", "Посуточная аренда")
- propertyType: Тип недвижимости ("Квартира", "Дом", "Коммерческая недвижимость")
- city: город (например, "Батуми")
- area: площадь числом
- price: цена числом
- rooms: количество комнат
- bedrooms: количество спален
- street: улица (только название, без "улица/ул")
- houseNumber: номер дома
- floor: этаж
- floorCount: этажность дома, если указана
- yard_area: площадь двора для дома
- land_area: площадь участка, если указана отдельно от общей площади
- currency: валюта цены

НЕОБЯЗАТЕЛЬНЫЕ ПОЛЯ (извлеките, если есть, иначе null):
- residential_complex: Название ЖК (например, "Orbi City")
- district: район
- floorCount: этажность дома
- bathrooms: количество санузлов
- address: Полная строка адреса для геокодинга.

Не вычисляй комнаты или спальни по площади и не подставляй этажность/площадь двора: если значения нет в тексте, оставь null и включи поле в missing_fields.

МАССИВ missing_fields:
Создайте свойство "missing_fields" (массив строк). 
Включите в него (НА РУССКОМ ЯЗЫКЕ) только ОБЯЗАТЕЛЬНЫЕ поля, которых не хватает:
- Если нет dealType, добавьте "Тип сделки"
- Если нет propertyType, добавьте "Тип недвижимости"
- Если нет city, добавьте "Город"
- Если нет area, добавьте "Площадь"
- Если нет price, добавьте "Цена"
- Если нет street, добавьте "Улица"
- Если нет houseNumber, добавьте "Номер дома"
- Если нет floor (для квартир), добавьте "Этаж"
 - Если комнат нет, добавьте "Количество комнат"
 - Если спален нет для квартиры или дома, добавьте "Количество спален"
 - Если этажности нет, добавьте "Этажность"
 - Если типа сделки или типа недвижимости нет, добавьте соответствующее поле

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
