export type Language = 'ru' | 'en';

export const translations = {
  ru: {
    nav: { features: "Преимущества", platforms: "Площадки" },
    hero: {
      badge: "Доступно в Telegram",
      title1: "Публикация",
      title2: "недвижимости.",
      title3: "Автоматизировано.",
      desc: "Создайте объявление один раз — Karty автоматически опубликует его на Korter, Realting, SS.ge и других площадках Грузии прямо с вашего телефона.",
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
        { t: "Единая статистика", d: "Следите за просмотрами со всех подключенных площадок в одном удобном дашборде." }
      ]
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
        }
      ]
    },
    cta: { title: "Готовы обогнать конкурентов?", btn: "Начать работу бесплатно" },
    footerDisclaimer: "Karty — независимый сервис автоматизации. Мы не являемся аффилированным лицом или официальным партнером myhome.ge, korter.ge и других площадок.",
    mockup: {
      newListing: "Новое объявление",
      aiDraft: "AI Черновик",
      placeholder: "Опишите объект...",
      rawText: "квартира 85 метров 3 комнаты 5 этаж батуми у моря с ремонтом",
      aiEnhance: "Улучшить с AI",
      styleShort: "Кратко",
      stylePro: "Строгий",
      styleSelling: "Продающий",
      enhancedText: "Продается 3-к квартира у моря 🌊\n📍 Адрес: Батуми, Новый бульвар\n📍 Площадь: 85 м² (5/12 этаж)\n🔥 Современный ремонт\n\nВ пешей доступности пляж и парки. Готова к заселению!\n\n💰 Цена: 120 000 $",
      detected: "Распознано: ",
      params4: "4 параметра",
      params0: "0 параметров",
      photos: "Фотографии",
      platforms: "Площадки публикации",
      btnPublish: "Опубликовать",
      btnPublishing: "Публикация...",
      successTitle: "Опубликовано!",
      successDesc: "На 2 площадках"
    }
  },
  en: {
    nav: { features: "Features", platforms: "Platforms" },
    hero: {
      badge: "Available on Telegram",
      title1: "Real estate",
      title2: "publishing.",
      title3: "Automated.",
      desc: "Create a listing once — Karty automatically publishes it to Korter, Realting, SS.ge, and other Georgian portals right from your phone.",
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
        { t: "Unified statistics", d: "Track views from all connected platforms in one convenient dashboard." }
      ]
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
        }
      ]
    },
    cta: { title: "Ready to beat the competition?", btn: "Start for free" },
    footerDisclaimer: "Karty is an independent automation service. We are not an affiliated entity or official partner of myhome.ge, korter.ge, and other platforms.",
    mockup: {
      newListing: "New Listing",
      aiDraft: "AI Draft",
      placeholder: "Describe property...",
      rawText: "apartment 85 meters 3 rooms 5th floor batumi by the sea renovated",
      aiEnhance: "Enhance via AI",
      styleShort: "Short",
      stylePro: "Pro",
      styleSelling: "Selling",
      enhancedText: "3-room apartment by the sea 🌊\n📍 Address: Batumi, New Boulevard\n📍 Area: 85 sq.m (5/12 floor)\n🔥 Modern renovation\n\nWalking distance to the beach and parks. Ready to move in!\n\n💰 Price: $120,000",
      detected: "Detected: ",
      params4: "4 parameters",
      params0: "0 parameters",
      photos: "Photos",
      platforms: "Publishing platforms",
      btnPublish: "Publish",
      btnPublishing: "Publishing...",
      successTitle: "Published!",
      successDesc: "On 2 platforms"
    }
  }
};
