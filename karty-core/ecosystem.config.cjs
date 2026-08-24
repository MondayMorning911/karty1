const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'karty',
      script: 'npx',
      args: 'tsx server.ts',
      cwd: '/root/karty-lab/karty-core',
      env: {
        NODE_ENV: 'production',
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
        TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
        TELEGRAM_SUPPORT_CHAT_ID: process.env.TELEGRAM_SUPPORT_CHAT_ID || '',
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
        VITE_MAPBOX_TOKEN: process.env.VITE_MAPBOX_TOKEN || '',
        CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
        CLOUDINARY_UPLOAD_PRESET: process.env.CLOUDINARY_UPLOAD_PRESET || '',
        CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
        CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
      },
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
    },
    {
      name: 'karty-userbot',
      script: '/root/karty-lab/karty-core/server/tgUserbot.py',
      interpreter: '/root/karty-lab/venv/bin/python3',
      cwd: '/root/karty-lab',
      autorestart: true,
      watch: false,
    },
    {
      name: 'karty-tg-parser',
      script: '/root/karty-lab/karty-core/karty-lab-code/tg_parser.py',
      args: '--mode monitor',
      interpreter: '/root/karty-lab/venv/bin/python3',
      cwd: '/root/karty-lab',
      autorestart: true,
      watch: false,
    },
  ],
};
