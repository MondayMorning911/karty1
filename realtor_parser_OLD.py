#!/usr/bin/env python3
"""
Realtor Parser — Парсинг объявлений на Georgian property sites.
Находит риэлторов (>10 объявлений) и сохраняет в SQLite.

Режимы:
  --full      Полный парсинг (все объявления)
  --daily     Ежедневный парсинг (только новые)
  --stats     Статистика базы

Запуск:
  xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 realtor_parser.py --full
  xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 realtor_parser.py --daily
  python3 realtor_parser.py --stats
"""
import asyncio
import argparse
import json
import random
import re
import logging
from datetime import datetime, timedelta
from pathlib import Path

from db import init_db, upsert_realtor, get_stats, get_connection

# Setup logging
LOG_DIR = Path("/root/karty-lab/logs")
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "parser.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("parser")

# Site configs
SITES = {
    "korter": {
        "class": "parsers.korter_parser.KorterParser",
        "headless": True,
        "cookies": "/root/karty-lab/cookies/korter_ge.json",
        "categories": [
            "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
            "https://korter.ge/ru/%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
            "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8",
            "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
            "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%B4%D0%BE%D0%BC%D0%BE%D0%B2-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8?sort=update_time_desc",
            "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%B4%D0%BE%D0%BC%D0%BE%D0%B2-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8",
            "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%BF%D0%BE%D1%81%D1%83%D1%82%D0%BE%D1%87%D0%BD%D0%BE-%D1%82%D0%B1%D0%B8%D0%BB%D0%B8%D1%81%D0%B8",
            "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80-%D0%BF%D0%BE%D1%81%D1%83%D1%82%D0%BE%D1%87%D0%BD%D0%BE-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8?sort=update_time_desc",
            "https://korter.ge/ru/%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%B0-%D0%B4%D0%BE%D0%BC%D0%BE%D0%B2-%D0%BF%D0%BE%D1%81%D1%83%D1%82%D0%BE%D1%87%D0%BD%D0%BE-%D0%B1%D0%B0%D1%82%D1%83%D0%BC%D0%B8",
        ],
    },
    "myhome": {
        "class": "parsers.myhome_parser.MyhomeParser",
        "headless": False,
        "cookies": "/root/karty-lab/cookies/myhome_ge.json",
        "categories": [
            # Тбилиси — продажа
            "https://www.myhome.ge/ru/nedvizhimost/?deal_types=1&CardView=1",
            # Тбилиси — аренда
            "https://www.myhome.ge/ru/nedvizhimost/?deal_types=2&CardView=1",
            # Тбилиси — посуточно
            "https://www.myhome.ge/ru/nedvizhimost/?deal_types=4&CardView=1",
            # Батуми — продажа
            "https://www.myhome.ge/ru/nedvizhimost/?deal_types=1&CardView=1&city_id=2",
            # Батуми — аренда
            "https://www.myhome.ge/ru/nedvizhimost/?deal_types=2&CardView=1&city_id=2",
            # Батуми — посуточно
            "https://www.myhome.ge/ru/nedvizhimost/?deal_types=4&CardView=1&city_id=2",
        ],
    },
    "ssge": {
        "class": "parsers.ssge_parser.SsGeParser",
        "headless": False,
        "cookies": "/root/karty-lab/cookies/ss_ge.json",
        "categories": [
            "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&order=1",
            "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0?currencyId=1&order=1",
            "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0--%D0%B7%D0%B0-%D0%B4%D0%B5%D0%BD%D1%8C?currencyId=1&order=1",
            "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%94%D0%BE%D0%BC/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&order=1",
            "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%94%D0%BE%D0%BC/%D0%90%D1%80%D0%B5%D0%BD%D0%B4%D0%B0?currencyId=1&order=1",
            "https://home.ss.ge/ru/%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/l/%D0%97%D0%B5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9-%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BE%D0%BA/%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B5%D1%82%D1%81%D1%8F?currencyId=1&advancedSearch=%7B%22landType%22%3Anull%7D&order=1",
        ],
    },
}

PARSED_FILE = Path("/root/karty-lab/parsed_listings.json")


def load_parsed() -> dict:
    """Load set of already parsed listing URLs."""
    if PARSED_FILE.exists():
        with open(PARSED_FILE) as f:
            return json.load(f)
    return {}


def save_parsed(parsed: dict):
    """Save parsed listings tracker."""
    with open(PARSED_FILE, "w") as f:
        json.dump(parsed, f, ensure_ascii=False)


def get_site_class(site_name: str):
    """Import and return site parser class."""
    dotpath = SITES[site_name]["class"]
    module_path, class_name = dotpath.rsplit(".", 1)
    import importlib
    mod = importlib.import_module(module_path)
    return getattr(mod, class_name)


