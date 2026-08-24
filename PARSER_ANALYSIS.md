# CRM Parser: как устроен код

Этот документ описывает live-контур CRM-парсера без Telegram.
Основной код находится в `karty-core/karty-lab-code/`.

## 1. Точка входа

CRM вызывает Node endpoint:

```text
POST /api/realtors/run
```

Node передает запрос Python API:

```ts
const resp = await fetch(`${PYTHON_API}/api/parse`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode, sites, max_per_site: effectiveMax }),
});
```

Python не парсит сайт внутри HTTP-запроса. Он создаёт task и запускает background-задачу:

```python
@app.post("/api/parse", response_model=ParseResponse)
async def start_parse(req: ParseRequest):
    task_id = str(uuid.uuid4())[:8]
    parse_tasks[task_id] = {
        "status": "processing",
        "mode": req.mode,
        "sites": req.sites,
        "realtors_found": 0,
    }

    asyncio.create_task(_run_parse(task_id, req, cancel_event))
    return ParseResponse(task_id=task_id)
```

`_run_parse()` выносит блокирующий Playwright-код в executor, чтобы не блокировать FastAPI event loop:

```python
data = await loop.run_in_executor(None, _blocking_parse)
```

## 2. Последовательность сайтов

В CRM обычно передаются:

```python
sites = ["korter", "ssge", "myhome"]
```

Python обрабатывает их последовательно:

```python
for site in req.sites:
    parse_tasks[task_id]["current_site"] = site

    try:
        count = asyncio.run(parse_site(site, mode=req.mode, task_id=task_id))
        results[site] = count
    except Exception as exc:
        results[site] = 0
        logging.error(f"{site} error: {exc}")
```

Ошибка одного сайта не останавливает следующие сайты.

## 3. Реестр парсеров

Файл `realtor_parser.py` содержит реестр классов:

```python
SITES = {
    "korter": {
        "class": "parsers.korter_parser.KorterParser",
        "headless": True,
        "cookies": "/root/karty-lab/cookies/korter_ge.json",
    },
    "ssge": {
        "class": "parsers.ssge_parser.SsGeParser",
        "headless": True,
        "cookies": "/root/karty-lab/cookies/ss_ge.json",
    },
    "myhome": {
        "class": "parsers.myhome_parser.MyhomeParser",
        "headless": True,
        "cookies": "/root/karty-lab/cookies/myhome_ge.json",
    },
}
```

Класс загружается динамически:

```python
def get_site_class(site_name: str):
    dotpath = SITES[site_name]["class"]
    module_path, class_name = dotpath.rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)
```

Плюс такого подхода: dispatcher не знает деталей конкретной площадки.
Минус: ошибка в строке класса проявляется только во время запуска.

## 4. Общий Playwright-класс

`parsers/base_parser.py` содержит общий браузерный lifecycle:

```python
class BaseParser:
    async def launch(self, cookies_path=None, headless=True):
        self.pw = await async_playwright().start()
        self.browser = await self.pw.chromium.launch(
            headless=headless,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
        )

        self.context = await self.browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=CHROME_USER_AGENT,
        )

        # Cookies фильтруются по домену текущего сайта.
        await self.context.add_cookies(filtered_cookies)
        self.page = await self.context.new_page()
```

После ошибки браузер может быть перезапущен:

```python
async def relaunch(self, cookies_path=None, headless=True):
    await self.close()
    await asyncio.sleep(2)
    await self.launch(cookies_path, headless)
```

## 5. Общий pipeline одного объявления

Для каждого URL dispatcher выполняет одну и ту же бизнес-логику:

```python
async def process_listing(parser, url, site_name, parsed, mode):
    if url in parsed:
        return 0, False

    author = await parser.get_listing_author(url)
    if not author or not author.get("phone"):
        return 0, False

    phone = normalize_phone(author["phone"])
    if not phone:
        return 0, False

    profile = await parser.get_author_profile(author.get("profile_url", ""))
    listings_count = int((profile or {}).get("listings_count", 0))

    if listings_count < MIN_LISTINGS:
        return 0, False

    existing = find_realtor_by_phone(phone)
    upsert_or_update(existing, author, profile, site_name, url)

    parsed[url] = datetime.now().isoformat()
    return 1 if existing is None else 0, False
```

Ключевые фильтры:

```python
MIN_LISTINGS = 20
```

Телефон нормализуется только если это грузинский мобильный номер:

```python
def normalize_phone(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())

    if digits.startswith("995") and len(digits) == 12:
        digits = digits[3:]
    if digits.startswith("0") and len(digits) == 10:
        digits = digits[1:]

    if len(digits) == 9 and digits.startswith("5"):
        return f"+995{digits}"
    return None
```

## 6. Korter

Файл: `parsers/korter_parser.py`.

Korter имеет фиксированный список категорий:

