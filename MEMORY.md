# Karty Lab — Память проекта

## PRODUCTION-READY SPRINT (24 августа 2026) — чеклист

Аудит всей системы завершён (бэкапы: `backups/full-audit-20260823/`). Задачи спринта:

### Блок A. Авторизация API
- [x] Проверено: publish/preflight/delete/republish/promotion/planner/presentations УЖЕ защищены `requirePublishIdentity` (Supabase Bearer + ownership) — server.ts:70,575,591-1460.
- [x] `/api/parse-listing` → добавлена Bearer-проверка (getAuthenticatedUserId). Тест: без токена 401.
- [x] `/api/realtors/*` (9 роутов) → CRM authMiddleware. Тест: без токена 401, с токеном 200.
- [x] `/api/tg/*` → уже был authMiddleware; фронт теперь шлёт Bearer через crmFetch.

### Блок B. CRM: менеджеры могут работать
- [x] CrmChats.tsx — сломанное условие `!userRole || true &&` заменено; селектор аккаунтов показывается всем авторизованным.
- [x] GET /api/crm/accounts открыт менеджерам read-only (без bot_token/chatwoot_token/session_string); POST/DELETE остались adminOnly. Тест: менеджер видит список без секретов.
- [x] Глобальная обработка 401: `src/lib/crmApi.ts` (crmFetch) — Bearer автоматически + при 401 очистка сессии и редирект на логин. Заменён fetch в Crm.tsx (39 вызовов), CrmChats.tsx (7), ParserTab.tsx (14), TelegramTab.tsx (12).
- [x] POST /api/crm/logout — серверная инвалидация сессии. Тест: logout 200 → session 401.

### Блок C. MiniApp
- [x] Двойная публикация: module-scope lock (`modulePublishLock`) переживает unmount CreateTab; серверная идемпотентность уже была (publish_idempotency + 409).
- [x] Очистка photos после успешной публикации (setPhotos([])).
- [x] HistoryTab delete/republish: молчаливые catch → alert с текстом ошибки.
- [x] parse-listing фоновый вызов шлёт Supabase Bearer.

### Багфиксы по ходу спринта
- [x] chat_accounts: все записи лежали active=0 → аккаунты были невидимы для отправки. Реактивированы telegram-аккаунты (WhatsApp остался off).
- [x] crm.db дрейф схемы: добавлены колонки manager_id/session_string, которые ждёт код (getAccountsByManager падал бы).

### Тесты пройдены (curl)
401 без токена на parse-listing/realtors; 200 с админ-токеном; менеджер: accounts 200 без секретов; logout инвалидирует сессию; health 200 после рестарта.

Статус: СПРИНТ ВЫПОЛНЕН 24.08.2026. Пароль админа и домен — меняет владелец вручную (вне спринта).

### Доп. задачи (24.08.2026)
- [x] Git: репозиторий `MondayMorning911/karty1` инициализирован, `.gitignore` исключает секреты/БД/куки/skyvern-data; все секреты в AGENTS.md/config.py/.env.example заменены на REDACTED/плейсхолдеры.
- [x] CRM: вкладка Агентства удалена полностью (Tab type, nav, компонент).
- [x] CRM: Dashboard — реальная сводка (лиды/чаты/риэлторы/источники), live-обновление каждые 30с.
- [x] CRM: live-поллинг чатов каждые 15с (список чатов + сообщения выбранного).
- [x] MiniApp: AbortController на AI-парсинг (гонка ответов устранена).
- [x] MiniApp: мёртвый PlatformsTab удалён.
- [x] CRM: мёртвый код (~230 строк LeadsPoolKanban/LeadsKanban/Leads) удалён.
- [ ] CRM: Финансы — заглушка, будет привязана к Tribute позже (осознанно отложено).

---

## Рабочая архитектура

Проект состоит из двух runtime-слоёв:

- Python FastAPI на `127.0.0.1:8000`: авторизация, публикация через Playwright, парсеры, Telegram API.
- Node/Express + React/Vite на `0.0.0.0:3000`: Mini App, CRM, Supabase, прокси Python API.
- Production управляется PM2-процессом `karty`, публичный reverse proxy работает через Nginx.
- Публичный адрес: `https://karty-bot.duckdns.org`.

Основные live-файлы:

- `api/main.py` — Python publish tasks, persistent task state, auth checks и уведомления.
- `api/publisher.py` — загрузка фото, auth precheck, идемпотентность на уровне задач, Playwright Chromium и error classification.
- `api/schemas.py` — строгая Pydantic-схема публикации.
- `sites/base.py` — общий publish flow, этапы, retry до запуска формы, URL/alive verification.
- `sites/ss_ge.py`, `sites/myhome_ge.py`, `sites/korter_ge.py` — сайт-specific формы.
- `karty-core/server.ts` — preflight, publish routes, task proxy, CRM и Telegram.
- `karty-core/src/pages/MiniApp.tsx` — Mini App: AI parsing, Cloudinary photos, preflight, multi-site publish и polling.
- `karty-core/server/skyvernOrchestrator.ts` — подготовленный, но не подключённый Skyvern-модуль.

Realting полностью исключён из production publish scope. `POST /api/publish/realting` возвращает `410`, а `/api/publish/auto` отклоняет `realting`; активные publish-targets только `korter`, `myhome`, `ss.ge`.

## Текущий publish flow

1. Mini App загружает фотографии в Cloudinary; при временной ошибке сохраняет data URI как fallback.
2. AI извлекает структурированные поля из описания.
3. `/api/publish/preflight` проверяет цену, площадь, город, адрес, описание, фото и site-specific поля.
4. Для Korter минимум 3 фото теперь является блокирующей ошибкой, а не warning.
5. Объект сохраняется в Supabase со статусом `publishing`.
6. Каждая выбранная площадка запускается отдельной задачей с `listing_id` и стабильным `idempotency_key`.
7. Python сохраняет задачи в `/root/karty-lab/publish_tasks.json`.
8. Перед браузером выполняется реальная проверка auth через `_verify_auth`; valid auth кэшируется на 5 минут.
9. Playwright Chromium запускает authenticated context из storage state или cookies.
10. `BaseSite.publish()` проходит этапы `auth`, `navigation`, `form`, `photos`, `submit`, `verification`.
11. После submit URL обязан быть получен и через 10 секунд подтверждён `_check_listing_alive`.
12. Если URL получен, но объект не подтверждён живым, результат считается ошибкой `PUBLISH_NOT_VERIFIED`, а не успехом.
13. После этапа `submit` повторный автоматический запуск запрещён, чтобы не создавать дубликаты при неясном результате submit.
14. Mini App не переводит общий объект в `published`, если хотя бы одна выбранная площадка завершилась ошибкой или не стартовала.

## Защиты, добавленные 4 августа 2026

