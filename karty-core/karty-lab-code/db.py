"""SQLite database for realtors."""
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/root/karty-lab/realtors.db")


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS realtors (
            phone TEXT PRIMARY KEY,
            name TEXT,
            source TEXT,
            listing_url TEXT,
            profile_url TEXT,
            listings_count INTEGER DEFAULT 0,
            parsed_at TEXT,
            verified INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL UNIQUE,
            chat_title TEXT DEFAULT '',
            chat_type TEXT DEFAULT 'group',
            last_checked_id INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            added_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            username TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            name TEXT DEFAULT '',
            message_count INTEGER DEFAULT 0,
            source_chat TEXT DEFAULT '',
            first_seen TEXT,
            last_seen TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT NOT NULL UNIQUE,
            session_string TEXT,
            user_id TEXT DEFAULT '',
            username TEXT DEFAULT '',
            display_name TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_messages (
            chat_id TEXT NOT NULL,
            message_id INTEGER NOT NULL,
            sender_id TEXT,
            is_listing INTEGER NOT NULL DEFAULT 0,
            listing_url TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (chat_id, message_id)
        )
    """)
    existing_columns = {row[1] for row in conn.execute("PRAGMA table_info(telegram_chats)")}
    for name, definition in {
        "chat_link": "TEXT DEFAULT ''",
        "join_status": "TEXT DEFAULT 'pending'",
        "joined_at": "TEXT",
    }.items():
        if name not in existing_columns:
            conn.execute(f"ALTER TABLE telegram_chats ADD COLUMN {name} {definition}")
    existing_columns = {row[1] for row in conn.execute("PRAGMA table_info(telegram_users)")}
    for name, definition in {
        "listing_count": "INTEGER NOT NULL DEFAULT 0",
        "listing_urls": "TEXT DEFAULT '[]'",
        "listing_samples": "TEXT DEFAULT '[]'",
        "lead_id": "TEXT DEFAULT ''",
    }.items():
        if name not in existing_columns:
            conn.execute(f"ALTER TABLE telegram_users ADD COLUMN {name} {definition}")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parse_tasks (
            task_id TEXT PRIMARY KEY,
            mode TEXT NOT NULL CHECK (mode IN ('full', 'daily')),
            status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
                'running', 'in_progress', 'completed', 'failed', 'cancelled', 'stalled'
            )),
            sites_json TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            last_heartbeat TEXT NOT NULL,
            current_site TEXT,
            current_category_url TEXT,
            current_page INTEGER NOT NULL DEFAULT 1,
            current_url TEXT,
            processed_count INTEGER NOT NULL DEFAULT 0,
            total_urls INTEGER NOT NULL DEFAULT 0,
            realtors_found INTEGER NOT NULL DEFAULT 0,
            filtered_min_listings INTEGER NOT NULL DEFAULT 0,
            no_phone_by_design_count INTEGER NOT NULL DEFAULT 0,
            manual_review_count INTEGER NOT NULL DEFAULT 0,
            site_error_pending INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parse_checkpoints (
            task_id TEXT NOT NULL,
            site TEXT NOT NULL,
            category_url TEXT NOT NULL,
            page_num INTEGER NOT NULL DEFAULT 1,
            last_processed_url TEXT,
            current_url TEXT,
            status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN (
                'pending', 'in_progress', 'completed', 'site_error_pending'
            )),
            processed_count INTEGER NOT NULL DEFAULT 0,
            total_urls INTEGER NOT NULL DEFAULT 0,
            site_error_pending INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            started_at TEXT,
            completed_at TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (task_id, site, category_url),
            FOREIGN KEY (task_id) REFERENCES parse_tasks(task_id) ON DELETE CASCADE
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parse_urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            site TEXT NOT NULL,
            category_url TEXT NOT NULL,
            page_num INTEGER NOT NULL DEFAULT 1,
            url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                'pending', 'in_progress', 'success', 'no_phone_by_design',
                'no_phone_retry', 'permanently_failed', 'site_error_pending',
                'manual_review'
            )),
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            error_type TEXT,
            next_retry_at TEXT,
            phone TEXT,
            profile_url TEXT,
            listings_count_snapshot INTEGER,
            first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_attempt_at TEXT,
            processed_at TEXT,
            requires_manual INTEGER NOT NULL DEFAULT 0,
            site_error_pending INTEGER NOT NULL DEFAULT 0,
            UNIQUE (task_id, url),
            FOREIGN KEY (task_id) REFERENCES parse_tasks(task_id) ON DELETE CASCADE
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS retry_queue (
            task_id TEXT NOT NULL,
            url TEXT NOT NULL,
            site TEXT NOT NULL,
            category_url TEXT NOT NULL,
            page_num INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
                'queued', 'processing', 'completed', 'manual_review'
            )),
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            error_type TEXT,
            first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_attempt_at TEXT,
            next_retry_at TEXT,
            older_than_48h INTEGER NOT NULL DEFAULT 0,
            requires_manual INTEGER NOT NULL DEFAULT 0,
            site_error_pending INTEGER NOT NULL DEFAULT 0,
            claimed_at TEXT,
            worker_id TEXT,
            lease_until TEXT,
            PRIMARY KEY (task_id, url),
            FOREIGN KEY (task_id) REFERENCES parse_tasks(task_id) ON DELETE CASCADE
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parser_scheduler_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active INTEGER NOT NULL DEFAULT 0,
            interval_hours INTEGER NOT NULL DEFAULT 6,
            last_run_at TEXT,
            next_run_at TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        INSERT INTO parser_scheduler_state (id, active, interval_hours)
        VALUES (1, 0, 6)
        ON CONFLICT(id) DO NOTHING
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parse_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            site TEXT NOT NULL,
            category_url TEXT,
            level TEXT NOT NULL CHECK (level IN ('site_error', 'manual_review')),
            error_type TEXT,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (task_id) REFERENCES parse_tasks(task_id) ON DELETE CASCADE
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS auth_status_cache (
            user_id TEXT NOT NULL,
            site TEXT NOT NULL,
            status TEXT NOT NULL,
            error TEXT,
            checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT NOT NULL,
            PRIMARY KEY (user_id, site)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_cache_user_site ON auth_status_cache(user_id, site, expires_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_tasks_status ON parse_tasks(status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_tasks_heartbeat ON parse_tasks(status, last_heartbeat)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_checkpoints_resume ON parse_checkpoints(task_id, status, site, page_num)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_urls_task_status ON parse_urls(task_id, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_urls_retry ON parse_urls(status, next_retry_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_urls_site_category ON parse_urls(task_id, site, category_url)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_urls_manual ON parse_urls(requires_manual, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_retry_queue_ready ON retry_queue(status, site_error_pending, next_retry_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_retry_queue_manual ON retry_queue(status, older_than_48h, requires_manual)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_retry_queue_site ON retry_queue(task_id, site, category_url)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parse_alerts_task ON parse_alerts(task_id, resolved, created_at)")
    conn.commit()
    conn.close()


def upsert_realtor(phone: str, name: str, source: str, listing_url: str,
                    profile_url: str, listings_count: int, verified: bool = False) -> bool:
    conn = get_connection()
    now = datetime.now().isoformat()
    inserted = conn.execute("""
        INSERT INTO realtors (phone, name, source, listing_url, profile_url, listings_count, parsed_at, verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(phone) DO NOTHING
    """, (phone, name, source, listing_url, profile_url, listings_count, now, int(verified))).rowcount == 1
    if not inserted:
        conn.execute("""
            UPDATE realtors SET
            name = ?,
            source = ?,
            listing_url = ?,
            profile_url = ?,
            listings_count = ?,
            parsed_at = ?,
            verified = ?
            WHERE phone = ?
        """, (name, source, listing_url, profile_url, listings_count, now, int(verified), phone))
    conn.commit()
    conn.close()
    return inserted


def get_realtors_by_source(source: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM realtors WHERE source = ?", (source,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_realtors() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM realtors ORDER BY listings_count DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_stats() -> dict:
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) FROM realtors").fetchone()[0]
    by_source = conn.execute("SELECT source, COUNT(*) as count FROM realtors GROUP BY source").fetchall()
    conn.close()
    return {"total": total, "by_source": {r["source"]: r["count"] for r in by_source}}


if __name__ == "__main__":
    init_db()
    print("Database initialized")
    print(f"Stats: {get_stats()}")
