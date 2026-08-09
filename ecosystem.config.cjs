// ============================================================
// PM2 config. This file IS committed to Git — do not hardcode
// secrets here. Values below are read from the root .env file
// (gitignored) at PM2 startup time, using a tiny inline parser
// so we don't depend on the `dotenv` package being hoisted to
// root by pnpm.
// ============================================================

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    // Strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const env = loadEnvFile(path.join(__dirname, '.env'));

// Fail loudly at `pm2 start` time if critical secrets are missing, instead
// of silently falling back to the well-known default and running insecure.
const REQUIRED = ['WORKER_SECRET', 'JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'];
const missing = REQUIRED.filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(
    `\n[ecosystem.config.cjs] Missing required vars in .env: ${missing.join(', ')}\n` +
    `Create a .env file in the repo root (see .env.example / Panduan_Deploy_Backend_v2.md) before running pm2 start.\n`
  );
  process.exit(1);
}

module.exports = {
  apps: [
    {
      name: 'qis-api',
      script: path.join(__dirname, 'apps/api/dist/main.js'),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: env.PORT || 3001,
        DATABASE_URL: env.DATABASE_URL,
        JWT_SECRET: env.JWT_SECRET,
        JWT_ACCESS_EXPIRES: env.JWT_ACCESS_EXPIRES || '15m',
        JWT_REFRESH_EXPIRES: env.JWT_REFRESH_EXPIRES || '7d',
        ENCRYPTION_KEY: env.ENCRYPTION_KEY,
        CORS_ORIGIN: env.CORS_ORIGIN,
        AI_SERVICE_URL: env.AI_SERVICE_URL || 'http://localhost:8000',
        TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID,
        OPS_TELEGRAM_BOT_TOKEN: env.OPS_TELEGRAM_BOT_TOKEN,
        OPS_TELEGRAM_CHAT_ID: env.OPS_TELEGRAM_CHAT_ID,
        // Must match qis-worker's WORKER_SECRET exactly — both read the
        // same value from the same .env, so they always stay in sync.
        WORKER_SECRET: env.WORKER_SECRET,
      },
    },
    {
      name: 'qis-worker',
      script: path.join(__dirname, 'apps/worker/dist/index.js'),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        // apps/worker/src/index.ts reads process.env.API_URL, not
        // API_BASE_URL — this var must be named API_URL to actually apply.
        API_URL: env.WORKER_API_URL || 'http://localhost:3001/api/v1',
        // Worker has no dotenv dependency of its own — it only reads
        // process.env directly. PM2 injects this value at process start,
        // sourced from the same root .env as qis-api above.
        WORKER_SECRET: env.WORKER_SECRET,
      },
    },
    {
      name: 'qis-ai-service',
      script: 'main.py',
      cwd: path.join(__dirname, 'apps/ai-service'),
      interpreter: fs.existsSync(path.join(__dirname, 'apps/ai-service/venv/bin/python'))
        ? path.join(__dirname, 'apps/ai-service/venv/bin/python')
        : 'python3',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      // Cloudflare Quick Tunnel — no domain required. Exposes qis-api
      // (localhost:3001) on a public https://xxxx.trycloudflare.com URL.
      // The URL changes every time this process restarts (reboot, crash,
      // etc) — tunnel-with-telegram.sh detects the new URL and pushes it
      // to your Telegram automatically so you can update Vercel's env
      // vars right away. Requires `cloudflared` installed on the server.
      name: 'qis-tunnel',
      script: path.join(__dirname, 'infrastructure/tunnel-with-telegram.sh'),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        TUNNEL_LOCAL_PORT: env.PORT || 3001,
        // Reuses the same trading-notification bot for simplicity. Set
        // OPS_TELEGRAM_BOT_TOKEN/OPS_TELEGRAM_CHAT_ID in .env instead if
        // you'd rather keep tunnel status alerts on a separate ops bot.
        TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID,
      },
    },
  ],
};
