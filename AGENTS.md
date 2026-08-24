# AGENTS.md — Karty Lab

> Документ собран по фактическому состоянию кода (read-only исследование).
> Никакие выводы «как должно быть» сюда не вписаны.
> Все утверждения сопровождены ссылками вида `file:line`.

---

## 1. СТРУКТУРА ПРОЕКТА

Проект — двухуровневый: **Node-фронтенд/шлюз** (`karty-core/`) + **Python FastAPI-бэкенд** для публикации/парсинга (`api/`, `sites/`, `parsers/`). Оба живут в одном репозитории `/root/karty-lab`.

```
/root/karty-lab/
├── api/                        # Python FastAPI (порт 8000) — БЭКЕНД ПУБЛИКАЦИИ И ПАРСИНГА
│   ├── main.py                 # 1300 строк: все эндпоинты (publish, parse, realtors, tg, listings, crm-proxy)
│   ├── publisher.py             # Оркестратор публикации: SITE_CLASSES, monkeypatch _launch, _download_photos
│   ├── schemas.py              # Pydantic модели (ListingRequest, PublishRequest, ParseRequest и т.д.)
│   └── cookie_manager.py       # Чтение/запись cookies и storage_state в cookies/<user_id>/
│
├── sites/                      # Публикаторы для каждого сайта (Playwright-код)
│   ├── base.py                # BaseSite.publish() — оркестрация; AsyncCamoufox в _launch — МЁРТВ (см. §3)
│   ├── ss_ge.py               # ss.ge — 1434 строки
│   ├── myhome_ge.py           # myhome.ge — 744 строки
│   ├── korter_ge.py           # korter.ge — 606 строки
│   └── realting_com.py        # НЕ РАБОЧИЙ (ImportError; нет в SITE_CLASSES) — см. §7
│
├── parsers/                   # ВНЕШНЯЯ копия парсеров риэлторов (НЕ ИСПОЛЬЗУЕТСЯ в рантайме)
│   ├── base_parser.py        # Playwright + playwright_stealth
│   ├── ssge_parser.py / myhome_parser.py / korter_parser.py
│
├── karty-core/                 # ★ Node-приложение (React/Vite/Express) — мини-апп + CRM + шлюз
│   ├── server.ts              # Express, слушает 0.0.0.0:3000, проксирует Python API, /api/crm/*, /api/auth/*
│   ├── server/                # TS-модули бэкенда
│   │   ├── pythonApi.ts       # spawn Python FastAPI как child process
│   │   ├── bot.ts             # node-telegram-bot-api (опционально)
│   │   ├── supabase.ts        # service-role Supabase client
│   │   ├── crmAuth.ts         # SQLite crm.db: таблица managers (default admin/admin123, sha256)
│   │   ├── crmChats.ts       # SQLite: chats, chat_messages, chat_accounts
│   │   ├── authManager.ts     # логин по паролю для ssge/myhome/realting через удалённый browserless
│   │   ├── korterAuth.ts      # 2FA для korter.ge через удалённый browserless
│   │   ├── korterPublisher.ts / myhomePublisher.ts / ssgePublisher.ts / realtingPublisher.ts  # ЛЕГАСИ TS-публикаторы (не импортируются server.ts)
│   │   ├── skyvernOrchestrator.ts  # 340 строк Skyvern-оркестрация — НЕ ПОДКЛЮЧЕНА к роутам
│   │   ├── ai.ts             # DeepSeek parse-listing
│   │   ├── tgUserbot.py      # Telethon FastAPI на :8001 (запрос/подтверждение кода, отправка)
│   │   ├── template.css / template.html  # забытые stub'ы (129 байт)
│   │   └── omniChats.ts      # ещё один chat-модуль — не импортируется
│   ├── src/
│   │   ├── App.tsx            # маршруты: /, /app/*, /crm/*, /video
│   │   ├── main.tsx / index.css / i18n.ts (9.7 KB локализация) / types.ts
│   │   ├── firebase.ts        # 8 строк; init Firebase, но live-вкладки используют Supabase — фактически мёртв
│   │   ├── lib/supabase.ts
│   │   ├── pages/
│   │   │   ├── MiniApp.tsx    # 1205 строк: CreateTab, HistoryTab ("Мои объекты"), PlatformsTab, BottomBar
│   │   │   ├── Crm.tsx       # 738 строк: chat / dashboard / leads / finances / agencies / parser / telegram / settings
│   │   │   ├── CrmChats.tsx  # 442 строки: WhatsApp/TG inbox (платный модуль внутри Crm)
│   │   │   ├── LandingPage.tsx / LoginPage.tsx / VideoExport.tsx
│   │   │   └── MiniApp.tsx.bak и др. (см. §7)
│   │   └── components/
│   │       ├── PresentationsTab.tsx  # вкладка презентаций: 6 тем, live preview и share-ссылки на 3 дня
│   │       ├── PlannerTab.tsx        # 352 строки (Supabase planner_notes/planner_tasks)
│   │       ├── ParserTab.tsx         # UI управления /api/realtors/run, scheduler, история, per-category grid
│   │       ├── TelegramTab.tsx      # 267 строк — UI Telegram monitoring (чаты, аккаунты, логин)
│   │       ├── KorterAuth.tsx / PlatformLoginAuth.tsx / PlatformIcons.tsx / AuthAnimation.tsx
│   │       └── PresentationsTab.tsx.bak  # 45 KB (мёртвый бэкап)
│   ├── karty-lab-code/        # ★ ВНУТРЕННЯЯ копия Python-кода — ИСПОЛЬЗУЕТСЯ для парсеров/БД/tg
│   │   ├── realtor_parser.py  # dispatcher parse_site() + parse_category() — реально живой парсер
│   │   ├── category_scheduler.py  # ★ RAM-aware category-level parallel scheduler (426 строк)
│   │   ├── db.py               # схема realtors (аналог /root/karty-lab/db.py)
│   │   ├── tg_parser.py        # Telethon-парсер пользователей Telegram чатов
│   │   ├── parsers/            # ВНУТРЕННЯЯ (живая) копия парсеров (Playwright, без stealth)
│   │   ├── sites/              # ВНУТРЕННЯЯ копия публикаторов (дрифтует с внешней — НЕ ИСПОЛЬЗУЕТСЯ api/publisher.py)
│   │   └── api/                # старая копия FastAPI (7.7 KB) — НЕ запускается (по логу нет uvicorn)
│   ├── package.json           # React 19, Vite 6, Express, @supabase/js, firebase, puppeteer-core, better-sqlite3, http-proxy-middleware, node-telegram-bot-api, openai/@google/genai
│   ├── supabase_schema.sql    # listings/presentations/planner_notes/planner_tasks/platform_sessions + RLS (фактически USING(true))
│   ├── crm.db                 # SQLite CRM (managers/chats/chat_accounts) — используется crmAuth.ts/crmChats.ts
│   ├── firestore.rules / firebase-applet-config.json / firebase-blueprint.json  # легаси схема listings (не live)
│   ├── app/                   # мёртвые скрипты applet/vps-browser-service (см. §7)
│   ├── bb_test.ts / check.ts / dump.ts / fix.js / fix_myhome.js / fix_ssge.js / test*.ts  # scratch-файлы (§7)
│   └── ecosystem.config.cjs   # pm2-конфиг (см. §конфиги)
│
├── utils/
│   ├── browser.py            # 2 строки-заглушка: load_selectors() возвращает {} — см. §7
│   ├── cookies.py            # load_cookies / cookies_to_playwright (исп. только в base.py МЁРТВОГО _launch)
│   ├── logger.py             # setup_logger + screenshot_path
│   └── tester.py             # TestSession — CloakBrowser/Camoufox/Playwright на выбор; ТОЛЬКО для check_screenshot.py/check_urls.py, НЕ для публикации
│
├── cookies/                  # хранилище сессий: cookies/<user_id>/<site>.json и <site>_state.json
├── uploads/                 # временные фото, удаляются после публикации (publisher.py:170-174)
├── backups/                 # бэкапы перед рефакторингом (pre-category-parallelism/)
├── logs/                    # api.log, server.log, parser.log (3.2 MB), myhome_api.log, parser/ — см. §7
├── screenshots/             # скриншоты публикаций (по site)
├── myhome_captcha_test/     # 5 PNG — эксперимент с капчей, НЕ интегрирован в myhome_ge.py
├── realtors.db              # SQLite — основная БД риэлторов
├── parsed_listings.json     # трекинг обработанных URL (дамп)
├── realtor_parser_OLD.py    # 18.5 KB — старый парсер
├── realtor_parser.py        # внешний CLI-парсер (дрифтует с внутренним karty-core/.../realtor_parser.py)
├── config.py                # SITES=["ss_ge","myhome_ge","korter_ge","realting_com"] — realting_com не зарегистрирован в API
├── requirements.txt
├── run_api.py              # uvicorn api.main:app (порт 8000)
├── install.sh / systemd/    # автозапуск
└── README.md / PROJECT_KNOWLEDGE.md / MEMORY.md / PROGRESS.md / INSTRUCTION_FOR_AI_STUDIO.md / API_REFERENCE.txt
```

