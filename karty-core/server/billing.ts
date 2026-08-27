import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'crm.db');
let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS billing_plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        interval TEXT NOT NULL DEFAULT 'month',
        duration_months INTEGER NOT NULL DEFAULT 1,
        features_json TEXT DEFAULT '{}',
        active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        is_agency INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        provider TEXT DEFAULT 'tribute',
        provider_payment_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        started_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS usage_counters (
        user_id TEXT PRIMARY KEY,
        listings_used INTEGER DEFAULT 0,
        presentations_used INTEGER DEFAULT 0,
        period_started_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS billing_payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_id TEXT,
        amount_cents INTEGER NOT NULL,
        currency TEXT DEFAULT 'USD',
        provider TEXT DEFAULT 'tribute',
        provider_payment_id TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_billing_payments_user ON billing_payments(user_id);
    `);
    seedDefaultPlans();
  }
  return db;
}

function seedDefaultPlans(): void {
  const d = getDbRaw();
  const existing = d.prepare('SELECT COUNT(*) as c FROM billing_plans').get() as any;
  if (existing.c > 0) return;
  const plans = [
    { id: 'monthly', name: 'Monthly', price: 5500, months: 1, interval: 'month', sort: 1 },
    { id: 'quarterly', name: '3 Months', price: 14900, months: 3, interval: 'quarter', sort: 2 },
    { id: 'halfyear', name: '6 Months', price: 28900, months: 6, interval: 'halfyear', sort: 3 },
    { id: 'yearly', name: 'Yearly', price: 53000, months: 12, interval: 'year', sort: 4 },
    { id: 'agency', name: 'Agency Plan', price: 19900, months: 1, interval: 'month', sort: 5, agency: 1 },
  ];
  const stmt = d.prepare('INSERT OR IGNORE INTO billing_plans (id, name, price_cents, currency, interval, duration_months, sort_order, is_agency) VALUES (?,?,?,?,?,\'USD\',?,?,?)');
  for (const p of plans) stmt.run(p.id, p.name, p.price, p.interval, p.months, p.sort, p.agency || 0);
}

function getDbRaw(): Database.Database {
  if (!db) getDb();
  return db!;
}

export interface BillingPlan {
  id: string; name: string; price_cents: number; currency: string;
  interval: string; duration_months: number; active: number; sort_order: number; is_agency: number;
  price_display: string;
}

export function listPlans(activeOnly = true): BillingPlan[] {
  const d = getDb();
  const rows = d.prepare(`SELECT * FROM billing_plans ${activeOnly ? 'WHERE active=1' : ''} ORDER BY sort_order`).all() as any[];
  return rows.map(r => ({ ...r, price_display: `$${(r.price_cents / 100).toFixed(2)}` }));
}

export function getPlan(id: string): BillingPlan | null {
  const d = getDb();
  const row = d.prepare('SELECT * FROM billing_plans WHERE id=?').get(id) as any;
  return row ? { ...row, price_display: `$${(row.price_cents / 100).toFixed(2)}` } : null;
}

export function updatePlanPrice(id: string, priceCents: number): void {
  getDb().prepare('UPDATE billing_plans SET price_cents=? WHERE id=?').run(priceCents, id);
}

export function updatePlan(id: string, fields: Record<string, any>): void {
  const d = getDb();
  const entries = Object.entries(fields).filter(([k]) => ['name', 'price_cents', 'active', 'sort_order', 'is_agency', 'features_json'].includes(k));
  if (!entries.length) return;
  d.prepare(`UPDATE billing_plans SET ${entries.map(([k]) => `${k}=?`).join(', ')} WHERE id=?`).run(...entries.map(([, v]) => v), id);
}

export interface UserSubscription {
  user_id: string; plan_id: string; status: string; started_at: string; expires_at: string;
  plan_name?: string;
}

export function getActiveSubscription(userId: string): UserSubscription | null {
  const d = getDb();
  const row = d.prepare(`
    SELECT s.*, p.name as plan_name FROM user_subscriptions s
    LEFT JOIN billing_plans p ON s.plan_id = p.id
    WHERE s.user_id=? AND s.status='active' AND s.expires_at > datetime('now')
    ORDER BY s.expires_at DESC LIMIT 1
  `).get(userId) as any;
  return row ? { user_id: row.user_id, plan_id: row.plan_id, status: row.status, started_at: row.started_at, expires_at: row.expires_at, plan_name: row.plan_name } : null;
}

export function activateSubscription(userId: string, planId: string, paymentId?: string): UserSubscription {
  const d = getDb();
  const plan = getPlan(planId);
  if (!plan) throw new Error('Plan not found');
  const now = new Date();
  const expires = new Date(now.getTime() + plan.duration_months * 30 * 24 * 60 * 60 * 1000);
  const id = crypto.randomUUID();
  d.prepare(`INSERT INTO user_subscriptions (id, user_id, plan_id, provider, provider_payment_id, status, started_at, expires_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, planId, 'tribute', paymentId || null, 'active', now.toISOString(), expires.toISOString());
  // Deactivate previous subscriptions
  d.prepare('UPDATE user_subscriptions SET status=? WHERE user_id=? AND id!=?').run('cancelled', userId, id);
  return { user_id: userId, plan_id: planId, status: 'active', started_at: now.toISOString(), expires_at: expires.toISOString() };
}

