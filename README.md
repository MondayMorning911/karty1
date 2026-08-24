# Karty Lab — API

Два сервиса в одном FastAPI приложении:
1. **Публикация объявлений** — автоматическая публикация на 3 грузинских сайтах
2. **Парсер риэлторов** — сбор телефонов профессиональных риэлторов

---

## Запуск

```bash
cd /root/karty-lab
source venv/bin/activate
xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 run_api.py
```

Сервер: `http://localhost:8000`
Документация: `http://localhost:8000/docs` (Swagger UI)

---

## Часть 1: Публикация объявлений

### POST /api/publish — Опубликовать объявление

Запускает публикацию объявления на указанных сайтах. Возвращает `task_id` для отслеживания.

**Request:**
```json
{
  "user_id": "tg_12345",
  "sites": ["ss_ge", "myhome_ge", "korter_ge"],
  "listing": {
    "deal": "sale",
    "type": "apartment",
    "price": 95000,
    "currency": "USD",
    "area": 72,
    "rooms": 2,
    "bedrooms": 1,
    "floor": 4,
    "floors_total": 12,
    "address": "Тбилиси, ул. Руставели 28",
    "city": "Тбилиси",
    "description": "Продаётся уютная 2-комнатная квартира в центре Тбилиси.",
    "photo_urls": ["https://res.cloudinary.com/.../photo.jpg"],
    "contact_name": "Даниэль"
  }
}
```

**Response:**
```json
{"task_id": "abc123", "status": "processing"}
```

### GET /api/publish/{task_id} — Статус публикации

**Polling:** опрашивать каждые **30 секунд**, максимальное время ожидания — **30 минут**.

```json
{
  "task_id": "abc123",
  "status": "completed",
  "results": {
    "ss_ge": {"status": "success", "url": "https://home.ss.ge/ru/l/36031374"},
    "myhome_ge": {"status": "success", "url": "https://statements.myhome.ge/..."},
    "korter_ge": {"status": "success", "url": "https://korter.ge/ru/profile/..."}
  }
}
```

### Справочник полей listing

#### Обязательные

| Поле | Тип | Описание | Пример |
|------|-----|----------|--------|
| `deal` | string | `"sale"` или `"rent"` | `"sale"` |
| `type` | string | `"apartment"`, `"house"`, `"land"`, `"commercial"` | `"apartment"` |
| `price` | int | Цена > 0 | `95000` |
| `area` | int | Площадь м² > 0 | `72` |
| `address` | string | `"Город, улица номер"` | `"Тбилиси, ул. Костави 12"` |
| `city` | string | Город | `"Тбилиси"` |
| `description` | string | Мин. 10 символов | `"Продаётся квартира..."` |
| `contact_name` | string | Имя контакта | `"Даниэль"` |

#### Опциональные

| Поле | Тип | Описание | Значение по умолчанию |
|------|-----|----------|-----------------------|
| `currency` | string | `"USD"` или `"GEL"` | `"USD"` |
| `rooms` | int | Комнаты | `null` |
| `bedrooms` | int | Спальни | `null` |
| `floor` | int | Этаж | `null` |
| `floors_total` | int | Всего этажей | `null` |
| `yard_area` | int | Двор м² | `null` |
| `photo_urls` | list | URL или пути к фото | `[]` |

#### Что обязательно по типам и сайтам

| | ss.ge | myhome.ge | korter.ge |
|---|-------|-----------|-----------|
| **Квартира** | все базовые | +`floor`+`floors_total` | +`rooms`+`bedrooms`+`floor`+`floors_total` |
| **Дом** | +`yard_area` | +`rooms`+`bedrooms` | +`rooms`+`bedrooms` |
| **Земля** | все базовые | все базовые | все базовые |
| **Коммерция** | все базовые | +`rooms`+`floor`+`floors_total` | +`rooms`+`floor`+`floors_total` |

