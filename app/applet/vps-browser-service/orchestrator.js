const express = require('express');
const { exec } = require('child_process');
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Хранилище активных сессий (в памяти)
const sessions = {};

const PORT = 8080;
const EXTERNAL_IP = '72.56.1.59'; // Обновлено на твой IP
const DOCKER_IMAGE = 'remote-browser:latest';

// Вспомогательная функция для запуска shell команд
const runShell = (cmd) => new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
    });
});

app.post('/start-session', async (req, res) => {
    const { userId, platform, proxy } = req.body;
    
    if (!userId || !platform) {
        return res.status(400).json({ error: 'userId and platform are required' });
    }

    const sessionId = `viz_${crypto.randomBytes(4).toString('hex')}_${userId}`;
    
    // Ищем свободные порты (очень простая логика для примера)
    // В продакшене лучше использовать библиотеку get-port
    const vncPort = 6000 + Math.floor(Math.random() * 1000);
    const cdpPort = 9000 + Math.floor(Math.random() * 1000);
    
    const containerName = `browser_session_${sessionId}`;
    
    let proxyEnv = proxy ? `-e PROXY="${proxy}"` : '';
    
    try {
        console.log(`[${sessionId}] Starting container...`);
        // 1. Поднимаем контейнер
        await runShell(`docker run -d --name ${containerName} \
            -p ${vncPort}:6080 \
            -p ${cdpPort}:9222 \
            ${proxyEnv} \
            ${DOCKER_IMAGE}`);
            
        sessions[sessionId] = {
            containerName,
            vncPort,
            cdpPort,
            userId,
            platform,
            createdAt: Date.now()
        };
        
        // Даем браузеру время запуститься внутри контейнера (3-5 секунд)
        await new Promise(r => setTimeout(r, 4000));
        
        // 2. Подключаемся через Playwright по CDP
        console.log(`[${sessionId}] Connecting Playwright to CDP port ${cdpPort}...`);
        const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        
        sessions[sessionId].browser = browser;
        sessions[sessionId].context = context;
        sessions[sessionId].page = page;

        // 3. Открываем нужный сайт платформы
        let targetUrl = 'https://example.com';
        if (platform === 'myhome') targetUrl = 'https://www.myhome.ge/';
        if (platform === 'ss') targetUrl = 'https://ss.ge/';
        if (platform === 'korter') targetUrl = 'https://korter.ge/';
        
        console.log(`[${sessionId}] Navigating to ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        
        // Возвращаем ссылку на noVNC для клиента
        // Формат ссылки noVNC: http://IP:PORT/vnc.html?autoconnect=true
        res.json({
            sessionId,
            novncUrl: `http://${EXTERNAL_IP}:${vncPort}/vnc.html?autoconnect=true&resize=scale`
        });
        
    } catch (err) {
        console.error(`[${sessionId}] Error:`, err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/check-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    try {
        const { page, context } = session;
        // Здесь можно дописать кастомную проверку (например, url поменялся на Dashboard или пропала кнопка "Войти")
        // Для примера просто сохраним текущий State
        
        const storageState = await context.storageState();
        const localStorageData = await page.evaluate(() => {
            let data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                data[key] = localStorage.getItem(key);
            }
            return data;
        });

        res.json({
            status: 'active',
            storageState,
            localStorage: localStorageData
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/stop-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    try {
        if (session.browser) await session.browser.close();
    } catch(e) {}
    
    try {
        await runShell(`docker rm -f ${session.containerName}`);
    } catch(e) {}
    
    delete sessions[sessionId];
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Remote Browser Orchestrator running on port ${PORT}`);
});
