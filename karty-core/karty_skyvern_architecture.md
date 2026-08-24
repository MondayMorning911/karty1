# Karty — Архитектура интеграции Skyvern

## Общий флоу публикации

```
Telegram Bot
    │
    ▼
Deepseek (парсинг описания → JSON)
    │
    ▼
AI Studio (системный промпт → массив Skyvern Tasks)
    │
    ├──► Playwright: загрузка фото на каждый портал
    │         input[accept="image/jpeg,..."]
    │         (выполняется ДО запуска Skyvern-задач)
    │
    └──► Skyvern Task API (self-hosted)
              ├─ korter.ge
              ├─ myhome.ge
              ├─ ss.ge
              └─ realting.com
```

---

## navigation_payload — полная схема

```typescript
interface KartyPayload {
  // Тип сделки и объекта
  deal_type: "sale" | "rent";
  property_type: "apartment" | "house" | "commercial" | "land";

  // Цена
  price: number;
  currency: "USD" | "GEL" | "EUR";

  // Характеристики
  area_total: number;       // общая площадь, м²
  area_living?: number;     // жилая площадь, м²
  rooms: number;
  floor?: number;
  floors_total?: number;
  condition: "renovated" | "shell" | "old_renovated" | "new";

  // Адрес — ОБА языка обязательны
  address_ru: string;       // "ул. Шерифа Химшиашвили, 1"
  address_ge: string;       // "შერიფ ხიმშიაშვილის ქუჩა, 1"
  district: string;         // из фиксированного списка
  complex_name?: string;    // "Orbi City" или null

  // Описание — оба языка
  description_ru: string;
  description_ge?: string;  // если нет — Skyvern пропускает myhome.ge

  // Медиа
  photos: string[];         // Cloudinary URLs, первое фото = обложка

  // Контакт
  contact_phone: string;

  // Куда публиковать
  portal_targets: Array<"korter.ge" | "myhome.ge" | "ss.ge" | "realting.com">;
}
```

---

## Playwright — загрузка фото (Python)

```python
async def upload_photos_playwright(page, photos: list[str], portal: str):
    """
    Вызывается ДО запуска Skyvern-задачи.
    Скачивает фото с Cloudinary и загружает через file input.
    """
    import tempfile, httpx, pathlib

    # Скачиваем фото во временную папку
    tmp_dir = pathlib.Path(tempfile.mkdtemp())
    local_paths = []
    async with httpx.AsyncClient() as client:
        for i, url in enumerate(photos):
            resp = await client.get(url)
            path = tmp_dir / f"photo_{i}.jpg"
            path.write_bytes(resp.content)
            local_paths.append(str(path))

    # Универсальный селектор для большинства порталов
    file_input = page.locator('input[type="file"][accept*="image"]').first
    await file_input.set_input_files(local_paths)

    # Ждём появления превью
    await page.wait_for_selector('.photo-preview, .uploaded-image, [class*="thumb"]',
                                  timeout=15000)
```

---

## Cookies — передача сессии в Skyvern

Skyvern Task API принимает cookies через поле `browser_session_id` или напрямую.
При self-hosted деплое — храни cookies в файлах и загружай через Playwright-контекст
перед стартом задачи:

```python
# Сохранение сессии (разово, вручную после логина)
storage = await context.storage_state(path=f"cookies_{portal}.json")

# Загрузка при каждом запуске
context = await browser.new_context(storage_state=f"cookies_{portal}.json")
```

---

## Обработка результата от Skyvern

```python
async def run_portal_task(task: dict) -> dict:
    resp = await skyvern_client.post("/api/v1/tasks", json=task)
    task_id = resp.json()["task_id"]

    # Polling результата
    for _ in range(60):  # max 5 минут
        await asyncio.sleep(5)
        status = await skyvern_client.get(f"/api/v1/tasks/{task_id}")
        data = status.json()

        if data["status"] == "completed":
            return {
                "portal": task["portal"],
                "success": True,
                "listing_url": data.get("extracted_information", {}).get("url")
            }
        elif data["status"] == "failed":
            return {
                "portal": task["portal"],
                "success": False,
                "error": data.get("failure_reason")
            }

    return {"portal": task["portal"], "success": False, "error": "TIMEOUT"}
```

---

## Ресурсы сервера (4 CPU / 8 GB RAM)

Skyvern self-hosted + Chromium в Docker минимум требует ~2 GB RAM на один браузер.

Рекомендуемая конфигурация:
- `concurrency: 1` — одна задача одновременно (порталы публикуются последовательно)
- Отключить тяжёлые ресурсы через `page.route`:

```python
async def block_heavy_resources(page):
    async def handler(route):
        if route.request.resource_type in ["media", "font"]:
            await route.abort()
        elif any(s in route.request.url for s in [
            "google-analytics", "facebook.net", "hotjar", "gtag"
        ]):
            await route.abort()
        else:
            await route.continue_()
    await page.route("**/*", handler)
```

Это освобождает ~30% RAM и ускоряет рендер страниц на 20-40%.

---

## Docker Compose (минимальный стек)

```yaml
version: "3.8"
services:
  skyvern:
    image: skyvernai/skyvern:latest
    ports:
      - "8000:8000"
    environment:
      - LLM_KEY=your_openrouter_key  # или прямой Gemini ключ
      - LLM_MODEL=google/gemini-flash-1.5-exp
      - BROWSER_TYPE=chromium
      - MAX_SCRAPING_RETRIES=3
    volumes:
      - ./cookies:/app/cookies
      - ./screenshots:/app/screenshots
    deploy:
      resources:
        limits:
          memory: 6G
          cpus: "3.5"
```