- Idempotency: повторный tap/retry с тем же `objectId:site` возвращает существующую задачу.
- Persistent tasks: после рестарта processing-задачи переводятся в failed с причиной рестарта.
- Backend schema требует город и минимум одну фотографию.
- Python-level validation повторяет критические photo checks, даже если Node preflight был обойдён.
- Auth precheck выполняется перед фактической публикацией; невалидные cookies не доходят до формы.
- Ошибки содержат `stage`, `error_code`, `user_action`, `user_message`, screenshot и `alive_after_publish`.
- Публикационный task теперь `completed` только если все его site results успешны; иначе `failed`.
- Ошибки запуска отдельных площадок не теряются при последующем успешном результате другой площадки.
- Publish tasks теперь сохраняют checkpoint по площадке и этапу (`queued`, `auth`, `navigation`, `form`, `photos`, `submit`, `verification`).
- Добавлены агрегированные статусы `partial` и `publish_unknown`; Mini App показывает их отдельно и не маскирует частичный результат под `published`.
- Если submit изменил текущий URL браузера, но extraction URL упал, BaseSite пытается проверить текущую страницу и восстановить URL без повторного submit.
- `publish_unknown` и `partial` отображаются в History Mini App отдельными badge/filter; `error_details` сохраняется для пользователя.
- Для browser/UI ошибок добавлен флаг `fallback_eligible` для будущего Skyvern routing.
- Skyvern отключён по умолчанию и больше не имеет hardcoded API key; требуется `SKYVERN_ENABLED=true` и `SKYVERN_API_KEY`.

## Что всё ещё не гарантируется

