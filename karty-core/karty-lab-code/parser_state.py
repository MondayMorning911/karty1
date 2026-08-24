"""Persistent state and retry coordination for the CRM realtor parser."""

from __future__ import annotations

import json
import os
import socket
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

from db import get_connection, init_db


FINAL_URL_STATUSES = {
    "success",
    "permanently_failed",
    "manual_review",
}

WORKER_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize() -> None:
    init_db()


def get_scheduler_state() -> dict[str, Any]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM parser_scheduler_state WHERE id = 1").fetchone()
        return dict(row) if row else {"id": 1, "active": 0, "interval_hours": 6}
    finally:
        conn.close()


def set_scheduler_state(
    active: bool,
    *,
    interval_hours: int = 6,
    last_run_at: str | None = None,
    next_run_at: str | None = None,
) -> dict[str, Any]:
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO parser_scheduler_state (
                id, active, interval_hours, last_run_at, next_run_at, updated_at
            ) VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                active = excluded.active,
                interval_hours = excluded.interval_hours,
                last_run_at = COALESCE(excluded.last_run_at, parser_scheduler_state.last_run_at),
                next_run_at = COALESCE(excluded.next_run_at, parser_scheduler_state.next_run_at),
                updated_at = CURRENT_TIMESTAMP
            """,
            (int(active), interval_hours, last_run_at, next_run_at),
        )
    return get_scheduler_state()


def create_alert(
    task_id: str,
    site: str,
    level: str,
    message: str,
    *,
    category_url: str | None = None,
    error_type: str | None = None,
) -> None:
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO parse_alerts (
                task_id, site, category_url, level, error_type, message
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (task_id, site, category_url, level, error_type, message),
        )


def create_task(task_id: str, mode: str, sites: list[str], total_urls: int = 0) -> dict[str, Any]:
    now = utc_now()
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO parse_tasks (
                task_id, mode, status, sites_json, started_at,
                last_heartbeat, total_urls, created_at, updated_at
            ) VALUES (?, ?, 'running', ?, ?, ?, ?, ?, ?)
            """,
            (task_id, mode, json.dumps(sites, ensure_ascii=False), now, now, total_urls, now, now),
        )
    return get_task(task_id) or {}