### Примеры запросов

**Продажа квартиры (все 3 сайта):**
```bash
curl -X POST http://localhost:8000/api/publish \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "tg_12345",
    "sites": ["ss_ge", "myhome_ge", "korter_ge"],
    "listing": {
      "deal": "sale", "type": "apartment",
      "price": 95000, "area": 72, "rooms": 2,
      "bedrooms": 1, "floor": 4, "floors_total": 12,
      "address": "Тбилиси, ул. Руставели 28",
      "city": "Тбилиси",
      "description": "Уютная квартира в центре Тбилиси. Ремонт, мебель.",
      "photo_urls": ["https://example.com/photo1.jpg"],
      "contact_name": "Даниэль"
    }
  }'
```

**Аренда земли:**
```json
{
  "deal": "rent", "type": "land",
  "price": 500, "area": 600,
  "address": "Тбилиси, ул. Пекини 15",
  "city": "Тбилиси",
  "description": "Земельный участок 600 м².",
  "photo_urls": ["https://example.com/land.jpg"],
  "contact_name": "Даниэль"
}
```

**Продажа дома:**
```json
{
  "deal": "sale", "type": "house",
  "price": 120000, "area": 200, "rooms": 4, "bedrooms": 3,
  "yard_area": 300,
  "address": "Тбилиси, ул. Чавчавадзе 45",
  "city": "Тбилиси",
  "description": "Частный дом 200 м² с участком.",
  "photo_urls": ["https://example.com/house.jpg"],
  "contact_name": "Даниэль"
}
```

**Продажа коммерции:**
```json
{
  "deal": "sale", "type": "commercial",
  "price": 200000, "area": 100, "rooms": 3,
  "floor": 2, "floors_total": 5,
  "address": "Тбилиси, ул. Костави 12",
  "city": "Тбилиси",
  "description": "Коммерческое помещение 100 м².",
  "photo_urls": ["https://example.com/office.jpg"],
  "contact_name": "Даниэль"
}
```

### Особенности по сайтам

| | ss.ge | myhome.ge | korter.ge |
|---|-------|-----------|-----------|
| **Улицы** | Русский транслит (Костави) | Грузинский (კოსტავა) | Без "ул." (Костави) |
| **Дом** | `yard_area` обяз. для домов | — | Дом должен существовать в базе korter |
| **Платёж** | Страница оплаты 0.10₾ | Checkout 0.10₾ | Бесплатно |
| **Auth** | Cookies | Cookies | storage_state (обязательно!) |
| **Валюта** | Два поля: $ и ₾ | Одно поле | Одно поле |

### Авторизация (cookies)

**ss.ge и myhome.ge** — обычные cookies:
```bash
# Загрузка
curl -X POST http://localhost:8000/api/cookies/tg_12345/ss_ge \
  -H 'Content-Type: application/json' \
  -d @cookies/ss_ge.json
```

**korter.ge** — storage_state (cookies + localStorage):
```bash
curl -X POST http://localhost:8000/api/storage-state/tg_12345/korter_ge \
  -H 'Content-Type: application/json' \
  -d @cookies/korter_ge_state.json
```

Генерация на Mac:
```python
from playwright.sync_api import sync_playwright
import json, os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto('https://korter.ge')
    input('Залогинься (телефон + SMS) и нажми Enter...')
    json.dump(ctx.cookies(), open('cookies/korter_ge.json', 'w'))
    ctx.storage_state(path='cookies/korter_ge_state.json')
    browser.close()
```

---

## Часть 2: Парсер риэлторов

Собирает телефоны риэлторов с объявлений. Находит профессионалов (>10 объявлений).

### POST /api/parse — Запуск парсинга

**Request:**
```json
{
  "mode": "daily",
  "sites": ["korter", "myhome", "ssge"],
  "max_per_site": 50
}
```

