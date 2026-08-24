"""Structured per-task logging for the realtor parser."""

from __future__ import annotations

import logging
from pathlib import Path


LOG_DIR = Path("/root/karty-lab/logs")


class ParserContextAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        context = self.extra
        prefix = (
            f"[{context.get('site', '-')}]"
            f"[{context.get('category', '-')}]"
            f"[page={context.get('page', '-')}]"
            f"[url={context.get('url', '-')}]"
        )
        return f"{prefix} {msg}", kwargs


def get_run_logger(task_id: str) -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(f"parser.run.{task_id}")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    if not logger.handlers:
        handler = logging.FileHandler(LOG_DIR / f"parser_run_{task_id}.log", encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)

    return logger


def context_logger(
    logger: logging.Logger,
    *,
    site: str,
    category: str,
    page: int | None = None,
    url: str | None = None,
) -> ParserContextAdapter:
    return ParserContextAdapter(logger, {
        "site": site,
        "category": category,
        "page": page,
        "url": url,
    })


def log_result(logger: logging.Logger, *, result: str, reason: str = "", **context) -> None:
    context_logger(logger, **context).info(
        "result=%s%s",
        result,
        f" reason={reason}" if reason else "",
    )