export interface UsageInfo {
  listings_used: number; listings_limit: number;
  presentations_used: number; presentations_limit: number;
  has_subscription: boolean; plan_name?: string; expires_at?: string;
}

export function getUsageInfo(userId: string): UsageInfo {
  const d = getDb();
  const sub = getActiveSubscription(userId);
  if (sub) {
    return { listings_used: 0, listings_limit: -1, presentations_used: 0, presentations_limit: -1, has_subscription: true, plan_name: sub.plan_name, expires_at: sub.expires_at };
  }
  const row = d.prepare('SELECT * FROM usage_counters WHERE user_id=?').get(userId) as any;
  const listings = row?.listings_used || 0;
  const presentations = row?.presentations_used || 0;
  return { listings_used: listings, listings_limit: 3, presentations_used: presentations, presentations_limit: 1, has_subscription: false };
}

export function incrementListingUsage(userId: string): void {
  const d = getDb();
  d.prepare(`INSERT INTO usage_counters (user_id, listings_used) VALUES (?, 1)
    ON CONFLICT(user_id) DO UPDATE SET listings_used = listings_used + 1`).run(userId);
}

export function incrementPresentationUsage(userId: string): void {
  const d = getDb();
  d.prepare(`INSERT INTO usage_counters (user_id, presentations_used) VALUES (?, 1)
    ON CONFLICT(user_id) DO UPDATE SET presentations_used = presentations_used + 1`).run(userId);
}

export function canPublish(userId: string): { ok: boolean; reason?: string } {
  const usage = getUsageInfo(userId);
  if (usage.has_subscription) return { ok: true };
  if (usage.listings_used < usage.listings_limit) return { ok: true };
  return { ok: false, reason: `Бесплатный лимит исчерпан (${usage.listings_used}/${usage.listings_limit} публикаций). Оформите подписку для безлимита.` };
}

export function canCreatePresentation(userId: string): { ok: boolean; reason?: string } {
  const usage = getUsageInfo(userId);
  if (usage.has_subscription) return { ok: true };
  if (usage.presentations_used < usage.presentations_limit) return { ok: true };
  return { ok: false, reason: `Бесплатный лимит исчерпан (${usage.presentations_used}/${usage.presentations_limit} презентаций). Оформите подписку для безлимита.` };
}

export function recordPayment(userId: string, planId: string, amountCents: number, providerPaymentId: string): any {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare(`INSERT INTO billing_payments (id, user_id, plan_id, amount_cents, provider, provider_payment_id, status)
    VALUES (?,?,?,?,?,?,?)`).run(id, userId, planId, amountCents, 'tribute', providerPaymentId, 'completed');
  return { id };
}

export function listPayments(limit = 50): any[] {
  const d = getDb();
  return d.prepare(`SELECT p.*, pl.name as plan_name FROM billing_payments p
    LEFT JOIN billing_plans pl ON p.plan_id = pl.id
    ORDER BY p.created_at DESC LIMIT ?`).all(limit) as any[];
}