- Изменение DOM/селекторов площадок невозможно предсказать. Максимальный безопасный fallback — Skyvern после отдельного тестирования.
- Skyvern fallback подключён к Node monitor, но фактически выключен в production до настройки и отдельного smoke test.
- CAPTCHA, антибот, баланс и истёкшая сессия не должны обходиться автоматически.
- После реального принятия объявления сайтом, но до получения URL, абсолютная защита от дубля невозможна без site-specific lookup/idempotency API.
- Generic recovery по текущему URL добавлен; полноценный site-specific lookup по списку личных объявлений ещё не реализован.
- Site-specific recovery добавлен для SS.ge и MyHome: после ambiguous submit личный кабинет ищется по одновременному совпадению адреса и цены, затем найденный URL проходит alive verification.
- Для Korter добавлен осторожный lookup через подтверждённый маршрут `/ru/profile`: карточка принимается только при одновременном совпадении адреса и цены и последующей alive verification; если совпадения нет, остаётся `publish_unknown`.
- Node server теперь сам мониторит Python publish task до 10 минут и обновляет Supabase независимо от того, открыт ли Mini App; listing URLs объединяются, а не перезаписываются.
- Safe Skyvern fallback contract подключён к server-side monitor, но production остаётся выключенным без `SKYVERN_ENABLED=true` и `SKYVERN_API_KEY`.
- Fallback разрешён только для `fallback_eligible=true` ошибок на этапах `navigation`, `form`, `photos`; auth, CAPTCHA, balance, validation и ambiguous submit не передаются Skyvern.
- Skyvern fallback использует platform session, временные cookies/photo files, проверяет домен полученного URL и удаляет временные файлы; без подтверждённого URL результат не меняется на success.
- Self-hosted Skyvern развернут в `/root/karty-lab/skyvern` через Docker Compose: `karty-skyvern` + `karty-skyvern-postgres`.
- Skyvern API слушает только `127.0.0.1:8010`; Python API продолжает использовать `8000`, Node использует `SKYVERN_API_URL=http://127.0.0.1:8010/api/v1`.
- Skyvern использует DeepSeek через OpenAI-compatible provider; API token сгенерирован в `/root/karty-lab/skyvern/.skyvern/credentials.toml` и подключён в `karty-core/.env`.
- Health check `GET /api/v1/heartbeat` отвечает `200`, token check на `/api/v1/organizations` отвечает `200`; fallback flag оставлен `SKYVERN_ENABLED=false`.
- Первый безопасный Skyvern task smoke test на `example.com` создал task и прошёл API/polling, но agent завершился `LLM_ERROR`: self-hosted config выбирала `OPENAI_GPT5_5`.
- Переданный второй Gemini token прошёл `v1beta/models` с `200`; доступные рабочие модели проверены прямым `generateContent`: `gemini-3-flash-preview` отвечает `200`, Pro/2.5 и старые Flash получили quota/availability ограничения.
- Skyvern настроен на официальный ключ `LLM_KEY=GEMINI_3.0_FLASH` (не `GEMINI_3_FLASH`); smoke test на `example.com` завершился `completed` и вернул `page_title=Example Domain`, `current_url=https://example.com/`.
- Портальные публикационные smoke tests ещё не запускались; до них fallback Karty остаётся `SKYVERN_ENABLED=false`.
- Auth test 4 августа: MyHome storage state успешно открывает `www.myhome.ge` с пользователем `Deniel`; Korter state открывает `korter.ge/ru/` с пользователем `Дэниэл`; SS.ge password credentials отдельно успешно редиректят на `home.ss.ge`, но сохранённый state показывает `Авторизация` из-за устаревшего OAuth/PKCE callback flow.
- Remote Browserless `72.56.1.59:3010` недоступен/нестабилен; в AuthManager добавлен local Chromium fallback с существующим `/root/.cache/ms-playwright/chromium-1223/...` и retry navigation, но автоматический SS auth через текущий server flow ещё не подтверждён.
- Dry-run API checks прошли: Node `/api/publish/preflight` возвращает ready checks для всех трёх сайтов, Python `/api/publish` корректно валидирует invalid site без запуска браузера; реальный submit намеренно не запускался.
- Test fixture `test_photos/1.jpg..3.jpg` найден и использован для smoke preparation.
- В publish preflight найден и исправлен баг типа объекта: слово `чемоданом` ошибочно матчило `дом`; теперь явный `propertyType=Квартира` имеет приоритет, а fallback использует границы слов.
- Exact-delete hardening добавлен: SS.ge/MyHome больше не удаляют первую карточку, а требуют совпадение URL целевой карточки; Korter продолжает удаление по exact URL.
- Реальный Korter submit task `c833f4bd` и повтор `2dbe991a` остановились до формы на auth/launch `ERR_INVALID_AUTH_CREDENTIALS`; URL не создан, delete не требовался.
- Реальный SS.ge submit task `a0c1f770` также остановился до формы на auth/launch `ERR_INVALID_AUTH_CREDENTIALS`; URL не создан, delete не требовался.
- Повтор Korter в headless режиме task `a41d58a7` дошёл до launcher, но три попытки получили timeout на `https://korter.ge/`; URL не создан. `PUBLISH_HEADLESS` возвращён в `false` для production headed/Xvfb профиля.
- MyHome preflight для исходного текста требует этажность, которой пользователь не указал; реальная публикация MyHome не запускалась, чтобы не выдумывать обязательное поле.
- Standalone `_launch_authenticated_site` вне FastAPI успешно открывает все три state с HTTP 200; live publish task `bdca1035` всё ещё получил `ERR_INVALID_AUTH_CREDENTIALS` на первой навигации Korter. Для устранения расхождения оставлен `PUBLISH_AUTH_PREFLIGHT=false`, но обязательный BaseSite auth check и headed/Xvfb publish flow не отключены.
- Background diagnostic task `11f76c89` подтвердил: Python API видит `storage_state=True`, cookies=23, `DISPLAY=:110`, `headless=False`; ошибка возникает именно внутри long-lived task на `page.goto`, хотя тот же launcher вне API проходит. Дополнительные реальные submit retries остановлены, чтобы не создавать нагрузку/дубли.
- Для теста пользователь разрешил временно выдумать этажность; это пока не применялось, потому что publish launcher не дошёл до формы и MyHome preflight остаётся безопасно блокирующим.
- Добавлен `api/publish_worker.py` и background worker isolation с отдельным Xvfb; ручной worker проходит Korter auth и доходит до UI, где текущие selectors не находят поля/button. Запуск того же worker из long-lived FastAPI task всё ещё получает `ERR_INVALID_AUTH_CREDENTIALS`; fallback/submit повторно не форсировать.
- Добавлено различие `submit_precheck` vs `submit`: Skyvern разрешён только если кнопка ещё не нажата; после фактического click fallback запрещён.
- После очистки worker env (`PATH/HOME/PYTHONPATH`, без наследования `DISPLAY`, `PUBLISH_AUTH_PREFLIGHT=false`) Node -> Python publish task `e3aa87af` прошёл auth/launcher и дошёл до `submit_precheck`, вернув `PUBLISH_NOT_VERIFIED` + `fallback_eligible=true`. Это устранило исходный long-lived launcher regression.
- Worker photo staging переведён на уникальный каталог `/root/karty-lab/uploads/<user_id>/<publish_task_id>`, чтобы конкурентные задачи одного пользователя не конфликтовали.
- Конкурентный unit smoke для two data-URI photo jobs прошёл: `task-a` и `task-b` получили отдельные непересекающиеся directories.
- Добавлен runtime-флаг `PUBLISH_DISABLED_SITES`; отдельную площадку можно отключить без остановки остальных. Realting явно закрыт ответом `410` и исключён из auto publish.
- Skyvern fallback smoke обнаружил неправильный контракт cookie-file-as-browser-session; исправлено на Skyvern `pbs_*` sessions, которые должны создаваться из заранее подготовленных `SKYVERN_PROFILE_ID_<PORTAL>` browser profiles.
- Browser session API lifecycle проверен: `POST /v1/browser_sessions` создаёт `pbs_*`, но без `browser_profile_id` не имеет авторизованного browser state; test session закрыта. Для production нужны отдельные Skyvern profiles, созданные через Skyvern UI/API после ручного логина.
- Browser profiles для порталов ещё не заведены, поэтому `SKYVERN_ENABLED=false`; self-hosted Skyvern/Gemini API остаются healthy.
- Live DOM audit подтвердил текущие Korter fields: `input[name=custom.geoObjectSearch]`, `input[name=street]`, `input[name=houseNumber]`, `#floorNumber`, `#floorCount`, `#roomCount-*`, `#bedroomCount-*`, `#area`, `#description.ru-RU`, `#price`, file input и role button `Опубликовать объект`; локаторы обновлены с role/text fallbacks.
- Live DOM audit SS.ge подтверждён изолированным worker: текущая схема deal/type/city/street/house/rooms/area/floor/floors/bedrooms/status/USD/description/photos проходит до submit без изменения селекторов.
- Первый полный Korter API E2E `31c1b50d` успешно создал публичный URL `.../817879`, `alive_after_publish=true`; exact-delete через isolated delete worker вернул success и через 10 секунд public URL вернул HTTP `410`.
- Полный E2E count в текущем audit: Korter `1/1` publish+alive+exact-delete; SS.ge `0` подтверждённых публикаций (help URL false-positive исправлен, dashboard не содержит тестовый объект); MyHome `0` подтверждённых публикаций (submit завершился без URL, dashboard встретил Cloudflare security verification). Требуемые 10-15 runs per portal ещё не выполнены.
- Korter public URL extraction обновлена: после submit dashboard URL больше не считается success; publisher кликает `Страница на сайте`, читает clipboard public URL, а exact-delete по ID подтверждает dashboard removal + public HTTP `410`.
- SS.ge false-positive recovery закрыта: `/help`, `/error`, `/auth`, `/profile`, `checkout` и другие non-listing URLs не принимаются как объявление.
- Publish worker получил hard timeout `PUBLISH_WORKER_TIMEOUT_SECONDS` (default 900s), kill процесса и `PUBLISH_TIMEOUT` result вместо вечного `processing`.
- Текущий сервер: 4 CPU, 7.8 GB RAM, swap отсутствует; idle Skyvern использует около 1.6 GB RAM. Для параллельных пользовательских публикаций нужен planned upgrade до 16-32 GB RAM и желательно отдельный Skyvern host.
- Полная live-статистика публикаций по сайтам ещё не собрана; проценты надёжности пока являются оценкой, а не измеренным KPI.

## Важные тесты и команды

```bash
cd /root/karty-lab
python3 -m py_compile api/main.py api/publisher.py api/schemas.py sites/base.py

cd /root/karty-lab/karty-core
npm run build
npm run lint
curl -k https://karty-bot.duckdns.org/api/health
pm2 list
```

`npm run lint` сейчас имеет два старых unrelated errors в `kartypresentation-maker`: отсутствуют зависимости/types для `html2canvas` и `jspdf`. Production `npm run build` проходит.

## Production audit status

- Actual active publish targets: Korter, MyHome, SS.ge. Realting is disabled with HTTP `410` and rejected from auto publish.
- Actual browser engine in live publish: Playwright Chromium; Camoufox/CloakBrowser/CapMonster are not wired into the live publisher.
- Node -> Python API, task persistence, preflight, polling, worker isolation, status aggregation and Skyvern API health were tested.
- Full Mini App -> real portal -> exact delete E2E is not certified: current Korter/SS.ge UI selectors fail before submit, while isolated workers reach the form and return `submit_precheck`/`fallback_eligible`.
- MyHome real publish is blocked until the test fixture has an address and floors_total; do not invent production listing fields except in an explicitly marked test fixture.
- Skyvern Gemini smoke on `example.com` passed; portal fallback is not production-ready because Skyvern requires per-portal browser profiles (`SKYVERN_PROFILE_ID_*`) and those profiles are not created.
- No real test listing was successfully created in the current audit, so no delete verification can be counted as E2E success.
- Current verdict: **not ready for production publish release**. Blocking items are current portal selectors, Skyvern profiles, and 10-15 successful publish/delete runs per portal.

