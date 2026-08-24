import logging
import os
from pathlib import Path

def setup_logger(name: str) -> logging.Logger:
    log = logging.getLogger(name)
    log.setLevel(logging.INFO)
    if not log.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter('%(asctime)s [%(name)s] %(levelname)s: %(message)s'))
        log.addHandler(h)
    return log

def screenshot_path(*args, **kwargs) -> str:
    import time
    d = Path("/root/karty-lab/screenshots")
    d.mkdir(parents=True, exist_ok=True)
    name = args[0] if args else "screenshot"
    ts = int(time.time())
    return str(d / f"{name}_{ts}.png")
