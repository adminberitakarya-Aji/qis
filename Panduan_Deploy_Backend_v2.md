# 🖥️ Panduan Deploy Backend Qis di Ubuntu Server Proxmox (v2 — tanpa domain)

Versi ini pakai **Cloudflare Quick Tunnel** (gratis, tanpa domain) dan sudah
memperbaiki 2 bug yang ditemukan saat audit:
1. `WORKER_SECRET` sekarang di-set langsung di `ecosystem.config.cjs` (worker
   tidak load file `.env` sama sekali — kalau taruh di `.env` tidak akan kebaca).
2. File `.env` untuk API dipindah ke **root repo**, bukan `apps/api/.env`,
   karena PM2 menjalankan API dengan `cwd` di root sehingga NestJS mencari
   `.env` di situ.

---

## Langkah 1 — Persiapan Server Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl python3 python3-pip python3-venv

# Node.js 22 & pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm pm2

# cloudflared (untuk Quick Tunnel)
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

## Langkah 2 — Clone & Install

```bash
git clone https://github.com/adminberitakarya-Aji/qis.git
cd qis
pnpm install
```

## Langkah 3 — File `.env` (di ROOT repo, bukan `apps/api/`)

```bash
nano .env
```

```env
# Database
DATABASE_URL="postgresql://user:password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

# JWT
JWT_SECRET="ganti-dengan-string-rahasia-panjang"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"

# Encryption key untuk API secret exchange — generate sendiri, JANGAN pakai contoh ini:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=""

# CORS — isi domain Vercel Anda
CORS_ORIGIN="https://qis-web.vercel.app"
PORT=3001
AI_SERVICE_URL="http://localhost:8000"

# Bot Telegram trading (notifikasi order/TP ke HP Anda)
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

# Bot Telegram ops (alert kritis: DB error, worker crash, dll — pisah dari bot trading)
OPS_TELEGRAM_BOT_TOKEN=""
OPS_TELEGRAM_CHAT_ID=""
```

> `WORKER_SECRET` **tidak** ditaruh di sini — worker tidak baca file `.env`
> sama sekali. Isi langsung di `ecosystem.config.cjs` (Langkah 5).

## Langkah 4 — Generate Prisma Client & Build

> ⚠️ **Urutan ini wajib**: `.env` harus ada dulu sebelum `prisma generate`
> bisa membaca `DATABASE_URL`, dan `prisma generate` harus selesai sebelum
> `pnpm build` supaya TypeScript punya tipe Prisma yang lengkap.

```bash
# 1. Generate Prisma client (butuh DATABASE_URL di .env)
pnpm --filter @qis/api exec prisma generate

# 2. Migrasi database (sekali saja saat deploy pertama)
pnpm --filter @qis/api exec prisma migrate deploy

# 3. Build semua package
pnpm build

# 4. Setup Python environment untuk AI service
cd apps/ai-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ../..
```

## Langkah 5 — `ecosystem.config.cjs` (tidak perlu edit manual)

File ini **aman di-commit ke Git** — tidak ada secret di-hardcode di
dalamnya. Semua nilai (`WORKER_SECRET`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`,
dst) dibaca otomatis dari `.env` di root repo (Langkah 3) setiap kali `pm2
start` dijalankan. `WORKER_SECRET` untuk `qis-api` dan `qis-worker` dijamin
selalu sama karena keduanya baca dari sumber yang sama.

Kalau `.env` belum ada atau ada variabel wajib yang kosong, `pm2 start` akan
langsung gagal dengan pesan jelas — bukan diam-diam jalan pakai secret
default yang tidak aman.

Proses `qis-tunnel` menjalankan script `infrastructure/tunnel-with-telegram.sh`
yang sudah dibuatkan — otomatis kirim URL publik terbaru ke Telegram Anda
setiap kali tunnel (re)start, karena URL `trycloudflare.com` berubah tiap restart.

```bash
chmod +x infrastructure/tunnel-with-telegram.sh
```

> **Catatan penting:** `ecosystem.config.cjs` memang ter-track di Git dari
> awal repo ini dibuat. Karena sekarang tidak ada secret di dalamnya, aman
> untuk tetap di-commit. Tapi kalau suatu saat Anda hardcode secret asli
> langsung ke file ini lagi (misal buat testing cepat), jangan lupa
> `git rm --cached ecosystem.config.cjs` dan tambahkan ke `.gitignore`.

## Langkah 6 — Jalankan Semua Service

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # ikuti instruksi yang muncul, biar auto-start saat reboot
pm2 status
pm2 logs qis-tunnel   # tunggu sampai muncul URL trycloudflare.com
```

Anda akan lihat 4 proses: `qis-api`, `qis-worker`, `qis-ai-service`, `qis-tunnel`.

Dalam beberapa detik, Telegram Anda bakal dapat pesan seperti:

```
✅ Qis backend is live
URL: https://random-words.trycloudflare.com

Update di Vercel:
NEXT_PUBLIC_API_URL=https://random-words.trycloudflare.com/api/v1
NEXT_PUBLIC_WS_URL=wss://random-words.trycloudflare.com/realtime
```

## Langkah 7 — Isi di Vercel Dashboard

Copy 2 baris dari pesan Telegram tadi ke **Project Settings → Environment
Variables** di Vercel, lalu redeploy frontend.

---

## ⚠️ Yang perlu diingat soal Quick Tunnel

- **URL berubah tiap restart** (reboot server, cloudflared crash, dll). Karena
  itu setup Telegram notifier di atas — begitu dapat pesan URL baru, langsung
  update env var di Vercel & redeploy.
- Cocok untuk mulai jalan & testing sekarang. Kalau sudah stabil dan mau
  production serius (trading beneran, bukan cuma paper), pertimbangkan beli
  domain murah (`.my.id` ~Rp15rb/tahun, atau `.com` di Cloudflare Registrar
  ~$8–12/tahun) lalu pindah ke *named tunnel* yang URL-nya permanen — supaya
  tidak perlu update Vercel manual tiap ada restart.
- Pastikan port `3001` dan `8000` **tidak** dibuka langsung ke internet
  (`sudo ufw deny 3001`, `sudo ufw deny 8000`) — akses publik cuma boleh
  lewat tunnel.

## Cek cepat semua jalan

```bash
pm2 status                     # semua "online"?
curl http://localhost:3001/api/v1/health   # API hidup?
pm2 logs qis-worker --lines 20  # worker konek ke API?
```
