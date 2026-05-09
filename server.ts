import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { korterAuthManager } from './server/korterAuth.js';
import { startBot } from './server/bot.js';
import { parseListingWithDeepSeek } from './server/ai.js';
import { AuthManager } from './server/authManager.js';
import { getFirestore } from 'firebase-admin/firestore';
import { createProxyMiddleware } from 'http-proxy-middleware';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Proxy Steel requests to fix mixed content (supports HTTP and WebSockets)
  const steelProxy = createProxyMiddleware({
    target: 'http://72.56.1.59:8080',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      '^/steel-proxy': ''
    }
  });

  app.use('/steel-proxy', steelProxy);

  // Init Telegram Bot
  startBot();

  // API Routes
  app.get('/install.sh', (req, res) => {
    const script = `#!/bin/bash
echo "Installing Steel Browser on VPS..."

# Stop pm2 orchestrator if exists
pm2 stop browser-orchestrator || true
pm2 delete browser-orchestrator || true

# Pull latest
docker pull ghcr.io/steel-dev/steel-browser:latest

# Remove old container
docker rm -f steel-browser || true

# Run new container
docker run -d \\
  --name steel-browser \\
  --restart always \\
  -p 8080:3000 \\
  -e API_KEY=karty_secret \\
  -v steel-data:/app/data \\
  --shm-size=1gb \\
  ghcr.io/steel-dev/steel-browser:latest

echo "Steel Browser is running on port 8080"
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

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/novnc')) {
      novncProxy.upgrade(req, socket, head);
    }
  });
}

startServer();
