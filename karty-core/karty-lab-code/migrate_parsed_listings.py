"""One-time migration of the legacy parsed_listings.json tracker to SQLite."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import parser_state


LEGACY_PATH = Path("/root/karty-lab/parsed_listings.json")


def main() -> None:
    parser_state.initialize()
    if not LEGACY_PATH.exists():
        print("No parsed_listings.json found")
        return

    data = json.loads(LEGACY_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("parsed_listings.json must contain an object")

    task_id = f"legacy-migration-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    parser_state.create_task(task_id, "full", ["korter", "ssge"], len(data))
    conn = parser_state.get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        for url, processed_at in data.items():
            site = "ssge" if "ss.ge" in url else "korter"
            conn.execute(
                """
                INSERT INTO parse_urls (
                    task_id, site, category_url, page_num, url, status,
                    first_seen_at, processed_at
                ) VALUES (?, ?, '', 1, ?, 'success', ?, ?)
                ON CONFLICT(task_id, url) DO NOTHING
                """,
                (task_id, site, url, processed_at or datetime.now(timezone.utc).isoformat(), processed_at),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    parser_state.finish_task(task_id, "completed")
    print(f"Migrated {len(data)} URLs into task {task_id}")


if __name__ == "__main__":
    main()