## Session Checkpoint Before SS/MyHome E2E

This is the complete state checkpoint before the first confirmed SS.ge and MyHome publish/delete attempt.

### Runtime

- Node/React/Express: PM2 app `karty`, port `3000`, public health `https://karty-bot.duckdns.org/api/health`.
- Python FastAPI: child process on port `8000`, started by `karty-core/server/pythonApi.ts` through `xvfb-run`.
- Self-hosted Skyvern: Docker Compose in `/root/karty-lab/skyvern`, API `127.0.0.1:8010`, Postgres alongside it.
- Skyvern/Gemini health was confirmed; `SKYVERN_ENABLED=false` in production.
- Realting is intentionally excluded and returns `410`; active production sites are Korter, SS.ge, MyHome.
- No git repository exists; regression comparison uses backups, especially `/root/karty-lab-backup-20260803-1210`.

### Publish Architecture

- Mini App creates a Supabase `listings` row with `publishing` status, then calls Node routes per selected site.
- Node forwards to Python `/api/publish` and starts a persistent task.
- Python task launches `/root/karty-lab/api/publish_worker.py` in a clean environment with a fresh Xvfb per task.
- Worker uses Playwright Chromium with the existing site-specific classes; live publisher is not Camoufox/CloakBrowser/CapMonster.
- Worker env explicitly sets `PUBLISH_AUTH_PREFLIGHT=false`, `PUBLISH_HEADLESS=false`, clean `PATH/HOME/PYTHONPATH`, and unique `_publish_task_id`.
- Worker hard timeout is `PUBLISH_WORKER_TIMEOUT_SECONDS=900`; timeout kills the worker and returns `PUBLISH_TIMEOUT` instead of leaving `processing` forever.
- Photo staging is isolated at `/root/karty-lab/uploads/<user_id>/<publish_task_id>`.
- Task statuses include `completed`, `failed`, `partial`, `publish_unknown`; stages include `auth`, `navigation`, `form`, `photos`, `submit_precheck`, `submit`, `verification`.
- `submit_precheck` means no final publish click occurred and is eligible for a future Skyvern fallback; after actual submit click, Skyvern fallback is blocked.
- `PUBLISH_DISABLED_SITES` can disable a single active site without taking down the others.
- Node server-side monitor updates Supabase even if Mini App closes.
- Idempotency key is based on object/site and prevents duplicate processing tasks while processing or after successful completion.

### Authentication State

- Test account used for controlled tests: `test_user`.
- Current states exist under `/root/karty-lab/cookies/test_user/` for `ss_ge`, `myhome_ge`, `korter_ge`.
- MyHome state was refreshed through a direct local Chromium login using the supplied credentials and showed `Deniel` on `www.myhome.ge`.
- SS.ge state was refreshed through the current homepage `Авторизация` button, which generated a fresh OAuth/PKCE URL; the resulting home page showed `Даниэль` and no `Авторизация` label.
- Korter state showed `Дэниэл` in the profile UI.
- Remote Browserless `72.56.1.59:3010` is unavailable/unstable. `AuthManager` has a local Chromium fallback, but automated password login is not the production publish path.
- Standalone `_launch_authenticated_site` tests under Xvfb opened all three states with HTTP 200.
- Python auth probe can report transient `unknown` timeouts; it no longer automatically treats every timeout as expired.

### Confirmed E2E Results

- Korter confirmed success: task `31c1b50d` created public URL `https://korter.ge/ru/продажа-квартир-батуми/alliance-palace/817879`, `alive_after_publish=true`; isolated exact-delete removed dashboard ID and public URL returned HTTP `410`.
- Korter form-flow was independently confirmed with current DOM: deal, type, city, rooms, bedrooms, area, floor, floors total, description, price and 3 photos.
- Korter current public URL behavior is special: submit first lands on `/profile/my-apartments/published`; public URL must be recovered by clicking `Страница на сайте` and reading clipboard. Dashboard URLs are rejected as false positives.
- Korter exact delete now navigates to published dashboard, finds exact ID, opens `Скрыть` menu, selects `Удалить`, waits for delayed deletion, reloads dashboard, then checks public URL HTTP status.
- SS.ge form-flow was independently confirmed: auth, deal, type, city, street/house, rooms, area, floor, floors, bedrooms, status, USD price, description and 3 photos.
- SS.ge full E2E attempts `d50b09f6` and prior `a0c1f770` did not produce a confirmed public URL. A previous help URL `https://ss.ge/ru/home/help?index=0` was correctly identified as a false positive and is now rejected. SS dashboard did not contain the test price/address after the latest attempt.
- MyHome isolated flow currently passes auth, deal, type, city, street/house, rooms, area, floors, bedrooms, project type, price, description, contact and 3 photos. Publish click can leave page at `/statement/create` with no URL and validation indicators.
- MyHome current Cloudflare behavior is unstable: a fresh direct context can show a Cloudflare security page, while the headed isolated publish context can pass auth and reach the form. No deterministic code regression was found against the 03-Aug backup.
- MyHome full E2E attempt `a099bf2d` returned `publish_unknown` with no URL; no confirmed object/delete result.
- MyHome fresh auth/form series after the audit: `5/5` clean headed contexts, `challenge=false`, `auth=true`; this confirms Cloudflare is not deterministic in the current run.
- MyHome full publish retry `942f20bf` and isolated worker both reached form/photo/publish click but stayed on `/statement/create` without URL; no confirmed object/delete. Isolated log showed `Red validation indicators found: 23`, so next diagnosis is validation/address/payment confirmation, not an assumed Cloudflare regression.
- No real test listing is currently known to remain from the latest SS/MyHome attempts; Korter ID `817879` was confirmed removed.

### MyHome Regression Analysis

- Diff against `/root/karty-lab-backup-20260803-1210/sites/myhome_ge.py` showed publish/auth/launcher/flags/timing logic unchanged; current differences are `_submit_clicked`, recovery lookup and exact-delete work.
- Diff against backup `api/publisher.py` showed global changes: error classification, auth cache/preflight, worker isolation, per-task photo directories, retries and task persistence. The worker now disables duplicate auth preflight, and isolated MyHome auth succeeds.
- The current MyHome failure is not proven to be Cloudflare alone: the isolated log shows `Clicked publish button`, then remains on create page with `Red validation indicators found: 23` and no URL. The test address/autocomplete or site validation may be incomplete.
- `BOT_PROTECTION` means bounded stop/no infinite retry/no duplicate submit; it does not mean the primary path was abandoned. No anti-bot bypass, fingerprint evasion or CAPTCHA solver was added.

### Skyvern State

