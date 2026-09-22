import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { upsertChat, addMessage, getDb } from './crmChats.js';
import { upsertTelegramLead } from './crmLeads.js';
import { activateSubscription } from './billing.js';
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = Number(process.env.TELEGRAM_ADMIN_CHAT_ID || '5938875657');

let bot: TelegramBot | null = null;

// === Admin DB tables ===
function ensureAdminTables() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS banned_users (
      telegram_id TEXT PRIMARY KEY,
      banned_at TEXT DEFAULT (datetime('now')),
      reason TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_grants (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      duration_months INTEGER NOT NULL,
      granted_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bot_users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      first_seen_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function registerBotUser(msg: any): void {
  const tid = String(msg.from?.id || msg.chat.id);
  const d = getDb();
  d.prepare(`INSERT OR IGNORE INTO bot_users (telegram_id, username, first_name, last_name) VALUES (?,?,?,?)`)
    .run(tid, msg.from?.username || '', msg.from?.first_name || '', msg.from?.last_name || '');
  d.prepare('UPDATE bot_users SET last_seen_at = datetime(\'now\') WHERE telegram_id = ?').run(tid);
}

function isBanned(telegramId: string): boolean {
  try {
    const d = getDb();
    return !!d.prepare('SELECT 1 FROM banned_users WHERE telegram_id=?').get(telegramId);
  } catch { return false; }
}

function banUser(telegramId: string, reason?: string): void {
  const d = getDb();
  d.prepare('INSERT OR REPLACE INTO banned_users (telegram_id, reason) VALUES (?, ?)').run(telegramId, reason || 'Banned by admin');
}

function unbanUser(telegramId: string): boolean {
  const d = getDb();
  const r = d.prepare('DELETE FROM banned_users WHERE telegram_id=?').run(telegramId);
  return r.changes > 0;
}

function getAllBotUserIds(): string[] {
  const d = getDb();
  const rows = d.prepare("SELECT telegram_id FROM bot_users").all() as any[];
  return rows.map(r => r.telegram_id);
}

// === Admin state machine (conversation flow) ===
type AdminState =
  | { action: 'grant_id' }
  | { action: 'grant_duration', telegramId: string }
  | { action: 'ban_id' }
  | { action: 'unban_id' }
  | { action: 'broadcast_text' }
  | { action: 'broadcast_media', text: string }
  | null;

const adminStates = new Map<number, AdminState>();

function adminKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '🎁 Выдать доступ', callback_data: 'admin_grant' }],
      [{ text: '⛔ Бан', callback_data: 'admin_ban' }, { text: '✅ Разбан', callback_data: 'admin_unban' }],
      [{ text: '📢 Рассылка', callback_data: 'admin_broadcast' }],
    ],
  };
}

function planKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '1 месяц ($55)', callback_data: 'plan_monthly' }],
      [{ text: '3 месяца ($149)', callback_data: 'plan_quarterly' }],
      [{ text: '6 месяцев ($289)', callback_data: 'plan_halfyear' }],
      [{ text: '12 месяцев ($530)', callback_data: 'plan_yearly' }],
      [{ text: ' Агенство ($199)', callback_data: 'plan_agency' }],
      [{ text: '⬅️ Назад', callback_data: 'admin_back' }],
    ],
  };
}

const PLAN_MAP: Record<string, string> = {
  plan_monthly: 'monthly',
  plan_quarterly: 'quarterly',
  plan_halfyear: 'halfyear',
  plan_yearly: 'yearly',
  plan_agency: 'agency',
};

