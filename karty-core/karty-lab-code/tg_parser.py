"""
Telegram Chat Parser — мониторит чаты по недвижимости,
собирает usernames, телефоны, имена риэлторов.
Daily continuous mode.
"""
import asyncio
import logging
import os
import re
import sys
import json
import fcntl
from urllib.parse import urlparse
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from config import TELEGRAM_API_ID, TELEGRAM_API_HASH

# Add karty-lab-code to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_connection

from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import UserAlreadyParticipantError, InviteRequestSentError, FloodWaitError
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.functions.messages import ImportChatInviteRequest

LOG_DIR = Path("/root/karty-lab/logs")
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "tg_parser.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("tg_parser")
LOCK_PATH = LOG_DIR / "tg_parser.lock"
STATUS_PATH = LOG_DIR / "tg_parser_status.json"
TBILISI_TZ = ZoneInfo("Asia/Tbilisi")


def now_local() -> str:
    return datetime.now(TBILISI_TZ).isoformat()

API_ID = TELEGRAM_API_ID
API_HASH = TELEGRAM_API_HASH


def write_status(**fields) -> None:
    current = {}
    try:
        current = json.loads(STATUS_PATH.read_text())
    except Exception:
        pass
    current.update(fields, updated_at=now_local())
    temp = STATUS_PATH.with_suffix(".tmp")
    temp.write_text(json.dumps(current, ensure_ascii=False))
    temp.replace(STATUS_PATH)

# Phone patterns for Georgian real estate
PHONE_PATTERN = re.compile(r'(\+?995\s*5\d{2}\s*\d{2}\s*\d{2}\s*\d{2})')
MOBILE_PATTERN = re.compile(r'(?<!\d)(5\d{2}\s*\d{2}\s*\d{2}\s*\d{2})(?!\d)')
PROPERTY_PATTERN = re.compile(r'квартир|апартамент|дом|участ|коммерч|офис|склад|недвиж|flat|house|land|property', re.I)
DEAL_PATTERN = re.compile(r'#?сда[её]тся|#?сдам|#?сдаю|#?прода[её]тся|#?продам|#?продаю|в\s+аренд[уые]|аренд[аеуы]|посуточн|rent|sale', re.I)
ADDRESS_PATTERN = re.compile(r'улиц[аеуы]|ул\.?\s|проспект|площадь|район|адрес|street|avenue', re.I)
PRICE_PATTERN = re.compile(r'(?:\$|₾|usd|gel|доллар|лари|цена)\s*\d|\d[\d\s,.]*\s*(?:\$|₾|usd|gel)', re.I)
AREA_PATTERN = re.compile(r'\d[\d\s,.]*\s*(?:м2|м²|кв\.?\s*м)', re.I)
LISTING_URL_PATTERN = re.compile(r'https?://(?:www\.)?(?:ss\.ge|myhome\.ge|korter\.ge)/\S+', re.I)


def get_accounts():
    """Get all active Telegram accounts."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT account_name, session_string, user_id, username, display_name FROM telegram_accounts WHERE active=1"
    ).fetchall()
    conn.close()
    return [{"name": r[0], "session": r[1], "user_id": r[2], "username": r[3], "display_name": r[4]} for r in rows]


def get_chats():
    """Get all active chats to monitor."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT chat_id, chat_title, chat_type, last_checked_id, chat_link, join_status FROM telegram_chats WHERE active=1"
    ).fetchall()
    conn.close()
    return [{"chat_id": r[0], "title": r[1], "type": r[2], "last_checked_id": r[3], "chat_link": r[4] or r[0], "join_status": r[5] or "pending"} for r in rows]


def update_chat_join(chat_id: str, status: str) -> None:
    conn = get_connection()
    conn.execute("UPDATE telegram_chats SET join_status=?, joined_at=CASE WHEN ?='joined' THEN CURRENT_TIMESTAMP ELSE joined_at END WHERE chat_id=?", (status, status, chat_id))
    conn.commit()
    conn.close()