- Gemini API key was validated; `gemini-3-flash-preview` responds with HTTP 200.
- Skyvern `example.com` browser/extraction smoke completed successfully.
- First fallback integration test exposed that cookie paths cannot be used as `browser_session_id`; correct Skyvern contract requires live `pbs_*` sessions from browser profiles.
- Fallback adapter now requires `SKYVERN_PROFILE_ID_KORTER`, `SKYVERN_PROFILE_ID_MYHOME`, `SKYVERN_PROFILE_ID_SSGE`, creates a live session from the profile, runs task, verifies URL domain, and closes the session.
- No per-portal Skyvern profiles have been created or authorized; `SKYVERN_ENABLED=false`.

### Remaining Work

1. Run 5-10 bounded MyHome attempts and record Cloudflare/validation/success percentages; no stealth bypass.
2. Complete one confirmed SS.ge publish + alive + exact-delete.
3. Complete one confirmed MyHome publish + alive + exact-delete if the controlled path passes.
4. Expand Korter/SS.ge/MyHome to at least 10 successful publish/delete runs each; do not count code-only runs.
5. Test timeout, partial status, idempotency, failed Mini App status, and 5-10 parallel workers.
6. Create Skyvern profiles only after an explicit manual login path is available; keep fallback disabled until each profile is tested.
7. Final production verdict remains **not ready** until these live counts and edge-case tests exist.
- MyHome regression audit against `/root/karty-lab-backup-20260803-1210/sites/myhome_ge.py`: publish/auth/launcher/flags/timing logic is unchanged; only `_submit_clicked`, recovery and exact-delete additions differ. Current isolated MyHome run passes auth and all field/photo steps, detects no Cloudflare page, clicks publish, then remains on `/statement/create` with red validation indicators. This is currently a validation/address/submit-confirmation issue, not confirmed Cloudflare regression.
- Additional MyHome browser check can show a Cloudflare challenge on a fresh direct `statements.myhome.ge` context, while the headed isolated publish context passes auth and reaches the form. Available 03-Aug backup logs contain parser runs but no verifiable publish success record at 21:03, so the claimed historical success is not independently reproducible from stored artifacts.
- No stealth/anti-bot bypass was added; `BOT_PROTECTION` remains a bounded, logged stop condition, not a declaration that the primary path is permanently abandoned.

## Следующие обязательные шаги

1. Накопить controlled live-тесты Korter profile lookup и при необходимости уточнить только matching-логику, не разрешая fallback по первому объекту.
2. Перед включением Skyvern проверить реальный API URL, browser session mount, одну тестовую публикацию на каждый портал и post-submit alive check.
3. Разделить в Supabase статусы `published`, `partial`, `error`, `publish_unknown`.
4. Добавить checkpoint storage по этапам и recovery после процесса/сервера.
5. Собрать controlled live matrix: минимум 30 публикаций на каждый сайт и 20 multi-site runs.
6. Исправить отсутствующие `html2canvas`/`jspdf` зависимости и добиться чистого `npm run lint`.

Этап hardening после 4 августа 2026 также проверен: `python3 -m py_compile` проходит, `npm run build` проходит, production после PM2 restart отвечает `{"status":"ok"}`. Добавлены checkpoint, `partial`/`publish_unknown`, safe URL recovery, SS/MyHome/Korter cabinet lookup, server-side task monitor и выключенный Skyvern fallback contract.

## Продуктовые изменения этой сессии

- Landing page обновлён и опубликован: hero, Mini App mockup, product suite, workflow, interactive Product Demo, mobile/desktop layout, RU/EN и light/dark themes.
- В hero mockup исправлены исходное описание объекта и AI-результат: цена теперь присутствует в улучшенном описании и видна в начале текста.
- В Mini App AI styles теперь идут в порядке `Продающий -> Кратко -> Строгий -> Не менять`.
- `Продающий`: 80-120 слов, hook-заголовок, emoji markers, эмоциональные преимущества только из входных данных, цена/факты сохраняются, CTA в личные сообщения.
- `Кратко`: 50-70 слов, только ключевые факты, без рекламной воды, обязательное сохранение цены/площади/адреса.
- `Строгий`: деловой формат, сухие параметры, без эмоциональных эпитетов, финал `Подробности и фото — по запросу`.
- CRM развёрнут вокруг `crm_leads`, `lead_events`, `referral_links`, `crm_payments`, `lead_usage`; есть общий пул лидов, claim после первого сообщения, статусы/Kanban, referral attribution, greeting generation и RU/EN/KA translation.
- Planner умеет извлекать задачу/дату из естественного текста, отправлять Telegram reminder и защищён от duplicate scheduler/reminders.
- Presentations используют web-card/share link вместо старой PDF-логики: темы, галерея, характеристики, карта, AI enrichment и ссылка с TTL 3 дня.
- Parser CRM фильтрует минимум 20 объявлений и сортирует по listings count; smoke test ранее дал SS.ge 10/10 и Korter 10/10 телефонов, MyHome 0/10 из-за masked numbers/reCAPTCHA.

## Операционные замечания

- Перед любым production restart сначала выполнить `npm run build`, затем проверить `nginx -t`; после PM2 restart первые несколько секунд возможен временный `502`, окончательная проверка должна быть после ожидания 5-10 секунд.
- Не считать parser logs статистикой publisher: для реального процента ошибок нужна отдельная controlled publication matrix.
- Не включать Skyvern без реального `SKYVERN_API_URL`, `SKYVERN_API_KEY`, проверки cookie/session mount, ограничения concurrency и обязательной URL/alive verification.
- Self-hosted Skyvern compose запускается из `/root/karty-lab/skyvern` с `docker compose --env-file /root/karty-lab/karty-core/.env ...`; не запускать `docker compose` из `karty-core`, там другой compose-файл.
- Gemini API key хранится только в `karty-core/.env`; не копировать его в compose, исходники или логи.
- В проекте исторически есть секреты и дубли Python-кода; перед публичным репозиторием проверить `config.py`, parser credentials, Telegram credentials, `.env` и старые backup/scratch-файлы.

## База данных и запуск

Live Supabase table `listings` содержит `id`, `user_id`, `title`, `description`, `status`, `platforms`, `cover_image`, `images`, `listing_urls`, `error_details`, `created_at`.

```bash
# Python API
cd /root/karty-lab && ./venv/bin/python run_api.py

# Node development
cd /root/karty-lab/karty-core && npm run dev

# Production
cd /root/karty-lab/karty-core && npm run build
pm2 restart karty
```

## Финальная диагностика MyHome и SS.ge (4 августа 2026)