```python
CATEGORIES = [
    "...продажа-квартир-тбилиси?...",
    "...продажа-квартир-батуми?...",
    "...продажа-домов-тбилиси?...",
    "...продажа-домов-батуми?...",
    "...продажа-коммерческой-недвижимости-тбилиси?...",
    "...продажа-коммерческой-недвижимости-батуми?...",
    "...продажа-земельных-участков-тбилиси?...",
    "...продажа-земельных-участков-батуми?...",
    "...аренда-квартир-тбилиси?...",
    "...аренда-квартир-батуми?...",
    "...аренда-коммерческой-недвижимости-тбилиси?...",
    "...аренда-коммерческой-недвижимости-батуми?...",
]
```

URL объявлений берутся из `window.INITIAL_STATE`:

```javascript
const state = window.INITIAL_STATE;
return state.apartmentListingStore.apartments.map(item => ({
  url: "https://korter.ge" + item.link,
  date: item.actualizeTime || "",
}));
```

На странице объявления parser:

1. открывает URL;
2. нажимает «Показать номер»;
3. ищет профиль `/agent/`, `/user/` или `/realtor/`;
4. извлекает телефон из `tel:` или текста;
5. открывает профиль;
6. считает ссылки на объявления и текстовый счётчик.

В full-режиме категория прекращается при обнаружении объявления старше 90 дней.

## 7. SS.ge

Файл: `parsers/ssge_parser.py`.

SS.ge использует фиксированные URL категорий и извлекает ссылки из DOM:

```javascript
const urls = [];
for (const link of document.querySelectorAll("a")) {
  const href = link.href;
  if (href.includes("home.ss.ge") && /\\d{4,}$/.test(href)) {
    urls.push(href);
  }
}
return [...new Set(urls)];
```

На объявлении parser:

1. открывает страницу;
2. нажимает кнопку «Показать номер»;
3. ищет профиль `/user/` или `/profile/`;
4. извлекает мобильный номер;
5. открывает профиль;
6. считает ссылки на объявления.

SS.ge имеет до трёх попыток извлечения автора для одного URL.

## 8. MyHome

Файл: `parsers/myhome_parser.py`.

MyHome не использует общий список `CATEGORIES`. Он строит страницы по комбинации:

```python
CITIES = ["Тбилиси", "Батуми"]
DEALS = [("sale", "1"), ("rent", "2")]
```

URL строится примерно так:

```python
base_url = (
    "https://www.myhome.ge/ru/nedvizhimost/"
    f"?deal_types={deal_type}&CardView=1{city_param}"
)
```

На каждой странице:

1. открывается URL;
2. выполняется прокрутка;
3. из DOM извлекаются ссылки `/ru/nedvizhimost/{id}`;
4. ссылки дедуплицируются;
5. каждое объявление открывается отдельно;
6. нажимается «Показать номер»;
7. ищется профиль `/user-profile/` или `/users/`;
8. извлекается телефон;
9. профиль проверяется по количеству объявлений.

Для MyHome предусмотрен timeout на объявление и relaunch браузера:

```python
try:
    found, _ = await asyncio.wait_for(
        process_listing(parser, url, "myhome", parsed, mode),
        timeout=90,
    )
except asyncio.TimeoutError:
    await parser.relaunch(cookies_path, headless=True)
```

## 9. SQLite

Таблица создаётся в `db.py`:

```sql
CREATE TABLE IF NOT EXISTS realtors (
    phone TEXT PRIMARY KEY,
    name TEXT,
    source TEXT,
    listing_url TEXT,
    profile_url TEXT,
    listings_count INTEGER DEFAULT 0,
    parsed_at TEXT,
    verified INTEGER DEFAULT 0
)
```

Сохранение выполняется через upsert:

```sql
INSERT INTO realtors (...)
VALUES (...)
ON CONFLICT(phone) DO UPDATE SET
    name = excluded.name,
    source = excluded.source,
    listing_url = excluded.listing_url,
    profile_url = excluded.profile_url,
    listings_count = excluded.listings_count,
    parsed_at = excluded.parsed_at,
    verified = excluded.verified
```

Следствие: один телефон может иметь только один `source`. Если тот же риэлтор найден на двух сайтах, последняя запись перезапишет источник и URL.

## 10. Прогресс

Парсер пишет `parse_progress.json`:

```python
update_progress(
    task_id,
    current_site="korter",
    current_url=url,
    processed_count=processed,
    total_urls=total_urls,
    realtors_found=total_found,
)
```

CRM запрашивает статус каждые 5 секунд и показывает:

- текущий сайт;
- категорию;
- текущий URL;
- обработанные URL;
- найденных риэлторов;
- процент выполнения.

## 11. Что важно понимать

- Live-код для CRM находится во внутренней копии `karty-core/karty-lab-code/`.
- Внешние `parsers/` и `sites/` в корне проекта не являются основным CRM parser runtime.
- Парсер использует Playwright Chromium, не Camoufox и не Skyvern.
- Сайты обрабатываются последовательно.
- Ошибка отдельного объявления логируется и пропускается.
- URL без телефона обычно не записывается в `parsed_listings.json`, поэтому может повторно проверяться в следующем запуске.
- Task и history находятся в памяти Python/Node; после рестарта полноценная история запусков не гарантируется.
- Scheduler CRM хранит своё состояние только в памяти Node-процесса.
