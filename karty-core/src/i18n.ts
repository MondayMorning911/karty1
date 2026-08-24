export type Language = 'ru' | 'en';

export const translations = {
  ru: {
    nav: { features: "Преимущества", platforms: "Площадки" },
    hero: {
      badge: "Доступно в Telegram",
      title1: "Публикация",
      title2: "недвижимости.",
      title3: "Автоматизировано.",
      desc: "Создайте объявление один раз — Karty автоматически опубликует его на Korter, SS.ge, MyHome и других площадках Грузии прямо с вашего телефона.",
      btnTry: "Попробовать бесплатно",
      btnHow: "Как это работает",
      check1: "Экономит до 15ч/нед",
      check2: "Умный AI парсер",
    },
    platformsSection: { title: "Синхронизация с лучшими порталами Грузии" },
    solution: {
      title1: "Рутина сжирает",
      title2: "ваше время",
      desc: "Агенты тратят часы на публикацию одного и того же объекта на разных сайтах, вместо того чтобы показывать квартиры и закрывать сделки.",
      pains: [
        "Бесконечное копирование описаний",
        "Ручной выбор параметров (этаж, площадь, ремонт) на каждом сайте",
        "Сложности с написанием продающего текста с телефона",
        "Откладывание публикации из-за неудобных интерфейсов сайтов"
      ],
      aiTitle: "Умное распознавание",
      aiSub: "Наш AI делает это за вас",
      aiQuote: '"Просторная 3-комнатная квартира 85 кв.м на 5 этаже в Батуми у моря..."',
      aiTypes: ["Тип", "Площадь", "Этаж", "Локация"],
      aiVals: ["3-комн.", "85 м²", "5/12", "Батуми"]
    },
    features: {
      title: "Один инструмент для всего",
      desc: "Хватит копировать описания и вручную загружать фотографии. Позвольте Karty сделать рутину за вас.",
      cards: [
        { t: "Telegram Mini App", d: "Управляйте всеми объявлениями прямо в мессенджере. Идеально для агентов в полях." },
        { t: "AI Улучшение текста", d: "Напишите коротко суть, а нейросеть превратит это в продающее описание." },
        { t: "Единая публикация", d: "Karty проверяет поля, фото и подключение площадок до начала публикации — вы сразу видите, что нужно исправить." },
        { t: "Презентации", d: "Создавайте красивую web-карточку объекта с галереей, картой и ссылкой для клиента." },
        { t: "Планер", d: "Записывайте задачи обычным языком — AI определит действие и время напоминания в Telegram." }
      ]
    },
    productSuite: {
      eyebrow: "Весь рабочий день риэлтора",
      title: "От первого описания до сделки — в одном Mini App",
      desc: "Karty собирает рутину риэлтора в понятный рабочий процесс, который всегда под рукой в Telegram.",
      modules: [
        { t: "Публикация", d: "AI извлекает поля, проверяет обязательные данные и отправляет объект на нужные площадки." },
        { t: "Объекты", d: "История публикаций, статусы по каждой площадке, ошибки и повторная публикация." },
        { t: "Презентации", d: "Одна ссылка для клиента: фотографии, характеристики, локация и контакты риэлтора." },
        { t: "Планер", d: "Заметки и напоминания, которые AI превращает в конкретные задачи." }
      ]
    },
    workflow: {
      title: "Как выглядит рабочий день с Karty",
      steps: ["Опишите объект", "Проверьте данные", "Опубликуйте в один клик", "Отправьте презентацию", "Не забудьте о клиенте"]
    },
    productDemo: {
      eyebrow: "Посмотрите внутри",
      title: "Не обещания — настоящий рабочий процесс",
      desc: "Переключайте экраны и посмотрите, как риэлтор проходит путь от описания объекта до следующего звонка клиенту.",
      tabs: ["Публикация", "Объекты", "Презентации", "Планер"],
      values: ["AI извлекает цену, площадь, адрес, этаж и другие поля из обычного текста.", "Все объявления и ошибки собраны в одном месте — не нужно искать их по сайтам.", "Клиент получает аккуратную web-карточку объекта вместо длинного сообщения.", "Karty понимает дату и действие из обычной фразы и отправляет напоминание в Telegram."],
      hints: [["AI выделяет параметры", "Фото добавляются в объект", "Площадки выбираются перед публикацией"], ["Статус каждого объекта", "Ошибки не теряются", "Повторная публикация в пару кликов"], ["Галерея и характеристики", "Карта и локация", "Ссылка для клиента на 3 дня"], ["Задача из обычного текста", "Дата и время из фразы", "Уведомление в Telegram"]],
      publishTitle: "Новое объявление", publishText: "Светлая 3-комнатная квартира у моря, 85 м², Батуми, цена 120 000 долларов", publishPrice: "Цена · $120 000", publishStatus: "AI распознал 5 параметров",
      objectsTitle: "Мои объекты", objectsStatus: "2 опубликовано · 1 требует внимания",
      presentationTitle: "Презентация готова", presentationStatus: "Ссылка для клиента действует 3 дня",
      plannerTitle: "Планер", plannerStatus: "Завтра · 14:30", plannerTask: "Перезвонить Александру по пентхаусу"
    },
    beforeAfter: {
      title: "Как изменится ваша работа",
      beforeTitle: "Раньше",
      afterTitle: "С Karty",
      items: [
        {
          before: "«Выложу вечером», когда уже нет сил",
          after: "Публикация моментально, пока объект «горит»"
        },
        {
          before: "10 минут на каждый сайт (итого 40 мин/объект)",
          after: "1 минута на всё — и объект на всех нужных площадках"
        },
        {
          before: "Мучительное придумывание красивого описания с телефона",
          after: "Пишете как есть — AI в один клик превращает набросок в продающий текст"
        },
        {
          before: "Обязательно нужен ноутбук, чтобы заполнить все формы на сайтах",
          after: "Вся публикация происходит прямо в Telegram с вашего смартфона за чашкой кофе"
        },
        {
          before: "Об ошибке на сайте узнаю случайно или от клиента",
          after: "Karty показывает понятную причину и подсказывает, что исправить"
        },
        {
          before: "Задачи и звонки остаются в заметках и голове",
          after: "Planner превращает обычную фразу в задачу и вовремя напоминает в Telegram"
        },
        {
          before: "Отправляю клиенту набор разрозненных фотографий",
          after: "Создаю одну профессиональную презентацию со ссылкой для клиента"
        }
      ]
    },
    cta: { title: "Готовы обогнать конкурентов?", btn: "Начать работу бесплатно" },
    footerDisclaimer: "Karty — независимый сервис автоматизации. Мы не являемся аффилированным лицом или официальным партнером myhome.ge, korter.ge и других площадок.",
    mockup: {
      newListing: "Новое объявление",
      aiDraft: "AI Черновик",
      placeholder: "Опишите объект...",
       rawText: "Светлая квартира у моря в Батуми: 85 м², 3 комнаты, 5 этаж, современный ремонт. Цена 120 000 долларов. Подходит для жизни и инвестиций.",
      aiEnhance: "Улучшить с AI",
      styleShort: "Кратко",
      stylePro: "Строгий",
      styleSelling: "Продающий",
       enhancedText: "Продается 3-комнатная квартира у моря 🌊\n💰 Цена: 120 000 $\n📍 Батуми, Новый бульвар · 85 м² · 5/12 этаж\n🔥 Современный ремонт\n\nПляж и парки в пешей доступности. Квартира готова к заселению и подходит для жизни или инвестиций.",
      detected: "Распознано: ",
      params4: "4 параметра",
      params0: "0 параметров",
      photos: "Фотографии",
      platforms: "Площадки публикации",
      btnPublish: "Опубликовать",
      btnPublishing: "Публикация...",
       successTitle: "Опубликовано!",
       successDesc: "На 2 площадках",
       planner: "Планер",
       presentation: "Презентация",
       plannerHint: "Задача и напоминание",
       presentationHint: "Ссылка для клиента"
       ,mockPrice: "$120 000", mockAddress: "Батуми · Новый бульвар", mockCondition: "Современный ремонт", mockPhotos: "3 фото загружено", mockReady: "Готово к публикации"
    }
  },
  en: {
    nav: { features: "Features", platforms: "Platforms" },
    hero: {
      badge: "Available on Telegram",
      title1: "Real estate",
      title2: "publishing.",
      title3: "Automated.",
      desc: "Create a listing once — Karty automatically publishes it to Korter, SS.ge, MyHome, and other Georgian portals right from your phone.",
      btnTry: "Try for free",
      btnHow: "How it works",
      check1: "Saves up to 15h/week",
      check2: "Smart AI parser",
    },
    platformsSection: { title: "Synchronization with top Georgian portals" },
    solution: {
      title1: "Routine eats up",
      title2: "your time",
      desc: "Agents spend hours publishing the same property on different sites instead of showing apartments and closing deals.",
      pains: [
        "Endless copying of descriptions",
        "Manual selection of parameters (floor, area) on each site",
        "Struggling to write selling copy from a smartphone",
        "Postponing publishing due to clunky mobile interfaces"
      ],
      aiTitle: "Smart recognition",
      aiSub: "Our AI does it for you",
      aiQuote: '"Spacious 3-room apartment 85 sq.m on the 5th floor in Batumi by the sea..."',
      aiTypes: ["Type", "Area", "Floor", "Location"],
      aiVals: ["3-room", "85 m²", "5/12", "Batumi"]
    },
      features: {
      title: "One tool for everything",
      desc: "Stop copying descriptions and manually uploading photos. Let Karty do the routine for you.",
      cards: [
        { t: "Telegram Mini App", d: "Manage all listings right in the messenger. Perfect for agents in the field." },
        { t: "AI Text Enhancement", d: "Just write the raw details, and our AI turns them into a professional listing description." },
        { t: "Unified publishing", d: "Karty checks your listing and connected sites first — you immediately see what needs fixing." },
        { t: "Presentations", d: "Create a beautiful web property card with gallery, map, and a client-ready link." },
        { t: "Planner", d: "Write tasks in natural language — AI finds the action and reminder time." }
      ]
    },
    productSuite: {
      eyebrow: "The realtor's entire workday",
      title: "From the first draft to the deal — in one Mini App",
      desc: "Karty brings the realtor's routine into a clear workflow available right inside Telegram.",
      modules: [
        { t: "Publishing", d: "AI extracts fields, validates required data, and sends the listing to selected portals." },
        { t: "Objects", d: "Publication history, per-platform statuses, errors, and republishing." },
        { t: "Presentations", d: "One client link with photos, specs, location, and realtor contacts." },
        { t: "Planner", d: "Notes and reminders that AI turns into concrete tasks." }
      ]
    },
    workflow: {
      title: "What a workday with Karty looks like",
      steps: ["Describe the property", "Review the data", "Publish in one click", "Send a presentation", "Follow up with the client"]
    },
    productDemo: {
      eyebrow: "Look inside",
      title: "Not promises — a real workflow",
      desc: "Switch between screens and see the realtor's path from the first property draft to the next client call.",
      tabs: ["Publish", "Objects", "Presentations", "Planner"],
      values: ["AI extracts price, area, address, floor, and other fields from ordinary text.", "All listings and errors live in one place instead of being scattered across portals.", "Clients get a polished web property card instead of a long unstructured message.", "Planner turns a sentence into a dated task and sends a Telegram reminder."],
      hints: [["AI extracts the fields", "Photos become part of the listing", "Choose portals before publishing"], ["Status for every object", "Errors stay visible", "Republish in a few clicks"], ["Gallery and property specs", "Map and location", "Client link active for 3 days"], ["Task from natural language", "Date and time extracted", "Telegram reminder"]],
      publishTitle: "New listing", publishText: "Bright 3-bedroom apartment by the sea, 85 m², Batumi, price $120,000", publishPrice: "Price · $120,000", publishStatus: "AI recognized 5 parameters",
      objectsTitle: "My objects", objectsStatus: "2 published · 1 needs attention",
      presentationTitle: "Presentation ready", presentationStatus: "Client link active for 3 days",
      plannerTitle: "Planner", plannerStatus: "Tomorrow · 14:30", plannerTask: "Call Alexander about the penthouse"
    },
    beforeAfter: {
      title: "How your work will change",
      beforeTitle: "Before",
      afterTitle: "With Karty",
      items: [
        {
          before: "«I'll post it tonight», when you have no energy left",
          after: "Publish instantly, while the property is «hot»"
        },
        {
          before: "10 minutes per platform (40 min/property)",
          after: "1 minute for everything — your property is on all platforms"
        },
        {
          before: "Agonizing over writing a beautiful description from your phone",
          after: "Just type a basic draft — AI instantly crafts a selling or professional description"
        },
        {
          before: "Constantly needing a laptop to fill out forms on different sites",
          after: "Publish everything directly in Telegram from your smartphone while having coffee"
        },
        {
          before: "I discover site errors by accident or from the client",
          after: "Karty explains the problem and tells me what to fix"
        },
        {
          before: "Calls and tasks stay in notes or in my head",
          after: "Planner turns a sentence into a task and reminds me in Telegram"
        },
        {
          before: "I send clients a scattered set of photos",
          after: "I send one professional property presentation link"
        }
      ]
    },
    cta: { title: "Ready to beat the competition?", btn: "Start for free" },
    footerDisclaimer: "Karty is an independent automation service. We are not an affiliated entity or official partner of myhome.ge, korter.ge, and other platforms.",
    mockup: {
      newListing: "New Listing",
      aiDraft: "AI Draft",
      placeholder: "Describe property...",
       rawText: "Bright apartment by the sea in Batumi: 85 m², 3 rooms, 5th floor, modern renovation. Price $120,000. Great for living or investment.",
      aiEnhance: "Enhance via AI",
      styleShort: "Short",
      stylePro: "Pro",
      styleSelling: "Selling",
       enhancedText: "3-bedroom apartment by the sea 🌊\n💰 Price: $120,000\n📍 Batumi, New Boulevard · 85 m² · 5/12 floor\n🔥 Modern renovation\n\nWalking distance to the beach and parks. Ready to move in and suitable for living or investment.",
      detected: "Detected: ",
      params4: "4 parameters",
      params0: "0 parameters",
      photos: "Photos",
      platforms: "Publishing platforms",
      btnPublish: "Publish",
      btnPublishing: "Publishing...",
       successTitle: "Published!",
       successDesc: "On 2 platforms",
       planner: "Planner",
       presentation: "Presentation",
       plannerHint: "Task and reminder",
       presentationHint: "Client-ready link"
       ,mockPrice: "$120,000", mockAddress: "Batumi · New Boulevard", mockCondition: "Modern renovation", mockPhotos: "3 photos uploaded", mockReady: "Ready to publish"
    }
  }
};
