import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Since the user is editing, we debounce the input on frontend
export async function parseListingWithDeepSeek(text: string, styleId: string) {
  const prompt = `
Вам предоставлен черновик объявления о недвижимости: "${text}"
И выбранный стиль редактирования: "${styleId}" (продающий/строгий/кратко/не менять).

Пожалуйста, извлеките следующие данные в формате JSON:
- price: цена строкой (например, "120 000 $")
- area: площадь строкой (например, "55 м²")
- floor: этаж числом или строкой
- rooms: количество комнат
- city: город (например, Батуми)
- district: район/улица (например, ул. Химшиашвили)
- address: Полная строка адреса для геокодинга (например, "Батуми, ул. Химшиашвили 7"). Оставьте пустым, если адреса нет.
- enhanced_text: Отредактируйте исходный текст в указанном стиле (${styleId}) для риелтора. Сделайте его читаемым и привлекательным.

Если какие-то параметры отсутствуют, верните null для них.
Верните ТОЛЬКО JSON объект. Без разметки \`\`\`json.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("Empty response");

    const json = JSON.parse(resultText);

    // If an address was parsed, try to geocode it
    if (json.address) {
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