| Поле | Описание | По умолчанию |
|------|----------|--------------|
| `mode` | `"daily"` (только новые) или `"full"` (все) | `"daily"` |
| `sites` | Список: `"korter"`, `"myhome"`, `"ssge"` | все 3 |
| `max_per_site` | Макс. объявлений на сайт | `50` |

**Response:**
```json
{"task_id": "f2f56b88"}
```

### GET /api/parse/{task_id} — Статус парсинга

**Polling:** опрашивать каждые **30 секунд**, максимальное время ожидания — **30 минут**.

```json
{
  "task_id": "f2f56b88",
  "status": "completed",
  "realtors_found": 5,
  "total_in_db": 129,
  "by_source": {"korter": 96, "myhome": 14, "ssge": 18},
  "error": ""
}
```

### GET /api/realtors — Список риэлторов

| Параметр | Описание | Пример |
|----------|----------|--------|
| `source` | Фильтр по сайту | `korter` |
| `min_listings` | Мин. кол-во объявлений | `10` |
| `limit` | Макс. результатов | `50` |

```bash
# Риэлторы с >10 объявлениями
curl 'http://localhost:8000/api/realtors?min_listings=10&limit=50'

# Только с korter
curl 'http://localhost:8000/api/realtors?source=korter'
```

**Response:**
```json
{
  "total": 41,
  "realtors": [
    {
      "phone": "593720470",
      "name": "Khatia",
      "source": "myhome",
      "listing_url": "https://myhome.ge/...",
      "profile_url": "https://myhome.ge/...",
      "listings_count": 752,
      "verified": 1
    }
  ]
}
```

### GET /api/realtors/stats — Статистика

```bash
curl http://localhost:8000/api/realtors/stats
```

```json
{
  "total": 129,
  "by_source": {"korter": 96, "myhome": 14, "ssge": 18},
  "top_realtors": [
    {"phone": "593720470", "name": "", "source": "myhome", "listings_count": 752},
    {"phone": "551199637", "name": "Khatia", "source": "korter", "listings_count": 400}
  ]
}
```

### Запуск парсера напрямую (без API)

```bash
# Ежедневный парсинг (только новые объявления, ~5 мин)
xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" \
  python3 realtor_parser.py --daily

# Полный парсинг (все объявления, ~30 мин на сайт)
xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" \
  python3 realtor_parser.py --full --max 2000

# Один сайт
xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" \
  python3 realtor_parser.py --site korter --max 100

# Статистика
python3 realtor_parser.py --stats
```

### Cron для ежедневного парсинга

```bash
0 8,20 * * * cd /root/karty-lab && xvfb-run --auto-servernum \
  --server-args="-screen 0 1280x900x24" \
  venv/bin/python3 realtor_parser.py --daily >> logs/cron.log 2>&1
```

### Категории парсинга

| Сайт | Категории | Кол-во URL |
|------|-----------|------------|
| korter.ge | Продажа/Аренда квартир+домов Тбилиси/Батуми + посуточные | 9 |
| ss.ge | Квартиры/Домы/Земля/Коммерция × Продажа/Аренда + посуточно | 6 |
| myhome.ge | Тбилиси/Батуми × Продажа/Аренда/Посуточно | 6 |

---

## Интеграция с Node.js

```javascript
const PYTHON_API = 'http://localhost:8000';
const POLL_INTERVAL = 30_000;  // 30 секунд
const POLL_TIMEOUT = 30 * 60_000;  // 30 минут

// === Публикация ===

// 1. Запустить публикацию
app.post('/api/listings/publish', async (req, res) => {
  const resp = await fetch(`${PYTHON_API}/api/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: req.user.id,
      sites: req.body.sites,
      listing: req.body.listing
    })
  });
  const { task_id } = await resp.json();
  res.json({ task_id });
});

// 2. Polling статуса (опрашивать каждые 30 сек, до 30 мин)
app.get('/api/listings/status/:taskId', async (req, res) => {
  const resp = await fetch(`${PYTHON_API}/api/publish/${req.params.taskId}`);
  res.json(await resp.json());
});

