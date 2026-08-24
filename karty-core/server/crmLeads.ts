import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'crm.db');
let db: Database.Database;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_leads (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE,
        name TEXT DEFAULT '',
        source TEXT DEFAULT '',
        source_url TEXT DEFAULT '',
        profile_url TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        manager_id TEXT,
        telegram_user_id TEXT,
        chat_id TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS lead_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id TEXT NOT NULL,
        type TEXT NOT NULL,
        manager_id TEXT,
        payload TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS referral_links (
        token TEXT PRIMARY KEY,
        manager_id TEXT NOT NULL,
        lead_id TEXT,
        campaign TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );
      CREATE TABLE IF NOT EXISTS crm_payments (
        id TEXT PRIMARY KEY,
        cryptomus_uuid TEXT UNIQUE,
        order_id TEXT UNIQUE,
        lead_id TEXT,
        manager_id TEXT,
        referral_token TEXT,
        amount TEXT,
        currency TEXT,
        status TEXT DEFAULT 'pending',
        payload TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS lead_usage (
        lead_id TEXT PRIMARY KEY,
        free_listings_used INTEGER DEFAULT 0,
        free_listings_limit INTEGER DEFAULT 3,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return db;
}

function parse(row: any) {
  if (!row) return row;
  return { ...row, metadata: JSON.parse(row.metadata || '{}') };
}

export function syncRealtorLead(realtor: any) {
  const d = getDb();
  const id = `realtor_${crypto.createHash('sha1').update(String(realtor.phone)).digest('hex').slice(0, 24)}`;
  d.prepare(`INSERT INTO crm_leads (id, phone, name, source, source_url, profile_url, metadata, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(phone) DO UPDATE SET name=excluded.name, source=excluded.source, source_url=excluded.source_url, profile_url=excluded.profile_url, metadata=excluded.metadata, updated_at=datetime('now')`)
    .run(id, realtor.phone, realtor.name || '', realtor.source || '', realtor.listing_url || '', realtor.profile_url || '', JSON.stringify({ listings_count: realtor.listings_count || 0, verified: realtor.verified || 0 }));
  return id;
}

export function listLeads(status?: string, managerId?: string) {
  const d = getDb();
  const where: string[] = [];
  const params: any[] = [];
  if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
  if (managerId && managerId !== 'all') { where.push('manager_id = ?'); params.push(managerId); }
  const rows = d.prepare(`SELECT * FROM crm_leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CAST(json_extract(metadata, '$.message_count') AS INTEGER) DESC, CAST(json_extract(metadata, '$.listings_count') AS INTEGER) DESC, updated_at DESC`).all(...params);
  return (rows as any[]).map(parse);
}

export function removeUnqualifiedRealtorLeads(minListings = 20) {
  const d = getDb();
  return d.prepare("DELETE FROM crm_leads WHERE source IN ('ssge','korter','myhome') AND (manager_id IS NULL OR manager_id='') AND CAST(json_extract(metadata, '$.listings_count') AS INTEGER) < ?").run(minListings).changes;
}

export function removeUnqualifiedTelegramLeads(maxMessages = 30) {
  const d = getDb();
  return d.prepare(
    "DELETE FROM crm_leads WHERE source = 'telegram' " +
    "AND CAST(json_extract(metadata, '$.message_count') AS INTEGER) <= ?"
  ).run(maxMessages).changes;
}

export function getLead(id: string) {
  return parse(getDb().prepare('SELECT * FROM crm_leads WHERE id=?').get(id));
}

export function findLeadByChat(chatId: string) {
  return parse(getDb().prepare("SELECT * FROM crm_leads WHERE chat_id=? OR (? = 'tg_' || telegram_user_id) LIMIT 1").get(chatId, chatId));
}

export function updateLead(id: string, patch: { status?: string; manager_id?: string | null; name?: string; phone?: string }) {
  const allowed = ['status', 'manager_id', 'name', 'phone'];
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (!entries.length) return parse(getDb().prepare('SELECT * FROM crm_leads WHERE id=?').get(id));
  const d = getDb();
  d.prepare(`UPDATE crm_leads SET ${entries.map(([key]) => `${key}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`).run(...entries.map(([, value]) => value), id);
  return parse(d.prepare('SELECT * FROM crm_leads WHERE id=?').get(id));
}

export function claimLead(id: string, managerId: string) {
  const d = getDb();
  const result = d.prepare("UPDATE crm_leads SET manager_id=?, status=CASE WHEN status='new' THEN 'contacted' ELSE status END, updated_at=datetime('now') WHERE id=? AND (manager_id IS NULL OR manager_id='')").run(managerId, id);
  const lead = getLead(id);
  if (result.changes) addLeadEvent(id, 'claimed', managerId, { status: lead?.status || 'contacted' });
  return { claimed: result.changes > 0, lead };
}

export function addLeadEvent(leadId: string, type: string, managerId?: string, payload: any = {}) {
  getDb().prepare('INSERT INTO lead_events (lead_id,type,manager_id,payload) VALUES (?,?,?,?)').run(leadId, type, managerId || null, JSON.stringify(payload));
}

export function listLeadEvents(leadId: string) {
  return getDb().prepare('SELECT * FROM lead_events WHERE lead_id=? ORDER BY created_at DESC').all(leadId);
}

export function createReferralLink(managerId: string, campaign = '', leadId?: string) {
  const token = crypto.randomBytes(18).toString('base64url');
  getDb().prepare('INSERT INTO referral_links (token,manager_id,lead_id,campaign) VALUES (?,?,?,?)').run(token, managerId, leadId || null, campaign);
  return token;
}

export function getReferralLink(token: string) {
  return getDb().prepare('SELECT * FROM referral_links WHERE token=?').get(token);
}

export function upsertTelegramLead(telegramUserId: string, name: string, username: string, referralToken?: string, metadata: any = {}) {
  const d = getDb();
  const link = referralToken ? getReferralLink(referralToken) as any : null;
  const existing = d.prepare('SELECT * FROM crm_leads WHERE telegram_user_id=?').get(telegramUserId) as any;
  if (link?.lead_id) {
    const linked = d.prepare('SELECT * FROM crm_leads WHERE id=?').get(link.lead_id) as any;
    if (linked) {
      updateLead(linked.id, { name: name || linked.name, manager_id: link.manager_id || linked.manager_id });
      d.prepare('UPDATE crm_leads SET telegram_user_id=?, chat_id=?, updated_at=datetime(\'now\') WHERE id=?').run(telegramUserId, `tg_${telegramUserId}`, linked.id);
      addLeadEvent(linked.id, 'bot_started', link.manager_id, { username, referral_token: referralToken || null });
      return linked.id;
    }
  }
  if (existing) {
    updateLead(existing.id, { name: name || existing.name, manager_id: link?.manager_id || existing.manager_id });
    d.prepare("UPDATE crm_leads SET metadata=?, updated_at=datetime('now') WHERE id=?").run(JSON.stringify({ ...(existing.metadata ? JSON.parse(existing.metadata) : {}), ...metadata, username }), existing.id);
    addLeadEvent(existing.id, 'bot_started', link?.manager_id, { username, referral_token: referralToken || null });
    return existing.id;
  }
  const id = `telegram_${telegramUserId}`;
  d.prepare('INSERT INTO crm_leads (id,name,source,status,manager_id,telegram_user_id,metadata) VALUES (?,?,?,?,?,?,?)').run(id, name || 'Telegram user', 'telegram', 'new', link?.manager_id || null, telegramUserId, JSON.stringify({ username, referral_token: referralToken || null, ...metadata }));
  addLeadEvent(id, 'bot_started', link?.manager_id, { username, referral_token: referralToken || null });
  return id;
}

export function recordLeadUsage(leadId: string, amount = 1) {
  const d = getDb();
  d.prepare('INSERT INTO lead_usage (lead_id,free_listings_used) VALUES (?,?) ON CONFLICT(lead_id) DO UPDATE SET free_listings_used=free_listings_used+excluded.free_listings_used,updated_at=datetime(\'now\')').run(leadId, amount);
  const usage = d.prepare('SELECT * FROM lead_usage WHERE lead_id=?').get(leadId) as any;
  if (usage.free_listings_used >= usage.free_listings_limit) updateLead(leadId, { status: 'trial_exhausted' });
  else updateLead(leadId, { status: 'trial_active' });
  addLeadEvent(leadId, 'free_listing_used', undefined, usage);
  return usage;
}

export function getLeadUsage(leadId: string) {
  return getDb().prepare('SELECT * FROM lead_usage WHERE lead_id=?').get(leadId) || { lead_id: leadId, free_listings_used: 0, free_listings_limit: 3 };
}

export function recordPayment(payment: any) {
  const d = getDb();
  d.prepare(`INSERT INTO crm_payments (id,cryptomus_uuid,order_id,lead_id,manager_id,referral_token,amount,currency,status,payload,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(cryptomus_uuid) DO UPDATE SET status=excluded.status,payload=excluded.payload,updated_at=datetime('now')`)
    .run(payment.id || crypto.randomUUID(), payment.cryptomus_uuid || null, payment.order_id || null, payment.lead_id || null, payment.manager_id || null, payment.referral_token || null, payment.amount || null, payment.currency || null, payment.status || 'pending', JSON.stringify(payment.payload || {}));
}