async def parse_site(site_name: str, mode: str = "daily", max_listings: int = 100,
                     cancel_event=None, task_id=None, parse_tasks=None):
    """Parse a single site and find realtors."""
    config = SITES[site_name]
    parser_class = get_site_class(site_name)
    parser = parser_class()
    
    log.info(f"Starting {site_name} parser ({mode} mode)")
    
    try:
        # Bypass proxy for Georgian real estate sites
        import os
        for var in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
            os.environ.pop(var, None)

        await parser.launch(config.get("cookies"), headless=config["headless"])

        # Collect listing URLs from categories
        # Both korter and ss.ge use date cutoff (3 months)
        cutoff_months = 3
        max_kw = "max_per_city" if site_name == "myhome" else "max_per_category"
        extra = {"daily": mode == "daily"} if site_name == "myhome" else {}
        # High limit - date cutoff stops collection, not page limit
        per_category = 10000

        collected = await parser.collect_listing_urls(
            **{max_kw: per_category, "cutoff_months": cutoff_months,
               "task_id": task_id, "parse_tasks": parse_tasks, **extra}
        )

        # collected is list of {url, date} dicts
        if collected and isinstance(collected[0], dict):
            url_list = [item['url'] for item in collected]
        else:
            url_list = collected  # fallback for myhome which still returns plain list

        log.info(f"{site_name}: Found {len(url_list)} listing URLs (cutoff: {cutoff_months} months)")

        # Filter already parsed (ONLY in daily mode)
        parsed = load_parsed()
        if mode == "daily":
            cutoff = (datetime.now() - timedelta(hours=24)).isoformat()
            new_urls = [u for u in url_list if u not in parsed]
            fresh_urls = [u for u in new_urls if parsed.get(u, '') < cutoff or u not in parsed]
            log.info(f"{site_name}: {len(fresh_urls)} fresh URLs (skipped {len(url_list) - len(fresh_urls)} already parsed)")
            url_list = fresh_urls
        else:
            log.info(f"{site_name}: Full mode — processing ALL {len(url_list)} URLs (ignoring parsed history)")

        # Update progress tracking
        if task_id and parse_tasks and task_id in parse_tasks:
            parse_tasks[task_id]["total_urls"] = len(url_list[:max_listings])

        # Process listings
        realtors_found = 0

        for i, url in enumerate(url_list[:max_listings]):
            # Check cancel signal
            if cancel_event and cancel_event.is_set():
                log.info(f"{site_name}: Cancelled by user")
                raise Exception("cancelled")

            if i % 10 == 0:
                log.info(f"{site_name}: Processing {i+1}/{min(len(url_list), max_listings)}...")

            # Update progress tracking
            if task_id and parse_tasks and task_id in parse_tasks:
                parse_tasks[task_id]["current_url"] = url
                parse_tasks[task_id]["processed_count"] = i

            try:
                author = await parser.get_listing_author(url)

                # Mark as parsed immediately (crash recovery)
                parsed[url] = datetime.now().isoformat()
                save_parsed(parsed)

                # Date-based stopping for daily mode: stop at yesterday's date
                if mode == "daily" and author and author.get("listing_date"):
                    listing_date_str = author.get("listing_date", "")
                    try:
                        # Try parsing various date formats
                        if "T" in listing_date_str:
                            listing_date = datetime.fromisoformat(listing_date_str.replace('Z', '+00:00')).date()
                        elif "-" in listing_date_str:
                            listing_date = datetime.strptime(listing_date_str, "%Y-%m-%d").date()
                        else:
                            # Try Russian date format like "12 июля 2026"
                            months = {"января":1, "февраля":2, "марта":3, "апреля":4, "мая":5, "июня":6,
                                      "июля":7, "августа":8, "сентября":9, "октября":10, "ноября":11, "декабря":12}
                            parts = listing_date_str.split()
                            if len(parts) == 3:
                                day = int(parts[0])
                                month = months.get(parts[1], 0)
                                year = int(parts[2])
                                listing_date = datetime(year, month, day).date()

                        if listing_date <= yesterday:
                            log.info(f"{site_name}: Reached yesterday's listing ({listing_date_str}), stopping daily parse")
                            break
                    except Exception as e:
                        log.debug(f"{site_name}: Could not parse date '{listing_date_str}': {e}")
                
                if author and author.get("phone"):
                    phone = author["phone"]
                    name = parser.clean_name(author.get("name", ""))
                    profile = author.get("profile_url", "")

                    # Get actual listing count — myhome returns it directly from listing data
                    actual_count = author.get("statements_count", 0) or author.get("listings_count", 0)

                    # For other sites, get count from profile page
                    if not actual_count and profile:
                        try:
                            prof = await parser.get_author_profile(profile)
                            if prof:
                                actual_count = prof.get("listings_count", 0)
                                if prof.get("name") and not name:
                                    name = prof["name"]
                        except:
                            pass

                    # Only save if >= 15 listings
                    if actual_count < 15:
                        continue

                    # Check if already in DB — by phone OR by name+source
                    conn = get_connection()
                    existing = conn.execute(
                        "SELECT phone, listings_count FROM realtors WHERE phone=? OR (name=? AND source=?)",
                        (phone, name, site_name)
                    ).fetchone()
                    conn.close()
                    
                    if not existing:
                        upsert_realtor(
                            phone=phone,
                            name=name or "Unknown",
                            source=site_name,
                            listing_url=url,
                            profile_url=profile or "",
                            listings_count=actual_count,
                            verified=True,
                        )
                        realtors_found += 1
                        log.info(f"  NEW: {name} ({phone}) - {actual_count} listings")
                    else:
                        # If same name+source but different phone, remove old entry
                        if existing["phone"] != phone:
                            conn2 = get_connection()
                            conn2.execute("DELETE FROM realtors WHERE phone=?", (existing["phone"],))
                            conn2.commit()
                            conn2.close()
                            upsert_realtor(
                                phone=phone,
                                name=name or "Unknown",
                                source=site_name,
                                listing_url=url,
                                profile_url=profile or "",
                                listings_count=actual_count,
                                verified=True,
                            )
                            realtors_found += 1
                            log.info(f"  REPLACED: {name} ({phone}) - {actual_count} listings")
                        elif actual_count > existing["listings_count"]:
                            upsert_realtor(
                                phone=phone,
                                name=name or "Unknown",
                                source=site_name,
                                listing_url=url,
                                profile_url=profile,
                                listings_count=actual_count,
                                verified=True,
                            )
                            log.info(f"  UPDATED: {name} ({phone}) -> {actual_count} listings")
                
                # Random delay
                await asyncio.sleep(random.uniform(2, 5))
                
            except Exception as e:
                log.warning(f"  Error processing {url[:60]}: {e}")
                # Save progress on error too (crash recovery)
                save_parsed(parsed)
        
        save_parsed(parsed)
        log.info(f"{site_name}: Done. Found {realtors_found} new realtors")
        return realtors_found
        
    except Exception as e:
        log.error(f"{site_name} parser error: {e}")
        return 0
    finally:
        try:
            await parser.close()
        except:
            pass