- **MyHome blocker установлен точно:** это не Cloudflare и не validation/address failure. Headful controlled run заполнил адрес `კოსტავას ქ. 12`, все обязательные поля и 3 фото; `POST https://api-statements.tnet.ge/v1/statements/create` вернул `200`, затем `POST /v2/payments/init-statement-services` вернул `200`, checkout открылся, выбор `balance` и `POST /v2/payments/pay` также вернули `200`. Сайт завершил flow на `status/success` и создал public URL `https://www.myhome.ge/pr/25667001/prodaetsia-3-komnatnaia-kvartira-v-sindisi`. Артефакт: `artifacts/myhome_ge_diagnostic_1785861831.json`.
- **MyHome delete result:** exact-delete worker подтвердил удаление карточки из кабинета: `Active=0`, совпадающая ссылка отсутствует. Однако повторное открытие public URL в новом authenticated browser context всё ещё возвращает canonical страницу объекта HTTP `200` с ID `25667001`. Поэтому public disappearance/HTTP `410` не подтверждены; текущая реализация delete, вероятно, скрывает карточку в кабинете, но не удаляет или не инвалидирует public URL немедленно.
- **SS.ge blocker установлен точно:** controlled headful run дошёл до `POST https://api-gateway.ss.ge/v1/RealEstate/create-draft` с HTTP `200`, после чего SS.ge показал `Insufficient balance`; код остановился до клика `Размещение заявки`. Баланс кабинета на момент проверки: `0 ₾`. Публичный объект в этом прогоне не создавался.
- **Судьба пропавшего SS.ge объекта:** task `d50b09f6` ранее был помечен успехом по `https://ss.ge/ru/home/help?index=0`, но это не listing URL. Кабинет SS.ge сейчас показывает `0` активных объявлений и не содержит карточки с тестовым адресом/ценой. Автоматическое удаление не могло удалить этот объект: publish flow подменяет `_delete_listing` на `no_delete`, а exact-delete worker запускается только отдельным delete-запросом с подтверждённым URL. Следовательно, объект не «пропал» после успешной публикации; успешной публикации не было, а `/home/help` был историческим false-positive.
- **Recovery hardening:** `sites/base.py` больше не выполняет URL recovery после ошибок balance/payment/auth/validation/CAPTCHA/Cloudflare, чтобы старое объявление не маскировало неуспешный submit. Для SS.ge реальный результат теперь должен оставаться `BALANCE_ERROR` на `submit_precheck`.
- **Ограничение следующего E2E:** подтверждённый SS.ge publish+alive+exact-delete невозможен до пополнения баланса тестового аккаунта. Для MyHome критерий удаления определён по кабинету: отсутствие exact URL в `Active`/текущих списках; HTTP `200` после удаления не отменяет успех.

### Уточнение delete/balance semantics после проверки кабинетов

- MyHome dashboard имеет отдельные состояния `Active`, `Drafts`, `Unpaid`, `Blocked`, `Expired`. После удаления тестового объекта он отсутствует в `Active` и в доступных текущих списках кабинета. В `Expired` UI явно показывает: после окончания срока фотографии удаляются, но информация остаётся доступной; public URL может продолжать отдавать историческую canonical страницу с HTTP `200`. Для MyHome успешное удаление определяется отсутствием exact URL в кабинете, а не HTTP `404/410`. `sites/myhome_ge.py` теперь проверяет этот критерий после подтверждения удаления.
- Полный подтверждённый MyHome цикл: publish task создал `https://www.myhome.ge/pr/25667001/prodaetsia-3-komnatnaia-kvartira-v-sindisi`, public page отвечала `200`, exact-delete worker убрал карточку из `Active`; public HTTP `200` после этого считается ожидаемым retention-поведением MyHome. Артефакты: `artifacts/myhome_ge_diagnostic_1785861831.json`, screenshot delete `screenshots/myhome_ge_1785861882.png`.
- Балансы кабинетов на проверке: MyHome `0.10 ₾` (минимальный тариф тестовой публикации), Korter `0 ₾` (публикация бесплатна), SS.ge `0 ₾` (платная публикация заблокирована). SS.ge publish после добавления balance precheck остановился до формы с `BALANCE_ERROR`, `stage=balance_precheck`; submit не выполнялся.
- Добавлен общий pre-submit balance hook. MyHome проверяет минимум `0.10 ₾`, SS.ge блокирует нулевой баланс, MyHome checkout теперь требует реального payment confirmation и не возвращает checkout URL как успешный listing URL. Пополнение SS.ge остаётся организационной задачей и намеренно пропущено.

## Финальная controlled publication matrix (10 августа 2026)

Тесты выполнялись на `test_user` с тремя локальными фотографиями, уникальной ценой на каждый запуск и полным циклом `publish -> public alive -> exact delete`. SS.ge и MyHome списывали по `0.10 GEL` за публикацию; Korter бесплатный.

| Площадка | apartment sale | apartment rent | house sale | house rent | land sale | land rent | commercial sale | commercial rent |
|---|---|---|---|---|---|---|---|
| SS.ge | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено |
| MyHome | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено |
| Korter | подтверждено | подтверждено | подтверждено | подтверждено | подтверждено | не поддержано: в форме нет Land для rent | подтверждено | подтверждено |

### Что было исправлено по результатам матрицы

- `sites/ss_ge.py`: delete ищет карточку по ID, потому что dashboard URL не равен public URL; выбирает последнюю активную modal-кнопку `Удалить`; ждёт eventual consistency до 30 секунд; проверяет отсутствие ID в кабинете. Убран dead `page.evaluate` без `await` в floor fallback.
- `sites/myhome_ge.py`: payment/status URL больше не считается public listing URL; если после оплаты URL не найден в кабинете, результат остаётся failed/not verified. Delete подтверждается отсутствием exact link в кабинете, а не HTTP-кодом public URL.
- `sites/korter_ge.py`: добавлены RU/EN labels и dropdowns, обработка `I accept Cookies`/`Clear form`, house/commercial subtype, URL из кнопки `Страница на сайте`/`Page on the website`, увеличено ожидание dashboard; delete подтверждается отсутствием карточки и HTTP `410`.
- `test_runner.py`: низкоуровневый publisher теперь получает подготовленные `photos`; каждый запуск использует уникальную цену/описание, чтобы SS.ge не возвращал старый deduplicated ID.
- Python production перезапущен через PM2, `api/health` на Node и Python отвечает `200`.

### Production verdict

