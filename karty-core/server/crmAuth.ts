import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = path.join(process.cwd(), 'crm.db');

let db: Database.Database;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS managers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        login TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'manager',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS crm_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        login TEXT NOT NULL,
        role TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    // Seed default admin if not exists
    const admin = db.prepare('SELECT id FROM managers WHERE login = ?').get('admin');
    if (!admin) {
      const hash = hashPassword('admin123');
      db.prepare('INSERT INTO managers (id, name, login, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), 'Администратор', 'admin', hash, 'admin'
      );
      console.log('[crmAuth] Default admin created: admin / admin123');
    }
  }
  return db;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('scrypt$')) {
    const [, salt, expected] = stored.split('$');
    const actual = crypto.scryptSync(password, salt, 32).toString('hex');
    return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  }
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  return legacy === stored;
}

export interface CrmUser {
  id: string;
  name: string;
  login: string;
  role: 'admin' | 'manager';
}

export function crmLogin(login: string, password: string): CrmUser | null {
  const d = getDb();
  const row = d.prepare('SELECT id, name, login, password_hash, role, active FROM managers WHERE login = ?').get(login) as any;
  if (!row || !row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  if (!row.password_hash.startsWith('scrypt$')) {
    d.prepare('UPDATE managers SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.id);
  }
  return { id: row.id, name: row.name, login: row.login, role: row.role };
}

export function saveCrmSession(token: string, user: CrmUser, expiresAt: number) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  getDb().prepare(`INSERT OR REPLACE INTO crm_sessions (token_hash,user_id,name,login,role,expires_at) VALUES (?,?,?,?,?,?)`)
    .run(tokenHash, user.id, user.name, user.login, user.role, expiresAt);
}

export function loadCrmSession(token: string): { userId: string; name: string; login: string; role: string; expiresAt: number } | null {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = getDb().prepare('SELECT user_id,name,login,role,expires_at FROM crm_sessions WHERE token_hash=?').get(tokenHash) as any;
  if (!row) return null;
  if (Date.now() >= Number(row.expires_at)) {
    getDb().prepare('DELETE FROM crm_sessions WHERE token_hash=?').run(tokenHash);
    return null;
  }
  return { userId: row.user_id, name: row.name, login: row.login, role: row.role, expiresAt: Number(row.expires_at) };
}

export function deleteCrmSession(token: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  getDb().prepare('DELETE FROM crm_sessions WHERE token_hash=?').run(tokenHash);
}

export function listManagers(): CrmUser[] {
  const d = getDb();
  return d.prepare('SELECT id, name, login, role FROM managers WHERE active = 1 ORDER BY created_at').all() as CrmUser[];
}

export function addManager(name: string, login: string, password: string, role: 'admin' | 'manager' = 'manager'): CrmUser {
  const d = getDb();
  const id = crypto.randomUUID();
  const hash = hashPassword(password);
  d.prepare('INSERT INTO managers (id, name, login, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, name, login, hash, role);
  return { id, name, login, role };
}

export function deleteManager(id: string): boolean {
  const d = getDb();
  const result = d.prepare('UPDATE managers SET active = 0 WHERE id = ? AND role != ?').run(id, 'admin');
  return result.changes > 0;
}
