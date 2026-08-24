# PROJECT KNOWLEDGE

## Архитектура проекта и структура каталогов
* **api/** - Директория для API маршрутов (на FastAPI). Основные файлы: `main.py`, `publisher.py`, `schemas.py`, `cookie_manager.py`.
* **sites/** - Скрипты взаимодействия с конкретными сайтами недвижимости через Playwright (`ss_ge.py`, `myhome_ge.py`, `korter_ge.py`, `base.py`).
* **parsers/** - Парсеры данных о недвижимости.
* **utils/** - Вспомогательные утилиты.
* **cookies/** - Хранилище сессий и cookies, загруженных через API.
* **uploads/** - Загруженные файлы (фото недвижимости перед публикацией). Директория очищается после загрузки.
* **karty-core/** - Основное ядро приложения, используемое для парсинга риелторов и Telegram (база данных `db.py`, `tg_parser.py` и т.д.).

## Схема публикации
Мини-приложение (фронтенд)
↓ [POST /api/publish]
Backend API (`api/main.py`)
↓
Publisher (`api/publisher.py`) -> скачивает фото, подготавливает cookies
↓
Конкретный сайт (Playwright скрипты в `sites/`)

## API Endpoints

### Публикация и удаление
* `POST /api/publish` - Публикация объявления на выбранные сайты. Возвращает task_id.
* `GET /api/publish/{task_id}` - Проверка статуса публикации.
* `POST /api/listings/delete` - Удаление объявления.
* `POST /api/listings/republish` - Перепубликация (удаление + публикация).

### Cookies и авторизация
* `POST /api/cookies/{user_id}/{site}` - Загрузка cookies.
* `POST /api/storage-state/{user_id}/{site}` - Загрузка storage state (нужно для korter_ge).

### Парсинг и риелторы
* `POST /api/parse` - Запуск парсера объявлений.
* `GET /api/parse/{task_id}` - Статус парсинга.
* `POST /api/parse/{task_id}/cancel` - Отмена парсинга.
* `POST /api/parse/{task_id}/resume` - Возобновление парсинга.
* `GET /api/parse/history` - История парсинга.
* `GET /api/realtors` - Получение списка риелторов.
* `GET /api/realtors/stats` - Статистика парсера риелторов.

### Telegram
* `GET /api/tg/chats`, `POST /api/tg/chats`, `DELETE /api/tg/chats/{chat_id}` - Управление мониторингом чатов.
* `GET /api/tg/accounts`, `POST /api/tg/accounts/login`, `POST /api/tg/accounts/confirm` - Управление аккаунтами Telegram.
* `GET /api/tg/stats`, `GET /api/tg/users`, `POST /api/tg/start`, `POST /api/tg/scan` - Статистика и запуск парсера Telegram.

### Health check
* `GET /api/health`

## Поддерживаемые сайты
1. **ss.ge** (`ss_ge`) - требует yard_area для домов.
2. **myhome.ge** (`myhome_ge`) - требует rooms для коммерции.
3. **korter.ge** (`korter_ge`) - требует минимум 3 фото и storage state (localStorage) для авторизации.

## Поддерживаемые категории недвижимости
Продажа (`sale`) и Аренда (`rent`, `daily`) для следующих типов:
* Квартира (`apartment`)
* Дом (`house`)
* Участок (`land`)
* Коммерция (`commercial`)

### Механика выбора категорий (Технический долг)
В скриптах Playwright (например, `ss_ge.py`) выбор типа сделки и категории реализован очень хрупко: выполняется инъекция JavaScript (`page.evaluate`), которая ищет все `div, span, p`, фильтрует по текстовому содержимому (например, "Купить", "Квартира") и размерам прямоугольника (bounding box).
**Потенциальная проблема:** При малейшем изменении верстки сайта или переводе интерфейса выбор категории сломается. Это место нужно рефакторить на использование надежных селекторов `data-testid` или более стабильных локаторов.

## Список Endpoint каждого сайта
1. **ss.ge**
   - Базовый URL: `https://home.ss.ge/ru/...`
   - Создание объявления: `https://home.ss.ge/ru/.../create`
2. **myhome.ge**
   - Базовый URL: `https://www.myhome.ge`
   - Создание объявления: `https://statements.myhome.ge/ru/statement/create?referrer=myhome`
3. **korter.ge**
   - Базовый URL: `https://korter.ge`
   - Создание объявления: Переход по клику на кнопку "Добавить" с главной страницы.

## Тесты и проверки
Существующие тесты и скрипты проверок:
- `test_parser.py` - Тестирование парсера риелторов.
- `check_screenshot.py` - Проверка успешности создания скриншотов.

В папке `karty-core` есть также различные скрипты для тестирования Telegram и базы данных (напр., `test.py`, `test.ts`, `test_bb.ts`). Покрытие тестами самого API публикации (`api/main.py` и `sites/`) отсутствует или минимально.

## Потенциально опасные места и технический долг
- **Хрупкие селекторы:** Поиск элементов по тексту ("Добавить", "Очистить форму", "Купить") вместо стабильных id или data-атрибутов.
- **Работа с анти-детектом:** Использование `camoufox` для обхода Cloudflare/капчи подвержено поломкам при обновлениях браузера или изменении алгоритмов защиты сайтов.
- **Отсутствие тестов публикации:** В случае изменения верстки на одном из сайтов публикация тихо сломается в рантайме.
- **Отсутствие строгой типизации для объявлений:** В `sites/` часто используются проверки `isinstance(listing.get("house"), dict)` - лучше использовать строгие Pydantic модели.
- **Очистка cookies:** Korter.ge использует `localStorage` для авторизации, а API загрузки cookies ожидает только куки или JSON-дамп стораджа, что усложняет управление сессиями.

## DO NOT MODIFY (КРИТИЧНЫЕ ЗОНЫ)
Следующие зоны нельзя изменять без особой осторожности, так как они критичны для работы приложения и обхода защиты сайтов:
1. **Флаги запуска браузера (Browser Init Flags):** Находятся в `api/publisher.py` (`patched_launch`) и `sites/base.py`. Флаги `--no-sandbox`, `--disable-blink-features=AutomationControlled`, `--enable-webgl`, `--ignore-gpu-blocklist`, `--use-gl=angle`, `--use-angle=swiftshader`, `--enable-unsafe-webgpu`, `--disable-gpu-sandbox` и использование `storage_state` критичны для обхода Cloudflare.
2. **Инициализация анти-детекта (Camoufox):** В `sites/base.py` используется `AsyncCamoufox(headless=HEADLESS)`. Замена на стандартный Playwright приведет к бану.
3. **Уничтожение зависших процессов:** В `sites/base.py` (`_close`) есть принудительный килл процессов: `subprocess.run(["pkill", "-9", "-f", "firefox"])` и `camoufox`. Убирать нельзя, иначе зомби-процессы переполнят память.
4. **Конфигурация Xvfb:** Запуск сервера `xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 run_api.py`. Сайтам нужен виртуальный дисплей для правильного рендера и кликов по координатам.
5. **API Публикации:** Точка входа `api/main.py` -> `POST /api/publish` и контракты в `schemas.py` не должны меняться, чтобы не сломать интеграцию с внешним фронтендом.
