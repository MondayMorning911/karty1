# PRESENTATIONS_SPEC.md — Дизайн-спек переработки вкладки «Презентации»

> Документ — **только план**. Реализация — отдельный этап, другой моделью.
> Дата: 2026-08-02. Основано на изучении трёх референсов и текущего кода.

---

## 0. Текущая архитектура (для контекста)

### Файлы, участвующие в модуле презентаций

| Файл | Роль | Строк |
|---|---|---|
| `karty-core/src/types.ts` | Типы `Presentation`, `PresentationTemplate`, `PresentationObject` | 3-47 |
| `karty-core/src/components/PresentationsTab.tsx` | UI вкладки: список, редактор (design/brand/objects/preview), генерация PDF | 622 |
| `karty-core/server.ts` | Эндпоинты: `/api/presentations/generate` (PDF), `/api/presentations/preview-html`, `/api/presentations/parse-listing` | 705-987 |
| `karty-core/presentation-template.html` | HTML-шаблон A4 для Puppeteer → PDF | 136 |
| `karty-core/supabase_schema.sql` | Таблица `presentations` (id, user_id, name, template jsonb, objects jsonb) | — |

### Текущий флоу
1. Риэлтор выбирает объекты из списка (или добавляет свой)
2. В редакторе выбирает: палитру (6 пресетов → 2 кружка цвета), шрифт (3 варианта), макет (2 варианта)
3. Заполняет брендинг: имя, агентство, телефон, лого, фото
4. Превью: iframe с `/api/presentations/preview-html`
5. Скачивание: `/api/presentations/generate` → Puppeteer → PDF

### Что можно переиспользовать как есть
- Логика сбора данных объекта (`PresentationObject` — поля не зависят от визуала)
- DeepSeek enrichment в `/api/presentations/generate` (заполнение недостающих полей)
- DeepSeek parse-listing в `/api/presentations/parse-listing`
- Выбор объектов из списка риэлтора (listings)
- CustomObjectForm (форма добавления своего объекта)
- PdfLivePreview (iframe с масштабированием)
- Supabase CRUD для `presentations`
- Puppeteer PDF-генерация (A4, 794×1123)

### Что полностью переписывается
- `COLOR_PRESETS` и `FONT_OPTIONS` в `PresentationsTab.tsx`
- `presentation-template.html` — вся вёрстка
- `generatePresentationHTML` в `server.ts` — логика генерации
- UI выбора пресета (вкладка «Дизайн») — с кружков на мини-превью

---

## 1. Новые пресеты (6 штук)

Каждый пресет — целостный стиль, вдохновлённый одним из референсов. Не просто цвета — полная типографика, композиция, настроение.

### 1.1 «Investment Bold» — по референсу SKY RIVER (anna_slides)

**Настроение:** уверенный, инвестиционный, крупная типографика. Для риэлторов, продающих новостройки и инвестиционные проекты.

**Цветовая палитра:**
```
Основной (primary):     #1B2A4A   (тёмно-синий, фон обложки)
Акцентный (accent):     #1B2A4A   (тот же синий, для заголовков)
Фон (surface):          #F5F0E8   (кремовый, фон страниц объекта)
Текст (text):           #2C2C2C   (почти чёрный, основной текст)
Золото (gold):          #B8963E   (золотой акцент, цена, метрики)
Вторичный фон (surface2): #E8E0D0  (карточки, подложки)
Текст на тёмном:        #F0EDE7   (кремовый текст на синем фоне)
Мuted (тихий):          #8A8578   (подписи, вторичный текст)
```

**Шрифтовая пара:**
- Заголовки: **'Fraunces', serif** (600-700 weight) — для заголовков, цен, метрик. Fraunces даёт характерный «инвестиционный» вид с лёгкой винтажностью.
- Тело: **'Manrope', sans-serif** (400-600) — для описаний, характеристик, подписей. Чистый гротеск, отличная читаемость при малых размерах.
- Курсив для акцентных слов: *Fraunces italic* — для названий объектов, УТП.

