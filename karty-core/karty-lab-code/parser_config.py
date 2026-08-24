"""Configuration for the fixed production realtor-parser source list."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CONFIG_PATH = Path(__file__).with_name("parser_sources.json")


def load_sources() -> dict[str, dict[str, Any]]:
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("parser_sources.json must contain an object")
    for site, config in data.items():
        if not isinstance(config, dict) or not isinstance(config.get("urls"), list):
            raise ValueError(f"Invalid parser source config for {site}")
        if not config["urls"] or any(not isinstance(url, str) or not url.startswith("http") for url in config["urls"]):
            raise ValueError(f"Invalid URL list for {site}")
    return data
