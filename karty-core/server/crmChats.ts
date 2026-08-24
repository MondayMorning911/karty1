import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'crm.db');

let db: Database.Database;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        chat_id TEXT PRIMARY KEY,
        client_phone TEXT,
        client_name TEXT,
        manager_id TEXT,
        platform TEXT NOT NULL,
        unread INTEGER DEFAULT 1,
        last_message_text TEXT,
        last_message_timestamp TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
      );
      CREATE TABLE IF NOT EXISTS chat_accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        account_name TEXT NOT NULL,
        bot_token TEXT,
        chatwoot_url TEXT,
        chatwoot_token TEXT,
        manager_id TEXT,
        session_string TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return db;
}

export interface Chat {
  chat_id: string;
  client_phone: string;
  client_name: string;
  manager_id: string;
  platform: 'whatsapp' | 'telegram';
  unread: boolean;
  last_message_text: string;
  last_message_timestamp: string;
}

export interface ChatMessage {
  id: number;
  chat_id: string;
  sender: 'client' | 'manager';
  text: string;
  timestamp: string;
}

export function upsertChat(chat: Omit<Chat, 'unread'> & { unread?: boolean }) {
  const d = getDb();
  const existing = d.prepare('SELECT chat_id FROM chats WHERE chat_id = ?').get(chat.chat_id);
  if (existing) {
    d.prepare('UPDATE chats SET last_message_text = ?, last_message_timestamp = ?, unread = 1 WHERE chat_id = ?')
      .run(chat.last_message_text, chat.last_message_timestamp, chat.chat_id);
  } else {
    d.prepare('INSERT INTO chats (chat_id, client_phone, client_name, manager_id, platform, unread, last_message_text, last_message_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(chat.chat_id, chat.client_phone, chat.client_name, chat.manager_id || 'pending', chat.platform, chat.unread ? 1 : 0, chat.last_message_text, chat.last_message_timestamp);
  }
}

export function addMessage(chatId: string, sender: 'client' | 'manager', text: string) {
  const d = getDb();
  const ts = new Date().toISOString();
  d.prepare('INSERT INTO chat_messages (chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?)').run(chatId, sender, text, ts);
  d.prepare('UPDATE chats SET last_message_text = ?, last_message_timestamp = ?, unread = CASE WHEN ? = ? THEN 1 ELSE unread END WHERE chat_id = ?')
    .run(text, ts, sender, 'client', chatId);
  return ts;
}

export function getChats(managerId?: string): Chat[] {
  const d = getDb();
  let rows;
  if (managerId && managerId !== 'all') {
    rows = d.prepare('SELECT * FROM chats WHERE manager_id = ? ORDER BY last_message_timestamp DESC').all(managerId);
  } else {
    rows = d.prepare('SELECT * FROM chats ORDER BY last_message_timestamp DESC').all();
  }
  return (rows as any[]).map(r => ({ ...r, unread: r.unread === 1 }));
}

export function getMessages(chatId: string): ChatMessage[] {
  const d = getDb();
  return d.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY timestamp ASC').all(chatId) as ChatMessage[];
}

export function getChat(chatId: string): Chat | null {
  const row = getDb().prepare('SELECT * FROM chats WHERE chat_id=?').get(chatId) as any;
  return row ? { ...row, unread: row.unread === 1 } : null;
}

export function markRead(chatId: string) {
  const d = getDb();
  d.prepare('UPDATE chats SET unread = 0 WHERE chat_id = ?').run(chatId);
}

export function assignChat(chatId: string, managerId: string) {
  const d = getDb();
  d.prepare('UPDATE chats SET manager_id = ? WHERE chat_id = ?').run(managerId, chatId);
}

export function getAccounts() {
  const d = getDb();
  return d.prepare('SELECT * FROM chat_accounts WHERE active = 1').all();
}

export function addAccount(platform: string, accountName: string, botToken?: string, chatwootUrl?: string, chatwootToken?: string) {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare('INSERT INTO chat_accounts (id, platform, account_name, bot_token, chatwoot_url, chatwoot_token) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, platform, accountName, botToken || null, chatwootUrl || null, chatwootToken || null);
  return { id, platform, account_name: accountName, active: true };
}

export function deleteAccount(id: string) {
  const d = getDb();
  d.prepare('UPDATE chat_accounts SET active = 0 WHERE id = ?').run(id);
}

export function getAccountsByManager(managerId: string) {
  const d = getDb();
  return d.prepare('SELECT * FROM chat_accounts WHERE manager_id = ? AND active = 1').all(managerId);
}

import crypto from 'crypto';
