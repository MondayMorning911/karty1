import json
from pathlib import Path

def load_cookies(site_name: str) -> list:
    cookie_path = Path("/root/karty-lab/cookies") / f"{site_name}.json"
    if cookie_path.exists():
        with open(cookie_path) as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    return []

def cookies_to_playwright(cookies: list) -> list:
    result = []
    for c in cookies:
        entry = {
            "name": c.get("name", ""),
            "value": c.get("value", ""),
            "domain": c.get("domain", ""),
            "path": c.get("path", "/"),
        }
        exp = c.get("expirationDate") or c.get("expires")
        if exp and isinstance(exp, (int, float)) and exp > 0:
            entry["expires"] = exp
        result.append(entry)
    return result
