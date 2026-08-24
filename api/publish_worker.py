"""Isolated browser worker for one publish task.

The API process stays long-lived, while Playwright/Xvfb gets a fresh process
for every task. This avoids browser state leaking between background tasks.
"""

import asyncio
import contextlib
import json
import sys

from api.publisher import publish_to_sites


async def main() -> None:
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        result = await publish_to_sites(
            user_id=request["user_id"],
            sites=request["sites"],
            listing=request["listing"],
        )
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