**Композиция обложки:**
- Полноэкранное фото объекта (верхние 55% страницы) с затемнением `linear-gradient(180deg, transparent 0%, rgba(27,42,74,0.9) 100%)`
- Нижние 45% — синий фон (#1B2A4A): агентство (кремовый текст), eyebrow «ПОДБОРКА ОБЪЕКТОВ» (золотой, uppercase, letter-spacing 0.16em), заголовок «Подборка недвижимости» (Fraunces 36px, кремовый), подзаголовок (13px, rgba белый 0.75)
- Список объектов: нумерованный (01, 02...), миниатюра 20×14mm, название (Fraunces), адрес (10px muted), цена (Fraunces, золотой)
- Низ: фото агента (32px circle), имя + роль (Fraunces 14px), телефон (10px, right-aligned)

**Композиция слайда объекта:**
- Шапка: «Объект 1» (Fraunces, золотой) | Агентство (Fraunces, muted) — 20mm отступ
- Галерея: hero-фото 75mm + миниатюры (5 шт, 22mm каждая, gap 8px, border-radius 8px)
- Заголовок: Fraunces 22px + адрес (📍 11px muted)
- Цена: Fraunces 22px, золотой, border-left 2px gold, price-per-m² (10px muted)
- Характеристики: grid 4 колонки, карточки с иконками (SVG 16px, accent), значение (Fraunces 16px bold), подпись (9px uppercase muted). Карточки: surface2 фон, border 1px, radius 8px, padding 12px
- Описание: surface2 фон, 11px/1.7 line-height
- Преимущества: pill-теги (surface2, border-radius 20px, check ✓ accent)
- Карта: placeholder с адресом, 45mm height, border-radius 8px
- Футер: «Объект 1 из N» | телефон, border-top 1px, 9px muted

**Минимальные размеры шрифта:** заголовки ≥16px, тело ≥10px, подписи ≥9px, метрики ≥16px.

---

### 1.2 «Corporate Light» — по референсу Blend&Bend

**Настроение:** чистый, минималистичный, много воздуха. Для консервативных клиентов и коммерческой недвижимости.

**Цветовая палитра:**
```
Основной (primary):     #2B2B2B   (почти чёрный, заголовки)
Акцентный (accent):     #2B2B2B   (тот же чёрный)
Фон (surface):          #FAFAF8   (молочный, фон страниц)
Текст (text):           #4A4A4A   (серый текст)
Золото (gold):          #8A7A5A   (тёплый серо-золотой, акценты)
Вторичный фон (surface2): #F0EFEB  (карточки)
Текст на тёмном:        #FAFAF8
Muted:                  #B0ADA5
```

**Шрифтовая пара:**
- Заголовки: **'Inter', sans-serif** (600-700) — чистый гротеск, без винтажности. Corporate feel.
- Тело: **'Inter', sans-serif** (400-500) — тот же шрифт, разный вес. Максимальная читаемость.
- Курсив: **'Georgia', serif italic** — только для названий объектов, 1-2 слова. Контраст с Inter.

**Композиция обложки:**
- Фото объекта — не полноэкранное, а **в рамке** (16mm отступы), border-radius 8px
- Ниже фото — текстовый блок на молочном фоне: eyebrow (Inter 10px, uppercase, gold), заголовок (Inter 28px), подзаголовок (Inter 12px, muted)
- Список объектов: без миниатюр, только текст (название + цена), разделённые hairline-линиями
- Низ: лого агентства (если есть), имя + телефон (Inter 10px)

**Композиция слайда объекта:**
- Шапка: минимальная, только номер объекта (Inter 10px, gold)
- Галерея: hero-фото в рамке (16mm отступы), без миниатюр — только 1 фото, крупно
- Заголовок: Inter 20px, под ним адрес (Inter 10px, muted)
- Цена: Inter 20px, gold, без рамки — просто текст
- Характеристики: **таблица** (не карточки) — строки с hairline-разделителями: параметр (Inter 10px muted) | значение (Inter 12px bold). Максимум воздуха.
- Описание: Inter 11px/1.8, max-width 120mm, много whitespace
- Преимущества: список с bullet-точками (gold •), не pill-теги
- Карта: без рамки, hairline border
- Футер: hairline top border, Inter 9px muted

**Минимальные размеры:** заголовки ≥14px, тело ≥10px, подписи ≥9px.

---

### 1.3 «Dubai Luxury» — по референсу IREST

**Настроение:** тёмный премиум, золото, фотография на всю ширину. Для элитной недвижимости и зарубежных объектов.

**Цветовая палитра:**
```
Основной (primary):     #0D1B2A   (глубокий тёмно-синий)
Акцентный (accent):     #C9A84C   (золотой — основной акцент)
Фон (surface):          #F5F2EC   (тёплый кремовый)
Текст (text):           #1F2937   (тёмно-серый)
Золото (gold):          #C9A84C   (тот же золотой)
Вторичный фон (surface2): #EBE6DA  (тёплый серо-кремовый)
Текст на тёмном:        #F0EBE0   (кремовый на тёмном)
Muted:                  #9CA3AF   (серый)
```

**Шрифтовая пара:**
- Заголовки: **'Playfair Display', serif** (600-700) — классический luxury serif, высокий контраст штрихов.
- Тело: **'Inter', sans-serif** (400-500) — нейтральный гротеск для читаемости.
- Курсив: **'Playfair Display' italic** — для подзаголовков, цитат.

**Композиция обложки:**
- Полноэкранное фото (вся страница) с сильным затемнением `rgba(13,27,42,0.85)`
- Центрированный текст: eyebrow «ПОДБОРКА НЕДВИЖИМОСТИ» (Inter 10px, gold, uppercase, letter-spacing 0.2em), заголовок (Playfair Display 32px, кремовый), подзаголовок (Inter 12px, rgba кремовый 0.7)
- Список объектов: минимальный, только название + цена, кремовый текст на тёмном фоне
- Низ: лого агентства (white), имя + телефон (Inter 10px, кремовый)

**Композиция слайда объекта:**
- Шапка: номер объекта (Inter 10px, gold) | агентство (Inter 10px, muted)
- Галерея: hero-фото на всю ширину (без отступов), миниатюры под ним (5 шт, gap 4px)
- Заголовок: Playfair Display 24px, тёмный, курсивное название района
- Цена: Playfair Display 24px, gold, крупно, с price-per-m²
- Характеристики: **grid 2×2** (не 4 колонки) — крупные карточки: иконка (24px), значение (Playfair Display 18px), подпись (Inter 9px uppercase). Карточки: surface2, border-left 3px gold.
- Описание: Inter 11px/1.7, на surface2 подложке
- Преимущества: список с gold checkmarks ✓
- Карта: gold border 1px
- Футер: hairline gold border, Inter 9px

**Минимальные размеры:** заголовки ≥18px, тело ≥10px, подписи ≥9px, метрики ≥18px.

---

### 1.4 «Nordic Minimal» — скандинавский стиль

**Настроение:** светлый, воздушный, скандинавский минимализм. Для современных квартир и молодой аудитории.

**Цветовая палитра:**
```
Основной (primary):     #374151   (серо-синий)
Акцентный (accent):     #6B7280   (серый)
Фон (surface):          #F9FAFB   (почти белый)
Текст (text):           #111827   (почти чёрный)
Золото (gold):          #78716C   (тёплый серый — не золото, а "тёплый акцент")
Вторичный фон (surface2): #F3F4F6  (светло-серый)
Текст на тёмном:        #F9FAFB
Muted:                  #A8A29E
```

**Шрифтовая пара:**
- Заголовки: **'Inter', sans-serif** (500-600) — лёгкий вес, много воздуха.
- Тело: **'Inter', sans-serif** (400) — тот же шрифт.
- Курсив: **'Inter' italic** — лёгкий, для акцентов.

**Композиция:** максимально минималистичная. Много whitespace, hairline-разделители, никаких тяжёлых рамок или подложек. Характеристики — просто текст в две колонки, без карточек. Цена — Inter 20px, не золото, а тёмный текст. Галерея — hero + 3 миниатюры (не 5). Карта — без рамки.

---

### 1.5 «Forest Green» — природный стиль

**Настроение:** природный, экологичный, тёплый. Для загородных домов и эко-проектов.

**Цветовая палитра:**
```
Основной (primary):     #1A3C2A   (тёмно-зелёный)
Акцентный (accent):     #2D6A4F   (средне-зелёный)
Фон (surface):          #F5F0E8   (кремовый)
Текст (text):           #374151   (тёмно-серый)
Золото (gold):          #B8963E   (золотой)
Вторичный фон (surface2): #E8E0D0  (тёплый серо-кремовый)
Текст на тёмном:        #F0EDE7
Muted:                  #9CA3AF
```

**Шрифтовая пара:**
- Заголовки: **'Fraunces', serif** (600) — тёплый, природный serif.
- Тело: **'Manrope', sans-serif** (400-500) — чистый гротеск.
- Курсив: *Fraunces italic* — для названий.

**Композиция:** похожа на Investment Bold, но с зелёными акцентами вместо синих. Характеристики — карточки с зелёным border-left. Преимущества — зелёные checkmarks.

---

### 1.6 «Elegant Purple» — элегантный стиль

**Настроение:** утончённый, женственный, премиум. Для квартир в центре и дизайнерских проектов.

**Цветовая палитра:**
```
Основной (primary):     #2C1654   (тёмно-фиолетовый)
Акцентный (accent):     #5B2C8E   (средне-фиолетовый)
Фон (surface):          #FAF7F1   (тёплый кремовый)
Текст (text):           #1F2937   (тёмно-серый)
Золото (gold):          #C9A84C   (золотой)
Вторичный фон (surface2): #F0EDE7  (серо-кремовый)
Текст на тёмном:        #F5F0E8
Muted:                  #9CA3AF
```

**Шрифтовая пара:**
- Заголовки: **'Playfair Display', serif** (600) — элегантный serif.
- Тело: **'Inter', sans-serif** (400-500).
- Курсив: *Playfair Display italic*.

**Композиция:** похожа на Dubai Luxury, но с фиолетовыми акцентами. Характеристики — карточки с фиолетовым border-left. Цена — Playfair Display, gold.

---

## 2. Редизайн UI вкладки «Дизайн» в mini-app

### 2.1 Карточка выбора пресета — мини-превью, не кружки

**Текущая реализация:** `PresentationsTab.tsx` строки 192-205 — кнопка с `linear-gradient(145deg, secondary, primary)` + два кружка (accent, gold) + название.

**Новая реализация:** каждая карточка пресета — **миниатюра того, как будет выглядеть обложка PDF** в этом стиле.

**Компонент:** `PresetCard` (новый, внутри `PresentationsTab.tsx` или отдельный файл).

**Структура мини-превью (пример для «Investment Bold»):**
```
┌─────────────────────────┐
│  [фото-заглушка 40%]    │
│  ┌─────────────────────┐│
│  │ eyebrow (gold)      ││
│  │ Заголовок (Fraunces)││
│  │ Подзаголовок        ││
│  │ ───                 ││
│  │ 01. Объект    $120k ││
│  │ 02. Объект    $85k  ││
│  │                     ││
│  │ [Агент]  [Телефон]  ││
│  └─────────────────────┘│
│  Фон: #1B2A4A           │
└─────────────────────────┘
```

**Реализация:** div с `aspect-ratio: 210/297` (A4), внутри — миниатюрная HTML-вёрстка в стиле пресета. Используем те же CSS-переменные, что и в PDF-шаблоне, но масштабированные.

**Размер карточки:** ~120×170px (A4 пропорция), grid 2 колонки (3 ряда для 6 пресетов).

**Состояния:**
- Default: border 1px, opacity 0.7
- Selected: border 2px `#533afd`, opacity 1, shadow-md
- Hover: opacity 0.9, scale 1.02

### 2.2 Что конкретно меняется в PresentationsTab.tsx

**Строки 192-205 (выбор палитры):** заменить на новый компонент `PresetCard`.

**Строки 207-221 (свои цвета):** оставить как опцию «Кастомные цвета» — показывать только если выбран пресет «Custom». По умолчанию скрыто.

**Строки 223-233 (выбор шрифта):** убрать — шрифт теперь часть пресета. Если риэлтор выбрал «Custom», показывать выбор шрифта.

**Строки 235-245 (выбор макета):** убрать — макет теперь часть пресета.

**Новый state:** `selectedPreset: string` (id пресета) вместо отдельных `primaryColor`, `secondaryColor`, etc.

**Миграция:** при загрузке существующей презентации — определять пресет по цветам (обратная совместимость), или показывать «Custom».

---

## 3. Редизайн PDF-шаблона(ов)

### 3.1 Архитектура: несколько шаблонов vs один шаблон с переменными

**Решение: один HTML-файл с CSS-переменными и условными блоками.**

Обоснование:
- Puppeteer загружает один HTML — проще поддерживать
- CSS-переменные позволяют менять всю палитру одним `:root` блоком
- Композиция (структура страниц) одинаковая для всех пресетов — отличаются только стили
- Условные блоки (через CSS-классы на `<body>`) для различий в композиции (например, Corporate Light без миниатюр галереи)

**Файл:** `presentation-template.html` — переписывается целиком.

**Структура:**
```html
<body class="preset-investment-bold">  <!-- или preset-corporate-light, etc -->
  <!-- Cover page -->
  <section class="page cover">...</section>
  <!-- Property pages -->
  <section class="page property">...</section>
  <!-- Agent card -->
  <section class="page agent">...</section>
</body>
```

**CSS-переменные (per preset):**
```css
.preset-investment-bold {
  --primary: #1B2A4A; --surface: #F5F0E8; --surface-2: #E8E0D0;
  --accent: #1B2A4A; --gold: #B8963E; --text: #2C2C2C;
  --font-display: 'Fraunces', serif; --font-body: 'Manrope', sans-serif;
  --cover-photo-height: 55%; --cover-photo-frame: 0;
  --gallery-thumbs: 5; --gallery-thumb-height: 22mm;
  --feature-style: cards; /* cards | table | minimal */
  --border-style: 1px solid var(--border);
  --border-accent: 2px solid var(--gold);
}
```

### 3.2 Композиция обложки (per preset)

**Investment Bold / Forest Green / Elegant Purple:**
- Фото: полноэкранное, 55% высоты, затемнение
- Текстовый блок: на цветном фоне (primary), ниже фото
- Список объектов: с миниатюрами
- Брендинг: внизу, border-top

**Corporate Light / Nordic Minimal:**
- Фото: в рамке (16mm отступы), 50% высоты
- Текстовый блок: на светлом фоне (surface), ниже фото
- Список объектов: без миниатюр, текст-only
- Брендинг: внизу, hairline border

**Dubai Luxury:**
- Фото: полноэкранное, 100% высоты, сильное затемнение
- Текстовый блок: поверх фото, центрированный
- Список объектов: минимальный, поверх фото
- Брендинг: внизу, поверх фото

### 3.3 Композиция слайда объекта (per preset)

**Вариант A — «Cards» (Investment Bold, Forest Green, Elegant Purple):**
```
┌──────────────────────────────────────┐
│ Объект 1                    Агентство│
│ [Hero photo 75mm]                    │
│ [thumb][thumb][thumb][thumb][thumb]  │
│                                      │
│ 2-комн. квартира в Ваке    $120 000│
│ 📍 ул. Пекина 12           ≈$2,000/м²│
│                                      │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│ │ 45 │ │ 2  │ │ 5/12│ │2020│        │
│ │ м² │ │комн│ │этаж │ │год │        │
│ └────┘ └────┘ └────┘ └────┘        │
│                                      │
│ [Описание на подложке]               │
│ [✓ Паркинг] [✓ Балкон] [✓ Охрана]   │
│ [Карта 45mm]                         │
│                                      │
│ Объект 1 из 3          +995 555 123 │
└──────────────────────────────────────┘
```

**Вариант B — «Table» (Corporate Light):**
```
┌──────────────────────────────────────┐
│ Объект 1                             │
│ [Hero photo в рамке 70mm]            │
│                                      │
│ 2-комн. квартира в Ваке              │
│ ул. Пекина 12                        │
│                         $120 000     │
│                         ≈$2,000/м²   │
│                                      │
│ Площадь           45 м²              │
│ Комнаты           2                  │
│ Этаж              5/12               │
│ Год постройки     2020               │
│                                      │
│ [Описание, много воздуха]            │
│ • Паркинг  • Балкон  • Охрана        │
│ [Карта без рамки]                    │
│                                      │
│ Объект 1 из 3          +995 555 123 │
└──────────────────────────────────────┘
```

**Вариант C — «Luxury» (Dubai Luxury):**
```
┌──────────────────────────────────────┐
│ Объект 1                    Агентство│
│ [Hero photo на всю ширину 80mm]      │
│ [thumb][thumb][thumb][thumb]         │
│                                      │
│ 2-комн. квартира в Ваке              │
│ Вака, Тбилиси                        │
│                         $120 000     │
│                         ≈$2,000/м²   │
│                                      │
│ ┌──────────┐ ┌──────────┐            │
│ │ 45 м²    │ │ 2 комн   │            │
│ │ Площадь  │ │ Комнаты  │            │
│ └──────────┘ └──────────┘            │
│ ┌──────────┐ ┌──────────┐            │
│ │ 5/12     │ │ 2020     │            │
│ │ Этаж     │ │ Год      │            │
│ └──────────┘ └──────────┘            │
│                                      │
│ [Описание на подложке]               │
│ ✓ Паркинг  ✓ Балкон  ✓ Охрана        │
│ [Карта с gold border]                │
│                                      │
│ Объект 1 из 3          +995 555 123 │
└──────────────────────────────────────┘
```

### 3.4 Акцентные цифры/метрики

**Investment Bold:** карточки с иконками (SVG 16px), значение Fraunces 16px bold, подпись 9px uppercase. Карточка: surface2 фон, border 1px, radius 8px.

**Corporate Light:** таблица — параметр (Inter 10px muted) | значение (Inter 12px bold), hairline-разделители.

**Dubai Luxury:** крупные карточки 2×2 — значение Playfair Display 18px, подпись Inter 9px uppercase. Карточка: surface2, border-left 3px gold.

**Nordic Minimal:** текст в две колонки — параметр (Inter 10px muted) | значение (Inter 12px), без рамок.

**Цена:** во всех пресетах — крупный шрифт (≥18px), акцентный цвет (gold или primary), price-per-m² под ним (10px muted).

### 3.5 Карта с местоположением

**Текущая реализация:** placeholder с адресом (текст на сером фоне).

**Новая реализация:** статическая карта Google Maps Static API:
```
https://maps.googleapis.com/maps/api/staticmap?center={address}&zoom=15&size=800x400&markers=color:red|{address}&key={GOOGLE_MAPS_API_KEY}
```

**Fallback:** если API key не настроен — placeholder с адресом (как сейчас).

**Стилизация per preset:**
- Investment Bold / Forest Green: border-radius 8px, border 1px var(--border)
- Corporate Light / Nordic: без рамки, hairline border
- Dubai Luxury / Elegant Purple: border 1px gold

### 3.6 Брендинг на слайдах

**Обложка:** лого (если есть), агентство, имя агента, телефон — внизу страницы.

**Слайд объекта:** агентство в шапке (right-aligned), телефон в футере.

**Последняя страница (Agent Card):** фото агента (80px circle), имя (Fraunces/Playfair 24px), роль (Inter 12px muted), телефон + агентство (два столбца), CTA-кнопка «Записаться на просмотр» (accent фон, белый текст, radius 8px).

---

## 4. Технические заметки для следующей модели

### 4.1 Файлы для изменения

| Файл | Что менять |
|---|---|
| `karty-core/src/types.ts` | Обновить `PresentationTemplate`: убрать `primaryColor`, `secondaryColor`, `accentColor`, `textColor`, `goldColor`, `mutedColor`, `fontHeading`, `fontBody`, `layoutStyle`. Добавить `presetId: string` (id пресета). Оставить: `coverHeadline`, `watermark`, `agentName`, `agentPosition`, `agency`, `agentPhone`, `agentPhoto`, `logoUrl`. Добавить `customColors?: {...}` для кастомизации. |
| `karty-core/src/components/PresentationsTab.tsx` | Заменить `COLOR_PRESETS` на новые `STYLE_PRESETS` (6 штук с полными метаданными). Заменить UI выбора палитры на `PresetCard` компонент. Убрать выбор шрифта и макета (часть пресета). Добавить опцию «Custom» с кастомными цветами. Обновить `startNew` и `editPresentation` для работы с `presetId`. |
| `karty-core/server.ts` | Обновить `generatePresentationHTML`: принимать `presetId` вместо отдельных цветов. Генерировать CSS-переменные из пресета. Добавить `class="preset-{id}"` на `<body>`. Обновить `/api/presentations/preview-html` аналогично. |
| `karty-core/presentation-template.html` | **Переписать целиком.** Один HTML-файл с CSS-переменными и условными классами. Секции: `:root` (дефолтные переменные), `.preset-*` (переопределения per preset), cover, property, agent card. |
| `karty-core/supabase_schema.sql` | Не менять — `template jsonb` уже гибкое. |

### 4.2 Что переиспользовать как есть

- **Логика сбора данных объекта** (`PresentationObject` в types.ts) — поля не зависят от визуала
- **DeepSeek enrichment** в `/api/presentations/generate` (строки 711-788) — заполнение недостающих полей
- **DeepSeek parse-listing** в `/api/presentations/parse-listing` (строки 933-987)
- **Выбор объектов из списка риэлтора** — `toggleListing`, `addCustomObject`, `CustomObjectForm`
- **PdfLivePreview** — iframe с масштабированием, debounced fetch
- **Supabase CRUD** — `savePresentation`, `deletePresentation`, `loadData`
- **Puppeteer PDF-генерация** — `downloadImageAsDataUri`, `page.pdf()`
- **CustomObjectForm** — форма добавления своего объекта

### 4.3 Что НЕ трогать

- Логику публикации на сайтах (`/api/publish/*`)
- Выбор объектов из списка риэлтора (listings)
- Дизайн-систему остального mini-app (компоненты, отступы, цвета вне вкладки Презентации)
- Вкладки «Объекты» и «Бренд» в редакторе — они не зависят от визуала

### 4.4 Google Maps Static API

Для карт в PDF нужен API key. Варианты:
1. **Google Maps Static API** — платный, нужен key в `.env` как `GOOGLE_MAPS_API_KEY`
2. **OpenStreetMap Static** — бесплатный, но менее красивый
3. **Placeholder** — текущее поведение (адрес текстом)

Рекомендация: начать с placeholder, добавить Google Maps как опцию позже.

### 4.5 Шрифты

Все шрифты загружаются через Google Fonts CDN в `<head>` шаблона:
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Puppeteer загружает их автоматически при `page.setContent()`.

### 4.6 Порядок реализации (рекомендуемый)

1. **Обновить types.ts** — новый `PresentationTemplate` с `presetId`
2. **Переписать presentation-template.html** — вёрстка с CSS-переменными
3. **Обновить server.ts** — `generatePresentationHTML` с пресетами
4. **Обновить PresentationsTab.tsx** — новый UI выбора пресета
5. **Тестирование** — превью + PDF для каждого пресета
6. **Миграция** — обратная совместимость для существующих презентаций

---

## 5. Сводная таблица пресетов

| ID | Название | Настроение | Primary | Surface | Gold | Font Display | Font Body |
|---|---|---|---|---|---|---|---|
| `investment-bold` | Investment Bold | Инвестиционный, крупная типографика | `#1B2A4A` | `#F5F0E8` | `#B8963E` | Fraunces | Manrope |
| `corporate-light` | Corporate Light | Чистый минимализм | `#2B2B2B` | `#FAFAF8` | `#8A7A5A` | Inter | Inter |
| `dubai-luxury` | Dubai Luxury | Тёмный премиум | `#0D1B2A` | `#F5F2EC` | `#C9A84C` | Playfair Display | Inter |
| `nordic-minimal` | Nordic Minimal | Скандинавский воздух | `#374151` | `#F9FAFB` | `#78716C` | Inter | Inter |
| `forest-green` | Forest Green | Природный, эко | `#1A3C2A` | `#F5F0E8` | `#B8963E` | Fraunces | Manrope |
| `elegant-purple` | Elegant Purple | Утончённый, женственный | `#2C1654` | `#FAF7F1` | `#C9A84C` | Playfair Display | Inter |

---

## 6. Матрица композиции per пресет

| Аспект | Investment Bold | Corporate Light | Dubai Luxury | Nordic Minimal | Forest Green | Elegant Purple |
|---|---|---|---|---|---|---|
| **Обложка фото** | 55%, полноэкранное | 50%, в рамке | 100%, полноэкранное | 50%, в рамке | 55%, полноэкранное | 55%, полноэкранное |
| **Обложка фон** | Primary | Surface | Primary (затемнение) | Surface | Primary | Primary |
| **Список объектов** | С миниатюрами | Текст-only | Минимальный | Текст-only | С миниатюрами | С миниатюрами |
| **Галерея** | Hero + 5 thumbs | Hero only | Hero + 4 thumbs | Hero + 3 thumbs | Hero + 5 thumbs | Hero + 5 thumbs |
| **Характеристики** | Cards 4-col | Table | Cards 2×2 | Text 2-col | Cards 4-col | Cards 2×2 |
| **Цена** | Fraunces 22px gold | Inter 20px gold | Playfair 24px gold | Inter 20px text | Fraunces 22px gold | Playfair 24px gold |
| **Преимущества** | Pill-теги | Bullet-список | Checkmarks | Bullet-список | Pill-теги | Checkmarks |
| **Карта** | Border 1px | Hairline | Gold border | Hairline | Border 1px | Gold border |
| **Футер** | Border-top | Hairline | Gold border | Hairline | Border-top | Gold border |
