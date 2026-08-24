import json
import os
import re
from pathlib import Path

COOKIES_DIR = Path(__file__).parent.parent / "cookies"
VALID_SITES = {"ss_ge", "myhome_ge", "korter_ge"}


def _user_dir(user_id: str) -> Path:
    value = str(user_id or "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise ValueError("Invalid user_id")
    return COOKIES_DIR / value


def _site_file(user_id: str, site: str, suffix: str = "") -> Path:
    if site not in VALID_SITES:
        raise ValueError("Invalid site")
    return _user_dir(user_id) / f"{site}{suffix}.json"


def get_cookies(user_id: str, site: str) -> list[dict]:
    """Load cookies for a user+site combination."""
    cookie_file = _site_file(user_id, site)
    if not cookie_file.exists():
        return []
    with open(cookie_file) as f:
        return json.load(f)


def get_storage_state(user_id: str, site: str) -> dict | None:
    """Load storage_state (cookies + localStorage) for a site. Returns None if not found."""
    state_file = _site_file(user_id, site, "_state")
    if not state_file.exists():
        return None
    with open(state_file) as f:
        return json.load(f)


def save_cookies(user_id: str, site: str, cookies: list[dict]) -> None:
    """Save cookies for a user+site combination."""
    user_dir = _user_dir(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    cookie_file = _site_file(user_id, site)
    with open(cookie_file, "w") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)


def save_storage_state(user_id: str, site: str, state: dict) -> None:
    """Save storage_state (cookies + localStorage + sessionStorage) for a site."""
    user_dir = _user_dir(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    state_file = _site_file(user_id, site, "_state")
    with open(state_file, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def has_cookies(user_id: str, site: str) -> bool:
    """Check if cookies or storage_state exist for a user+site."""
    cookie_file = _site_file(user_id, site)
    state_file = _site_file(user_id, site, "_state")
    return cookie_file.exists() or state_file.exists()


def delete_auth_state(user_id: str, site: str) -> None:
    user_dir = _user_dir(user_id)
    for filename in (f"{site}.json", f"{site}_state.json"):
        path = user_dir / filename
        if path.exists():
            path.unlink()
