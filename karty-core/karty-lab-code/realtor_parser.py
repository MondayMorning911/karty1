#!/usr/bin/env python3
"""Persistent realtor parser dispatcher for the CRM runtime."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import re
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

from db import get_connection, get_stats, init_db, upsert_realtor
from parser_config import load_sources
from parser_logger import get_run_logger
import parser_state


LOG_DIR = Path("/root/karty-lab/logs")
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.FileHandler(LOG_DIR / "parser.log"), logging.StreamHandler()],
)
log = logging.getLogger("parser")


SITES = {
    "korter": {
        "class": "parsers.korter_parser.KorterParser",
        "headless": True,
        "cookies": "/root/karty-lab/cookies/korter_ge.json",
    },
    "ssge": {
        "class": "parsers.ssge_parser.SsGeParser",
        "headless": True,
        "cookies": "/root/karty-lab/cookies/ss_ge.json",
    },
    "myhome": {
        "class": "parsers.myhome_parser.MyhomeParser",
        "headless": True,
        "cookies": "/root/karty-lab/cookies/myhome_ge.json",
    },
}

MIN_LISTINGS = 20
SYSTEM_PHONES = {
    "ssge": {"+995322121661"},
}
LISTING_TIMEOUT_SECONDS = 30
LISTING_ATTEMPTS = 3
RETRY_DELAY_SECONDS = (60, 300, 900, 1800, 3600)
THREE_MONTHS_AGO = datetime.now() - timedelta(days=90)
TODAY = datetime.now().date()


def get_site_class(site_name: str):
    dotpath = SITES[site_name]["class"]
    module_path, class_name = dotpath.rsplit(".", 1)
    import importlib

    module = importlib.import_module(module_path)
    return getattr(module, class_name)


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value).strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    if raw.startswith("00"):
        digits = digits[2:]
    if digits.startswith("995") and len(digits) == 12:
        digits = digits[3:]
    if digits.startswith("0") and len(digits) == 10:
        digits = digits[1:]
    # Realtor contacts are Georgian MOBILE numbers (5XXXXXXXX). Landlines
    # (+995 32...) extracted from korter building cards are developer sales-office /
    # platform hotline numbers, not listing authors — reject them.
    if len(digits) == 9 and digits[0] == "5":
        return f"+995{digits}"
    return None


def clean_realtor_name(value: str | None) -> str:
    """Reject SS.ge profile counters accidentally extracted as a name."""
    name = str(value or "").strip()
    if not name or re.fullmatch(r"\d+", name):
        return ""
    if re.match(r"^\d+\s*(объявлен|объявление|листинг|listing|active)", name, re.I):
        return ""
    return name


async def process_listing(parser, url: str, site_name: str, mode: str) -> dict:
    """Extract and persist one realtor candidate outcome."""
    author = await parser.get_listing_author(url)
    listing_date = author.get("listing_date") if author else None

    if mode == "daily" and (not listing_date or listing_date.date() != TODAY):
        return {"status": "out_of_window", "listing_date": listing_date}
    if listing_date and mode == "full" and listing_date < THREE_MONTHS_AGO:
        return {"status": "out_of_window", "listing_date": listing_date}
    if not author or not author.get("phone"):
        try:
            body = (await parser.page.locator("body").inner_text()).lower()
        except Exception:
            body = ""
        if any(marker in body for marker in (
            "телефон скрыт",
            "номер скрыт",
            "только email",
            "только e-mail",
            "только электронная почта",
        )):
            return {
                "status": "no_phone_retry",
                "error": "Phone is hidden or was not exposed after the contact action",
                "error_type": "phone_hidden_or_not_extracted",
            }
        return {"status": "no_phone_retry", "error": "Phone was not extracted", "error_type": "no_phone"}

    phone = normalize_phone(author["phone"])
    if not phone:
        log.warning(
            "Phone validation failed: raw=%r site=%s url=%s",
            author["phone"], site_name, url,
        )
        # A wrongly formatted number will not change on retry — fail permanently.
        return {"status": "permanently_failed", "error": "Phone format is invalid", "error_type": "invalid_phone"}
    if phone in SYSTEM_PHONES.get(site_name, set()):
        return {
            "status": "no_phone_retry",
            "error": "The extracted number belongs to the platform, not the listing author",
            "error_type": "system_phone_excluded",
        }

    profile_url = author.get("profile_url", "") or ""
    if not profile_url:
        return {
            "status": "manual_review",
            "phone": phone,
            "profile_url": profile_url,
            "error": "Author profile is missing, so listing count cannot be verified",
            "error_type": "profile_missing",
            "requires_manual": True,
        }
    profile_cache = getattr(parser, "_profile_cache", {})
    if profile_url in profile_cache:
        profile_info = profile_cache[profile_url]
    else:
        profile_info = await parser.get_author_profile(profile_url) if profile_url else None
        if profile_info:
            profile_cache[profile_url] = profile_info

    if not profile_info:
        return {
            "status": "no_phone_retry",
            "phone": phone,
            "profile_url": profile_url,
            "error": "Author profile could not be loaded, so listing count cannot be verified",
            "error_type": "profile_error",
        }

    listings_count = int(profile_info.get("listings_count", 0) or 0)
    if listings_count < MIN_LISTINGS:
        return {
            "status": "success",
            "phone": phone,
            "profile_url": profile_url,
            "listings_count_snapshot": listings_count,
            "filtered_min_listings": True,
        }

    conn = get_connection()
    existing = conn.execute("SELECT phone FROM realtors WHERE phone = ?", (phone,)).fetchone()
    conn.close()
    author_name = clean_realtor_name(author.get("name"))
    profile_name = clean_realtor_name(profile_info.get("name"))
    inserted = upsert_realtor(
        phone=phone,
        name=author_name or profile_name or "Unknown",
        source=site_name,
        listing_url=url,
        profile_url=profile_url,
        listings_count=listings_count,
        verified=bool(existing),
    )
    return {
        "status": "success",
        "phone": phone,
        "profile_url": profile_url,
        "listings_count_snapshot": listings_count,
        "new_realtor": inserted,
    }


def page_url(category_url: str, page_num: int, sort_param: str | None = None) -> str:
    parsed = urllib.parse.urlsplit(category_url)
    query = [(key, value) for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True) if key != "page"]
    if sort_param:
        sort_key, _, sort_value = sort_param.partition("=")
        if sort_key and not any(key == sort_key for key, _ in query):
            query.append((sort_key, sort_value))
    query.append(("page", str(page_num)))
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query), parsed.fragment))


async def collect_page(parser, site_name: str) -> list[dict]:
    if site_name == "korter":
        return await parser.page.evaluate("""() => {
            const state = window.INITIAL_STATE;
            if (!state) throw new Error('window.INITIAL_STATE is missing');
            if (!state?.apartmentListingStore?.apartments) return [];
            return state.apartmentListingStore.apartments.map(item => ({
                url: 'https://korter.ge' + item.link,
                date: item.actualizeTime || ''
            }));
        }""")
    return await parser.page.evaluate("""() => [...new Set([...document.querySelectorAll('a')]
        .map(link => link.href)
        .filter(href => href.includes('home.ss.ge') && /\\d{4,}$/.test(href) && !href.includes('create')))]
        .map(url => ({url, date: ''}))""")


def retry_at(attempt: int) -> str:
    delay = RETRY_DELAY_SECONDS[min(max(attempt - 1, 0), len(RETRY_DELAY_SECONDS) - 1)]
    return (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()


async def process_persistent_listing(
    parser,
    task_id: str,
    site_name: str,
    category_url: str,
    page_num: int,
    url: str,
    mode: str,
    run_log: logging.Logger,
) -> dict:
    existing = parser_state.get_url(task_id, url)
    if not existing:
        existing = parser_state.get_final_url_any_task(url, site_name)
        if existing:
            parser_state.ensure_url(task_id, site_name, category_url, page_num, url)
            parser_state.mark_url_result(
                task_id,
                url,
                existing["status"],
                phone=existing.get("phone"),
                profile_url=existing.get("profile_url"),
                listings_count_snapshot=existing.get("listings_count_snapshot"),
                last_error=existing.get("last_error"),
                error_type=existing.get("error_type"),
                requires_manual=bool(existing.get("requires_manual")),
            )
    if (
        existing
        and existing.get("status") in parser_state.FINAL_URL_STATUSES
        and (existing.get("status") != "success" or str(existing.get("phone") or "").strip())
    ):
        return {"status": existing["status"], "already_done": True}

    parser_state.ensure_url(task_id, site_name, category_url, page_num, url)
    for attempt in range(1, LISTING_ATTEMPTS + 1):
        parser_state.mark_url_in_progress(task_id, url)
        try:
            outcome = await asyncio.wait_for(
                process_listing(parser, url, site_name, mode),
                timeout=LISTING_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            outcome = {"status": "no_phone_retry", "error": "listing_timeout", "error_type": "timeout"}
        except asyncio.CancelledError:
            outcome = {"status": "no_phone_retry", "error": "listing_cancelled", "error_type": "cancelled"}
        except Exception as exc:
            outcome = {"status": "no_phone_retry", "error": str(exc), "error_type": "parser_error"}

        status = outcome.get("status")
        if status == "out_of_window":
            return outcome
        if status == "success":
            parser_state.mark_url_result(
                task_id,
                url,
                "success",
                phone=outcome.get("phone"),
                profile_url=outcome.get("profile_url"),
                listings_count_snapshot=outcome.get("listings_count_snapshot"),
            )
            return outcome
        if status == "no_phone_by_design":
            parser_state.mark_url_result(task_id, url, status)
            return outcome
        if status == "manual_review":
            parser_state.mark_url_result(
                task_id,
                url,
                status,
                phone=outcome.get("phone"),
                profile_url=outcome.get("profile_url"),
                last_error=outcome.get("error"),
                error_type=outcome.get("error_type"),
                requires_manual=True,
            )
            return outcome
        if status == "permanently_failed":
            parser_state.mark_url_result(
                task_id,
                url,
                status,
                last_error=outcome.get("error"),
                error_type=outcome.get("error_type"),
            )
            return outcome

        run_log.warning(
            "retry_attempt=%s error=%s type=%s",
            attempt,
            outcome.get("error"),
            outcome.get("error_type"),
        )
        if attempt < LISTING_ATTEMPTS:
            await asyncio.sleep(2 * attempt)
            continue
        parser_state.enqueue_retry(
            task_id,
            url,
            error=outcome.get("error", "temporary listing error"),
            error_type=outcome.get("error_type", "temporary"),
            next_retry_at=retry_at(attempt),
        )
        return outcome
    return {"status": "no_phone_retry", "error": "retry loop exhausted"}


async def parse_category(
    site_name: str,
    category_url: str,
    mode: str = "daily",
    task_id: str | None = None,
    cancel_event=None,
    progress_callback=None,
) -> dict:
    """Parse ONE category with its own browser instance for parallel execution."""
    sources = load_sources()
    if site_name not in sources:
        log.error("Site %s is not configured for this run", site_name)
        return {"found": 0, "processed": 0, "errors": 0, "status": "error", "error": "site_not_configured"}
    if site_name not in SITES:
        log.error("Site %s has no parser class", site_name)
        return {"found": 0, "processed": 0, "errors": 0, "status": "error", "error": "no_parser_class"}

    config = SITES[site_name]
    parser_class = get_site_class(site_name)
    run_log = get_run_logger(task_id or "cat-standalone")
    sort_param = sources[site_name].get("sort_param")
    smoke_pages = int(os.getenv("PARSER_SMOKE_MAX_PAGES", "0"))

    checkpoint = parser_state.get_checkpoint(task_id, site_name, category_url) if task_id else None
    if checkpoint and checkpoint.get("status") == "completed":
        return {"found": 0, "processed": 0, "errors": 0, "status": "skipped"}

    start_page = int(checkpoint.get("page_num", 1)) if checkpoint else 1
    profile_cache: dict[str, dict] = {}
    # The scheduler aggregates each category result; this counter must be local
    # to the category rather than seeded from the task-wide total.
    total_found = 0
    processed = parser_state.get_category_url_count(task_id, site_name, category_url) if task_id else 0
    errors = 0

    parser = parser_class()
    parser._profile_cache = profile_cache
    try:
        if task_id:
            parser_state.heartbeat(task_id, current_site=site_name)
        await parser.launch(config.get("cookies"), headless=config.get("headless", True))
        page_num = start_page
        page_failures = 0
        while True:
            if cancel_event and cancel_event.is_set():
                break
            current_page_url = page_url(category_url, page_num, sort_param)
            if task_id:
                parser_state.upsert_checkpoint(
                    task_id,
                    site_name,
                    category_url,
                    page_num=page_num,
                    current_url=current_page_url,
                )
            try:
                await parser.page.goto(current_page_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(1)
                collected = await collect_page(parser, site_name)
                page_failures = 0
            except Exception as exc:
                log.exception("%s page failed: %s", current_page_url, exc)
                page_failures += 1
                errors += 1
                if page_failures < 3:
                    log.warning("Retrying %s page after failure (%s/2)", current_page_url, page_failures)
                    try:
                        await parser.relaunch(config.get("cookies"), headless=config.get("headless", True))
                    except Exception:
                        log.exception("Browser relaunch failed for %s", current_page_url)
                    await asyncio.sleep(2 * page_failures)
                    continue
                if task_id:
                    parser_state.upsert_checkpoint(
                        task_id,
                        site_name,
                        category_url,
                        page_num=page_num,
                        current_url=current_page_url,
                        status="site_error_pending",
                        site_error_pending=True,
                        last_error=str(exc),
                    )
                    parser_state.create_alert(
                        task_id,
                        site_name,
                        "site_error",
                        str(exc),
                        category_url=category_url,
                        error_type="category_page_error",
                    )
                break

            if not collected:
                if task_id:
                    parser_state.upsert_checkpoint(
                        task_id, site_name, category_url,
                        page_num=page_num, status="completed",
                    )
                break

            stop_category = False
            for item in collected:
                if cancel_event and cancel_event.is_set():
                    stop_category = True
                    break
                url = item.get("url")
                if not url:
                    continue
                if item.get("date") and mode == "full":
                    try:
                        listing_date = datetime.fromisoformat(item["date"].replace("Z", "+00:00")).replace(tzinfo=None)
                        if listing_date < THREE_MONTHS_AGO:
                            stop_category = True
                            break
                    except (TypeError, ValueError):
                        pass

                processed += 1
                if progress_callback:
                    progress_callback(
                        processed=processed,
                        current_url=url,
                        current_date=item.get("date", "") or "",
                        pages_done=page_num,
                        found=total_found,
                    )
                if task_id:
                    parser_state.heartbeat(
                        task_id,
                        current_site=site_name,
                        current_category_url=category_url,
                        current_page=page_num,
                        current_url=url,
                        processed_count=parser_state.get_task_url_count(task_id),
                    )
                try:
                    outcome = await process_persistent_listing(
                        parser, task_id, site_name, category_url, page_num, url, mode, run_log,
                    )
                except Exception as exc:
                    errors += 1
                    run_log.warning("site=%s category=%s page=%s url=%s result=error error=%s", site_name, category_url, page_num, url, exc)
                    continue
                if outcome.get("new_realtor"):
                    total_found += 1
                    if progress_callback:
                        progress_callback(found=total_found)
                if outcome.get("status") in ("parser_error", "timeout"):
                    errors += 1
                if task_id:
                    parser_state.heartbeat(
                        task_id,
                        current_site=site_name,
                        current_category_url=category_url,
                        current_page=page_num,
                        current_url=url,
                        processed_count=parser_state.get_task_url_count(task_id),
                        total_urls=parser_state.get_task_url_count(task_id),
                        realtors_found=total_found,
                    )
                run_log.info(
                    "site=%s category=%s page=%s url=%s result=%s",
                    site_name, category_url, page_num, url, outcome.get("status", "unknown"),
                )
                if outcome.get("status") == "out_of_window":
                    stop_category = True
                    break

            if task_id:
                parser_state.upsert_checkpoint(
                    task_id,
                    site_name,
                    category_url,
                    page_num=page_num,
                    last_processed_url=collected[-1].get("url"),
                    processed_count=processed,
                    status="completed" if stop_category else "in_progress",
                )
            if stop_category:
                break
            if smoke_pages > 0 and page_num - start_page + 1 >= smoke_pages:
                break
            page_num += 1
            await asyncio.sleep(random.uniform(1, 2))
    except Exception as exc:
        log.exception("%s category failed: %s", category_url, exc)
        errors += 1
        if task_id:
            parser_state.upsert_checkpoint(
                task_id,
                site_name,
                category_url,
                status="site_error_pending",
                site_error_pending=True,
                last_error=str(exc),
            )
            parser_state.create_alert(
                task_id,
                site_name,
                "site_error",
                str(exc),
                category_url=category_url,
                error_type="category_error",
            )
    finally:
        await parser.close()
        if task_id:
            parser_state.heartbeat(task_id, current_site="", current_url="")

    return {"found": total_found, "processed": processed, "errors": errors, "status": "completed"}


async def parse_site(site_name: str, mode: str = "daily", task_id: str | None = None, cancel_event=None):
    """Parse configured categories with persistent checkpoints."""
    sources = load_sources()
    if site_name not in sources:
        log.error("Site %s is not configured for this run", site_name)
        return 0
    if site_name not in SITES:
        log.error("Site %s has no parser class", site_name)
        return 0

    config = SITES[site_name]
    parser_class = get_site_class(site_name)
    run_log = get_run_logger(task_id or "standalone")
    stored_task = parser_state.get_task(task_id) if task_id else None
    total_found = int((stored_task or {}).get("realtors_found", 0) or 0)
    processed = parser_state.get_task_url_count(task_id) if task_id else 0
    categories = sources[site_name]["urls"]
    sort_param = sources[site_name].get("sort_param")
    smoke_categories = int(os.getenv("PARSER_SMOKE_CATEGORIES", "0"))
    smoke_pages = int(os.getenv("PARSER_SMOKE_MAX_PAGES", "0"))
    if smoke_categories > 0:
        categories = categories[:smoke_categories]

    profile_cache: dict[str, dict] = {}
    for category_url in categories:
        if cancel_event and cancel_event.is_set():
            break
        checkpoint = parser_state.get_checkpoint(task_id, site_name, category_url) if task_id else None
        if checkpoint and checkpoint.get("status") == "completed":
            continue

        start_page = int(checkpoint.get("page_num", 1)) if checkpoint else 1
        parser = parser_class()
        parser._profile_cache = profile_cache
        try:
            if task_id:
                parser_state.heartbeat(task_id, current_site=site_name)
            await parser.launch(config.get("cookies"), headless=config.get("headless", True))
            page_num = start_page
            page_failures = 0
            while True:
                if cancel_event and cancel_event.is_set():
                    break
                current_page_url = page_url(category_url, page_num, sort_param)
                if task_id:
                    parser_state.upsert_checkpoint(
                        task_id,
                        site_name,
                        category_url,
                        page_num=page_num,
                        current_url=current_page_url,
                    )
                try:
                    await parser.page.goto(current_page_url, wait_until="domcontentloaded", timeout=30000)
                    await asyncio.sleep(1)
                    collected = await collect_page(parser, site_name)
                    page_failures = 0
                except Exception as exc:
                    log.exception("%s page failed: %s", current_page_url, exc)
                    page_failures += 1
                    if page_failures < 3:
                        log.warning("Retrying %s page after failure (%s/2)", current_page_url, page_failures)
                        try:
                            await parser.relaunch(config.get("cookies"), headless=config.get("headless", True))
                        except Exception:
                            log.exception("Browser relaunch failed for %s", current_page_url)
                        await asyncio.sleep(2 * page_failures)
                        continue
                    if task_id:
                        parser_state.upsert_checkpoint(
                            task_id,
                            site_name,
                            category_url,
                            page_num=page_num,
                            current_url=current_page_url,
                            status="site_error_pending",
                            site_error_pending=True,
                            last_error=str(exc),
                        )
                        parser_state.create_alert(
                            task_id,
                            site_name,
                            "site_error",
                            str(exc),
                            category_url=category_url,
                            error_type="category_page_error",
                        )
                    break

                if not collected:
                    if task_id:
                        parser_state.upsert_checkpoint(
                            task_id, site_name, category_url,
                            page_num=page_num, status="completed",
                        )
                    break

                stop_category = False
                for item in collected:
                    if cancel_event and cancel_event.is_set():
                        stop_category = True
                        break
                    url = item.get("url")
                    if not url:
                        continue
                    if item.get("date") and mode == "full":
                        try:
                            listing_date = datetime.fromisoformat(item["date"].replace("Z", "+00:00")).replace(tzinfo=None)
                            if listing_date < THREE_MONTHS_AGO:
                                stop_category = True
                                break
                        except (TypeError, ValueError):
                            pass

                    processed += 1
                    if task_id:
                        parser_state.heartbeat(
                            task_id,
                            current_site=site_name,
                            current_category_url=category_url,
                            current_page=page_num,
                            current_url=url,
                            processed_count=processed,
                        )
                    outcome = await process_persistent_listing(
                        parser,
                        task_id,
                        site_name,
                        category_url,
                        page_num,
                        url,
                        mode,
                        run_log,
                    )
                    if outcome.get("new_realtor"):
                        total_found += 1
                    if task_id:
                        parser_state.heartbeat(
                            task_id,
                            current_site=site_name,
                            current_category_url=category_url,
                            current_page=page_num,
                            current_url=url,
                            processed_count=processed,
                            total_urls=processed,
                            realtors_found=total_found,
                        )
                    if outcome.get("filtered_min_listings") and task_id:
                        task = parser_state.get_task(task_id) or {}
                        parser_state.update_task(
                            task_id,
                            filtered_min_listings=int(task.get("filtered_min_listings", 0)) + 1,
                        )
                    if outcome.get("status") == "no_phone_by_design" and task_id:
                        task = parser_state.get_task(task_id) or {}
                        parser_state.update_task(
                            task_id,
                            no_phone_by_design_count=int(task.get("no_phone_by_design_count", 0)) + 1,
                        )
                    run_log.info(
                        "site=%s category=%s page=%s url=%s result=%s",
                        site_name,
                        category_url,
                        page_num,
                        url,
                        outcome.get("status", "unknown"),
                    )
                    if outcome.get("status") == "out_of_window":
                        stop_category = True
                        break

                if task_id:
                    parser_state.upsert_checkpoint(
                        task_id,
                        site_name,
                        category_url,
                        page_num=page_num,
                        last_processed_url=collected[-1].get("url"),
                        processed_count=processed,
                        status="completed" if stop_category else "in_progress",
                    )
                if stop_category:
                    break
                if smoke_pages > 0 and page_num - start_page + 1 >= smoke_pages:
                    break
                page_num += 1
                await asyncio.sleep(random.uniform(1, 2))
        except Exception as exc:
            log.exception("%s category failed: %s", category_url, exc)
            if task_id:
                parser_state.upsert_checkpoint(
                    task_id,
                    site_name,
                    category_url,
                    status="site_error_pending",
                    site_error_pending=True,
                    last_error=str(exc),
                )
                parser_state.create_alert(
                    task_id,
                    site_name,
                    "site_error",
                    str(exc),
                    category_url=category_url,
                    error_type="category_error",
                )
        finally:
            await parser.close()
            if task_id:
                parser_state.heartbeat(task_id, current_site="", current_url="")

    if task_id:
        parser_state.update_task(
            task_id,
            processed_count=processed,
            total_urls=processed,
            realtors_found=total_found,
            current_site=site_name,
        )
    return total_found


async def run_sites(mode: str, sites: list[str], task_id: str | None = None, cancel_event=None):
    results = await asyncio.gather(
        *[parse_site(s, mode=mode, task_id=task_id, cancel_event=cancel_event) for s in sites],
        return_exceptions=True,
    )
    total = 0
    for site_name, result in zip(sites, results):
        if isinstance(result, Exception):
            log.exception("Fatal site error for %s: %s", site_name, result)
        else:
            total += result
    return total


async def run_full(task_id: str | None = None):
    return await run_sites("full", ["korter", "ssge"], task_id)


async def run_daily(task_id: str | None = None):
    return await run_sites("daily", ["korter", "ssge"], task_id)


async def run_with_retry_worker(mode: str, sites: list[str], task_id: str):
    from retry_worker import RetryWorker, SiteParserProcessor

    processor = SiteParserProcessor()
    worker = RetryWorker(processor, task_id=task_id)
    worker_task = asyncio.create_task(worker.serve_forever())
    try:
        return await run_sites(mode, sites, task_id)
    finally:
        worker.stop()
        try:
            await asyncio.wait_for(worker_task, timeout=10)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            worker_task.cancel()
        await processor.close()


def show_stats():
    init_db()
    stats = get_stats()
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Persistent realtor parser")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--daily", action="store_true")
    parser.add_argument("--stats", action="store_true")
    parser.add_argument("--site", choices=("korter", "ssge"))
    args = parser.parse_args()

    init_db()
    if args.stats:
        show_stats()
    else:
        selected_sites = [args.site] if args.site else ["korter", "ssge"]
        mode = "full" if args.full or not args.daily else "daily"
        task_id = f"cli-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        parser_state.create_task(task_id, mode, selected_sites)
        try:
            count = asyncio.run(run_with_retry_worker(mode, selected_sites, task_id))
            parser_state.finish_task(task_id, "completed")
            log.info("Parser completed: %s new realtors", count)
        except Exception as exc:
            parser_state.finish_task(task_id, "failed", str(exc))
            raise