async def ensure_joined(client: TelegramClient, chat: dict):
    link = str(chat.get("chat_link") or chat.get("chat_id") or "").strip()
    previous_status = str(chat.get("join_status") or "")
    if previous_status.startswith("join_requested") or previous_status.startswith("flood_wait"):
        return None
    try:
        if re.fullmatch(r"-?\d+", link):
            entity = await client.get_entity(int(link))
            update_chat_join(chat["chat_id"], "joined")
            return entity
        parsed = urlparse(link if "://" in link else "https://t.me/" + link.lstrip("@"))
        path = parsed.path.strip("/")
        if path.startswith("+"):
            result = await client(ImportChatInviteRequest(path[1:]))
            entity = result.chats[0] if getattr(result, "chats", None) else None
        elif path.startswith("joinchat/"):
            result = await client(ImportChatInviteRequest(path.split("/", 1)[1]))
            entity = result.chats[0] if getattr(result, "chats", None) else None
        else:
            username = path.split("/", 1)[0] or link
            # Resolve public chats without repeatedly sending JoinChannelRequest.
            # Telegram applies FloodWait aggressively to repeated join attempts.
            entity = await client.get_entity(username.lstrip("@"))
        update_chat_join(chat["chat_id"], "joined")
        return entity
    except UserAlreadyParticipantError:
        update_chat_join(chat["chat_id"], "joined")
        try:
            return await client.get_entity(link)
        except Exception:
            async for dialog in client.iter_dialogs():
                if dialog.name == chat.get("title"):
                    return dialog.entity
            raise
    except InviteRequestSentError:
        update_chat_join(chat["chat_id"], "join_requested")
        return None
    except FloodWaitError as exc:
        update_chat_join(chat["chat_id"], f"flood_wait:{exc.seconds}")
        log.warning("Telegram FloodWait for %s: %s seconds", chat.get("title"), exc.seconds)
        return None
    except Exception as exc:
        update_chat_join(chat["chat_id"], f"error:{type(exc).__name__}")
        raise


def save_user(user_id: str, username: str, phone: str, name: str, source_chat: str, msg_count: int = 1, listing_delta: int = 0, listing_url: str = "", listing_sample: str = ""):
    """Save or update a Telegram user in DB."""
    conn = get_connection()
    now = datetime.now().isoformat()
    existing = conn.execute("SELECT id, message_count FROM telegram_users WHERE user_id=?", (user_id,)).fetchone()
    if existing:
        conn.execute(
            "UPDATE telegram_users SET username=COALESCE(NULLIF(?, ''), username), "
            "phone=COALESCE(NULLIF(?, ''), phone), name=COALESCE(NULLIF(?, ''), name), "
            "message_count=message_count+?, listing_count=listing_count+?, "
            "listing_urls=CASE WHEN ?!='' AND instr(listing_urls, ?) = 0 THEN json_insert(listing_urls, '$[#]', ?) ELSE listing_urls END, "
            "listing_samples=CASE WHEN ?!='' AND instr(listing_samples, ?) = 0 THEN json_insert(listing_samples, '$[#]', ?) ELSE listing_samples END, "
            "last_seen=?, source_chat=COALESCE(NULLIF(?, ''), source_chat) WHERE user_id=?",
            (username, phone, name, msg_count, listing_delta, listing_url, listing_url, listing_url, listing_sample, listing_sample, listing_sample, now, source_chat, user_id)
        )
        log.debug(f"  UPDATED: {name or username} (+{msg_count} msgs)")
    else:
        conn.execute(
            "INSERT INTO telegram_users (user_id, username, phone, name, message_count, listing_count, listing_urls, listing_samples, source_chat, first_seen, last_seen) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, username, phone, name, msg_count, listing_delta, json.dumps([listing_url] if listing_url else [], ensure_ascii=False), json.dumps([listing_sample] if listing_sample else [], ensure_ascii=False), source_chat, now, now)
        )
        log.info(f"  NEW: {name or username} (@{username}) {phone} from {source_chat}")
    conn.commit()
    conn.close()


def update_chat_last_id(chat_id: str, last_id: int):
    """Update last checked message ID for a chat."""
    conn = get_connection()
    conn.execute("UPDATE telegram_chats SET last_checked_id=? WHERE chat_id=?", (last_id, chat_id))
    conn.commit()
    conn.close()


def is_listing_message(text: str) -> bool:
    if not text:
        return False
    if LISTING_URL_PATTERN.search(text):
        return True
    score = int(bool(PROPERTY_PATTERN.search(text)))
    score += int(bool(PRICE_PATTERN.search(text)))
    score += int(bool(AREA_PATTERN.search(text)))
    score += int(bool(DEAL_PATTERN.search(text)))
    score += int(bool(ADDRESS_PATTERN.search(text)))
    return score >= 2


