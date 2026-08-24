"""RAM-aware category-level parallel scheduler for the realtor parser.

Instead of running one browser per site (sequential categories), each
CATEGORY gets its own browser task.  A Semaphore + RAM monitor gates
concurrency so we don't OOM the server.

Usage::

    scheduler = CategoryScheduler(task_id, mode="daily")
    total = await scheduler.run(cancel_event=evt)

"""

from __future__ import annotations

import asyncio
import logging
import random
from pathlib import Path
from typing import Any

from parser_config import load_sources
import parser_state
from parser_state import (
    create_alert,
    heartbeat,
    upsert_checkpoint,
)
from realtor_parser import parse_category  # created separately

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LOG_DIR = Path("/root/karty-lab/logs")
LOG_DIR.mkdir(exist_ok=True)

log = logging.getLogger("parser.scheduler")

# Minimum free RAM (MB) before we refuse to spawn another browser.
RAM_CRITICAL_MB = 400

# Seconds to sleep when RAM is critically low before re-checking.
RAM_WAIT_SECONDS = 10

# ---------------------------------------------------------------------------
# RAM helpers
# ---------------------------------------------------------------------------


def get_available_ram_mb() -> int:
    """Return available RAM in MB by reading /proc/meminfo.

    Falls back to a conservative estimate if the file is unreadable.
    """
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("MemAvailable:"):
                    # Format: "MemAvailable:   12345678 kB"
                    parts = line.split()
                    if len(parts) >= 2:
                        return int(parts[1]) // 1024
    except (OSError, ValueError):
        pass
    # Fallback: report a low value so the scheduler is cautious.
    return 0


def should_wait_for_ram(limit_mb: int) -> bool:
    """Return True if spawning another browser would likely exceed *limit_mb*."""
    free = get_available_ram_mb()
    return free < RAM_CRITICAL_MB


# ---------------------------------------------------------------------------
# Category progress tracker (in-memory mirror of parser_state checkpoints)
# ---------------------------------------------------------------------------


class _CategoryProgress:
    """Per-category stats kept in memory and merged on demand."""

    __slots__ = (
        "site",
        "category_url",
        "status",
        "processed",
        "found",
        "current_url",
        "pages_done",
        "current_date",
        "error",
    )

    def __init__(self, site: str, category_url: str) -> None:
        self.site = site
        self.category_url = category_url
        self.status: str = "pending"
        self.processed: int = 0
        self.found: int = 0
        self.current_url: str = ""
        self.pages_done: int = 0
        self.current_date: str = ""
        self.error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "processed": self.processed,
            "found": self.found,
            "current_url": self.current_url,
            "pages_done": self.pages_done,
            "current_date": self.current_date,
            "error": self.error,
        }

    def update(self, **values: Any) -> None:
        for name, value in values.items():
            if hasattr(self, name):
                setattr(self, name, value)


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------


