# Apna Dhanda

**Multi-shop SaaS for local kirana stores and salons.** Every shop gets its own online storefront, a shopkeeper admin panel installable as a phone app, and the platform owner runs everything from one owner console ("God Mode").

Live: https://apnadhanda.krishpatil.workers.dev · Current version: **10.16.2**

> 📖 This repository is **public** (anyone can read it), but the code is proprietary: all rights reserved, see [LICENSE](LICENSE). Never commit secrets, backups or shop/customer data.

---

## Features

### Customers (`/`, `/s/<shop-link>`)
- Browse nearby shops, search products in Hindi and English, categories with product icons
- Cart, offers, place orders, track an order live (`/track`), My Orders, reorder, favourites, ratings
- Salon shops: services and appointment booking
- Installable PWA, Web Push notifications, works well on slow 3G

### Shopkeepers (`/admin`)
- Sign up with mobile number, recovery key, approval flow (pending → approved)
- Products, variants, stock in/out, low-stock alerts, PDF/Excel stock-list import
- Today's orders, order status, free bill to the shopkeeper's own WhatsApp
- Offers, notification center (daily due reminders by cron), reports and history
- Shop info, location, Open/Closed switch, QR code + printable A4 QR poster
- Per-shop home-screen app icon

### Platform owner — God Mode (`/dev`)
- All shops at a glance, approve/reject/pause, subscriptions control
- View any shop as the owner, broadcast notifications, banners, maintenance mode, feature flags
- Health, error log, live dev alerts, Cloudflare usage, landing-page editor

## Tech stack
- **Runtime:** Cloudflare Workers (single Worker `apnadhanda`, `site/_worker.mjs`) serving static assets from `site/`
- **Database:** Cloudflare D1 (SQLite), binding `DB`, database `kirana-db`
- **Frontend:** vanilla JavaScript, HTML, CSS — no framework; shop panel bundled with esbuild (`tools/build-admin.mjs`)
- **Push:** Web Push (VAPID keys generated at runtime and stored in D1 — none in code)
- **Cron:** Cloudflare Cron Trigger, daily 09:00 IST
- **Tests:** Node's built-in test runner (`node --test`) with a D1 shim over better-sqlite3

## Getting started (local)

Requirements: Node.js 20+, npm. A Cloudflare account only if you deploy.

```bash
git clone https://github.com/Krishpatil16/apna-dhanda.git
cd apna-dhanda
npm install
cp .env.example .env      # local values only, never commit .env
npm test                  # run the full test suite
npm run build             # build the shop panel bundle (site/admin.js)
npm run dev               # local server on http://localhost:8787 (SQLite file, no Cloudflare needed)
```

Open http://localhost:8787 (customer), http://localhost:8787/admin (shopkeeper), http://localhost:8787/dev (owner).

Step-by-step laptop setup in Hinglish: [docs/LAPTOP-SETUP.md](docs/LAPTOP-SETUP.md).

## Deploy (owner only)

```bash
npx wrangler login
npm run stamp && npm run build
npx wrangler deploy --config wrangler.apnadhanda.toml
```

Always take a backup first (`npm run backup` — the `.sql` file it writes contains real shop data and is git-ignored; keep it private). Only Krish deploys to production.

## Folder structure

```
.
├── site/                    # Everything served to the browser + the Worker
│   ├── _worker.mjs          # Cloudflare Worker: API, auth, DB migrations, cron, push
│   ├── index.html, app.js   # Customer storefront
│   ├── admin.html, admin-*.js, admin.js  # Shopkeeper panel (admin.js is the built bundle)
│   ├── dev.html, dev.js, god.js          # Owner console / God Mode
│   ├── landing*.{html,js,css}            # Platform landing page
│   ├── salon.js, track.js, …             # Feature modules
│   └── icons/               # Product icons (webp)
├── tools/                   # Build, version stamp, backup and maintenance scripts
├── test/                    # Automated tests (*.test.mjs) + fixtures and browser checks
├── docs/                    # Setup guide, technical notes, release notes
├── dev-server.mjs           # Local dev server (SQLite instead of D1)
├── wrangler.apnadhanda.toml # Production Worker config
├── wrangler.toml            # Same Worker (kept so a plain `wrangler deploy` is safe)
└── package.json
```

Detailed architecture, data model, security rules and the per-version history: [docs/TECHNICAL-NOTES.md](docs/TECHNICAL-NOTES.md).

## Configuration and secrets
- The Worker has **no secrets and no secret hashes in code**. Shop and owner passwords are PBKDF2-SHA256 hashes (100k iterations) in D1.
- The operator secrets are **Cloudflare Worker secrets**, stored only as PBKDF2 hashes: `SETUP_KEY_HASH`, `DEV_RECOVERY_HASH` and `DEV_SEED` (the God Mode account, used only on an empty database). Run `node tools/make-secrets.mjs` to make new random keys, then `npx wrangler secret put <NAME> --config wrangler.apnadhanda.toml` for each. If a secret is missing, setup and God Mode recovery just refuse; the rest of the app keeps working.
- Tests run on every push and pull request (GitHub Actions, `.github/workflows/test.yml`).
- Local values go in `.env` (copy from [.env.example](.env.example)). `.env`, `*.secret`, `.dev.vars`, backups and `local.sqlite` are git-ignored.
- The D1 `database_id` in the toml files is an identifier, not a credential.

## Contributing
Friends who are added as collaborators: read [CONTRIBUTING.md](CONTRIBUTING.md). Short version: make a branch → open a Pull Request → Krish reviews → merge. Never push to `main` directly, never commit secrets or customer data.

## License
All rights reserved — proprietary (the repository is public to read, not to reuse). See [LICENSE](LICENSE).
