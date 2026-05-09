#!/bin/bash
echo "Installing and rebuilding Orchestrator..."
mkdir -p /root/vps-browser-service/image

cat << 'EOFBASH' > /root/vps-browser-service/image/start.sh
#!/bin/bash
Xvfb :99 -screen 0 1280x800x24 -listen tcp &
sleep 1
fluxbox &
sleep 1

PROXY_ARGS=""
if [ ! -z "$PROXY" ]; then
  PROXY_ARGS="--proxy-server=$PROXY"
fi

CHROME_BIN=$(find /ms-playwright -type f \( -name chrome -o -name chromium -o -name browser \) | grep -v 'ms-playwright/webkit' | grep -v 'ms-playwright/firefox' | head -n 1)

if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN="chromium"
fi

echo "Using Chrome Binary: $CHROME_BIN"

$CHROME_BIN --no-sandbox \
         --disable-dev-shm-usage \
         --disable-gpu \
         --user-data-dir=/tmp/chromium-data \
         --remote-debugging-port=9222 \
         --remote-debugging-address=0.0.0.0 \
         --remote-allow-origins=* \
         --start-maximized \
         --window-position=0,0 \
         --window-size=1280,800 \
         $PROXY_ARGS > /tmp/chrome.log 2>&1 &

sleep 2
echo "Chrome log output:"
cat /tmp/chrome.log

x11vnc -display :99 -forever -nopw -bg -quiet -listen localhost -xkb &
websockify --web=/usr/share/novnc/ 6080 localhost:5900

EOFBASH

cat << 'EOFJS' > /root/vps-browser-service/orchestrator.js
const express = require('express');
const { exec } = require('child_process');
const { chromium } = require('playwright-core');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const sessions = {};
const PORT = 8080;
const EXTERNAL_IP = '72.56.1.59'; 
const DOCKER_IMAGE = 'remote-browser:latest';

const runShell = (cmd) => new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error('Shell error:', error.message);
            reject(error);
        } else {
            resolve(stdout);
        }
    });
});

app.post('/start-session', async (req, res) => {
    const { userId, platform } = req.body;
    if (!userId || !platform) return res.status(400).json({ error: 'Missing userId or platform' });
    
    const sessionId = `viz_${crypto.randomBytes(4).toString('hex')}_${userId}`;
    const vncPort = Math.floor(Math.random() * (6999 - 6100) + 6100);
    const cdpPort = Math.floor(Math.random() * (9999 - 9100) + 9100);
    const containerName = `browser_viz_${sessionId}`;
    
    let proxyEnv = '';
    
    try {
        console.log(`[${sessionId}] Starting container...`);
        await runShell(`docker run -d --name ${containerName} -p ${vncPort}:6080 -p ${cdpPort}:9222 --shm-size=1gb ${proxyEnv} ${DOCKER_IMAGE}`);
            
        sessions[sessionId] = { containerName, vncPort, cdpPort, platform, userId, createdAt: Date.now() };
        
        let cdpUp = false;
        console.log(`[${sessionId}] Waiting for CDP to be available on port ${cdpPort}...`);
        for(let i=0; i<15; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                const test = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (test.ok) {
                    cdpUp = true;
                    break;
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!cdpUp) {
            const chromeLog = await runShell(`docker exec ${containerName} cat /tmp/chrome.log`).catch(() => 'no chrome log');
            const dockerLogs = await runShell(`docker logs ${containerName} --tail 20`).catch(() => 'no docker logs');
            throw new Error(`Chromium CDP did not start in time inside container on port ${cdpPort}.\nChrome Log: ${chromeLog}\nDocker logs: ${dockerLogs}`);
        }
        
        console.log(`[${sessionId}] Connecting Playwright to CDP port ${cdpPort}...`);
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        
        sessions[sessionId].browser = browser;
        sessions[sessionId].context = context;
        sessions[sessionId].page = page;
        
        let targetUrl = 'https://example.com';
        if (platform === 'myhome') targetUrl = 'https://www.myhome.ge/';
        if (platform === 'ssge') targetUrl = 'https://ss.ge/ru';
        if (platform === 'korter') targetUrl = 'https://korter.ge/';
        if (platform === 'realting') targetUrl = 'https://realting.com/ru/';
        
        console.log(`[${sessionId}] Navigating to ${targetUrl}`);
        page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(console.error);
        
        res.json({
            sessionId,
            novncUrl: `http://${EXTERNAL_IP}:${vncPort}/vnc.html?autoconnect=true&resize=scale`
        });
        
    } catch (err) {
        console.error(`[${sessionId}] Error:`, err.message);
        try { await runShell(`docker rm -f ${containerName}`); } catch(e){}
        delete sessions[sessionId];
        return res.status(500).json({ error: err.message });
    }
});

app.post('/check-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    try {
        const { page, context } = session;
        const storageState = await context.storageState();
        const localStorageData = await page.evaluate(() => {
            let data = {};
            for(let i=0; i<localStorage.length; i++) {
                const key = localStorage.key(i);
                data[key] = localStorage.getItem(key);
            }
            return data;
        }).catch(() => ({}));

        res.json({ status: 'active', state: { storageState, localStorage: localStorageData } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/stop-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const { containerName } = session;
    console.log(`[${sessionId}] Stopping...`);
    try {
        await runShell(`docker rm -f ${containerName}`);
    } catch (e) {
        console.error('Docker rm error:', e);
    }
    delete sessions[sessionId];
    res.json({ status: 'stopped' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Orchestrator running on port ${PORT}`));

EOFJS

chmod +x /root/vps-browser-service/image/start.sh

cd /root/vps-browser-service/image
echo "Building docker image..."
docker build -t remote-browser:latest .

echo "Restarting Orchestrator..."
cd /root/vps-browser-service
pm2 restart browser-orchestrator
pm2 logs browser-orchestrator --lines 15
