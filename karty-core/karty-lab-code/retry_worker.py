"""Background worker for retrying individual listing URLs."""

from __future__ import annotations

import asyncio
import inspect
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

import parser_state


RETRY_DELAYS_SECONDS = (60, 300, 900, 1800, 3600)
POLL_INTERVAL_SECONDS = 30
RETRY_ITEM_THROTTLE_SECONDS = 0.25
MANUAL_REVIEW_AFTER_SECONDS = 48 * 60 * 60

Processor = Callable[[dict[str, Any]], Awaitable[dict[str, Any]] | dict[str, Any]]


def next_retry_at(attempts: int, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    delay = RETRY_DELAYS_SECONDS[min(max(attempts - 1, 0), len(RETRY_DELAYS_SECONDS) - 1)]
    return (now + timedelta(seconds=delay)).isoformat()


class RetryWorker:
    """Claims queued listing retries using leased SQLite rows.

    The processor is injected by the dispatcher. It must use a per-site
    parser context owned by this worker, not the main dispatcher context.
    """

    def __init__(self, processor: Processor, logger: logging.Logger | None = None, task_id: str | None = None):
        self.processor = processor
        self.log = logger or logging.getLogger("parser.retry")
        self.task_id = task_id
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def run_once(self) -> bool:
        item = parser_state.claim_retry(self.task_id)
        if not item:
            return False

        task_id = item["task_id"]
        url = item["url"]
        try:
            result = self.processor(item)
            if inspect.isawaitable(result):
                result = await result
            await self._handle_result(item, result or {})
        except Exception as exc:
            self.log.exception("Retry processor crashed for %s: %s", url, exc)
            await self._reschedule(item, str(exc), "worker_exception")
        return True

    async def _handle_result(self, item: dict[str, Any], result: dict[str, Any]) -> None:
        task_id = item["task_id"]
        url = item["url"]
        status = result.get("status", "retry")

        if status == "success":
            parser_state.mark_url_result(
                task_id,
                url,
                "success",
                phone=result.get("phone"),
                profile_url=result.get("profile_url"),
                listings_count_snapshot=result.get("listings_count_snapshot"),
            )
            parser_state.complete_retry(task_id, url)
            return

        if status == "no_phone_by_design":
            parser_state.mark_url_result(task_id, url, status)
            parser_state.complete_retry(task_id, url)
            return

        if status == "permanently_failed":
            parser_state.mark_url_result(
                task_id,
                url,
                status,
                last_error=result.get("error"),
                error_type=result.get("error_type"),
            )
            parser_state.complete_retry(task_id, url)
            return

        attempts = int(item.get("attempts", 0))
        first_seen = item.get("first_seen_at") or ""
        if first_seen and self._older_than_manual_review(first_seen):
            parser_state.move_retry_to_manual_review(
                task_id,
                url,
                result.get("error", "Retry exceeded 48 hours"),
            )
            return

        await self._reschedule(
            item,
            result.get("error", "Temporary parser error"),
            result.get("error_type", "temporary"),
            attempts=attempts,
        )

    async def _reschedule(
        self,
        item: dict[str, Any],
        error: str,
        error_type: str,
        attempts: int | None = None,
    ) -> None:
        attempts = attempts if attempts is not None else int(item.get("attempts", 0))
        parser_state.enqueue_retry(
            item["task_id"],
            item["url"],
            error=error,
            error_type=error_type,
            next_retry_at=next_retry_at(max(attempts, 1)),
        )

    @staticmethod
    def _older_than_manual_review(first_seen: str) -> bool:
        try:
            value = datetime.fromisoformat(first_seen.replace("Z", "+00:00"))
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - value).total_seconds() >= MANUAL_REVIEW_AFTER_SECONDS
        except (TypeError, ValueError):
            return False

    async def serve_forever(self) -> None:
        parser_state.recover_stale_leases()
        while not self._stop.is_set():
            processed = await self.run_once()
            if not processed:
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=POLL_INTERVAL_SECONDS)
                except asyncio.TimeoutError:
                    pass
            else:
                # Yield to the shared event loop between retries: synchronous
                # SQLite transactions otherwise starve uvicorn under load.
                await asyncio.sleep(RETRY_ITEM_THROTTLE_SECONDS)


class SiteParserProcessor:
    """Own one isolated BaseParser instance per configured retry site."""

    def __init__(self):
        self.parsers: dict[str, Any] = {}

    async def _get_parser(self, site: str):
        if site in self.parsers and self.parsers[site].page and not self.parsers[site].page.is_closed():
            return self.parsers[site]
        from realtor_parser import SITES, get_site_class

        if site not in SITES:
            raise ValueError(f"Retry site is not configured: {site}")
        parser = get_site_class(site)()
        await parser.launch(SITES[site].get("cookies"), headless=SITES[site].get("headless", True))
        self.parsers[site] = parser
        return parser

    async def __call__(self, item: dict[str, Any]) -> dict[str, Any]:
        from realtor_parser import process_listing

        parser = await self._get_parser(item["site"])
        try:
            return await asyncio.wait_for(
                process_listing(parser, item["url"], item["site"], "full"),
                timeout=30,
            )
        except Exception:
            try:
                await parser.close()
            finally:
                self.parsers.pop(item["site"], None)
            raise

    async def close(self) -> None:
        for parser in list(self.parsers.values()):
            try:
                await parser.close()
            except Exception:
                pass
        self.parsers.clear()