- Для продуктовых шести категорий (`apartment/house/commercial × sale/rent`) все три активные площадки подтверждены реальными publish/delete циклами.
- Land sale также подтверждён на всех трёх площадках.
- Land rent поддержан MyHome и подтверждён publish/delete; Korter не предлагает такую сделку и должен показывать пользователю понятный `unsupported` preflight.
- Public URL после удаления не является универсальным критерием: SS.ge может сохранять HTTP `200`, MyHome зависит от retention; authoritative критерий — отсутствие exact карточки в кабинете, а для Korter дополнительно HTTP `410`.
- Перед production rollout нужен отдельный Mini App smoke через Node routes с реальным Supabase `listing`/`objectId`; прямые Python controlled cycles подтверждают площадки и формы, но не заменяют authenticated UI smoke.
- Node route smoke выполнен для Korter: `POST /api/publish/korter` -> Python task `574468a0` -> public URL `https://korter.ge/ru/продажа-квартир-тбилиси/827655` -> exact delete через `/api/listings/delete` подтверждён.
- Node preflight smoke через публичный API вернул `ready=true` для Korter/MyHome/SS.ge на apartment-sale payload с 3 фото.
- Mini App preflight теперь передаёт `userId` и вызывает Python `/api/publish/preflight`: проверяются auth cookies/storage-state, баланс SS.ge/MyHome, фото, тип/сделка и обязательные поля; ошибки показываются до создания Supabase listing.
- MyHome land-rent recovery исправлен: кабинет конвертирует USD в GEL, поэтому URL recovery теперь использует fallback по типу/сделке, а не требует совпадения исходной цены.

## Mandatory field preflight

The publish gate is now enforced in both Node and Python. AI extraction must return explicit values; missing `dealType` or `propertyType` no longer silently defaults to sale/apartment when `parsedData` is present. AI does not invent rooms, bedrooms, floor count or yard area from square meters.

| Category | SS.ge | MyHome | Korter |
|---|---|---|---|
| apartment | price, area, city, address, description, photos, rooms, bedrooms, floor, floors_total | base + rooms, floor, floors_total | base + 3 photos, rooms, bedrooms, floor, floors_total |
| house | base + rooms, bedrooms, yard_area | base + rooms, bedrooms, floors_total | base + 3 photos, rooms, bedrooms, floors_total |
| land | base | base | base + 3 photos |
| commercial | base | base + rooms, floor, floors_total | base + 3 photos, floor, floors_total |

Mini App sends `userId` to `/api/publish/preflight`. The preflight checks auth cookies/storage-state, paid-site balance, photos, category support and fields before inserting the Supabase listing or starting a browser task. Unsupported `Korter land + rent` is rejected with a user-facing message; `MyHome land + rent` is supported and tested.

## Security hardening started (10 August 2026)

- Local backup created before hardening: `/root/karty-backups/karty-lab-20260810-2036.tar.gz` (40 MB, generated directories excluded).
- Node publish/preflight/delete/republish routes now require a Supabase Bearer token whose user ID matches the requested `userId`; missing token returns HTTP 401.
- Mini App sends the Supabase access token on publish, preflight, delete and republish requests.
- Delete worker has a 180-second timeout and process-group cleanup to prevent stuck HTTP requests.
- Publish idempotency keys are now persisted in `realtors.db`, and overlapping `(user_id, site)` publish tasks are rejected with HTTP 409.
- Publish/delete routes verify listing ownership through the server Supabase client; publish monitor deadline is aligned to 15 minutes and writes `publish_unknown` on expiry.
- Photo downloads reject arbitrary local paths, private/link-local IPs, non-HTTP(S) URLs and files larger than 12 MB.
- Mini App no longer removes a history item when upstream delete fails.
- Secure RLS schema and live migration are in `karty-core/supabase_schema.sql` and `karty-core/supabase_security_migration.sql`; the migration must be applied in Supabase SQL Editor because local code cannot execute remote DDL.
- Persistent per-platform state is defined in `karty-core/supabase_publications_migration.sql`; apply it in Supabase SQL Editor to enable `listing_publications`, monitor recovery after Node restart and independent publish/delete states.
- Latest hardening backup: `/root/karty-backups/karty-lab-hardening-20260810.tar.gz`.
- После оплаты MyHome commercial-sale ранее был ложный `success` с `/status/success`; `sites/myhome_ge.py` теперь возвращает failure, если после оплаты не найден public URL в кабинете.
- `npm run build`, `nginx -t`, PM2 restart и публичный `https://karty-bot.duckdns.org/api/health` проверены после финальных правок.

## Production Security Checkpoint (11 августа 2026)

- Пользователь применил в Supabase SQL Editor базовые ownership-политики RLS для `platform_sessions`, `listings`, `presentations`, `planner_notes` и `planner_tasks`.
- Пользователь также применил `/root/karty-lab/karty-core/supabase_publications_migration.sql`: создана `listing_publications`, включён RLS и добавлена policy `Users own listing publications`.
- Node security hardening завершён в `karty-core/server.ts`: Bearer identity и ownership checks добавлены для `/api/publish/auto`, publish status, cookies/storage-state proxy, platform auth/session routes и planner Telegram registration.
- `/api/auth/debug-sessions` и тестовый `/api/auth/test-error` отключены и возвращают `404`.
- Python API в `run_api.py` переведён с `0.0.0.0` на `127.0.0.1`; публичная точка входа остаётся Node/Nginx.
- Убраны hardcoded GitHub/DeepSeek credentials из `gpt_helper.py` и `karty-core/server.ts`; `ecosystem.config.cjs` теперь загружает runtime secrets из `karty-core/.env`.
- Production build повторно прошёл; Python `py_compile` и Node syntax checks прошли. `npm run lint` по-прежнему имеет только старые ошибки отсутствующих `html2canvas` и `jspdf`.
- PM2 process `karty` был запущен из `karty-core/ecosystem.config.cjs`, сохранён через `pm2 save`, статус `online`, restart count `0`.
- Локальный и публичный `/api/health` возвращают `{"status":"ok"}`.
- Неавторизованный `POST /api/publish/auto` проверен и возвращает HTTP `401`.
- Python API проверен через `ss`: слушает только `127.0.0.1:8000`; Node слушает `0.0.0.0:3000`.
- Текущий production verdict: публикационные controlled E2E и security hardening выполнены; перед дальнейшими изменениями не запускать новые реальные публикации без необходимости.

## Parser Phone-Extraction Hardening (11 августа 2026)

