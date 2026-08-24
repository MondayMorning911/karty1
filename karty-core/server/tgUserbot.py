"""
Telegram Userbot service — sends/receives messages from real Telegram accounts.
Uses Telethon for userbot functionality.
"""
import asyncio
import json
import os
import sqlite3
import sys
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession
from dotenv import load_dotenv

load_dotenv("/root/karty-lab/.env")

# Store active client sessions
clients: dict[str, TelegramClient] = {}
# Store pending logins (phone → client)
pending_logins: dict[str, TelegramClient] = {}

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))  # Get from https://my.telegram.org
API_HASH = os.getenv("TELEGRAM_API_HASH", "")  # Get from https://my.telegram.org


async def start_client(session_string: str, account_name: str) -> dict:
    """Start a Telegram userbot client with existing session."""
    try:
        client = TelegramClient(StringSession(session_string), API_ID, API_HASH)
        await client.start()
        me = await client.get_me()
        clients[account_name] = client
        return {
            "success": True,
            "user_id": me.id,
            "name": f"{me.first_name} {me.last_name or ''}".strip(),
            "username": me.username or "",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def request_code(phone: str) -> dict:
    """Step 1: Send verification code to phone number."""
    try:
        client = TelegramClient(StringSession(), API_ID, API_HASH)
        await client.connect()
        await client.send_code_request(phone)
        pending_logins[phone] = client
        return {"success": True, "message": f"Код отправлен на {phone}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def confirm_code(phone: str, code: str, account_name: str, password: str = "") -> dict:
    """Step 2: Confirm code and complete login."""
    client = pending_logins.get(phone)
    if not client:
        return {"success": False, "error": "Сессия не найдена. Запросите код заново."}
    try:
        try:
            await client.sign_in(phone, code)
        except SessionPasswordNeededError:
            if not password:
                return {"success": False, "requires_password": True, "message": "Введите пароль двухфакторной аутентификации Telegram"}
            await client.sign_in(password=password)
        me = await client.get_me()
        session_string = client.session.save()
        await client.disconnect()
        del pending_logins[phone]
        # Store session for immediate use
        clients[account_name] = TelegramClient(StringSession(session_string), API_ID, API_HASH)
        await clients[account_name].start()
        return {
            "success": True,
            "session_string": session_string,
            "user_id": me.id,
            "name": f"{me.first_name} {me.last_name or ''}".strip(),
            "username": me.username or "",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def send_message(account_name: str, peer: str, text: str) -> dict:
    """Send a message from the specified account."""
    client = clients.get(account_name)
    if not client:
        return {"success": False, "error": f"Аккаунт {account_name} не подключен"}
    try:
        entity = await client.get_entity(peer)
        await client.send_message(entity, text)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def get_dialogs(account_name: str, limit: int = 20) -> list:
    """Get recent dialogs for the specified account."""
    client = clients.get(account_name)
    if not client:
        return []
    try:
        dialogs = []
        async for dialog in client.iter_dialogs(limit=limit):
            if not dialog.is_group and not dialog.is_channel:
                peer = dialog.peer
                name = dialog.name or str(peer.user_id if hasattr(peer, 'user_id') else '')
                dialogs.append({
                    "chat_id": f"tg_{peer.user_id if hasattr(peer, 'user_id') else 0}",
                    "client_name": name,
                    "last_message": dialog.message.message if dialog.message else "",
                    "timestamp": dialog.message.date.isoformat() if dialog.message else "",
                    "unread": dialog.unread_count > 0,
                })
        return dialogs
    except Exception as e:
        print(f"Error getting dialogs: {e}")
        return []


async def stop_client(account_name: str):
    """Stop a client session."""
    client = clients.get(account_name)
    if client:
        await client.disconnect()
        del clients[account_name]


async def restore_active_clients() -> None:
    """Reconnect persisted accounts after a userbot process restart."""
    try:
        conn = sqlite3.connect("/root/karty-lab/realtors.db")
        rows = conn.execute(
            "SELECT account_name, session_string FROM telegram_accounts "
            "WHERE active=1 AND session_string IS NOT NULL AND session_string != ''"
        ).fetchall()
        conn.close()
    except Exception as exc:
        print(f"Failed to read Telegram accounts: {exc}")
        return

    for account_name, session_string in rows:
        result = await start_client(session_string, account_name)
        if not result.get("success"):
            print(f"Failed to restore Telegram account {account_name}: {result.get('error')}")


# FastAPI endpoints
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()


@app.on_event("startup")
async def startup_restore_clients():
    await restore_active_clients()


class RequestCodeRequest(BaseModel):
    phone: str


class ConfirmCodeRequest(BaseModel):
    phone: str
    code: str
    account_name: str
    password: str = ""


class StartRequest(BaseModel):
    session_string: str
    account_name: str


class SendMessageRequest(BaseModel):
    account_name: str
    peer: str
    text: str


@app.post("/request_code")
async def api_request_code(req: RequestCodeRequest):
    return await request_code(req.phone)


@app.post("/confirm_code")
async def api_confirm_code(req: ConfirmCodeRequest):
    return await confirm_code(req.phone, req.code, req.account_name, req.password)


@app.post("/start")
async def api_start(req: StartRequest):
    return await start_client(req.session_string, req.account_name)


@app.post("/send")
async def api_send(req: SendMessageRequest):
    return await send_message(req.account_name, req.peer, req.text)


@app.get("/dialogs/{account_name}")
async def api_dialogs(account_name: str, limit: int = 20):
    return await get_dialogs(account_name, limit)


@app.get("/health")
async def health():
    return {"status": "ok", "active_clients": list(clients.keys())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