def extract_listing_url(text: str) -> str:
    match = LISTING_URL_PATTERN.search(text or "")
    return match.group(0).rstrip(".,)") if match else ""


def record_message(chat_id: str, message_id: int, sender_id: str, is_listing: bool, listing_url: str) -> bool:
    conn = get_connection()
    result = conn.execute(
        "INSERT OR IGNORE INTO telegram_messages (chat_id,message_id,sender_id,is_listing,listing_url) VALUES (?,?,?,?,?)",
        (chat_id, message_id, sender_id, int(is_listing), listing_url),
    )
    conn.commit()
    conn.close()
    return result.rowcount == 1


def extract_phone(text: str) -> str | None:
    """Extract Georgian phone number from message text."""
    if not text:
        return None
    # Try +995 pattern first
    m = PHONE_PATTERN.search(text)
    if m:
        phone = re.sub(r'\s', '', m.group(1))
        if phone.startswith('+'):
            return phone
        return '+995' + phone
    # Try bare 5XX pattern
    m = MOBILE_PATTERN.search(text)
    if m:
        return '+995' + m.group(1).replace(' ', '')
    return None


def normalize_phone(value: str) -> str:
    digits = ''.join(ch for ch in str(value or '') if ch.isdigit())
    if digits.startswith('995') and len(digits) == 12:
        digits = digits[3:]
    if digits.startswith('0') and len(digits) == 10:
        digits = digits[1:]
    return f'+995{digits}' if len(digits) == 9 and digits.startswith('5') else ''


async def process_message(client: TelegramClient, chat: dict, message) -> bool:
    if not message.sender_id:
        return False
    # Channel posts have a Channel sender, not a user profile. They cannot
    # produce realtor leads and must not enter the user-specific extraction.
    try:
        sender = await message.get_sender()
    except Exception as exc:
        log.debug("Cannot resolve sender %s in %s: %s", message.sender_id, chat["title"], exc)
        return False
    if sender is None or not hasattr(sender, "first_name"):
        return False
    user_id = str(sender.id)
    username = sender.username or ''
    name = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
    phone = normalize_phone(sender.phone or '')
    msg_phone = extract_phone(message.text or '')
    if msg_phone and not phone:
        phone = normalize_phone(msg_phone)
    text = message.text or ""
    listing = is_listing_message(text)
    listing_url = extract_listing_url(text)
    if not (phone or username or listing):
        return False
    if not record_message(str(chat["chat_id"]), message.id, user_id, listing, listing_url):
        return False
    save_user(user_id, username, phone, name, chat["title"], 1, int(listing), listing_url, text[:500] if listing else "")
    return True


async def parse_chat(client: TelegramClient, chat: dict) -> int:
    """Parse new messages from a single chat. Returns count of new users found."""
    new_users = 0
    last_message = None
    processed = 0
    try:
        chat_id = str(chat["chat_id"])
        chat_title = chat["title"]
        entity = await ensure_joined(client, chat)
        if entity is None:
            return 0
        last_checked_id = int(chat.get("last_checked_id") or 0)
        
        # Get messages after last checked ID
        async for message in client.iter_messages(entity, min_id=last_checked_id, reverse=True):
            last_message = message
            processed += 1
            if not message.sender_id:
                continue
            try:
                if await process_message(client, chat, message):
                    new_users += 1

            except Exception as e:
                log.debug(f"  Skip sender: {e}")
                continue

            if processed % 25 == 0:
                conn = get_connection()
                total = conn.execute("SELECT COUNT(*) FROM telegram_users").fetchone()[0]
                with_phone = conn.execute("SELECT COUNT(*) FROM telegram_users WHERE phone != '' AND phone IS NOT NULL").fetchone()[0]
                listing_total = conn.execute("SELECT COALESCE(SUM(listing_count), 0) FROM telegram_users").fetchone()[0]
                conn.close()
                write_status(running=True, current_chat=chat_title, total_users=total, with_phone=with_phone, listing_count=listing_total, last_activity_at=now_local())
        
        # Update last checked ID
        if last_message:
            update_chat_last_id(chat_id, last_message.id)
            
    except Exception as e:
        log.error(f"Error parsing chat {chat_title}: {e}")
    
    return new_users