- Диагностика показала, что parser не был остановлен: task `797a3e27` продолжает работать с heartbeat, но полный последовательный Korter-прогон обрабатывает тысячи URL и доходит до SS.ge только после завершения всех Korter categories.
- Scheduler был выключен с 8 августа; включён обратно через `POST /api/realtors/scheduler`, interval 6 часов. Scheduler теперь перед daily-запуском проверяет активные parse tasks и пропускает запуск при занятом parser.
- Найдена критичная ошибка ledger: старые `success` без телефона переиспользовались как уже обработанные. `parser_state.get_final_url_any_task()` и `process_persistent_listing()` теперь принимают `success` только при непустом phone; `mark_url_result()` запрещает записывать success без phone.
- Исторические `9,802` success-записи без phone инвалидированы; `724` записи активной задачи `797a3e27` отправлены в retry queue, остальные переведены в `manual_review`. Текущий strict invariant: `success_without_phone = 0`.
- Phone extraction расширен: Georgian mobile/landline formats, international `+CC` formats, phone links, text and revealed contact buttons. ID объявления больше не принимается за phone из-за обязательных границ/разделителей.
- Korter listings с владельцем без realtor profile теперь сохраняют извлечённый phone как успешный phone-only contact; profile/listings count остаются дополнительными, не обязательными для phone extraction.
- SS.ge распознаёт `/userlist?userId=...` profile links; profile URL больше не является условием наличия телефона.
- Реальные smoke checks подтвердили extraction: Korter owner phone, Korter international `+38 (099) 322 57 81` → `+380993225781`, SS.ge profile/phone flow.
- API/UI hardening: parser history теперь читается из persistent `parse_tasks`, live parse status показывает реальный `total_in_db`/`by_source`, а не нули после рестарта.
- После рестартов PM2 checkpoint task `797a3e27` восстановился; PM2 `karty` online, public health и parser status отвечают 200.
- На момент checkpoint: active task `797a3e27` processing на Korter, `315` realtors in DB (`253` Korter, `62` SS.ge), `1,064` URL остаются retry и не считаются success до phone extraction.
- Полная phone extraction matrix ещё не завершена: retry queue и оставшийся full run должны закончиться; manual review URLs не считаются успешно обработанными.
- После дополнительного требования пользователя production-normalizer ужесточён: принимаются только грузинские мобильные `5XXXXXXXX`, сохраняются как `+9955XXXXXXXX`. Международные, городские, hotline и ID объявления отклоняются.
- Активный parser ledger полностью сброшен после backup `/root/karty-backups/parser-audit-pre-reset-20260811.sqlite`; таблица `realtors` сохранена (`316` записей на момент reset), scheduler выключен, новый clean run ещё не запускался.
- Controlled audit sample: Korter `12/12` с телефоном и ролью/авторским контекстом; SS.ge `12/12` с телефоном, `11/12` с явной ролью Agent и `1/12` с userlist-контактом без role label. Full database revalidation ещё не проведена.
- Дополнительный SS.ge direct sample `15` показал `8/15` с явной ролью Agent; остальные имели phone/userlist без role label и должны оцениваться по profile `listings_count`, а не автоматически отбрасываться по отсутствию роли.
- Уточнение критерия пользователя: роль `Агент/Риелтор` не является обязательной. `process_listing` принимает контакт, если есть валидный грузинский mobile, загружен author profile и `listings_count >= MIN_LISTINGS (20)`. Если профиль отсутствует/не загрузился и count нельзя проверить, URL не проходит в realtor DB и уходит в `manual_review/retry`.
- После role hardening parser был скомпилирован, production build прошёл, PM2 перезапущен и сохранён; scheduler остаётся выключенным до clean controlled run.
- Final parser/UI audit: profile cache added across categories within one run; profile screenshots disabled by default (`PARSER_SAVE_PROFILE_SCREENSHOTS=true` enables them); page navigation/collection retries up to 2 times with browser relaunch after timeout.
- ParserTab hardening: default UI filter threshold is now 20, duplicate task polling is prevented with a ref, scheduler response errors are surfaced instead of optimistically changing state, and persistent recovery does not offer resume for completed tasks.
- Safe acceleration policy: no parallel listing browsers added; speed comes from profile cache, avoiding screenshots, bounded page retries and daily incremental mode. Parallelism remains intentionally disabled to avoid portal rate limits/anti-bot failures.

## Telegram Parser Checkpoint (11 августа 2026)

- Root system Python had Telethon 1.44.0, but production `/root/karty-lab/venv/bin/python3` did not. Telethon 1.44.0 installed into venv and added to root `requirements.txt`.
- Telegram parser runtime smoke passed: venv imports `TelegramClient` and `SessionPasswordNeededError`; no-account monitor exits cleanly with a clear message.
- Telegram parser uses `/root/karty-lab/karty-core/karty-lab-code/tg_parser.py`; API spawns it with the venv Python. It monitors `telegram_chats` using active `telegram_accounts` StringSession rows.
- `scan` resets each chat cursor and reads all messages; `monitor` reads messages after `last_checked_id` every 5 minutes. Sender phone is preferred, message text phone is fallback. Users with phone or username are stored in `telegram_users` with message/source timestamps.
- Telegram parser currently collects Telegram user candidates only; it does not insert verified rows into `realtors` and does not prove `listings_count >= 20`. A separate lead/verification rule is required before treating Telegram users as verified realtors.
- Added parser process lock `/root/karty-lab/logs/tg_parser.lock` to prevent duplicate monitor/scan processes; API now returns conflict when one is already running.
- Fixed Telegram user updates so empty phone/username/name values cannot overwrite previously collected values.
- Added Telegram 2FA password flow to `tgUserbot.py`, API and `TelegramTab`.
- Telegram parser API routes are protected by CRM auth/admin middleware; `TelegramTab` sends `crm_token`, and the UI polls Telegram status/data every 30 seconds.
- Telegram API status at checkpoint: one active chat, zero active accounts, zero collected users, parser not running. Site realtor parser task `c5402665` is active independently and was not stopped by Telegram changes.
- Telegram lead flow implemented with threshold `listing_count >= 25`: chat links/IDs are stored with join status, public/private Telegram links are joined before parsing, message IDs are deduplicated in `telegram_messages`, and listing messages are classified by site URL or property+price/area signals.
- `telegram_users` now stores `listing_count`, deduplicated `listing_urls`, listing samples and lead linkage. Empty profile data cannot erase existing phone/name/username.
- `/api/tg/leads?min_listings=25` returns Telegram candidates with username; Node automatically syncs them into `crm_leads` with metadata every 5 minutes and when Telegram UI loads.
- Telegram UI accepts chat links, shows join status/listing counts, polls parser status, and supports CRM-authenticated 2FA account setup.
- Current Telegram DB after migration: one active chat, zero accounts, zero users/messages; no Telegram monitor is running. User must add an account before scan/monitor can start.
- CRM `Session expired` hardening: CRM sessions are now persisted as SHA-256 token hashes in `crm.db` table `crm_sessions` for their 8-hour lifetime, so PM2 restarts no longer invalidate active CRM tokens. A new login is still required once after the deployment that introduced this table.
- Telegram live status UI added: parser writes `/root/karty-lab/logs/tg_parser_status.json` with running/mode/cycle/users/listing_count/last_cycle_at/error; `/api/tg/status` exposes it and TelegramTab displays a compact activity line. Static frontend is deployed to `/var/www/karty`, the actual Nginx document root.
- Operational rule: never run `tg_parser.py --mode monitor` or any `run_until_disconnected` process in foreground; use only `setsid nohup ... > /root/karty-lab/logs/monitor.log 2>&1 < /dev/null & disown`, then finite `sleep 3` and one `tail -n N`. Never use `tail -f`, `less +F`, or loops waiting for monitor output.
