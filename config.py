import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")
HEADLESS = True
COOKIES_DIR = str(BASE_DIR / "cookies" / "cookies")
SELECTORS_DIR = str(BASE_DIR / "selectors")
LOGS_DIR = str(BASE_DIR / "logs")
SCREENSHOTS_DIR = str(BASE_DIR / "logs" / "screenshots")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_ENDPOINT = "https://models.inference.ai.azure.com"
GPT_MODEL = "gpt-4o"
TIMEOUT = 30000
RETRY_COUNT = 3
MYHOME_EMAIL = os.getenv("MYHOME_EMAIL", "")
MYHOME_PASSWORD = os.getenv("MYHOME_PASSWORD", "")
TELEGRAM_API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_NOTIFY_CHAT_ID = os.getenv("TELEGRAM_NOTIFY_CHAT_ID", "")

SITES = ["ss_ge", "myhome_ge", "korter_ge", "realting_com"]
DEALS = ["sale", "rent"]
TYPES = ["apartment", "house", "land", "commercial"]
