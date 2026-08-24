# Инструкция для AI Studio — Интеграция парсера риэлторов

## Контекст

У нас есть готовый Python-скрипт для парсинга риэлторов с грузинских сайтов недвижимости. Нужно интегрировать его в наш Telegram мини-апп (Node.js + Express бэкенд).

## Что уже готово

### Парсер (`/root/karty-lab/`)
- `realtor_parser.py` — основной скрипт (работает автономно)
- `parsers/` — модули для korter.ge, myhome.ge, ss.ge
- `db.py` — SQLite база данных
- `realtors.db` — база с 84 риэлторами

### API для публикации (`/root/karty-lab/api/`)
- FastAPI сервер на порту 8000
- `POST /api/publish` — публикация объявлений
- `GET /api/publish/{task_id}` — проверка статуса
- `POST /api/cookies/{user_id}/{site}` — загрузка cookies

## Задача для AI Studio

### Часть 1: API для парсинга

Нужно создать HTTP API обёртку вокруг `realtor_parser.py`:

```python
# Пример эндпоинтов для добавления в api/main.py:

@app.post("/api/parser/run")
async def run_parser(mode: str = "daily", max_listings: int = 50):
    """Запуск парсера. mode: 'full' или 'daily'"""
    # Запускает realtor_parser.py как subprocess
    # Возвращает task_id для polling

@app.get("/api/parser/status")
async def parser_status():
    """Статус парсера: всего риэлторов, последний прогон"""

@app.get("/api/parser/realtors")
async def get_realtors(source: str = None, limit: int = 50):
    """Список риэлторов. Фильтр по сайту."""

@app.get("/api/parser/phones")
async def export_phones():
    """Экспорт всех номеров в TXT"""
```

### Часть 2: Фронтенд в Telegram WebApp

Страницы:
1. **Дашборд** — статистика: всего риэлторов, по сайтам, последний прогон
2. **Запуск парсера** — кнопки "Полный сбор" и "Ежедневный прогон"
3. **Список риэлторов** — таблица с фильтрами (сайт, имя, телефон)
4. **Экспорт** — скачивание TXT с номерами

### Часть 3: Cron / Автозапуск

На VPS нужно настроить cron:
```bash
# 2 раза в день
0 8,20 * * * cd /root/karty-lab && xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" /root/karty-lab/venv/bin/python3 realtor_parser.py --daily
```

## Ключевые моменты для AI Studio

### 1. Парсер работает БЕЗ кук
Все 3 сайта (korter, myhome, ss.ge) парсятся анонимно. Авторизация не нужна.

### 2. Требуется xvfb
Браузеры запускаются в non-headless режиме для обхода Cloudflare. На VPS нужен пакет `xvfb`:
```bash
apt install xvfb
```

### 3. SQLite база
- Файл: `/root/karty-lab/realtors.db`
- Таблица: `realtors` (phone TEXT PRIMARY KEY)
- Дубликаты исключены на уровне БД

### 4. Трекинг прогресса
- Файл: `/root/karty-lab/parsed_listings.json`
- Режим `--full`: обрабатывает все URL
- Режим `--daily`: пропускает уже обработанные

### 5. Зависимости Python
```
playwright
```
Установка:
```bash
pip install playwright
playwright install chromium
```

### 6. Запуск парсера из Node.js

```javascript
const { execSync } = require('child_process');

// Запуск парсера
function runParser(mode = 'daily', maxListings = 50) {
  const cmd = `xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 realtor_parser.py --${mode} --max ${maxListings}`;
  const result = execSync(cmd, { cwd: '/root/karty-lab', timeout: 600000 });
  return result.toString();
}

// Получение статистики
function getStats() {
  const result = execSync('python3 realtor_parser.py --stats', { cwd: '/root/karty-lab' });
  return result.toString();
}
```

### 7. Чтение базы из Node.js

```javascript
const Database = require('better-sqlite3');
const db = new Database('/root/karty-lab/realtors.db');

// Все риелторы
const realtors = db.prepare('SELECT * FROM realtors ORDER BY listings_count DESC').all();

// По сайту
const korter = db.prepare('SELECT * FROM realtors WHERE source = ?').all('korter');

// Поиска
const search = db.prepare('SELECT * FROM realtors WHERE name LIKE ?').all('%Khatia%');
```

## Структура файлов для интеграции

```
/root/karty-lab/
├── realtor_parser.py      # Основной скрипт парсера
├── parsers/               # Модули парсинга
├── db.py                  # SQLite слой
├── realtors.db            # База данных
├── parsed_listings.json   # Трекинг URL
├── api/                   # FastAPI для публикации
│   ├── main.py
│   ├── publisher.py
│   └── schemas.py
├── run_api.py             # Запуск API сервера
└── logs/                  # Логи
```

## FAQ для AI Studio

**Q: Нужны ли куки для парсинга?**
A: Нет. Все 3 сайта работают без авторизации.

**Q: Сколько времени занимает прогон?**
A: ~15 мин для полного сбора (~500 объявлений), ~5 мин для ежедневного.

**Q: Как предотвратить дубликаты?**
A: SQLite PRIMARY KEY на поле phone. Перед вставкой проверка SELECT.

**Q: Что если сайт заблокирует?**
A: Задержки 2-5 сек между запросами + non-headless браузер. Пока не блокирует.

**Q: Как получить номера в Telegram?**
A: Экспорт в TXT через `/api/parser/phones` или прямое чтение SQLite.
