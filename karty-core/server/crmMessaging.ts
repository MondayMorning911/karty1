import { createReferralLink } from './crmLeads.js';

function fallbackVariants(lead: any) {
  const name = lead.name?.trim() ? ` ${lead.name.trim()}` : '';
  const source = lead.source ? ` на ${lead.source}` : '';
  const variants = [
    `__NAME__добрый день! Смотрел ваши объявления${source} — солидный объём. Как сейчас справляетесь с публикацией на нескольких площадках, всё вручную заносите?`,
    `Здравствуйте${name}! Заметил ваши листинги${source}. Приходится ли параллельно дублировать одно и то же объявление на другие сайты руками?`,
    `Добрый день${name}! Обратил внимание на ваши объявления${source}. Сколько площадок обычно ведёте одновременно?`,
    `Здравствуйте${name}! Увидел ваши объявления${source} — активно работаете. Как организована актуализация цен и статусов на всех площадках?`,
    `Добрый день${name}! Смотрел ваш профиль${source} — заметный объём листингов. Сколько времени в неделю уходит на публикацию и обновления?`,
  ];
  const selected = variants[Math.floor(Math.random() * variants.length)].replace('__NAME__', lead.name?.trim() ? `${lead.name.trim()}, ` : 'Здравствуйте! ');
  return [selected];
}

export async function generateGreetingVariants(lead: any, managerId: string, botUsername: string) {
  const token = createReferralLink(managerId, 'crm-outreach', lead.id);
  const referralUrl = `https://t.me/${botUsername}?start=ref_${token}`;
  const sourceLabel = lead.source === 'ssge' ? 'SS.ge' : lead.source === 'korter' ? 'Korter' : lead.source === 'myhome' ? 'MyHome' : lead.source || 'сайте недвижимости';
  const promptLead = { ...lead, source: sourceLabel };
  const fallback = fallbackVariants(promptLead);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { variants: fallback, referralUrl, token };
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.85, max_tokens: 350, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: `Составь ОДНО короткое первое сообщение потенциальному клиенту-риэлтору. Имя: ${lead.name || 'нет имени'}. Источник объявлений: ${sourceLabel}. Укажи, что ты увидел его объявления на ${sourceLabel}. Задай ровно ОДИН лёгкий открытый вопрос о том, как он публикует объявления на нескольких площадках. Не продавай сервис, не вставляй ссылку, не используй списки, эмодзи и маркетинговые обещания. Текст должен быть естественным и каждый раз отличаться по формулировке. Верни JSON {"message":"..."}.` }] }),
    });
    if (!response.ok) return { variants: fallback, referralUrl, token };
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (!parsed.message || typeof parsed.message !== 'string') return { variants: fallback, referralUrl, token };
    return { variants: [parsed.message.trim()], referralUrl, token };
  } catch { return { variants: fallback, referralUrl, token }; }
}
