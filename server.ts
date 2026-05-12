import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { korterAuthManager } from './server/korterAuth.js';
import { startBot } from './server/bot.js';
import { parseListingWithDeepSeek } from './server/ai.js';
import { AuthManager } from './server/authManager.js';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Ensure Firebase Admin is initialized
if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.warn('⚠️ service-account.json not found! Falling back to application default credentials.');
      admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'karty-app' });
    }
  } catch (e: any) {
    console.error("Firebase admin initialization warning:", e.message);
  }
}
let firestoreDatabaseId: string | undefined = undefined;
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    firestoreDatabaseId = firebaseConfig.firestoreDatabaseId;
  }
} catch (e) {}

const db = firestoreDatabaseId ? getFirestore(admin.app(), firestoreDatabaseId) : getFirestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

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

  app.post('/api/auth/generic/login', async (req, res) => {
    const { userId, siteKey, login, password } = req.body;
    if (!userId || !siteKey || !login || !password) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
      console.log(`[API] Generic login started for: ${siteKey}`);
      await AuthManager.loginWithPassword(userId, siteKey, login, password);
      res.json({ status: 'success' });
    } catch (error: any) {
      console.error('[API] /api/auth/generic/login Error:', error.message);
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
      await db.doc(`sessions/${userId}/platforms/${siteKey}`).delete();
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
