import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { korterAuthManager } from './server/korterAuth';
import { startBot } from './server/bot';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Пропуск экрана предупреждения ngrok
  app.use((req, res, next) => {
    res.header('ngrok-skip-browser-warning', 'true');
    next();
  });

  // Init Telegram Bot
  startBot();

  // API Routes
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
