"""SQLite database for realtors."""
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/root/karty-lab/realtors.db")


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
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
    conn.commit()
    conn.close()


def upsert_realtor(phone: str, name: str, source: str, listing_url: str,
                    profile_url: str, listings_count: int, verified: bool = False):
    conn = get_connection()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO realtors (phone, name, source, listing_url, profile_url, listings_count, parsed_at, verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
            name = excluded.name,
            source = excluded.source,
            listing_url = excluded.listing_url,
            profile_url = excluded.profile_url,
            listings_count = excluded.listings_count,
            parsed_at = excluded.parsed_at,
            verified = excluded.verified
    """, (phone, name, source, listing_url, profile_url, listings_count, now, int(verified)))
    conn.commit()
    conn.close()


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
