import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import readline from 'readline';

const stealth = stealthPlugin();
chromium.use(stealth);

const TARGETS = [
  { name: 'Korter', url: 'https://korter.ge/ru/' },
  { name: 'MyHome (auth)', url: 'https://auth.tnet.ge/ru/user/login/?Continue=https://www.myhome.ge/' },
  { name: 'MyHome (main page)', url: 'https://www.myhome.ge/ru/' },
  { name: 'Realting', url: 'https://realting.com/ru/login' },
  { name: 'SS.ge', url: 'https://account.ss.ge/ka/account/login' }
];

async function start() {
  console.log('🦾 Подключаем твой Google Chrome...');

  const userDataDir = './chrome-profiler-data';
  const browserContext = await chromium.launchPersistentContext(userDataDir, { 
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--disable-infobars'
    ],
    // Это важно для myhome.ge, убирает флаг автоматизации, из-за которого капча/cloudflare блокирует
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: null
  });

  const page = browserContext.pages().length > 0 ? browserContext.pages()[0] : await browserContext.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('🎯') || text.includes('🔗')) {
      console.log(text);
    }
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`🔗 ТЕКУЩИЙ URL: ${page.url()}`);
    }
  });

  await page.addInitScript(() => {
    window.addEventListener('click', (e) => {
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation(); // чтобы клик не уводил со страницы
        const el = e.target;
        
        let selector = el.tagName.toLowerCase();
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ').filter(c => c.trim()).join('.');
          if (classes) selector += `.${classes}`;
        }

        console.log(`
🎯 ВЫБРАННЫЙ ЭЛЕМЕНТ:
   Текст: ${el.innerText?.trim() || el.value || 'Пусто'}
   Селектор: ${selector}
   Имя (name): ${el.name || 'Нет'}
   ID: ${el.id || 'Нет'}
   Type: ${el.type || 'Нет'}
        `);
      }
    }, true);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const showMenu = () => {
    console.log('\n==============================');
    console.log('🌐 МЕНЮ ВЫБОРА САЙТА');
    console.log('==============================');
    TARGETS.forEach((t, i) => {
      console.log(`${i + 1}. ${t.name}`);
    });
    console.log(`${TARGETS.length + 1}. Ввести свой URL`);
    console.log('0. Выход\n');
    
    rl.question('👉 Выбери цифру и нажми Enter: ', async (answer) => {
      const idx = parseInt(answer.trim());
      
      if (idx === 0) {
        console.log('👋 Закрываем браузер...');
        await browserContext.close();
        process.exit(0);
      } else if (idx > 0 && idx <= TARGETS.length) {
        await navigateTo(TARGETS[idx - 1].url);
      } else if (idx === TARGETS.length + 1) {
        rl.question('🌐 Введи ссылку (например, https://myhome.ge): ', async (customUrl) => {
          if (!customUrl.startsWith('http')) customUrl = 'https://' + customUrl;
          await navigateTo(customUrl);
        });
      } else {
        console.log('❌ Неверный ввод.');
        showMenu();
      }
    });
  };

  const navigateTo = async (url) => {
    console.log(`\n➡️ Переход на: ${url}`);
    console.log('💡 Напиши "m" и нажми Enter в консоли, чтобы вернуться в меню.');
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (err) {
      console.error(`❌ Ошибка перехода:`, err.message);
    }
    
    const waitForM = () => {
      rl.question('', (ans) => {
        if (ans.trim().toLowerCase() === 'm') {
          showMenu();
        } else {
          waitForM();
        }
      });
    };
    waitForM();
  };

  console.log('\n--- 🚀 ИНСПЕКТОР ЗАПУЩЕН ---');
  console.log('1. Вводи данные руками в браузере.');
  console.log('2. Чтобы узнать селектор поля, нажми на него с ЗАЖАТЫМ Alt.');
  showMenu();
}

start();
