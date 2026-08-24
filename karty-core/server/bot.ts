import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { upsertChat, addMessage } from './crmChats.js';
import { upsertTelegramLead } from './crmLeads.js';
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

let bot: TelegramBot | null = null;

export function startBot() {
  if (!token) {
    console.warn("No TELEGRAM_BOT_TOKEN provided. Bot is disabled.");
    return;
  }

  console.log(`Starting Telegram Bot.`);

  bot = new TelegramBot(token, { polling: true });

  bot.on('polling_error', (error) => {
    console.error(`[Telegram Bot Polling Error]: ${error.message}`);
  });

  const appUrl = process.env.APP_URL || "https://karty-bot.duckdns.org/app";

  console.log(`Telegram Bot started. Mini App URL: ${appUrl}`);

  bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const referralToken = match?.[1]?.replace(/^ref_/, '');
    upsertTelegramLead(String(msg.from?.id || chatId), [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '), msg.from?.username || '', referralToken);
    bot?.sendMessage(chatId, "Добро пожаловать в Karty!\n\nМощный инструмент централизованной публикации на все доски недвижимости.\nНажмите кнопку ниже, чтобы открыть Mini App и авторизовать площадки.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть Karty", web_app: { url: appUrl } }]
        ]
      }
    });
  });

  // Handle all incoming messages — store in CRM chat system
  bot.on('message', (msg) => {
    if (msg.text?.startsWith('/')) return; // skip commands

    const chatId = `tg_${msg.chat.id}`;
    const phone = msg.from?.username || String(msg.chat.id);
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Telegram User';
    const text = msg.text || '[media]';

    upsertChat({
      chat_id: chatId,
      client_phone: phone,
      client_name: name,
      manager_id: 'pending',
      platform: 'telegram',
      last_message_text: text,
      last_message_timestamp: new Date().toISOString(),
    });

    addMessage(chatId, 'client', text);
  });
}

export function sendTelegramMessage(chatId: string, text: string) {
  if (!bot) return Promise.reject(new Error('Bot not running'));
  // chatId format: "tg_123456" → actual Telegram chat ID is 123456
  const numericId = chatId.replace('tg_', '');
  return bot.sendMessage(numericId, text);
}
