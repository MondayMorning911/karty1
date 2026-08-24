import asyncio
import json
import sys

from api.cookie_manager import get_cookies, get_storage_state
from api.publisher import _get_site_class, _launch_authenticated_site


async def main() -> None:
    request = json.load(sys.stdin)
    site_key = request["site_key"]
    site = _get_site_class(site_key)()
    try:
        await _launch_authenticated_site(
            site,
            get_storage_state(request["user_id"], site_key),
            get_cookies(request["user_id"], site_key),
            site_key,
        )
        success = await site._delete_listing(request["url"])
        print(json.dumps({"success": bool(success), "url": request["url"]}, ensure_ascii=False), flush=True)
    finally:
        try:
            await site._close()
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())
