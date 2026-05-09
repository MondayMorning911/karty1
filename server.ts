import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { korterAuthManager } from './server/korterAuth.js';
import { startBot } from './server/bot.js';
import { parseListingWithDeepSeek } from './server/ai.js';
import { AuthManager } from './server/authManager.js';
import { getFirestore } from 'firebase-admin/firestore';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Init Telegram Bot
  startBot();

  // API Routes
  app.get('/install.sh', (req, res) => {
    const startSh = `#!/bin/bash
Xvfb :99 -screen 0 1280x800x24 -listen tcp &
sleep 1
fluxbox &
sleep 1

PROXY_ARGS=""
if [ ! -z "$PROXY" ]; then
  PROXY_ARGS="--proxy-server=$PROXY"
fi

CHROME_BIN=$(find /ms-playwright -type f \\( -name chrome -o -name chromium -o -name browser \\) | grep -v 'ms-playwright/webkit' | grep -v 'ms-playwright/firefox' | head -n 1)

if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN="chromium"
fi

echo "Using Chrome Binary: $CHROME_BIN"

$CHROME_BIN --no-sandbox \\
         --disable-dev-shm-usage \\
         --disable-gpu \\
         --user-data-dir=/tmp/chromium-data \\
         --remote-debugging-port=9222 \\
         --remote-debugging-address=0.0.0.0 \\
         --remote-allow-origins=* \\
         --start-maximized \\
         --window-position=0,0 \\
         --window-size=1280,800 \\
         $PROXY_ARGS > /tmp/chrome.log 2>&1 &

socat TCP-LISTEN:9223,fork,bind=0.0.0.0 TCP:127.0.0.1:9222 &

sleep 2
echo "Chrome log output:"
cat /tmp/chrome.log

x11vnc -display :99 -forever -nopw -bg -quiet -listen localhost -xkb &
websockify --web=/usr/share/novnc/ 6080 localhost:5900
`;

    const orchJs = `const express = require('express');
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
    
    const sessionId = \`viz_\${crypto.randomBytes(4).toString('hex')}_\${userId}\`;
    const vncPort = Math.floor(Math.random() * (6999 - 6100) + 6100);
    const cdpPort = Math.floor(Math.random() * (9999 - 9100) + 9100);
    const containerName = \`browser_viz_\${sessionId}\`;
    
    let proxyEnv = '';
    
    try {
        console.log(\`[\${sessionId}] Starting container...\`);
        await runShell(\`docker run -d --name \${containerName} -p \${vncPort}:6080 -p \${cdpPort}:9223 --shm-size=1gb \${proxyEnv} \${DOCKER_IMAGE}\`);
            
        sessions[sessionId] = { containerName, vncPort, cdpPort, platform, userId, createdAt: Date.now() };
        
        let cdpUp = false;
        console.log(\`[\${sessionId}] Waiting for CDP to be available on port \${cdpPort}...\`);
        for(let i=0; i<15; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                const test = await fetch(\`http://127.0.0.1:\${cdpPort}/json/version\`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (test.ok) {
                    cdpUp = true;
                    break;
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!cdpUp) {
            const chromeLog = await runShell(\`docker exec \${containerName} cat /tmp/chrome.log\`).catch(() => 'no chrome log');
            const dockerLogs = await runShell(\`docker logs \${containerName} --tail 20\`).catch(() => 'no docker logs');
            throw new Error(\`Chromium CDP did not start in time inside container on port \${cdpPort}.\\nChrome Log: \${chromeLog}\\nDocker logs: \${dockerLogs}\`);
        }
        
        console.log(\`[\${sessionId}] Connecting Playwright to CDP port \${cdpPort}...\`);
        const browser = await chromium.connectOverCDP(\`http://127.0.0.1:\${cdpPort}\`);
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
        
        console.log(\`[\${sessionId}] Navigating to \${targetUrl}\`);
        page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(console.error);
        
        res.json({
            sessionId,
            novncUrl: \`http://\${EXTERNAL_IP}:\${vncPort}/vnc.html?autoconnect=true&resize=scale\`
        });
        
    } catch (err) {
        console.error(\`[\${sessionId}] Error:\`, err.message);
        try { await runShell(\`docker rm -f \${containerName}\`); } catch(e){}
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
    console.log(\`[\${sessionId}] Stopping...\`);
    try {
        await runShell(\`docker rm -f \${containerName}\`);
    } catch (e) {
        console.error('Docker rm error:', e);
    }
    delete sessions[sessionId];
    res.json({ status: 'stopped' });
});

app.listen(PORT, '0.0.0.0', () => console.log(\`Orchestrator running on port \${PORT}\`));
`;

    const script = `#!/bin/bash
echo "Installing and rebuilding Orchestrator..."
mkdir -p /root/vps-browser-service/image

cat << 'EOFBASH' > /root/vps-browser-service/image/start.sh
${startSh}
EOFBASH

cat << 'EOFJS' > /root/vps-browser-service/orchestrator.js
${orchJs}
EOFJS

chmod +x /root/vps-browser-service/image/start.sh

cat << 'EOF' > /root/vps-browser-service/image/Dockerfile
FROM mcr.microsoft.com/playwright:v1.44.0-jammy
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
RUN apt-get update && apt-get install -y \\
    xvfb x11vnc fluxbox novnc websockify socat \\
    && rm -rf /var/lib/apt/lists/*
ENV DISPLAY=:99
COPY start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
EOF

cd /root/vps-browser-service/image
echo "Building docker image..."
docker build -t remote-browser:latest .

echo "Restarting Orchestrator..."
cd /root/vps-browser-service
pm2 restart browser-orchestrator
pm2 logs browser-orchestrator --lines 15
`;
    res.type('text/plain').send(script);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Start Auth Phase 1
  app.post('/api/auth/korter/start', async (req, res) => {
    const { userId, login } = req.body;
    if (!userId || !login) {
      return res.status(400).json({ error: 'userId and login are required' });
    }
    
    console.log(`Starting login for Korter: ${userId}`);
    const result = await korterAuthManager.startLogin(userId, login);
    res.json(result);
  });

  // Verify Code Phase 2
  app.post('/api/auth/korter/verify', async (req, res) => {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ error: 'userId and code are required' });
    }
    
    console.log(`Verifying code for Korter: ${userId}`);
    const result = await korterAuthManager.verifyCode(userId, code);
    res.json(result);
  });

  app.post('/api/auth/test-error', async (req, res) => {
    res.status(500).json({ error: 'This is a test error from backend JSON.' });
  });

  app.get('/api/auth/debug-sessions', async (req, res) => {
    try {
      const response = await fetch('http://72.56.1.59:3001/sessions?token=KartyMustPassword');
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Capture Session API
  app.post('/api/auth/capture', async (req, res) => {
    console.log('[API] /api/auth/capture hit:', req.body);
    const { userId, siteKey } = req.body;
    if (!userId || !siteKey) {
      console.log('[API] /api/auth/capture failed: Missing userId or siteKey');
      return res.status(400).json({ error: 'userId and siteKey are required' });
    }

    try {
      console.log(`[API] AuthManager StartSession...`);
      const { interactiveUrl, sessionId } = await AuthManager.startSession(userId, siteKey as any);
      console.log(`[API] AuthManager success. URL: ${interactiveUrl}, SessionID: ${sessionId}`);
      
      res.json({ success: true, interactiveUrl, sessionId });
    } catch (error: any) {
      console.error('[API] /api/auth/capture Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Save Session API manually
  app.post('/api/auth/save-session', async (req, res) => {
    const { userId, siteKey, sessionId } = req.body;
    if (!userId || !siteKey || !sessionId) {
      return res.status(400).json({ error: 'userId, siteKey, sessionId are required' });
    }

    try {
      await AuthManager.saveSession(userId, siteKey, sessionId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Remove Session API
  app.post('/api/auth/remove', async (req, res) => {
    const { userId, siteKey } = req.body;
    if (!userId || !siteKey) {
      return res.status(400).json({ error: 'userId and siteKey are required' });
    }

    try {
      await getFirestore().doc(`sessions/${userId}/platforms/${siteKey}`).delete();
      res.json({ success: true, message: 'Session removed' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Parse Listing with deepseek
  app.post('/api/parse-listing', async (req, res) => {
    const { text, styleId } = req.body;
    if (!text) return res.json(null);
    const result = await parseListingWithDeepSeek(text, styleId);
    res.json(result);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