async def run_monitoring():
    """Listen only to new Telegram messages using Telethon events."""
    accounts = get_accounts()
    if not accounts:
        log.error("No active Telegram accounts found. Add an account first.")
        return
    
    chats = get_chats()
    if not chats:
        log.error("No chats to monitor. Add chats first.")
        return
    
    log.info(f"Starting Telegram monitoring: {len(accounts)} accounts, {len(chats)} chats")
    write_status(running=True, mode="monitor", accounts=len(accounts), chats=len(chats), error="")

    clients = []
    for acc in accounts:
        try:
            client = TelegramClient(StringSession(acc["session"]), API_ID, API_HASH)
            await client.start()
            me = await client.get_me()
            log.info(f"Connected: {acc['display_name'] or me.first_name} (@{me.username})")
            clients.append((client, acc))
        except Exception as e:
            log.error(f"Failed to connect {acc['name']}: {e}")
    
    if not clients:
        log.error("No clients connected. Check accounts.")
        return
    
    client = clients[0][0]
    registered = 0
    for chat in chats:
        try:
            entity = await ensure_joined(client, chat)
            if entity is None:
                continue
            update_chat_join(chat["chat_id"], "joined")

            async def on_message(event, chat=chat):
                try:
                    if await process_message(client, chat, event.message):
                        conn = get_connection()
                        total = conn.execute("SELECT COUNT(*) FROM telegram_users").fetchone()[0]
                        with_phone = conn.execute("SELECT COUNT(*) FROM telegram_users WHERE phone != '' AND phone IS NOT NULL").fetchone()[0]
                        listing_total = conn.execute("SELECT COALESCE(SUM(listing_count), 0) FROM telegram_users").fetchone()[0]
                        conn.close()
                        write_status(running=True, mode="monitor", current_chat=chat["title"], total_users=total, with_phone=with_phone, listing_count=listing_total, last_activity_at=now_local())
                except Exception as exc:
                    log.error("New message processing error in %s: %s", chat["title"], exc)

            client.add_event_handler(on_message, events.NewMessage(chats=entity))
            registered += 1
        except Exception as exc:
            log.warning("Cannot register chat %s: %s", chat["title"], exc)

    write_status(running=True, mode="monitor", registered_chats=registered, current_chat="Ожидание новых сообщений", last_activity_at=now_local())
    log.info("Telegram event monitor ready: %s chats; history scan disabled", registered)
    await client.run_until_disconnected()


async def one_time_scan():
    """Single scan of all chats — for initial import."""
    accounts = get_accounts()
    chats = get_chats()
    
    if not accounts or not chats:
        log.error("No accounts or chats configured")
        return
    
    log.info(f"One-time scan: {len(chats)} chats")
    write_status(running=True, mode="scan", accounts=len(accounts), chats=len(chats), error="")
    
    for acc in accounts:
        try:
            client = TelegramClient(StringSession(acc["session"]), API_ID, API_HASH)
            await client.start()
            
            for chat in chats:
                log.info(f"Scanning {chat['title']}...")
                # Reset last_checked_id to scan from beginning
                update_chat_last_id(chat["chat_id"], 0)
                new = await parse_chat(client, {**chat, "last_checked_id": 0})
                log.info(f"  {chat['title']}: found {new} users")
            
            await client.disconnect()
        except Exception as e:
            log.error(f"Error: {e}")


def get_qualified_leads(min_messages: int = 30) -> list[dict]:
    conn = get_connection()
    query = (
        "SELECT user_id, username, phone, name, message_count, listing_count, listing_urls, "
        "listing_samples, source_chat, first_seen, last_seen FROM telegram_users"
    )
    query += " WHERE message_count > ?"
    params = (int(min_messages),)
    query += " ORDER BY message_count DESC, listing_count DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["monitor", "scan"], default="monitor")
    args = parser.parse_args()
    lock_handle = LOCK_PATH.open("w")
    try:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.error("Another Telegram parser process is already running")
        sys.exit(2)

    try:
        if args.mode == "monitor":
            asyncio.run(run_monitoring())
        else:
            asyncio.run(one_time_scan())
    finally:
        write_status(running=False, finished_at=datetime.now().isoformat())
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        lock_handle.close()
