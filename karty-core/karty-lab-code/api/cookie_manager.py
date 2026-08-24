import json
import os
from pathlib import Path

COOKIES_DIR = Path(__file__).parent.parent / "cookies"


def get_cookies(user_id: str, site: str) -> list[dict]:
    """Load cookies for a user+site combination."""
    cookie_file = COOKIES_DIR / user_id / f"{site}.json"
    if not cookie_file.exists():
        return []
    with open(cookie_file) as f:
        return json.load(f)


def get_storage_state(user_id: str, site: str) -> dict | None:
    """Load storage_state (cookies + localStorage) for a site. Returns None if not found."""
    state_file = COOKIES_DIR / user_id / f"{site}_state.json"
    if not state_file.exists():
        return None
    with open(state_file) as f:
        return json.load(f)


def save_cookies(user_id: str, site: str, cookies: list[dict]) -> None:
    """Save cookies for a user+site combination."""
    user_dir = COOKIES_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    cookie_file = user_dir / f"{site}.json"
    with open(cookie_file, "w") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)


def save_storage_state(user_id: str, site: str, state: dict) -> None:
    """Save storage_state (cookies + localStorage + sessionStorage) for a site."""
    user_dir = COOKIES_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    state_file = user_dir / f"{site}_state.json"
    with open(state_file, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def has_cookies(user_id: str, site: str) -> bool:
    """Check if cookies or storage_state exist for a user+site."""
    cookie_file = COOKIES_DIR / user_id / f"{site}.json"
    state_file = COOKIES_DIR / user_id / f"{site}_state.json"
    return cookie_file.exists() or state_file.exists()
