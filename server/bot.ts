import TelegramBot from 'node-telegram-bot-api';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import dotenv from 'dotenv';
dotenv.config();

// Usually Telegram token from env, or fallback to the one user provided
const token = process.env.TELEGRAM_BOT_TOKEN;

let bot: TelegramBot | null = null;

export function startBot() {
  if (!token) {
    console.warn("No TELEGRAM_BOT_TOKEN provided. Bot is disabled.");
    return;
  }

  const proxyUrl = process.env.PROXY_URL;
  let requestOpts: any = undefined;
  
  if (proxyUrl) {
    let agent: any;
    if (proxyUrl.startsWith('socks')) {
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      agent = new HttpsProxyAgent(proxyUrl);
    }
    requestOpts = { agent };
    console.log(`Using proxy for Telegram Bot: ${proxyUrl}`);
  }

  // Create a bot that uses 'polling' to fetch new updates
  bot = new TelegramBot(token, { 
    polling: true,
    request: requestOpts
  });

  // Fallback app URL if process.env.APP_URL is not set (you'll set it in production)
  // For AI Studio, it will be injected.
  const appUrl = process.env.APP_URL || "https://karty-app.vercel.app";

  console.log(`Telegram Bot started. Mini App URL configured as: ${appUrl}`);

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot?.sendMessage(chatId, "Добро пожаловать в Karty! 🚀\n\nМощный инструмент централизованной публикации на все доски недвижимости.\nНажмите кнопку ниже, чтобы открыть Mini App и авторизовать площадки.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть Karty", web_app: { url: appUrl } }]
        ]
      }
    });
  });

  bot.on('polling_error', (error) => {
    console.log("Telegram Bot Polling Error:", error);
  });
}