export function startBot() {
  if (!token) {
    console.warn("No TELEGRAM_BOT_TOKEN provided. Bot is disabled.");
    return;
  }

  ensureAdminTables();
  console.log(`Starting Telegram Bot.`);
  bot = new TelegramBot(token, { polling: true });

  bot.on('polling_error', (error) => {
    console.error(`[Telegram Bot Polling Error]: ${error.message}`);
  });

  const appUrl = process.env.APP_URL || "https://karty-bot.duckdns.org/app";
  console.log(`Telegram Bot started. Mini App URL: ${appUrl}`);

  // === /admin command ===
  bot.onText(/\/admin/, (msg) => {
    if (msg.from?.id !== ADMIN_ID) return;
    adminStates.delete(msg.chat.id);
    bot?.sendMessage(msg.chat.id, '🔧 *Админ-панель Karty*\n\nВыберите действие:', {
      parse_mode: 'Markdown',
      reply_markup: adminKeyboard(),
    });
  });

  // === Callback queries ===
  bot.on('callback_query', (query) => {
    if (query.from?.id !== ADMIN_ID) {
      bot?.answerCallbackQuery(query.id, { text: 'Нет доступа' });
      return;
    }
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    const data = query.data!;

    // Reset state on navigation
    if (data === 'admin_back' || data === 'admin_menu') {
      adminStates.delete(chatId);
      bot?.editMessageText('🔧 *Админ-панель Karty*\n\nВыберите действие:', {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
        reply_markup: adminKeyboard(),
      });
      bot?.answerCallbackQuery(query.id);
      return;
    }

    // Grant access
    if (data === 'admin_grant') {
      adminStates.set(chatId, { action: 'grant_id' });
      bot?.editMessageText('🎁 *Выдача доступа*\n\nВведите Telegram ID пользователя:', {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
      });
      bot?.answerCallbackQuery(query.id);
      return;
    }

    // Ban
    if (data === 'admin_ban') {
      adminStates.set(chatId, { action: 'ban_id' });
      bot?.editMessageText('⛔ *Бан пользователя*\n\nВведите Telegram ID для бана:', {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
      });
      bot?.answerCallbackQuery(query.id);
      return;
    }

    // Unban
    if (data === 'admin_unban') {
      adminStates.set(chatId, { action: 'unban_id' });
      bot?.editMessageText('✅ *Разбан пользователя*\n\nВведите Telegram ID для разбана:', {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
      });
      bot?.answerCallbackQuery(query.id);
      return;
    }

    // Broadcast
    if (data === 'admin_broadcast') {
      adminStates.set(chatId, { action: 'broadcast_text' });
      bot?.editMessageText('📢 *Рассылка*\n\nВведите текст рассылки:\n(для отмены /admin)', {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
      });
      bot?.answerCallbackQuery(query.id);
      return;
    }

    // Plan selection (after entering user ID for grant)
    if (data.startsWith('plan_')) {
      const planId = PLAN_MAP[data];
      if (!planId) return;
      const state = adminStates.get(chatId);
      if (!state || state.action !== 'grant_duration') return;
      const { telegramId } = state;
      adminStates.delete(chatId);
      try {
        activateSubscription(telegramId, planId, `admin_grant_${Date.now()}`);
        const grantId = crypto.randomUUID();
        const d = getDb();
        const months = planId === 'monthly' || planId === 'agency' ? 1 : planId === 'quarterly' ? 3 : planId === 'halfyear' ? 6 : 12;
        d.prepare('INSERT INTO admin_grants (id, telegram_id, plan_id, granted_by, duration_months) VALUES (?,?,?,?,?)')
          .run(grantId, telegramId, planId, String(ADMIN_ID), months);
        bot?.editMessageText(`✅ Доступ выдан!\n\n👤 ID: ${telegramId}\n📦 План: ${planId}\n⏱ Срок: ${months} мес.`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: adminKeyboard(),
        });
        // Notify the user
        bot?.sendMessage(telegramId, '🎉 Вам выдан доступ к Karty!\n\nВсе функции разблокированы. Нажмите кнопку ниже, чтобы открыть Mini App.', {
          reply_markup: { inline_keyboard: [[{ text: 'Открыть Karty', web_app: { url: appUrl } }]] },
        }).catch(() => {});
      } catch (e: any) {
        bot?.editMessageText(`❌ Ошибка: ${e.message}`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: adminKeyboard(),
        });
      }
      bot?.answerCallbackQuery(query.id);
      return;
    }

    bot?.answerCallbackQuery(query.id);
  });

  // === Admin conversation handler ===
  bot.on('message', (msg) => {
    if (msg.text?.startsWith('/')) return;
    const chatId = msg.chat.id;
    const userId = String(msg.from?.id || chatId);

    // Ban check for all users
    if (isBanned(userId)) {
      bot?.sendMessage(chatId, '🚫 Ваш доступ к боту заблокирован. Обратитесь к администратору.');
      return;
    }

    // Admin state machine
    const state = adminStates.get(chatId);
    if (state && msg.from?.id === ADMIN_ID) {
      handleAdminMessage(chatId, msg, state);
      return;
    }

    // Normal message handling — only create CRM chat if this user was already
    // contacted by a manager (i.e. the chat already exists). Random users sending
    // media/stickers to the bot should NOT generate fake CRM conversations.
    const crmChatId = `tg_${msg.chat.id}`;
    const existingChat = getDb().prepare('SELECT chat_id FROM chats WHERE chat_id = ?').get(crmChatId);
    if (existingChat) {
      const phone = msg.from?.username || String(msg.chat.id);
      const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Telegram User';
      const text = msg.text || '[media]';

      upsertChat({
        chat_id: crmChatId,
        client_phone: phone,
        client_name: name,
        manager_id: 'pending',
        platform: 'telegram',
        last_message_text: text,
        last_message_timestamp: new Date().toISOString(),
      });
      addMessage(crmChatId, 'client', text);
    }
  });

  // === /start with referral ===
  bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from?.id || chatId);

    // Register every /start in bot_users table
    registerBotUser(msg);

    if (isBanned(userId)) {
      bot?.sendMessage(chatId, '🚫 Ваш доступ к боту заблокирован. Обратитесь к администратору.');
      return;
    }

    const referralToken = match?.[1]?.replace(/^ref_/, '');
    upsertTelegramLead(userId, [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '), msg.from?.username || '', referralToken);
    bot?.sendMessage(chatId, "Добро пожаловать в Karty!\n\nМощный инструмент централизованной публикации на все доски недвижимости.\nНажмите кнопку ниже, чтобы открыть Mini App и авторизовать площадки.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть Karty", web_app: { url: appUrl } }]
        ]
      }
    });
  });

  function handleAdminMessage(chatId: number, msg: any, state: AdminState) {
    const text = msg.text || '';

    switch (state.action) {
      case 'grant_id': {
        const tid = text.trim();
        if (!/^\d+$/.test(tid)) {
          bot?.sendMessage(chatId, '❌ Неверный ID. Введите числовой Telegram ID:');
          return;
        }
        adminStates.set(chatId, { action: 'grant_duration', telegramId: tid });
        bot?.sendMessage(chatId, `👤 ID: ${tid}\n\nВыберите план:`, { reply_markup: planKeyboard() });
        break;
      }

      case 'ban_id': {
        const tid = text.trim();
        if (!/^\d+$/.test(tid)) {
          bot?.sendMessage(chatId, '❌ Неверный ID. Введите числовой Telegram ID:');
          return;
        }
        banUser(tid, 'Banned via admin panel');
        adminStates.delete(chatId);
        bot?.sendMessage(chatId, `✅ Пользователь ${tid} забанен.\n\nКнопки бота перестанут работать для этого пользователя.`, {
          reply_markup: adminKeyboard(),
        });
        break;
      }

      case 'unban_id': {
        const tid = text.trim();
        if (!/^\d+$/.test(tid)) {
          bot?.sendMessage(chatId, '❌ Неверный ID. Введите числовой Telegram ID:');
          return;
        }
        const ok = unbanUser(tid);
        adminStates.delete(chatId);
        bot?.sendMessage(chatId, ok ? `✅ Пользователь ${tid} разбанен.` : `⚠️ Пользователь ${tid} не был в бане.`, {
          reply_markup: adminKeyboard(),
        });
        break;
      }

      case 'broadcast_text': {
        adminStates.set(chatId, { action: 'broadcast_media', text });
        bot?.sendMessage(chatId, '📸 Прикрепите фото или видео для рассылки, или нажмите /skip для текста без медиа:', {
          reply_markup: { inline_keyboard: [[{ text: 'Пропустить (только текст)', callback_data: 'broadcast_skip_media' }]] },
        });
        break;
      }

      case 'broadcast_media': {
        // This shouldn't be reached via callback; handled in media handler below
        break;
      }
    }
  }

  // Broadcast skip media callback
  bot.on('callback_query', (query) => {
    if (query.from?.id !== ADMIN_ID) return;
    if (query.data !== 'broadcast_skip_media') return;
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    const state = adminStates.get(chatId);
    if (!state || state.action !== 'broadcast_media') return;
    const { text } = state;
    adminStates.delete(chatId);
    doBroadcast(chatId, text, null, null);
    bot?.answerCallbackQuery(query.id);
  });

  // Media handler for broadcast
  bot.on('message', (msg) => {
    if (msg.from?.id !== ADMIN_ID) return;
    const chatId = msg.chat.id;
    const state = adminStates.get(chatId);
    if (!state || state.action !== 'broadcast_media') return;
    const text = state.text;
    adminStates.delete(chatId);

    let mediaType: 'photo' | 'video' | null = null;
    let fileId: string | null = null;
    if (msg.photo?.length) {
      mediaType = 'photo';
      fileId = msg.photo[msg.photo.length - 1].file_id;
    } else if (msg.video) {
      mediaType = 'video';
      fileId = msg.video.file_id;
    } else if (msg.document?.mime_type?.startsWith('image/')) {
      mediaType = 'photo';
      fileId = msg.document.file_id;
    } else if (msg.document?.mime_type?.startsWith('video/')) {
      mediaType = 'video';
      fileId = msg.document.file_id;
    }

    if (!fileId) {
      bot?.sendMessage(chatId, '❌ Не распознано как фото/видео. Рассылка отменена.', { reply_markup: adminKeyboard() });
      return;
    }

    doBroadcast(chatId, text, mediaType, fileId);
  });

  function doBroadcast(adminChatId: number, text: string, mediaType: 'photo' | 'video' | null, fileId: string | null) {
    const userIds = getAllBotUserIds();
    const banned = new Set<string>();
    try {
      const d = getDb();
      d.prepare('SELECT telegram_id FROM banned_users').all().forEach((r: any) => banned.add(r.telegram_id));
    } catch {}

    const targets = userIds.filter(id => !banned.has(id));
    let sent = 0, failed = 0;

    bot?.sendMessage(adminChatId, `📢 Рассылка 시작алась...\n\n👥 Получателей: ${targets.length}\n📝 Текст: ${text.slice(0, 100)}...`);

    (async () => {
      for (const tid of targets) {
        try {
          if (mediaType === 'photo' && fileId) {
            await bot?.sendPhoto(tid, fileId, { caption: text });
          } else if (mediaType === 'video' && fileId) {
            await bot?.sendVideo(tid, fileId, { caption: text });
          } else {
            await bot?.sendMessage(tid, text);
          }
          sent++;
        } catch {
          failed++;
        }
        // Rate limit: ~25 msg/s
        await new Promise(r => setTimeout(r, 40));
      }
      bot?.sendMessage(adminChatId, `✅ Рассылка завершена!\n\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`, {
        reply_markup: adminKeyboard(),
      });
    })();
  }
}

export function sendTelegramMessage(chatId: string, text: string) {
  if (!bot) return Promise.reject(new Error('Bot not running'));
  const numericId = chatId.replace('tg_', '');
  return bot.sendMessage(numericId, text);
}