// 3. Ожидание завершения (для серверного использования)
async function waitForPublish(taskId) {
  const deadline = Date.now() + POLL_TIMEOUT;
  while (Date.now() < deadline) {
    const resp = await fetch(`${PYTHON_API}/api/publish/${taskId}`);
    const status = await resp.json();
    if (status.status !== 'processing') return status;
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error('Publish timed out');
}

// === Парсер ===

// 4. Запустить ежедневный парсинг
app.post('/api/realtors/parse', async (req, res) => {
  const resp = await fetch(`${PYTHON_API}/api/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'daily', sites: ['korter', 'myhome', 'ssge'] })
  });
  const { task_id } = await resp.json();
  res.json({ task_id });
});

// 5. Получить риэлторов
app.get('/api/realtors', async (req, res) => {
  const { min_listings = 10, limit = 50 } = req.query;
  const resp = await fetch(`${PYTHON_API}/api/realtors?min_listings=${min_listings}&limit=${limit}`);
  res.json(await resp.json());
});

// 6. Статистика
app.get('/api/realtors/stats', async (req, res) => {
  const resp = await fetch(`${PYTHON_API}/api/realtors/stats`);
  res.json(await resp.json());
});
```

---

## Структура файлов

```
karty-lab/
├── api/                        # FastAPI микросервис
│   ├── main.py                 # Все эндпоинты (11 штук)
│   ├── schemas.py              # Pydantic модели
│   ├── publisher.py            # Публикация на сайты
│   └── cookie_manager.py       # Cookies + storage_state
├── sites/                      # Логика публикации
│   ├── base.py                 # Базовый класс
│   ├── ss_ge.py                # ss.ge (7/7)
│   ├── myhome_ge.py            # myhome.ge (8/8)
│   └── korter_ge.py            # korter.ge (7/7)
├── parsers/                    # Парсер риэлторов
│   ├── base_parser.py          # Базовый парсер
│   ├── ssge_parser.py          # ss.ge (6 категорий)
│   ├── myhome_parser.py        # myhome.ge (6 категорий)
│   └── korter_parser.py        # korter.ge (9 категорий)
├── cookies/                    # Авторизация
├── realtors.db                 # БД риэлторов (SQLite)
├── parsed_listings.json        # Трекинг обработанных URL
├── realtor_parser.py           # CLI точка входа парсера
├── run_api.py                  # Запуск API
└── README.md
```

## Все API эндпоинты (11)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/health` | Проверка сервера |
| POST | `/api/publish` | Публикация объявления |
| GET | `/api/publish/{task_id}` | Статус публикации |
| POST | `/api/cookies/{user_id}/{site}` | Загрузка cookies |
| POST | `/api/storage-state/{user_id}/{site}` | Загрузка storage_state |
| POST | `/api/parse` | Запуск парсинга |
| GET | `/api/parse/{task_id}` | Статус парсинга |
| GET | `/api/realtors` | Список риэлторов |
| GET | `/api/realtors/stats` | Статистика риэлторов |

## Поддерживаемые комбинации

| Тип | Продажа | Аренда |
|-----|---------|--------|
| Квартира | ss ✅ my ✅ ko ✅ | ss ✅ my ✅ ko ✅ |
| Дом | ss ✅ my ✅ ko ✅ | ss ✅ my ✅ ko ✅ |
| Земля | ss ✅ my ✅ ko ✅ | ss ✅ my ✅ ko ✅ |
| Коммерция | ss ✅ my ✅ ko ✅ | ss ✅ my ✅ ko ✅ |

**21/21 комбинация работает.**

## Требования

- Python 3.10+
- Linux + Xvfb (для non-headless Chromium)
- ~2GB RAM (3 параллельных Chromium)
- Playwright + Chromium