### Конфиги и запуск (кратко)
- **systemd**: `karty-publisher.service` (`/etc/systemd/system/`) — `Restart=always`, `KillMode=control-group`. Запускает `tsx server.ts` (Node), который спавнит Python API как child process. `systemctl enable --now karty-publisher`.
- Python API: запускается через `xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 run_api.py` (нужен виртуальный дисплей для non-headless Playwright). Node spawner делает это сам: `karty-core/server/pythonApi.ts` запускает Python как child-process.
- Node: `karty-core/package.json` — `dev: tsx server.ts`, `start: node dist/server.cjs`. Слушает `0.0.0.0:3000`.
- Telethon userbot: `server/tgUserbot.py` FastAPI на `:8001`.
- pm2: `karty-core/ecosystem.config.cjs` (legacy, теперь используется systemd).
- `config.py:10` содержит **зашитый GitHub PAT** (`ghp_...gestW0`) — секрет в исходниках (§7).

---

## 2. API-ЭНДПОИНТЫ

### 2.1 Python FastAPI — `api/main.py`, порт 8000
| Метод | Путь | Что делает | Файл:line |
|---|---|---|---|
| GET  | `/api/health` | health-check | api/main.py:35 |
| POST | `/api/cookies/{user_id}/{site}` | сохранить cookies (site ∈ ss_ge/myhome_ge/korter_ge) | api/main.py:40 |
| POST | `/api/storage-state/{user_id}/{site}` | сохранить storage_state (cookies + localStorage) — нужен для korter.ge | api/main.py:50 |
| POST | `/api/publish` | старт async-задачи публикации на сайт(ы); возвращает task_id | api/main.py:72 |
| GET  | `/api/publish/{task_id}` | статус задачи (in-memory `tasks` dict) | api/main.py:107 |
| POST | `/api/listings/delete` | удалить объявление с платформы (запускает sites/*._delete_listing; HARDCODED USER_ID="test_user") | api/main.py:572 |
| POST | `/api/listings/republish` | удалить + опубликовать заново | api/main.py:637 |
| POST | `/api/parse` | запуск парсинга риэлторов (mode/sites/max_per_site) | api/main.py:127 |
| GET  | `/api/parse/{task_id}` | статус парсинга (in-memory + parse_progress.json) | api/main.py:260 |
| POST | `/api/parse/{task_id}/cancel` | сигнал отмены | api/main.py:299 |
| POST | `/api/parse/{task_id}/resume` | продолжить упавший/cancelled parse новым task_id | api/main.py:318 |
| GET  | `/api/parse/history` | последние 20 запусков (in-memory) | api/main.py:254 |
| GET  | `/api/realtors` | список риэлторов (фильтры source/min_listings/limit) | api/main.py:359 |
| GET  | `/api/realtors/stats` | статистика по БД (top_realtors) | api/main.py:377 |
| GET  | `/api/realtors/categories/{task_id}` | per-category progress для UI grid (CategoryScheduler.summary() или checkpoint fallback) | api/main.py:855 |
| GET  | `/api/tg/chats` | список мониторинговых Telegram-чатов | api/main.py:400 |
| POST | `/api/tg/chats` | добавить чат | api/main.py:412 |
| DELETE | `/api/tg/chats/{chat_id}` | удалить чат | api/main.py:433 |
| GET  | `/api/tg/accounts` | Telegram-аккаунты (session_string вырезается) | api/main.py:446 |
| POST | `/api/tg/accounts/login` | запрос отправочного кода (вызов tgUserbot.request_code) | api/main.py:458 |
| POST | `/api/tg/accounts/confirm` | подтверждение кода → сохранение session_string | api/main.py:477 |
| GET  | `/api/tg/stats` | статистика Telegram users/chats/accounts | api/main.py:512 |
| GET  | `/api/tg/users` | собранные Telegram-пользователи | api/main.py:527 |
| POST | `/api/tg/start` | запуск `tg_parser.py --mode monitor` через subprocess | api/main.py:542 |
| POST | `/api/tg/scan` | разовый `tg_parser.py --mode scan` | api/main.py:556 |

### 2.2 Node Express — `karty-core/server.ts`, порт 3000
Часть роутов — чистый проксик на Python API (`createProxyMiddleware` для `/api/parse`, `/api/cookies`, `/api/storage-state` — `server.ts:249-255`). Ниже — ключевые собственные роуты (полный список длинный, см. `server.ts`).

| Метод | Путь | Что делает | Файл:line |
|---|---|---|---|
| GET  | `/install.sh` | отдаёт shell-скрипт установки Steel Browser docker-контейнера | server.ts:215 |
| GET  | `/api/health` | health | server.ts:244 |
| GET  | `/api/auth/debug-sessions` | проксик на внешнюю `72.56.1.59:3001/sessions` (remote browserless) | server.ts:285 |
| POST | `/api/auth/korter/start` | фаза 1 2FA-логина korter (через `korterAuthManager`, удалённый browserless) | server.ts:258 |
| POST | `/api/auth/korter/verify` | фаза 2 2FA | server.ts:270 |
| POST | `/api/auth/generic/login` | парольный логин ssge/myhome/realting (authManager.ts → remote browserless) | server.ts:295 |
| POST | `/api/auth/remove` | удалить сессию платформы из Supabase `platform_sessions` | server.ts:312 |
| POST | `/api/publish/korter` | обёртка над `${PYTHON_API}/api/publish` с sites=['korter_ge'] | server.ts:341 |
| POST | `/api/publish/ssge` | то же для ss_ge | server.ts:366 |
| POST | `/api/publish/myhome` | то же для myhome_ge | server.ts:391 |
| POST | `/api/publish/realting` | то же для realting_com → **Python вернёт 400** (нет в valid_sites) | server.ts:416 |
| POST | `/api/publish/auto` | мульти-портальная публикация, маппинг через SITE_MAP | server.ts:442 |
| GET  | `/api/publish/:taskId/status` | проксик статуса | server.ts:469 |
| POST | `/api/parse-listing` | DeepSeek text→structured listing (`ai.ts`) | server.ts:524 |
| GET/POST | `/api/realtors/scheduler` | тумблер Node-планировщика (каждые 6 ч) | server.ts:538/543 |
| POST | `/api/realtors/run` | запуск парсинга → `${PYTHON_API}/api/parse` | server.ts:578 |
| GET  | `/api/realtors/status/:taskId` | статус + сохранение в parseHistory | server.ts:600 |
| POST | `/api/realtors/cancel/:taskId` / `resume/:taskId` | проксики | server.ts:625/638 |
| GET  | `/api/realtors/history` | последние 20 в in-memory parseHistory | server.ts:653 |
| GET  | `/api/realtors/list` / `/stats` | проксики на Python | server.ts:658/672 |
| GET  | `/api/realtors/categories/:taskId` | проксик per-category progress на Python | server.ts:672+ |
| POST | `/api/listings/delete` / `/api/listings/republish` | проксики на Python | server.ts:682/692 |
| POST | `/api/presentations/generate` | отключён: PDF больше не генерируется | server.ts:933 |
| POST | `/api/presentations/preview-html` | live HTML preview карточки объекта с DeepSeek enrichment | server.ts:1102 |
| POST | `/api/presentations/share` | сохраняет одностраничник в Supabase и возвращает `/p/:id` на 3 дня | server.ts:1159 |
| GET | `/p/:id` | публичная web-карточка; после TTL показывает истёкшую ссылку | server.ts:1230 |
| POST | `/api/presentations/parse-listing` | DeepSeek text/url → JSON объекта | server.ts:933 |
| POST | `/api/crm/login` | логин CRM (SQLite managers, sha256) | server.ts:1076 |
| GET  | `/api/crm/session` | валидация Bearer-токена | server.ts:1086 |
| GET/POST/DELETE | `/api/crm/managers` / `/api/crm/managers/:id` | CRUD managers (admin) | server.ts:1090/1094/1105 |
| GET/POST | `/api/crm/chats` | CRUD chats | server.ts:1111/1116 |
| GET/POST | `/api/crm/chats/:chatId/*` | сообщения, чтение, назначение, отправка | server.ts:1132/1136/1143/1148/1230 |
| GET/POST/DELETE | `/api/crm/accounts`, `/api/crm/accounts/:id` | CRUD TG-аккаунтов CRM (admin) | server.ts:1154/1158/1165 |
| POST | `/api/crm/accounts/tg/request-code` / `/confirm` / `/start` | проксики на USERBOT_API:8001 | server.ts:1173/1187/1207 |
| GET  | `/api/crm/accounts/dialogs/:accountName` | проксик | server.ts:1221 |
| POST | `/api/crm/accounts/:id/assign` | назначение менеджера (admin) — **вероятно ReferenceError на `getDb`**, §7 | server.ts:1256 |
| GET/POST/DELETE | `/api/tg/*` | проксики на Python (8 роутов) | server.ts:1266+ |

---

## 3. ПУБЛИКАЦИЯ ОБЪЯВЛЕНИЙ ПО КАЖДОМУ САЙТУ

> ⚠️ **ВАЖНОЕ РАСХОЖДЕНИЕ с предпосылкой брифа.**
> По факту кода **все 3 сайта используют ОДИН И ТОТ ЖЕ инструмент** —
> vanilla **Playwright Chromium** (`from playwright.async_api import async_playwright`),
> с идентичным набором хром-флагов и одинаковым UA `'Chrome/131.0.0.0'`.
> Camoufox заявлен в `sites/base.py` (`AsyncCamoufox`), но **переопределён** в каждом из сайтов
> и **повторно перетёрт** в `api/publisher.py` — то есть в рантайме фактически не используется.
> CloakBrowser встречается ТОЛЬКО в `utils/tester.py` (debuharness для `check_screenshot.py`/`check_urls.py`),
> НИКАКОЙ публикатор его не вызывает.
> Капчи-солверов (CapMonster / 2Captcha / CapSolver) в пайплайне публикации НЕТ.
> Это зафиксировано как факт; рекомендации «унифицировать» в этом документе НЕ даются.

### Общая точка оркестрации — `api/publisher.py`

`SITE_CLASSES` (`api/publisher.py:9-13`) — реестр только 3 сайтов:
```python
SITE_CLASSES = {
    "ss_ge":      "sites.ss_ge.SsGeSite",
    "myhome_ge":  "sites.myhome_ge.MyhomeGeSite",
    "korter_ge":  "sites.korter_ge.KorterGeSite",
}
```
В `publish_to_site()` (`api/publisher.py:87-149`) делается **monkeypatch `_launch`** для любого сайта:
- `sites/ss_ge.py:62-81`, `sites/myhome_ge.py:59-77`, `sites/korter_ge.py:12-26` — каждый определяет свой `_launch()` с одинаковым Playwright-Chromium-стартом;
- `api/publisher.py:98-135` ещё раз подменяет `_launch` на `patched_launch` с тем же Playwright Chromium и тем же хром-флагами (т.е., собственный `_launch` сайта фактически не отрабатывает);
- выбор `storage_state` vs cookies делается здесь же: если есть `get_storage_state(...)` — используется `new_context(storage_state=state, …)`; иначе `add_cookies(...)` после `new_context(…)` (`api/publisher.py:118-131`);
- UA фиксирован: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36` (`api/publisher.py:122/127`);
- `_delete_listing` подменяется на `no_delete` (`api/publisher.py:137-139`) — при публикации через API **удаление отключено**; `BaseSite.publish()` логирует "Publish complete (delete disabled)" (`sites/base.py:200`).
- Фаллбэка на другой браузерный движок НЕТ ни в `publisher.py`, ни в site-классах.

Базовый flow в `sites/base.py:publish()` (`sites/base.py:106-215`): `goto base_url → _verify_auth (проверка cook/session) → _navigate_to_add → _select_deal → _select_type → _select_subtype → _fill_fields → _upload_photos → screenshot "filled" → _publish → _check_listing_alive → screenshot "published"`; 3 попытки `_launch` (`sites/base.py:111-137`) — но в каждой попытке тот же Playwright, альтернатив нет; при фейле делают `pkill -9 firefox / camoufox` (`base.py:132-133` и `base.py:62-63` в `_close`), что для chromium no-op, но оставлено для чистки зомби-процессов camoufox, если бы он запускался.

#### Хром-флаги (одинаковые для всех 3 сайтов × 2 точках)
```
--no-sandbox
--disable-blink-features=AutomationControlled
--enable-webgl
--ignore-gpu-blocklist
--use-gl=angle
--use-angle=swiftshader
--enable-unsafe-webgpu
--disable-gpu-sandbox
```
(`sites/ss_ge.py:67-76`, `sites/myhome_ge.py:65-73`, `sites/korter_ge.py:13-22`, `api/publisher.py:106-114`)

#### Замечание про `PROJECT_KNOWLEDGE.md`
В `PROJECT_KNOWLEDGE.md:91-95` есть блок «DO NOT MODIFY»: там говорится, что `AsyncCamoufox(headless=HEADLESS)` якобы используется в `sites/base.py` для обхода Cloudflare, и «замена на стандартный Playwright приведет к бану». По факту кода **замена уже произошла** (переопределение в site-классах + повторный monkeypatch в `publisher.py`) — т.е. формулировки в `PROJECT_KNOWLEDGE.md` описывают намерение/легаси, а не текущий рантайм.

---

### 3.1 ss.ge — `sites/ss_ge.py`

**Инструмент:** vanilla Playwright Chromium. Импорт и старт — `sites/ss_ge.py:62-77`:
```python
from playwright.async_api import async_playwright
self._pw = await async_playwright().start()
self.browser = await self._pw.chromium.launch(headless=False, args=[...см. выше...])
self.context = await self.browser.new_context(
    viewport={"width":1280,"height":900},
    user_agent="...Chrome/131.0.0.0..."
)
```
Никаких импортов `camoufox`, `cloakbrowser`, `patchright`, `playwright_stealth` в файле НЕТ (grep-проверено: `sites/ss_ge.py` не возвращает матчей).

**Селекторы / степы / сценарий** — всё захардкожено в теле `sites/ss_ge.py`:
- `CREATE_URL` (стр. 6), `STREET_TO_GEORGIAN` (стр. 9-45), `_to_georgian_street` (стр. 48-55)
- `_verify_auth` (стр. 147) — ищет кнопку «Авторизация»
- `_dismiss_draft_modal` (стр. 172), `_mouse_click_text` (стр. 190 — инъекция JS по тексту+bounding box)
- `_navigate_to_add` (стр. 221)
- `_select_deal` (стр. 227) — тексты `Купить`/`Снять`/`Посуточно`
- `_select_subtype` (стр. 259) — no-op с логом «ss.ge has no subtypes»
- `_select_type` (стр. 262)
- `_fill_fields` (стр. 299 — огромный блок: город/улица/дом/комнаты/площадь/этаж/спальни/статус/состояние/цена/описание/телефон)
- `_upload_photos` (стр. 1038)
- `_publish` (стр. 1057 — «Продолжить» → «Размещение заявки», парсит URL из API-ответов)
- `_delete_listing` (стр. 1309, отключён через monkeypatch в `api/publisher.py:137-139`)
- `_check_listing_alive` (стр. 1426)
Утилитарная `utils/browser.py:load_selectors()` возвращает `{}` — она вызывается из `sites/base.py:114`, но селекторы фактически не используются, всё в коде.

**Антибот конкретно для ss.ge:**
- Fingerprint spoofing: НЕТ. Только аргумент `--disable-blink-features=AutomationControlled` (`ss_ge.py:69`), плюс WebGL/SwiftShader-флаги.
- User-Agent: жёстко `Chrome/131.0.0.0` Desktop (`ss_ge.py:80`).
- Прокси: НЕТ.
- Задержки: обильные — `asyncio.sleep(10)` после навигации (`ss_ge.py:150,223`), `.type(street_search, delay=80)` (`ss_ge.py:379`), `delay=30` при вводе цены (`ss_ge.py:959`), межстеп-сны 2-10с.
- Капча: НЕТ (CapMonster/2Captcha не подключён; отдельной папки/ss-капчи нет вообще).

**Fallback на другой движок:** НЕТ. Один Playwright-старт; при фейле — те же 3 попытки `_launch` (`sites/base.py:111-137`), без смены движка.

**TODO/ FIXME / заметно сломанное:** явных маркеров нет, но:
- Опечатка в списке типов land: `"land": ["Участок","Учеток"]` (`ss_ge.py:266`) — «Учеток» вместо «Участок».
- Мёртвая переменная `floor_input` — `ss_ge.py:565-575`: значение из `page.evaluate(...)` (bool) переприсваивается и тут же затирается новым locator'ом. Работает только потому, что ниже пересоздаётся.
- JS-обход валидации в `_publish` — force-клик «Полная стоимость» через JS (`ss_ge.py:762-779`).

---

### 3.2 myhome.ge — `sites/myhome_ge.py`

**Инструмент:** vanilla Playwright Chromium. Импорт `from playwright.async_api import async_playwright` (`myhome_ge.py:3`); старт идентичен ss.ge (`myhome_ge.py:59-77`). Никаких camoufox/cloakbrowser/patchright/stealth в файле НЕТ.

**Селекторы / степы / сценарий** — всё в теле `sites/myhome_ge.py`:
- `STREET_TO_GEORGIAN` (стр. 8-38), `STREET_TO_TRANSLIT` в коде **НЕ определён** (см. §7).
- `_to_georgian_street` (стр. 41-52)
- `_launch` (стр. 59), `_close` (стр. 108)
- `_verify_auth` (стр. 134)
- `_navigate_to_add` (стр. 155 — прямой URL `https://statements.myhome.ge/ru/statement/create?referrer=myhome`)
- `_click_test_id` (стр. 161) — в качестве первичных селекторов используются `data-test-id`
- `_select_type` (стр. 169), `_select_deal` (стр. 183), `_select_subtype` (стр. 195)
- `_fill_fields` (стр. 215: статус/состояние, локация, комнаты, площадь, этаж, этажность, спальни, project_type, цена, описание, contact_name)
- `_upload_photos` (стр. 521)
- `_publish` (стр. 533, + обработка чекбокса livo/checkout)
- `_delete_listing` (стр. 639, перезапускает браузер если `self.page` закрыт)
- `_check_listing_alive` (стр. 713)

**Антибот конкретно для myhome.ge:**
- Fingerprint spoofing: НЕТ (только `--disable-blink-features=AutomationControlled`, `myhome_ge.py:65`).
- User-Agent: тот же `Chrome/131.0.0.0` (`myhome_ge.py:76`).
- Прокси: НЕТ.
- Задержки: `asyncio.sleep(5)` после auth (`:138`); `.type(street, delay=80)` (`:297`); `delay=80` для ввода `floors_total` (`:404, :422`); `sleep(8)` после навигации, `sleep(10)` после публикации (`:583`).
- Капча: НЕТ. Отдельная папка `/root/karty-lab/myhome_captcha_test/` (5 PNG `w_01.png … w_30s.png`) — это следы эксперимента, **интеграции в `myhome_ge.py` нет**.

**Fallback на другой движок:** НЕТ.

**TODO / сломанное:**
- Мёртвый код в `_to_georgian_street` (`myhome_ge.py:41-52`): после `return clean` идёт ещё блок `clean = …; if clean in STREET_TO_TRANSLIT: … return clean` — недостижим, причём `STREET_TO_TRANSLIT` нигде не определён (NameError, если бы достигалось).
- JS-инъекция в `_publish` для force-enable кнопки (`myhome_ge.py:536-546`).
- Хак «Uncheck livo as ABSOLUTE LAST STEP» (`myhome_ge.py:549-565`).
- `_delete_listing` сам перезапускает `_launch()` (`:642-643`), что ломает консистентность контекста к моменту `_close` в базовом классе.

---

### 3.3 korter.ge — `sites/korter_ge.py`

**Инструмент:** vanilla Playwright Chromium. Импорт `from playwright.async_api import async_playwright` (`korter_ge.py:3`); старт (`korter_ge.py:12-26`). Никаких camoufox/cloakbrowser/patchright/stealth в файле НЕТ.

**Селекторы / степы / сценарий** — всё в теле `sites/korter_ge.py`:
- `_launch` (стр. 12 — внутриплаговская **цепочка загрузки state**: сначала `storage_state`, при отсутствии — `cookies`, при отсутствии — чистый контекст; см. ниже)
- `_close` (стр. 61) — **БЕЗ** `pkill firefox/camoufox` (в отличие от `base.py:62-63`), т.к. использован chromium
- `_verify_auth` (стр. 88 — проверка отсутствия «Войти»)
- `_dismiss_overlays` (стр. 107)
- `_navigate_to_add` (стр. 117 — клик по кнопке «Добавить» на главной)
- `_select_deal` (стр. 143 — тексты `Продажа` / `Долгосрочная аренда`)
- `_click_dropdown_option` (стр. 189 — DOM-walking через `evaluate`, выбор опции по точному тексту+rect)
- `_handle_map_pin` (стр. 228 — НО НИКЕМ НЕ ВЫЗЫВАЕТСЯ в `BaseSite.publish`, см. §7)
- `_click_button` (стр. 253)
- `_select_type` (стр. 262 — `Квартира`/`Дом`/`Участок`/`Коммерческая недвижимость`)
- `_select_subtype` (стр. 274)
- `_fill_fields` (стр. 289 — city через `input[name='custom.geoObjectSearch']`, улица, houseNumber, roomCount-*, bedroomCount-*, area, land_area, floor, floors total, описание, цена `$`)
- `_upload_photos` (стр. 505 — **нет проверки на минимум 3 фото**)
- `_publish` (стр. 517 + JS-force-enable кнопки «Опубликовать объект»)
- `_delete_listing` (стр. 571), `_check_listing_alive` (стр. 594)

**Антибот конкретно для korter.ge:**
- Fingerprint spoofing: НЕТ (`--disable-blink-features=AutomationControlled` только в хром-флагах, `korter_ge.py:18`).
- User-Agent: тот же `Chrome/131.0.0.0`, задаётся **в обеих ветках** контекста (`korter_ge.py:35-39` для storage_state и `:44-47` для fallback).
- Прокси: НЕТ.
- Задержки: `delay=80` для города (`:300`); `delay=100` для улицы (`:355`) и номера дома (`:401`); межстеп `sleep(2-3)`; `sleep(10)` после публикации (`:538`).
- Капча: НЕТ.

**Fallback:** движка на другой браузер НЕТ. Зато есть **внутри-Paywright auth-state fallback** (`korter_ge.py:31-57`):
```python
try:
    if os.path.exists(state_path):
        with open(state_path) as f: state = json.load(f)
        self.context = await self.browser.new_context(storage_state=state, viewport=..., user_agent=...)
    else:
        raise FileNotFoundError("no state file")
except Exception:
    self.context = await self.browser.new_context(viewport=..., user_agent=...)
    try:
        if os.path.exists(cookie_path):
            cookies = ...
            await self.context.add_cookies(cookies)
    except Exception as e:
        self.log.warning(f"Cookie load failed: {e}")
```
Это только про credentials, не про движок. В `api/publisher.py:117-131` та же логика (приоритет `storage_state`, иначе cookies) — тоже в рамках Playwright Chromium.

**TODO / сломанное:**
- `_handle_map_pin()` (`korter_ge.py:228-251`) определён, но `BaseSite.publish()` его НЕ вызывает — мёртвый код в нормальном flow.
- JS-обход валидации в `_publish` (`korter_ge.py:520-531`): `btn.disabled=false; … opacity=1; pointerEvents='auto'`, потом `force=True` клик (`:536`).
- Целочисленное деление `rect['w']//2` над JS-возвращённым float в `_click_dropdown_option` (`korter_ge.py:247`) — мелкая некорректность.
- `_close()` не делает pkill firefox/camoufox (осознанно), в отличие от `base.py` — поведенческая несовместимость с базой.

---

### 3.4 (Бонус) `utils/tester.py` — CloakBrowser в кодовой базе
`utils/tester.py:TestSession.launch_browser(engine=...)` — единственное место, где встречаются **cloakbrowser** и **camoufox**:
- `engine == "cloakbrowser"` (по умолчанию): `import cloakbrowser; await cloakbrowser.launch_context_async(headless=True, …, record_har_path=har_path)` (`utils/tester.py:29-37`);
- `engine == "camoufox"`: `from camoufox.async_api import AsyncCamoufox; AsyncCamoufox(headless=True).start()` (`utils/tester.py:38-45`);
- `engine == "playwright"`: тот же Playwright Chromium + UA `Chrome/131.0.0.0` (`utils/tester.py:46-65`).
Используется только `check_screenshot.py`/`check_urls.py` (debuharness), **ни один публикатор это не применяет**.

### 3.5 `sites/base.py:3` — Camoufox в `_launch`
```python
from camoufox.async_api import AsyncCamoufox
...
self._cm = AsyncCamoufox(headless=HEADLESS)
self.browser = await self._cm.start()
```
Эта `_launch` наследуется по умолчанию, но **полностью переопределена** в ss_ge/myhome_ge/korter_ge, а сверху `'api/publisher.py:patched_launch'` ещё раз подменяет метод. То есть в реальной публикации **camoufox не стартует**. `pkll firefox/camoufox` в `_close` (`base.py:62-63`) и в retry-цикле (`base.py:132-133`) — это артефакт предыдущей схемы, сейчас бесполезен (но удалять не рекомендуют для чистки зомби, если когда-то camoufox запустится).

---

## 4. АВТОРИЗАЦИЯ РИЭЛТОРОВ НА САЙТАХ

Схема — **ручная загрузка** риэлтором авторизационных данных в `/root/karty-lab/cookies/` через Python-эндпоинты. Никакого серверного login-flow для ss.ge/myhome.ge/korter.ge внутри публикационного бэкенда **нет** (логин происходит во внешнем браузере на Маке/ПК риэлтора, потом куки выгружаются и грузятся в API).

### Хранение
Функции `api/cookie_manager.py`:
- `get_cookies(user_id, site)` — читает `cookies/<user_id>/<site>.json` (`:8-14`).
- `get_storage_state(user_id, site)` — читает `cookies/<user_id>/<site>_state.json` (`:17-23`), возвращает `dict | None`.
- `save_cookies(user_id, site, cookies)` — пишет `cookies/<user_id>/<site>.json` (`:26-32`).
- `save_storage_state(user_id, site, state)` — пишет `cookies/<user_id>/<site>_state.json` (`:35-41`).
- `has_cookies(user_id, site)` — True, если **либо** cookies, **либо** storage_state существует (`:44-48`).

### Загрузка в API
- `POST /api/cookies/{user_id}/{site}` (`api/main.py:40`) — принимает `list[dict]` (cookie-entries в браузерном экспорт-формате) и сохраняет в `<user_id>/<site>.json`.
- `POST /api/storage-state/{user_id}/{site}` (`api/main.py:50`) — принимает полный `dict` Playwright `storage_state` (cookies + localStorage origins), пишется в `<user_id>/<site>_state.json`. Эндпоинт явно подписан «Required for korter.ge which stores auth in localStorage, not cookies».

### Как привязываются к публикациям
`api/publisher.py:publish_to_site()`:
- сначала проверка `has_cookies(...)` (`:89`) — иначе fail с `Cookies not found`;
- `user_cookies = get_cookies(...)` (`:95`); `storage_state = get_storage_state(...)` (`:96`);
- в `patched_launch` (`:100-135`) — приоритет **storage_state** (если есть файл `*_state.json`, контекст создаётся с `storage_state=state`); иначе создаётся чистый контекст + `add_cookies(...)` (через `_build_cookies_for_context`, `:57-84`, фильтрует cookie по доменам сайта и нормализует sameSite/expires/secure/httpOnly).
- µưu всего: только домены сайтов фильтруются через `SITE_DOMAINS` (`api/publisher.py:15-19`) — ss.ge / myhome.ge / korter.ge соответственно.

### Особенности по сайтам
| Сайт | Что работает | Файл:line |
|---|---|---|
| **ss.ge** | cookies (`cookies/<user_id>/ss_ge.json`) — основной путь | `sites/ss_ge.py:83-101` (загрузка внутри std `_launch`; в реальности переопределено на publisher.py) |
| **myhome.ge** | cookies (`cookies/<user_id>/myhome_ge.json`) | `sites/myhome_ge.py` (через `api/publisher.py:_build_cookies_for_context`) |
| **korter.ge** | **storage_state обязателен** — куки в localStorage; приоритет в `api/publisher.py:117-123` и fallback `:124-131`; повтор логики в `sites/korter_ge.py:31-57` | тот же приоритет в `_launch`, см. §3.3 |

### Где генерируются (на стороне риэлтора)
README (`README.md:201-213`) даёт Python-скрипт для генерации storage_state на Маке:
```python
with sync_playwright() as p:
    ...
    page.goto('https://korter.ge')
    input('Залогинься (телефон + SMS) и нажми Enter...')
    json.dump(ctx.cookies(), open('cookies/korter_ge.json', 'w'))
    ctx.storage_state(path='cookies/korter_ge_state.json')
```
Куки ss.ge/myhome.ge — обычная выгрузка расширения браузера.

### Где хранятся в БД
**В БД они НЕ хранятся.** `realtors.db` (SQLite) хранит только риэлторов и (мануально созданные) telegram-таблицы — для публикационных кук/сессий **отдельной таблицы нет**, всё на файловой системе в `cookies/<user_id>/`.
В **Supabase** (`karty-core/supabase_schema.sql`) таблица `platform_sessions(user_id, platform, state jsonb, created_at, updated_at)` существует и используется **Node-сторонним CRM-логином** (`POST /api/auth/generic/login`, `POST /api/auth/korter/start`/`verify`, `POST /api/auth/remove` в `server.ts:258-312` — записывает/читает туда через `server/supabase.ts`). Но пайплайн публикации через Python читает **только файловую систему** в `cookies/<user_id>/`, к Supabase не обращается. Это два независимых хранилища авторизации, которые не синхронизированы между собой.

---

## 5. АРХИТЕКТУРА ПАРСИНГА (CategoryScheduler)

### 5.0 Обзор
Парсинг риэлторов с korter.ge и ss.ge выполняется через **`CategoryScheduler`** (`karty-core/karty-lab-code/category_scheduler.py`) — RAM-aware планировщик с параллельным выполнением по категориям.

**Ключевые особенности:**
- Каждая категория (URL) запускается как отдельная корутина с **собственным браузером** (`parse_category()` в `realtor_parser.py`)
- Параллелизм: `asyncio.Semaphore(4)` — максимум 4 категории одновременно
- RAM-мониторинг: `/proc/meminfo`, критический порог 400MB свободной RAM → 10с бэкoff
- Хрупкость: авария одной категории НЕ ломает другие
- Отмена: `threading.Event` → `asyncio.Event` bridge через callback
- Чекпоинты: каждая категория сохраняет прогресс в `parser_state` (SQLite)
- Мёртвые дубликаты: при перезапуске пропускает уже завершённые категории

### 5.1 `category_scheduler.py` — основные методы
| Метод | Что делает |
|---|---|
| `CategoryScheduler(task_id, mode, sites, max_per_site)` | конструктор; загружает URLs из `parser_sources.json`, перемешивает, создаёт Semaphore |
| `run()` | основной цикл: `asyncio.gather(*[_run_one(...)])` по всем категориям |
| `_run_one(site_name, category_url)` | запускает `parse_category()`, трекает прогресс, краш-изоляция |
| `cancel()` | ставит `_cancel_event`, все运行ющие категории завершаются gracefully |
| `get_category_progress()` → `dict` | `{site: {url: CategoryProgress}}` для UI |
| `summary()` → `dict` | `{task_id, mode, total_categories, completed, failed, running, total_found, available_ram_mb, categories}` |

### 5.2 `parse_category()` — парсинг одной категории
`realtor_parser.py:328-525` — standalone функция:
- Создаёт **собственный** экземпляр парсера (KorterParser/SsgeParser) с `launch()`/`close()`
- Поддерживает `cancel_event.is_set()` (совместимо с asyncio и threading Event)
- Поддерживает чекпоинты: `parser_state.get_checkpoint()` / `upsert_checkpoint()`
- Smoke-test: `PARSER_SMOKE_MAX_PAGES=1` env var для быстрой проверки
- Возвращает `dict`: `{found, processed, errors, status}`
- `found` считается отдельно для каждой категории; scheduler суммирует результаты категорий.

### 5.3 Телефон — расширенные фоллбэки
Два живых парсера (korter и ssge) имеют каскад извлечения телефона:

1. Кнопки «Показать телефон»: 5 вариантов текстов (`korter_parser.py`, `ssge_parser.py`)
2. Мета-теги: `<meta property="og:phone_number">`, `<meta name="twitter:data1">`
3. JSON-LD: `jsonld["telephone"]` (если `json.loads` страницы)
4. Regex в body: `r'\+?995[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}'`
5. Regex `5XX XX XX XX` для грузинских номеров

**WARNING логируется** при:
- Неудаче всех фоллбэков: `"Phone extraction failed after all fallbacks: <url>"`
- Невалидном номере (не начинается на +995/5XX): `"Phone validation failed: raw='...' site=..."`

### 5.4 `ParserTab.tsx` — per-category grid
UI показывает двойную колонку (Korter / SS.ge), в каждой — карточки категорий:
- Статус: pending/running/completed/failed с анимированным спиннером
- Прогресс-бар и счётчик `found`
- Обновление каждые 5с через `GET /api/realtors/categories/{taskId}`
- Авто-обновление при `status=processing`

### 5.5 Бэкап
Бэкап до изменений: `/root/karty-lab/backups/pre-category-parallelism/`
Содержит: `realtor_parser.py`, `parser_state.py`, `db.py`, `parser_sources.json`, `ParserTab.tsx`, `api_main.py`, `server.ts`

---

## 6. ТИПЫ ОБЪЯКТОВ

Идентификаторы типов во всём коде: **`apartment`, `house`, `land`, `commercial`**. Сделки: `sale`, `rent` (+ `daily` только в парсерах и в некоторых старых описаниях).

### 6.1 Публикаторы — ветвления по типу

**ss.ge** (`sites/ss_ge.py`)
- комнаты — только для `("apartment","house")` (`:439`)
- `yard_area = listing.get("yard_area", "")` → поле «Площадь двора» заполняется ТОЛЬКО для `house` (`:491-494`). ✔ подтверждает матрицу README (ss.ge требует yard_area для домов).
- площадь кухни автоматически считается для `apartment` (`:537`)
- `floor` пропускается для `("land","house")` (`:562`)
- `floors_total` пропускается для `("land","house")` (`:604`)
- спальни — только для `("apartment","house")` (`:639`)
- отдельная `:715` ветка для house-only полей
- список типов сделки-категории: `("Участок","Учеток")` для land — ОПЕЧАТКА (`:266`, см. §7)

**myhome.ge** (`sites/myhome_ge.py`)
- skip-branch для `rent + land` (`:184`)
- `land` → своя форма (`:224`)
- `commercial` → своя форма (`:226`)
- комнаты заполняются для `("apartment","house","commercial")` (`:340`) — ✔ подтверждает матрицу README (myhome требует rooms для коммерции).
- `floor` пропускается только для `land` (`:368`) → для commercial floor вносится.
- `floors_total` пропускается только для `land` (`:380`)
- спальни — для `("apartment","house","commercial")` (`:432`) — шире матрицы README, но не ломает.

**korter.ge** (`sites/korter_ge.py`)
- комнаты — только для `("apartment","house")` (`:413`). ❗ README утверждает, что korter требует rooms для commercial — **код этого не делает** → матрица README **неточна**.
- спальни — только для `("apartment","house")` (`:425`)
- площадь: подменяется по типу (`:439-444`) — для `land` первый `placeholder='м²'`, для `house` locator «Площадь дома», иначе стандарт.
- `land_area` только для `house` (`:452-461`)
- `floor` пропускается для `("land","house")` (`:465`)
- `floors_total` пропускается только для `land` (`:475`) → commercial сохраняет.
- `_upload_photos` (`:505-515`) — **нет проверки на минимум 3 фото**, хотя README/PROJECT_KNOWLEDGE ссылаются на «korter требует минимум 3 фото». В коде нет валидации; возможен server-side reject от korter.ge, но publisher сам не отсекает.

### 6.2 Парсеры — ветвления
Парсеры (и внешние `parsers/`, и внутренние `karty-core/karty-lab-code/parsers/`) **не ветвят логику по типу внутри `get_listing_author`**. У каждого парсера есть хардкод списка `CATEGORIES` — по категории на сайт.

| Парсер | Категории (файл:line) |
|---|---|
| `parsers/ssge_parser.py` (внешний) / `…/karty-lab-code/parsers/ssge_parser.py` (внутренний, живой) | 6 URL: Apartment sale/rent/daily, House sale/rent, Land sale (`ssge_parser.py:12-19`) |
| `parsers/korter_parser.py` / внутренний аналог | 12 URL: sale apartments/houses/commercial/land в Тбилиси & Батуми + rent apartments + commercial (`korter_parser.py:12-27`) |
| `parsers/myhome_parser.py` | города Тбилиси/Батуми × sale/rent + 14 district IDs для Тбилиси в daily (`myhome_parser.py:13,50,59-80`). ❗ В **живом** `karty-core/karty-lab-code/realtor_parser.py:40-52` myhome **намеренно отключён** для парсинга, хотя `api/main.py:130` принимает `"myhome"` как валидный site (§7). |

### 6.3 Различия в полях формы между сайтами (по коду)
| Поле | ss.ge | myhome.ge | korter.ge |
|---|---|---|---|
| rooms (обязат.?) | apartment/house | apartment/house/**commercial** | apartment/house only (не для commercial вопреки README) |
| bedrooms | apartment/house | apartment/house/commercial | apartment/house |
| floor | пропустить land/house | пропустить только land | пропустить land/house |
| floors_total | пропустить land/house | пропустить только land | пропустить только land |
| yard_area / land_area | **обязат.** для house | — | house |
| площадь кухни | только apartment | — | — |
| min фото | — | — | **нет проверки** (README говорит ≥3, код не валидирует) |
| валюта | два поля ($ и ₾) | одно | одно |
| улица | транслит на грузинский (`_to_georgian_street`) | грузинский из `STREET_TO_GEORGIAN` | без «ул.» |
| платёж | страница оплаты 0.10₾ | checkout 0.10₾ | бесплатно |

---

## 7. ИЗВЕСТНЫЕ ПРОБЛЕМЫ

Собрано по grep, чтению кода и логам. Без правок — только фактология.

### 7.1 Явные TODO / FIXME / мёртвый код

| Где | Что |
|---|---|
| `karty-core/server.ts:1248` | `// TODO: WhatsApp via Chatwoot` — отправка WhatsApp из CRM inbox **не реализована**. |
| `karty-core/server.ts:1198` и `:1258` | Вызовы `getDb()` (внутри `POST /api/crm/chats/:chatId/send` и `POST /api/crm/accounts/:id/assign`). Символ `getDb` объявлен приватно в `crmAuth.ts`/`crmChats.ts`, но **не реэкспортирован** и не импортирован в `server.ts`. При вызове этих роутов → `ReferenceError: getDb is not defined`. |
| `realtor_parser.py:40` (внутренний) | `# Site configs — only korter + ss.ge (myhome disabled for parsing)` — myhome убран из `SITES`. Но `api/main.py:130` (`valid_sites = {"korter","myhome","ssge"}`) по-прежнему принимает `myhome` — передача `myhome` в `/api/parse` вызовет `KeyError` в `get_site_class()`. |
| `sites/myhome_ge.py:41-52` | `_to_georgian_street`: код после первого `return clean` — недостижим, и ссылается на не определённый `STREET_TO_TRANSLIT` (NameError, если бы достигалось). |
| `sites/ss_ge.py:266` | Опечатка: `"land": ["Участок","Учеток"]` (второе слово ошибочно). |
| `sites/ss_ge.py:565-575` | `floor_input` переприсваивается на bool из `page.evaluate(...)`, тут же затирается свежим locator'ом ниже — мёртвый вычислительный блок. |
| `sites/korter_ge.py:228-251` | `_handle_map_pin()` определён, но `BaseSite.publish()` его НЕ вызывает → мёртвый код в нормальном flow публикации. |
| `sites/korter_ge.py:520-531` / `sites/myhome_ge.py:536-546` | JS-инъекция снимает `disabled` и навешивает `opacity/pointerEvents` с кнопки публикации — обход клиентской валидации. |
| `api/publisher.py:137-139` + `sites/base.py:200` | Удаление объявление отключено (monkeypatch `_delete_listing` → no-op). Любой «delete» вернёт success=True фактом. |
| `api/main.py:587-588` | `POST /api/listings/delete` использует **HARDCODED `USER_ID="test_user"`** — удаление чужой сессии невозможно по дизайну. |
| `utils/browser.py` | 2 строки-заглушка: `def load_selectors(site_name): return {}`. Реальный селектор-механизм не реализован. |
| `sites/realting_com.py:3-4` | `from utils.browser import click_element, fill_field` — этих символов в `utils/browser.py` НЕТ. import падает `ImportError`. Класс к тому же не зарегистрирован в `api/publisher.py:SITE_CLASSES` и `api/main.py:75` reject'ит `realting_com`. Всё «Направление realting» — полностью мёртвый код (см. §7.2). |
| `sites/base.py:22-33` | Camoufox-овый `_launch` (через `AsyncCamoufox`) — мёртвый, т.к. переопределён и в site-классах, и повторно в `api/publisher.py:patched_launch`. `pkill firefox/camoufox` (`base.py:62-63,132-133`) — no-op для текущей схемы. |
| `karty-core/server/skyvernOrchestrator.ts` | 340 строк Skyvern-оркестрации (api.v1, KartyPayload с `property_type` и `portal_targets` incl. `realting.com`). **Не импортирован** ни одним роутом `server.ts` — мёртвая архитектура. |
| `karty-core/server/{korterPublisher,myhomePublisher,ssgePublisher,realtingPublisher}.ts` | Легаси TS-публикаторы. **Не импортируются** `server.ts` (публикация теперь через Python). |
| `karty-core/server/omniChats.ts` | Ещё один chat-модуль — не импортирован. |
| `karty-core/app/` + `bb_test.ts`,`check.ts`,`dump.ts`,`fetch_ui.js`,`fix.js`,`fix_myhome.js`,`fix_ssge.js`,`replaceVars.js`,`test*.ts/.py`, `tmp_orch.js`, `tmp_start.sh` | Scratch-файлы для Steel/Browserless PoC. Ничего из этого в live не импортируется. |
| `MYHOME` scratch: `myhome_captcha_test/` | 5 PNG (`w_01.png … w_30s.png`) — эксперимент с капчей myhome.ge, в `sites/myhome_ge.py` **не интегрирован**. |
| `sites/ss_ge.py.bak` (70KB), `karty-core/server.ts.bak` (52KB), `src/components/PresentationsTab.tsx.bak` (45KB), `presentation-template.html.bak`, `realtor_parser_OLD.py` (18.5KB) | Бэкапы, дрейфующие от основных файлов. |
| Деревья-дубликаты `parsers/` + `sites/` + `api/` vs `karty-core/karty-lab-code/{parsers,sites,api}` | Полная параллельная копия Python-кода. `diff -q` показывает расхождения. **Live**: внешний `api/main.py` (ApiLauncher `server/pythonApi.ts` запускает `/root/karty-lab/run_api.py`), но парсеры/БД/tg импортируются из **внутренней** копии (`api/main.py:179 sys.path.insert`). Поддержко-опасная конструкция. |

### 7.2 realting.com — полностью нерабочая ветка

| Слой | Что не так |
|---|---|
| `sites/realting_com.py:3-4` | `ImportError` при импорте (нет `click_element`/`fill_field` в `utils/browser.py`). |
| `api/publisher.py:9-13` | `realting_com` нет в `SITE_CLASSES` → `_get_site_class("realting_com")` → `KeyError`. |
| `api/main.py:75` | `valid_sites = {"ss_ge","myhome_ge","korter_ge"}` — `realting_com` reject'ится 400. |
| `karty-core/server.ts:336-337` | `SITE_MAP['realting']='realting_com'` и `POST /api/publish/realting` (`server.ts:416`) форвардят `${PYTHON_API}/api/publish` с `sites:['realting_com']` — но Python вернёт 400. Весь flow недостижим. |
| `karty-core/server/realtingPublisher.ts`, `server/authManager.ts:10-16` (`platform === 'realting'` ветка), `server/skyvernOrchestrator.ts:38,183,197` | Легаси_TS_ветки для realting — не импортируются `server.ts`. |
| `config.py:16` | `SITES=["ss_ge","myhome_ge","korter_ge","realting_com"]` — формально_realting_com_ присутствует, но нигде не зарегистрирован. |

### 7.3 Секреты в исходниках

| Где | Что |
|---|---|
| `config.py:10` | **Захардкожен GitHub PAT**: `GITHUB_TOKEN = "ghp_REDACTED"`, `GITHUB_ENDPOINT = "https://models.inference.ai.azure.com"`, `GPT_MODEL = "gpt-4o"`. Если репозиторий когда-либо уйдёт в публичный — этоxsleak. |
| `parsers/myhome_parser.py:14-15` | Хардкод кредов myhome: `MYHOME_EMAIL="REDACTED_EMAIL"`, `MYHOME_PASSWORD="REDACTED_PASS"` (используется при парсинге myhome, который сейчас всё равно отключён). |
| `karty-core/karty-lab-code/tg_parser.py:34-35` | `API_ID=REDACTED_API_ID`, `API_HASH="REDACTED_API_HASH"` — Telegram API credentials в открытом виде. |
| `karty-core/server/crmAuth.ts:25-32` | Авто-seed `admin / admin123` в таблицу managers (sha256 без соли). |

### 7.4 Логи (`/root/karty-lab/logs/`)

| Файл | Что заметить |
|---|---|
| `logs/api.log:1-4` | `ModuleNotFoundError: No module named 'uvicorn'` из `/root/karty-lab/karty-core/karty-lab-code/run_api.py` — **внутренняя** копия FastAPI не запускается (нет uvicorn в окружении). Live-бэк runs из внешнего `/root/karty-lab/run_api.py` через `server/pythonApi.ts`. |
| `logs/server.log:9-29` | `Error: listen EADDRINUSE 0.0.0.0:3000` (Node упал, порт занят) + Python `ERROR: [Errno 98] error while attempting to bind on ('0.0.0.0', 8000): address already in use` — двойной запуск / stale pid. |
| `logs/myhome_api.log:18-32` | Множественные `parser.myhome ERROR`: `HTTP Error 502: Bad Gateway` и `expected string or bytes-like object, got 'NoneType'` — myhome-парсер хрупкий (regex на None). Вероятно поэтому он и был отключён в `realtor_parser.py:40`. |
| `logs/parser.log` (3.2 MB, ~508 ERROR/Exception) | Примеры: `:17416-17 asyncio ERROR: Future exception was never retrieved` + `TargetClosedError` при навигации на `korter.ge/ru/realtor/...`; `TimeoutError 15000ms exceeded` на korter realtor-страницах; тонны `[parser.korter] WARNING: No phone found (attempt N)` (retry-then-skip поведение); массовые `[asyncio] WARNING: pipe closed by peer` (~13.6 K) — известный шум Playwright/xvfb. |
| `logs/parser/` (10 мелких файлов за июль) | Исторические логи парсеров. |

### 7.5 Несоответствия документации коду

| Документ | Что неверно |
|---|---|
| `PROJECT_KNOWLEDGE.md:91-95` («DO NOT MODIFY») | Говорит, что Camoufox якобы используется в рантайме и «замена на стандартный Playwright приведёт к бану». По коду замена **уже произошла** (переопределено в site-классах + повторный monkeypatch в `api/publisher.py`). Camoufox сейчас мёртв. |
| `MEMORY.md:41-46` | Перечисляет `POST /api/publish/korter`, `/ssge`, `/myhome`, `/api/listings/delete`, `/api/listings/republish`, `/api/presentations/generate` как будто это Python-эндпоинты. На самом деле они живут в **Node** `karty-core/server.ts:341/366/391/682/692/705`, а Python их не имеет (Python только `/api/publish`, `/api/publish/{task_id}`, `/api/listings/delete`, `/api/listings/republish`). |
| `MEMORY.md:16` | `sites/` названы «Playwright парсеры сайтов» — но `sites/` это **публикаторы**; парсеры — отдельный модуль `parsers/`. |
| `MEMORY.md:59` | «run server with `bun run server.ts`» — `package.json` использует `tsx` (npm), а не bun. |
| `MEMORY.md` | Не упоминают: `parsers/`, `/api/publish/realting` и `/api/publish/auto`, `/api/crm/*`, `/api/tg/*`, `/api/auth/*`, `/api/presentations/preview-html`/`parse-listing`. |
| `README.md:106-107` (матрица) | Утверждает, что korter требует rooms/floor/floors_total для commercial; код (`sites/korter_ge.py:413`) ставит rooms только для `("apartment","house")`. |
| `README.md` / `PROJECT_KNOWLEDGE.md:53` | «korter требует минимум 3 фото» — в коде `sites/korter_ge.py:505-515` **нет валидации** количества. |
| `README.md:444-456` | Список «11 эндпоинтов» устарел: фактически в `api/main.py` ~23 эндпоинта (см. §2.1). |

### 7.6 Незаконченные/частичные решения

- **Telegram-таблицы не создаются в коде.** `db.py` (`init_db`) создаёт только `realtors`. `telegram_chats`, `telegram_users`, `telegram_accounts` используются в `api/main.py:407,422,453,499,519-536` и `tg_parser.py:46,56,66,69,76,88`, но `CREATE TABLE` для них нигде нет. На свежей БД любой TG-эндпоинт → `sqlite3.OperationalError: no such table`. Латентый баг.
- **Live dispatcher парсера** `karty-core/karty-lab-code/realtor_parser.py:40-52` хардкодит только `["korter","ssge"]` в `run_full`/`run_daily` (`:442, :462`), при этом `realtor_parser.py:212` принимает произвольный `site_name` — рассинхрон с тем, что принимает API.
- **Схема RLS в Supabase.** `karty-core/supabase_schema.sql:63-76` — политики `USING (true) WITH CHECK (true)` на всех таблицах. RLS формально включён, но фактически отключён (любой anon key читает/пишет всё). Не упоминается в README/MEMORY.
- **Firestore-схема listings (`firestore.rules`) легаси** — поля `userId,title,desc,date,image`, тогда как live-данные используют Supabase `listings` (`user_id,title,description,cover_image,...`). `src/firebase.ts` (8 строк) инициализирует Firebase, но вкладки (Presentations/Planner/History) используют `../lib/supabase`. Мёртвый клиентский код.
- **`api/main.py:600` в `delete_listing`** обрабатывает только default `"test_user"` cookies — нет мульти-tenant.
- **`/api/listings/republish`** (`api/main.py:637-667`): сначала вызывает `delete_listing` (где `USER_ID="test_user"`), потом `publish_to_sites` с `user_id` из `listing_data`. PartialEq между ними нет — может работать не на тех сессиях.

### 7.7 Краткие маркеры для¡быстрого ориентира
- Если нужно чинить публикацию на одном сайте — смотреть **`sites/<site>.py`** (логика в коде, селекторов-файла нет; `utils/browser.py` — заглушка).
- Если падает импорт `sites.realting_com` — это известное нерабочее (§7.2), не стартовать.
- Если `/api/parse sites=['myhome']` отвечает 500 — это `KeyError` в `realtor_parser.py` (§7.1).
- Если `/api/crm/accounts/:id/assign` кидает `ReferenceError: getDb is not defined` — known bug §7.1.
- Если `/api/tg/*` 500 на свежей БД — `telegram_*` таблицы не созданы §7.6.
- **.Environment/секреты** подготовить к уборке до любого публичного доступа: `config.py:10`, `parsers/myhome_parser.py:14-15`, `tg_parser.py:34-35`.