class CategoryScheduler:
    """Orchestrate parallel category-level parsing across sites.

    Parameters
    ----------
    task_id:
        The persistent task identifier (from ``parser_state.create_task``).
    mode:
        ``"full"`` or ``"daily"`` — forwarded to the per-category parser.
    max_concurrent:
        Hard upper bound on simultaneous category tasks.
    ram_limit_mb:
        Total RAM budget in MB.  The scheduler will try to keep estimated
        combined browser usage below this value.
    """

    def __init__(
        self,
        task_id: str,
        *,
        mode: str = "daily",
        max_concurrent: int = 4,
        max_per_site: int = 2,
        skip_categories: set[str] | None = None,
        ram_limit_mb: int = 3000,
    ) -> None:
        self.task_id = task_id
        self.mode = mode
        self.max_concurrent = max_concurrent
        self.max_per_site = max_per_site
        self.skip_categories = skip_categories or set()
        self.ram_limit_mb = ram_limit_mb

        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._running: dict[str, asyncio.Task[None]] = {}
        self._progress: dict[tuple[str, str], _CategoryProgress] = {}
        self._cancel_event: asyncio.Event | None = None

        # Aggregate counters (updated under the lock below).
        self._lock = asyncio.Lock()
        self._total_found: int = 0
        self._completed: int = 0
        self._failed: int = 0
        self._total_categories: int = 0

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def get_category_progress(self, task_id: str) -> dict[str, dict[str, dict[str, Any]]]:
        """Return nested ``{site: {url: stats}}`` dict for the frontend."""
        result: dict[str, dict[str, dict[str, Any]]] = {}
        for (site, url), prog in self._progress.items():
            result.setdefault(site, {})[url] = prog.as_dict()
        return result

    # ------------------------------------------------------------------
    # Internal: build and shuffle the work list
    # ------------------------------------------------------------------

    def _build_work_list(self) -> list[tuple[str, str]]:
        """Load sources and return a flat shuffled list of (site, url)."""
        sources = load_sources()
        items: list[tuple[str, str]] = []
        for site_name, cfg in sources.items():
            for url in cfg.get("urls", []):
                if url in self.skip_categories:
                    log.info("[%s] Skipping one-time excluded category: %s", site_name, url)
                    continue
                items.append((site_name, url))
        random.shuffle(items)
        return items

    # ------------------------------------------------------------------
    # Internal: RAM gating
    # ------------------------------------------------------------------

    async def _wait_for_capacity(self) -> None:
        """Block until a semaphore slot is free AND RAM is available."""
        await self._semaphore.acquire()

        # Now that we have a slot, make sure we have enough RAM.
        attempts = 0
        while should_wait_for_ram(self.ram_limit_mb):
            if self._cancel_event and self._cancel_event.is_set():
                self._semaphore.release()
                return
            attempts += 1
            if attempts == 1:
                log.warning(
                    "[%s] Low RAM — waiting before spawning (available=%dMB)",
                    self.task_id,
                    get_available_ram_mb(),
                )
            await asyncio.sleep(RAM_WAIT_SECONDS)

        if attempts > 0:
            log.info(
                "[%s] RAM recovered — available=%dMB",
                self.task_id,
                get_available_ram_mb(),
            )

    def _release_slot(self) -> None:
        """Release a concurrency slot back to the pool."""
        self._semaphore.release()

    # ------------------------------------------------------------------
    # Internal: single-category worker
    # ------------------------------------------------------------------

    async def _run_category(
        self,
        site_name: str,
        category_url: str,
    ) -> None:
        """Parse one category URL in its own browser instance."""
        key = (site_name, category_url)
        tag = f"[{site_name}][{category_url}]"
        progress = self._progress[key]
        progress.status = "running"

        # Register the checkpoint so the UI can see the category.
        upsert_checkpoint(
            self.task_id,
            site_name,
            category_url,
            status="in_progress",
        )

        log.info("%s spawn (ram=%dMB)", tag, get_available_ram_mb())
        heartbeat(self.task_id, current_site=site_name, current_category_url=category_url)

        try:
            # parse_category handles exactly one (site, url) with its own browser.
            result = await parse_category(
                site_name,
                category_url,
                mode=self.mode,
                task_id=self.task_id,
                cancel_event=self._cancel_event,
                progress_callback=progress.update,
            )
            found = result.get("found", 0) if isinstance(result, dict) else int(result)
            async with self._lock:
                self._total_found += found
                self._completed += 1
            progress.status = "completed"
            progress.found = found
            progress.processed = result.get("processed", 0) if isinstance(result, dict) else 0
            log.info("%s completed — found=%d", tag, found)
        except asyncio.CancelledError:
            progress.status = "cancelled"
            log.warning("%s cancelled", tag)
            raise
        except Exception as exc:
            async with self._lock:
                self._failed += 1
            progress.status = "failed"
            progress.error = str(exc)
            log.exception("%s failed: %s", tag, exc)
            create_alert(
                self.task_id,
                site_name,
                "error",
                str(exc),
                category_url=category_url,
                error_type="category_scheduler_error",
            )
            upsert_checkpoint(
                self.task_id,
                site_name,
                category_url,
                status="site_error_pending",
                site_error_pending=True,
                last_error=str(exc),
            )
        finally:
            heartbeat(self.task_id, current_site="", current_category_url="", current_url="")
            self._release_slot()

    # ------------------------------------------------------------------
    # Internal: dispatcher loop
    # ------------------------------------------------------------------

    async def _dispatch_loop(self, work: list[tuple[str, str]]) -> None:
        """Pick categories off *work* and spawn them when capacity opens."""
        pending: list[tuple[str, str]] = list(work)
        running_tasks: list[asyncio.Task[None]] = []

        while pending or running_tasks:
            if self._cancel_event and self._cancel_event.is_set():
                break

            # Launch as many as the semaphore allows.
            while pending:
                active_by_site = {
                    site: sum(1 for running_site, _ in self._running if running_site == site)
                    for site, _ in self._running
                }
                candidate_index = next(
                    (
                        index for index, (candidate_site, _) in enumerate(pending)
                        if active_by_site.get(candidate_site, 0) < self._site_limit(candidate_site, pending)
                    ),
                    None,
                )
                if candidate_index is None:
                    break
                site_name, category_url = pending[candidate_index]
                key = (site_name, category_url)

                # Skip if already running (idempotent after resume).
                if key in self._running:
                    pending.pop(0)
                    continue

                # Check RAM cheaply before acquiring the semaphore.
                if get_available_ram_mb() < RAM_CRITICAL_MB:
                    log.debug(
                        "[%s] RAM below threshold (%dMB) — pausing dispatch",
                        self.task_id,
                        get_available_ram_mb(),
                    )
                    break

                # Non-blocking check: if semaphore is full, stop trying.
                if self._semaphore.locked():
                    break

                pending.pop(candidate_index)

                await self._wait_for_capacity()

                if self._cancel_event and self._cancel_event.is_set():
                    break

                task = asyncio.create_task(
                    self._run_category(site_name, category_url),
                    name=f"cat-{site_name}-{category_url[:40]}",
                )
                self._running[key] = task
                running_tasks.append(task)

            # Reap finished tasks.
            still_running: list[asyncio.Task[None]] = []
            for task in running_tasks:
                if task.done():
                    # Clean up the tracker entry for this task.
                    done_key = next(
                        (k for k, v in self._running.items() if v is task),
                        None,
                    )
                    if done_key is not None:
                        del self._running[done_key]
                else:
                    still_running.append(task)
            running_tasks = still_running

            # Always yield — pending work may be blocked by RAM/semaphore/site
            # limits; spinning here would starve the shared event loop.
            await asyncio.sleep(0.5)

    def _site_limit(self, site_name: str, pending: list[tuple[str, str]]) -> int:
        """Keep a 2/2 split while both sites have work, then use free slots."""
        other_pending = any(site != site_name for site, _ in pending)
        other_running = any(site != site_name for site, _ in self._running)
        if not other_pending and not other_running:
            return self.max_concurrent
        return self.max_per_site

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run(self, cancel_event: asyncio.Event | None = None) -> int:
        """Run all categories and return total new realtors found.

        Parameters
        ----------
        cancel_event:
            When set, the scheduler stops spawning new categories and
            waits for running ones to finish.
        """
        self._cancel_event = cancel_event

        work = self._build_work_list()
        self._total_categories = len(work)

        # Initialise progress tracker for every category.
        for site_name, url in work:
            self._progress[(site_name, url)] = _CategoryProgress(site_name, url)

        log.info(
            "[%s] Starting category scheduler — %d categories, "
            "max_concurrent=%d, ram_limit=%dMB, available=%dMB",
            self.task_id,
            self._total_categories,
            self.max_concurrent,
            self.ram_limit_mb,
            get_available_ram_mb(),
        )

        heartbeat(
            self.task_id,
            total_urls=self._total_categories,
        )

        try:
            await self._dispatch_loop(work)
        except asyncio.CancelledError:
            log.warning("[%s] Scheduler cancelled — waiting for running tasks", self.task_id)
            # Let running tasks finish naturally via their cancel checks.

        # Wait briefly for any straggler tasks.
        for task in list(self._running.values()):
            if not task.done():
                try:
                    await asyncio.wait_for(asyncio.shield(task), timeout=30)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass

        log.info(
            "[%s] Scheduler finished — completed=%d, failed=%d, found=%d",
            self.task_id,
            self._completed,
            self._failed,
            self._total_found,
        )

        return self._total_found

    async def summary(self) -> dict[str, Any]:
        """Return a snapshot of the scheduler state."""
        # The worker updates SQLite heartbeats while it parses a category.
        # Merge those checkpoints so the UI shows live processed/current values,
        # not only the final result after the browser closes.
        for (site, url), progress in self._progress.items():
            checkpoint = parser_state.get_checkpoint(self.task_id, site, url)
            if not checkpoint:
                continue
            progress.processed = max(progress.processed, int(checkpoint.get("processed_count") or 0))
            progress.pages_done = max(progress.pages_done, int(checkpoint.get("page_num") or 1))
            progress.current_url = checkpoint.get("current_url") or progress.current_url
            progress.error = checkpoint.get("last_error") or progress.error
            if progress.status == "pending":
                progress.status = checkpoint.get("status", "pending")

        return {
            "task_id": self.task_id,
            "mode": self.mode,
            "total_categories": self._total_categories,
            "completed": self._completed,
            "failed": self._failed,
            "running": len(self._running),
            "total_found": self._total_found,
            "available_ram_mb": get_available_ram_mb(),
            "categories": self.get_category_progress(self.task_id),
        }