def get_task(task_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        return _row(conn.execute("SELECT * FROM parse_tasks WHERE task_id = ?", (task_id,)).fetchone())
    finally:
        conn.close()


def list_unfinished_tasks() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT * FROM parse_tasks
            WHERE status IN ('running', 'in_progress', 'stalled')
            ORDER BY started_at
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_last_resumable_task() -> dict[str, Any] | None:
    """Latest cancelled/failed task that has a saved checkpoint (site/category progress)."""
    conn = get_connection()
    try:
        return _row(
            conn.execute(
                """
                SELECT * FROM parse_tasks
                WHERE status IN ('cancelled', 'failed')
                  AND (current_site != '' OR current_category_url IS NOT NULL)
                ORDER BY completed_at DESC
                LIMIT 1
                """
            ).fetchone()
        )
    finally:
        conn.close()


def list_recent_tasks(limit: int = 20) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM parse_tasks ORDER BY COALESCE(completed_at, updated_at, started_at) DESC LIMIT ?",
            (max(1, min(int(limit), 100)),),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def update_task(task_id: str, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = utc_now()
    columns = ", ".join(f"{name} = ?" for name in fields)
    values = list(fields.values()) + [task_id]
    with transaction() as conn:
        conn.execute(f"UPDATE parse_tasks SET {columns} WHERE task_id = ?", values)


def heartbeat(task_id: str, **fields: Any) -> None:
    fields["last_heartbeat"] = utc_now()
    update_task(task_id, **fields)


def finish_task(task_id: str, status: str, error: str | None = None) -> None:
    update_task(
        task_id,
        status=status,
        last_error=error,
        completed_at=utc_now(),
        last_heartbeat=utc_now(),
    )


def upsert_checkpoint(
    task_id: str,
    site: str,
    category_url: str,
    *,
    page_num: int = 1,
    last_processed_url: str | None = None,
    current_url: str | None = None,
    status: str = "in_progress",
    processed_count: int = 0,
    total_urls: int = 0,
    site_error_pending: bool = False,
    last_error: str | None = None,
) -> None:
    now = utc_now()
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO parse_checkpoints (
                task_id, site, category_url, page_num, last_processed_url,
                current_url, status, processed_count, total_urls,
                site_error_pending, last_error, started_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(task_id, site, category_url) DO UPDATE SET
                page_num = excluded.page_num,
                last_processed_url = excluded.last_processed_url,
                current_url = excluded.current_url,
                status = excluded.status,
                processed_count = excluded.processed_count,
                total_urls = excluded.total_urls,
                site_error_pending = excluded.site_error_pending,
                last_error = excluded.last_error,
                completed_at = CASE
                    WHEN excluded.status = 'completed' THEN excluded.updated_at
                    ELSE parse_checkpoints.completed_at
                END,
                updated_at = excluded.updated_at
            """,
            (
                task_id, site, category_url, page_num, last_processed_url,
                current_url, status, processed_count, total_urls,
                int(site_error_pending), last_error, now, now,
            ),
        )


def get_checkpoint(task_id: str, site: str, category_url: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        return _row(conn.execute(
            """
            SELECT * FROM parse_checkpoints
            WHERE task_id = ? AND site = ? AND category_url = ?
            """,
            (task_id, site, category_url),
        ).fetchone())
    finally:
        conn.close()


def ensure_url(
    task_id: str,
    site: str,
    category_url: str,
    page_num: int,
    url: str,
) -> dict[str, Any]:
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO parse_urls (
                task_id, site, category_url, page_num, url
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(task_id, url) DO NOTHING
            """,
            (task_id, site, category_url, page_num, url),
        )
        row = conn.execute(
            "SELECT * FROM parse_urls WHERE task_id = ? AND url = ?",
            (task_id, url),
        ).fetchone()
    return dict(row)


def get_url(task_id: str, url: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        return _row(conn.execute(
            "SELECT * FROM parse_urls WHERE task_id = ? AND url = ?",
            (task_id, url),
        ).fetchone())
    finally:
        conn.close()


def get_task_url_count(task_id: str) -> int:
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT COUNT(*) AS count FROM parse_urls
            WHERE task_id = ? AND status != 'pending'
            """,
            (task_id,),
        ).fetchone()
        return int(row["count"] if row else 0)
    finally:
        conn.close()


def get_category_url_count(task_id: str, site: str, category_url: str) -> int:
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT COUNT(*) AS count FROM parse_urls
            WHERE task_id = ? AND site = ? AND category_url = ? AND status != 'pending'
            """,
            (task_id, site, category_url),
        ).fetchone()
        return int(row["count"] if row else 0)
    finally:
        conn.close()


def get_final_url_any_task(url: str, site: str | None = None) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        query = """
            SELECT * FROM parse_urls
            WHERE url = ?
              AND status IN ({})
              AND (status != 'success' OR (phone IS NOT NULL AND TRIM(phone) != ''))
        """.format(",".join("?" for _ in FINAL_URL_STATUSES))
        params: list[Any] = [url, *FINAL_URL_STATUSES]
        if site:
            query += " AND site = ?"
            params.append(site)
        query += " ORDER BY processed_at DESC LIMIT 1"
        return _row(conn.execute(query, params).fetchone())
    finally:
        conn.close()


def mark_url_in_progress(task_id: str, url: str) -> None:
    now = utc_now()
    with transaction() as conn:
        conn.execute(
            """
            UPDATE parse_urls
            SET status = 'in_progress',
                attempts = attempts + 1,
                last_attempt_at = ?,
                last_error = NULL,
                error_type = NULL
            WHERE task_id = ? AND url = ?
            """,
            (now, task_id, url),
        )


def mark_url_result(
    task_id: str,
    url: str,
    status: str,
    *,
    phone: str | None = None,
    profile_url: str | None = None,
    listings_count_snapshot: int | None = None,
    last_error: str | None = None,
    error_type: str | None = None,
    requires_manual: bool = False,
) -> None:
    if status == "success" and not str(phone or "").strip():
        raise ValueError("A parser URL cannot be marked success without a phone")
    now = utc_now()
    with transaction() as conn:
        conn.execute(
            """
            UPDATE parse_urls
            SET status = ?, phone = COALESCE(?, phone),
                profile_url = COALESCE(?, profile_url),
                listings_count_snapshot = COALESCE(?, listings_count_snapshot),
                last_error = ?, error_type = ?, next_retry_at = NULL,
                processed_at = ?, requires_manual = ?,
                site_error_pending = ?
            WHERE task_id = ? AND url = ?
            """,
            (
                status, phone, profile_url, listings_count_snapshot,
                last_error, error_type, now, int(requires_manual),
                int(status == "site_error_pending"), task_id, url,
            ),
        )


def enqueue_retry(
    task_id: str,
    url: str,
    *,
    error: str,
    error_type: str,
    next_retry_at: str,
) -> None:
    now = utc_now()
    with transaction() as conn:
        row = conn.execute(
            "SELECT site, category_url, page_num, attempts FROM parse_urls WHERE task_id = ? AND url = ?",
            (task_id, url),
        ).fetchone()
        if row is None:
            raise ValueError(f"Unknown parser URL: {task_id}/{url}")
        conn.execute(
            """
            UPDATE parse_urls
            SET status = 'no_phone_retry', last_error = ?, error_type = ?,
                next_retry_at = ?, last_attempt_at = ?
            WHERE task_id = ? AND url = ?
            """,
            (error, error_type, next_retry_at, now, task_id, url),
        )
        conn.execute(
            """
            INSERT INTO retry_queue (
                task_id, url, site, category_url, page_num, status,
                attempts, last_error, error_type, first_seen_at,
                last_attempt_at, next_retry_at
            ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(task_id, url) DO UPDATE SET
                status = 'queued', attempts = excluded.attempts,
                last_error = excluded.last_error,
                error_type = excluded.error_type,
                last_attempt_at = excluded.last_attempt_at,
                next_retry_at = excluded.next_retry_at,
                site_error_pending = 0,
                claimed_at = NULL,
                worker_id = NULL,
                lease_until = NULL
            """,
            (
                task_id, url, row["site"], row["category_url"], row["page_num"],
                row["attempts"], error, error_type, now, now, next_retry_at,
            ),
        )


def claim_retry(task_id: str | None = None, lease_seconds: int = 300) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    now_text = now.isoformat()
    lease_until = (now + timedelta(seconds=lease_seconds)).isoformat()
    with transaction() as conn:
        expired = conn.execute(
            """
            UPDATE retry_queue
            SET status = 'queued', claimed_at = NULL, worker_id = NULL, lease_until = NULL
            WHERE status = 'processing' AND lease_until IS NOT NULL AND lease_until <= ?
            """,
            (now_text,),
        )
        query = """
            SELECT retry_queue.* FROM retry_queue
            JOIN parse_tasks ON parse_tasks.task_id = retry_queue.task_id
            WHERE retry_queue.status = 'queued'
              AND retry_queue.site_error_pending = 0
              AND retry_queue.next_retry_at IS NOT NULL
              AND retry_queue.next_retry_at <= ?
              AND parse_tasks.status IN ('running', 'in_progress')
              AND NOT EXISTS (
                  SELECT 1 FROM parse_tasks AS active_task
                  WHERE active_task.status IN ('running', 'in_progress')
                    AND active_task.current_site = retry_queue.site
                    AND COALESCE(active_task.current_url, '') != ''
              )
        """
        params: list[Any] = [now_text]
        if task_id:
            query += " AND task_id = ?"
            params.append(task_id)
        query += " ORDER BY next_retry_at LIMIT 1"
        row = conn.execute(query, params).fetchone()
        if row is None:
            return None
        next_attempt = int(row["attempts"] or 0) + 1
        updated = conn.execute(
            """
            UPDATE retry_queue
            SET status = 'processing', attempts = ?, claimed_at = ?,
                worker_id = ?, lease_until = ?
            WHERE task_id = ? AND url = ? AND status = 'queued'
            """,
            (next_attempt, now_text, WORKER_ID, lease_until, row["task_id"], row["url"]),
        )
        if updated.rowcount != 1:
            return None
        conn.execute(
            """
            UPDATE parse_urls
            SET status = 'in_progress', attempts = ?,
                last_attempt_at = ?, last_error = NULL, error_type = NULL
            WHERE task_id = ? AND url = ?
            """,
            (next_attempt, now_text, row["task_id"], row["url"]),
        )
        claimed = conn.execute(
            "SELECT * FROM retry_queue WHERE task_id = ? AND url = ?",
            (row["task_id"], row["url"]),
        ).fetchone()
    return dict(claimed) if claimed else None


def complete_retry(task_id: str, url: str) -> None:
    with transaction() as conn:
        conn.execute(
            """
            UPDATE retry_queue
            SET status = 'completed', last_attempt_at = CURRENT_TIMESTAMP,
                claimed_at = NULL, worker_id = NULL, lease_until = NULL
            WHERE task_id = ? AND url = ?
            """,
            (task_id, url),
        )


def move_retry_to_manual_review(task_id: str, url: str, error: str) -> None:
    now = utc_now()
    with transaction() as conn:
        conn.execute(
            """
            UPDATE retry_queue
            SET status = 'manual_review', last_error = ?,
                older_than_48h = 1, requires_manual = 1,
                next_retry_at = NULL, last_attempt_at = ?,
                claimed_at = NULL, worker_id = NULL, lease_until = NULL
            WHERE task_id = ? AND url = ?
            """,
            (error, now, task_id, url),
        )
        conn.execute(
            """
            UPDATE parse_tasks
            SET manual_review_count = manual_review_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE task_id = ?
            """,
            (task_id,),
        )
        conn.execute(
            """
            UPDATE parse_urls
            SET status = 'manual_review', last_error = ?,
                next_retry_at = NULL, requires_manual = 1,
                processed_at = ?
            WHERE task_id = ? AND url = ?
            """,
            (error, now, task_id, url),
        )


def recover_stale_leases() -> int:
    now = utc_now()
    with transaction() as conn:
        result = conn.execute(
            """
            UPDATE retry_queue
            SET status = 'queued', claimed_at = NULL, worker_id = NULL, lease_until = NULL
            WHERE status = 'processing' AND lease_until IS NOT NULL AND lease_until <= ?
            """,
            (now,),
        )
        return result.rowcount


def mark_stalled_tasks(stale_after_seconds: int = 300) -> int:
    threshold = (datetime.now(timezone.utc) - timedelta(seconds=stale_after_seconds)).isoformat()
    with transaction() as conn:
        result = conn.execute(
            """
            UPDATE parse_tasks
            SET status = 'stalled', updated_at = CURRENT_TIMESTAMP
            WHERE status IN ('running', 'in_progress')
              AND last_heartbeat < ?
            """,
            (threshold,),
        )
        return result.rowcount


def task_report(task_id: str) -> dict[str, Any]:
    conn = get_connection()
    try:
        task = _row(conn.execute("SELECT * FROM parse_tasks WHERE task_id = ?", (task_id,)).fetchone()) or {}
        status_rows = conn.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM parse_urls WHERE task_id = ? GROUP BY status
            """,
            (task_id,),
        ).fetchall()
        retry = conn.execute(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN older_than_48h = 1 THEN 1 ELSE 0 END) AS older_than_48h,
                   SUM(CASE WHEN requires_manual = 1 THEN 1 ELSE 0 END) AS requires_manual
            FROM retry_queue WHERE task_id = ? AND status != 'completed'
            """,
            (task_id,),
        ).fetchone()
        return {
            "task": task,
            "url_statuses": {row["status"]: row["count"] for row in status_rows},
            "retry": dict(retry) if retry else {},
        }
    finally:
        conn.close()