async def run_full(max_per_site: int = 200):
    """Full parse - collect as many listings as possible."""
    log.info("=" * 60)
    log.info("FULL PARSE STARTED")
    log.info("=" * 60)
    
    init_db()
    total = 0
    
    for site_name in ["korter", "myhome", "ssge"]:
        count = await parse_site(site_name, mode="full", max_listings=max_per_site)
        total += count
        log.info(f"{site_name}: +{count} realtors")
    
    stats = get_stats()
    log.info(f"FULL PARSE COMPLETE: {stats['total']} total realtors")
    log.info(f"  by source: {stats['by_source']}")
    return stats


async def run_daily():
    """Daily parse - only new listings."""
    log.info("=" * 60)
    log.info("DAILY PARSE STARTED")
    log.info("=" * 60)
    
    init_db()
    total = 0
    
    for site_name in ["korter", "myhome", "ssge"]:
        count = await parse_site(site_name, mode="daily", max_listings=50)
        total += count
        log.info(f"{site_name}: +{count} new realtors")
    
    stats = get_stats()
    log.info(f"DAILY PARSE COMPLETE: {stats['total']} total (+{total} new)")
    return stats


def show_stats():
    """Show database statistics."""
    init_db()
    stats = get_stats()
    parsed = load_parsed()
    
    print(f"\n{'='*50}")
    print(f"REALTOR PARSER STATISTICS")
    print(f"{'='*50}")
    print(f"Total realtors: {stats['total']}")
    for src, count in stats["by_source"].items():
        print(f"  {src}: {count}")
    print(f"Tracked listings: {len(parsed)}")
    
    # Show recent parses
    recent = sorted(parsed.items(), key=lambda x: x[1], reverse=True)[:5]
    if recent:
        print(f"\nRecent parses:")
        for url, date in recent:
            print(f"  {date[:16]} - {url[:60]}")
    
    print(f"\n{'='*50}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Realtor Parser")
    parser.add_argument("--full", action="store_true", help="Full parse (all listings)")
    parser.add_argument("--daily", action="store_true", help="Daily parse (new only)")
    parser.add_argument("--stats", action="store_true", help="Show statistics")
    parser.add_argument("--site", type=str, help="Parse specific site (korter/myhome/ssge)")
    parser.add_argument("--max", type=int, default=200, help="Max listings per site")
    
    args = parser.parse_args()
    
    if args.stats:
        show_stats()
    elif args.full:
        asyncio.run(run_full(args.max))
    elif args.daily:
        asyncio.run(run_daily())
    elif args.site:
        init_db()
        asyncio.run(parse_site(args.site, mode="full", max_listings=args.max))
    else:
        # Default: daily run
        asyncio.run(run_daily())
