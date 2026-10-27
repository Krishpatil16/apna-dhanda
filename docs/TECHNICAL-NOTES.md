# Apna Kirana — online ordering for one neighbourhood kirana store

Live demo: https://kirana-demo.sites.tab.bot/  ·  Shopkeeper panel: https://kirana-demo.sites.tab.bot/admin  ·  Developer console: https://kirana-demo.sites.tab.bot/dev

Customers browse the shop's items (Hindi first, English switch), add to cart, and send an **order request**
(Cash on Delivery / optional UPI-on-delivery). The shopkeeper sees it in the admin panel, accepts or rejects it,
and moves it through Preparing → Out for Delivery → Delivered. Customers can follow the status on a private
tracking link and can also send the itemised order to the shop on WhatsApp.

## v10.12 — BATCH 2: two sides (customer / shopkeeper), nearby shops, QR poster, Open/Closed, Today's orders (2026-10-26)

| What | Where |
|---|---|
| Two entry links | Customers: **`/shops`** (alias `/customer` → 302). Shopkeepers: **`/admin`** (alias `/shopkeeper` → 302). `/` shows "Who are you?" with two big cards (🛍️ I'm a customer → `/shops`, 🏪 I'm a shopkeeper → `/shopkeeper`); the shop list that v10.11 put on `/` is gone. The rest of `/` (shopkeeper explainer, dev → Landing editor) is unchanged below. |
| Customer page `/shops` | `shops.html` + `shops.css` (warm orange/pink, ~6 KB) + `shops.js` (~6 KB). Server-rendered cards (works without JS, fast on 3G): greeting "What do you need today?", search (shop names), colourful type chips (only types that have shops), cards with logo/emoji, coloured type badge, open/closed dot, distance. Empty states for "no match" and "no shops yet". EN \| हिंदी switch (shared `ak_lang`). |
| Directory rule | `publicShopList()`: status active/grace + `online=1` + in plan (`subState().can_operate`) + `dir_hidden=0` + name not starting "TEST". Public fields only: slug, name, type, open (shop hours / "closed today"), logo, km. Never owner, phone or coordinates. |
| 📍 Near me | `GET /api/shops?lat=&lng=` (public, 60/min per IP; the customer's position is used for the sort and never stored) → sorted by haversine distance, `km` + `km_text` ("250 m", "2.6 km"); shops without a location last. Browser geolocation only (free). `permissions-policy` now allows `geolocation=(self)`. |
| Shop location | /admin → Settings → 📍 **Set my shop location**: browser geolocation once → "Is this your shop's location?" confirm → `POST /api/admin/location {lat,lng,accuracy,confirm:true}` (shop-scoped, validated, rounded to 5 decimals, logged in service_log). `{clear:true}` removes it. |
| Open / Closed | The big one-tap switch at the very top of /admin is the existing ONLINE flag (`/api/admin/online`): closed = shop page shows "closed", the server refuses orders (423) and the shop leaves the directory. |
| Today's orders | /admin opens on **📋 Today** (`todayView`): 3 numbers (new/active, done, sales today), only active orders with their action buttons, then a "More" grid (All orders, Items/Menu, Stock, Categories, QR poster, Share link, Settings). Categories left the bottom bar (7 tabs fit one row at 360 px). |
| QR poster | `qr.js` (our own encoder, no CDN — CSP `script-src 'self'` unchanged): A4 PNG, shop name + QR to `/s/<slug>` + "Scan to order" (English first, Hindi line; Hindi first in हिंदी mode). Buttons: Today → QR poster, Settings → Download QR poster, top bar 🖨️ QR, Dev → per shop. |
| Remember the customer | `localStorage["cust._me"] = {name, phone}` after an order (shared by every shop on the phone) → prefilled at checkout with "Hi Ravi · Not you? Change". |
| Dev panel | Per shop: open/closed pill + 🔴 Close / 🟢 Open, 📍 location set/none + Clear location, 👁 in directory / 🙈 hidden + Hide/Show, 🖨️ QR poster, 🛒 orders today. Filters: Any / Open / Closed / Has location / No location / Not in directory. API `POST /api/dev/shops/flags {shop_id, online?, dir_hidden?, clear_location?}` — one shop, logged in sub_log (`dev_flags`, actor dev:<name>). The whole panel is in English now. |
| English | Server messages are "हिंदी · English"; `AK.pickMsg` shows only the part for the chosen language (English default), the dev panel always English. |
| Migration #16 | Additive: `shops.lat`, `shops.lng` (NULL), `shops.dir_hidden` (default 0). Schema v16. |

Tests: `npm test` (152: 151 pass, 1 skipped) incl. `test/v1012.test.mjs`.

## v10.9 — 📊 Dukaan wise (dev) + 🧾 free bill to the shopkeeper's own WhatsApp (2026-10-25)
- **Dev → Logs → 📊 Dukaan wise** (first sub-tab): chips Aaj / 7 din / 30 din / Sab (IST days). One card per shop, sorted by orders:
  🛒 orders · 💰 Kamai (total of DELIVERED orders, test orders excluded) · 🔑 shopkeeper logins / logouts + last login · 👥 distinct customers + shop visits.
  Tap a shop → customer list (name, orders, last seen; phones without a name grouped as "Bina naam") + recent login/logout with device (mobile/desktop).
  API: `GET /api/dev/dukaan?range=today|7d|30d|all`, `GET /api/dev/dukaan/<shop_id>?range=…` (developer login only).
- New table `shop_events (id, shop_id, kind, ts, meta)` + index `(shop_id, ts)` — additive migration #14. Kinds: `admin_login`, `admin_logout`
  (button, or `how: expired` when a session runs out), `cust_visit`. Login/visit counting starts 25 Oct 2026; orders/Kamai include old data.
- Customer visit beacon: `/s/<slug>` fires `POST /api/visit` (fire-and-forget, keepalive) with an anonymous random device id (localStorage `ak_did`)
  and the name already typed at checkout, if any. At most one row per device per shop per 30 min; per-IP limit 30/10 min; per-shop cap 600/hour.
  No IPs, no phone numbers stored. Distinct customers = by name when known, else by device.
- New-order push now opens `/admin#bill=<id>` (the order's bill). The bill has **📲 Mere WhatsApp pe bhejo**: `wa.me/91<shop's registered mobile>?text=<bill>`
  (order ID, IST date/time, customer name + number, items, total). Free: the shopkeeper taps Send once in WhatsApp; no paid API.

## v10.1 — Dev → 🏠 Landing editor (2026-10-25)

| What | Where |
|---|---|
| Editor | Dev → **🏠 Landing**: every text on `/` in हिं + EN (top bar, hero, badges, phone/QR picture, 3 steps, "What you get", plan card, buttons, footer), step/button icons, feature cards (add / edit / delete / ↑↓ reorder / show-hide, max 12, emoji icon + picker), section on/off (phone/QR, trial badge, steps, features, plan, bottom buttons), colours (primary + accent pickers), 👁 Preview (`/?splash=0`), ↺ Reset per section + Reset all (in-page modal), sticky Save bar, toasts. |
| Storage | One JSON in `service_state` key `landing_json` (validated in `landingValidate`: length limits, `<>` stripped, colours `#rrggbb`, ≤12 cards). Empty field = built-in default (`LANDING_TEXT`, `LANDING_CARDS` in `_worker.mjs`). Rendered server-side by `renderLanding()` with `H()` escaping; templates `{trial_days}`, `{price}` (from Platform pricing, never stored here), `{brand}`. |
| Old fields | Platform's old "Landing page title/text" boxes are gone; `POST /api/dev/platform {landing_title, landing_text}` still works and writes into the editor JSON (both languages). Old values saved before v10.1 are folded in on read. |
| API | `GET /api/dev/landing` → `{landing, defaults, limits, plan}`, `POST /api/dev/landing {landing}` (dev session + `x-requested-with: kirana-dev`). |
| Laptop | `LAPTOP-SETUP.md` (Hinglish, Windows), `npm start` / `npm run deploy` / `npm run backup` / `npm run dev-password`. |

Tests: `npm test` (64 pass, 1 skipped) incl. `test/v101.test.mjs`.

## v10 — 3D intro splash, new landing, branded login/sign-up (2026-10-25)

| What | Where |
|---|---|
| Intro splash | `site/splash.css` + `site/splash.js` (≈7 KB, pure CSS 3D: extruded logo tile flies in and turns, "Apna Dhanda" letters flip in with layered-shadow extrusion, अपना धंधा rises, perspective grid floor). Markup is injected by the Worker (`{{SPLASH}}` → `splashHtml(brand)`) on `/`, `/admin`, `/dev` only; storefronts `/s/<slug>` never carry it. Once per browser session (`sessionStorage ad_splash_v10`), ~2.5 s, tap/Enter/Esc skips, reduced-motion = short fade, ends on its own via CSS even if JS fails. `?splash=1` forces, `?splash=0` hides. Uses the brand logo from Dev → Brand (falls back to the built-in mark). |
| Landing `/` | `landing.html` + `landing.css` + `landing.js`: hero + 3D phone, 3 steps, features, plan card. Price and trial days come from platform settings (`{{PRICE}}`, `{{TRIAL_DAYS}}`), approval note hides when auto-approve is on. Hindi first, EN toggle (shared `ak_lang`). |
| /admin auth | Logged-out screens get `body.auth-mode`: green brand header with 3D logo, login / new-shop switch, bigger fields, orange primary buttons. Every field and id unchanged. |
| Sign-up success | Shop ID, full customer link (`customer_url` now in the sign-up answer), Copy / Share / WhatsApp, on-screen QR, QR PNG download, A4 QR poster, pending vs approved state, recovery key. |
| One Worker | Only `apnadhanda` is deployed now (`wrangler.toml` also names apnadhanda, so a plain deploy cannot recreate the removed `kirana` Worker). |

Tests: `npm test` (59 pass, 1 skipped) incl. `test/v10.test.mjs`.

## v6 — "Apna Dhanda" (platform landing, online switch, per-shop home-screen app)

| What | Where |
|---|---|
| Landing page | `/` = Apna Dhanda page (Hindi): "दुकान रजिस्टर करें" → `/admin#signup`, "दुकानदार लॉगिन" → `/admin`. No shop data on it. (Old QR codes that point at `/` now open this page — use the `/s/<slug>` posters.) |
| Online / offline | Shopkeeper panel top bar: big switch. Approved shops start **offline**; offline = storefront shows "🔒 अभी बंद है" (503) and the server refuses orders (423 `service_paused`). Pending ("जल्द शुरू"), paused ("temporarily unavailable") and offline pages are all different. Existing active shops were set online by the migration. |
| Fixed customer link | Top bar shows `PUBLIC_ORIGIN/s/<slug>` (wrangler `[vars] PUBLIC_ORIGIN`, falls back to the request origin) with Copy, WhatsApp share and QR poster. Slugs never change. |
| Home-screen app | `/s/<slug>/manifest.webmanifest`: name/short_name (≤12) from the shop's home-screen name, icons 192/512/maskable from the logo, `start_url` = `scope` = `/s/<slug>`, theme colour. Page head also gets apple-touch-icon (180 PNG), apple-mobile-web-app-title, theme-color. Icons are drawn in the browser (`site/appicon.js`) and stored in `images`; fallback = initials tile `/s/<slug>/icon.svg` (the panel also auto-makes initials PNGs on first login). Admin: top bar → 📱 App (logo, name, colour, live preview). |
| Developer | `/dev → Shops`: platform brand card (name + logo → landing page, `/manifest.webmanifest`, `/admin.webmanifest`, `/dev.webmanifest`); per shop "📱 Logo / name" override + 🔒 lock (shopkeeper gets 423); "🗑 Delete" removes a shop and all its data (type the link name; shop #1 protected). |
| Stickers | Add-item sheet: "✨ स्टिकर से जल्दी जोड़ें" — 57 emoji stickers in 8 groups (`site/stickers.js`); a tap sets the picture (when no photo), Hindi + English name and the matching category. |

Migration v6 runs automatically (adds `shops.online, app_name, app_icons, app_theme, app_lock`, brand rows in `service_state`). Two Workers ("kirana" and "apnadhanda", `wrangler.apnadhanda.toml`) serve the same code and the same D1. Tests: `npm test` (43) incl. `test/v6.test.mjs`; browser check `test/ui-ad.mjs`.

## v5 — many shops on one website (multi-shop)

One deployment now serves many independent shops. Each shopkeeper signs up for their own account and sees **only their own shop**.

| What | Where |
|---|---|
| Shop #1 (existing data, owner = the original `bhaiya` admin, same password) | `/s/mahesh-kirana` — and `/` still opens it (old QR codes keep working; the address bar switches to `/s/mahesh-kirana`) |
| Any other shop's storefront | `/s/<slug>` (slug chosen at sign-up, unique), info page `/s/<slug>/info`, own app manifest `/s/<slug>/manifest.webmanifest` |
| Order tracking | `/track` (order token decides the shop); links from a storefront carry `?s=<slug>` |
| Shopkeeper sign-up / login | `/admin` → “नया दुकान अकाउंट बनाएं”: owner's name, shop name, link name, mobile, password. Login with the mobile number (shop #1 keeps its username). A **recovery key** is shown once at sign-up (only its hash is stored); shop #1 keeps the original setup key for recovery. |
| Approval | New shops start **pending** (customers see “starting soon”, orders refused on the server, the shopkeeper can already add items). The developer approves/rejects in `/dev → Shops`. “Auto-approve new shops” toggle, default **off**. Rejected = cannot log in, storefront 404. |
| Billing per shop | `/dev → Shops → Billing`: pause/activate, paid-until + grace days (default 7), +1 month, per-shop change log. A paused shop shows the paused page with **that shop's** phone/WhatsApp; other shops are unaffected. `dev_contact` stays global. krish-dev is still the single developer login. |
| QR poster | Shop admin → Settings → “QR पोस्टर डाउनलोड”: A4 PNG (2480×3508) drawn in the browser (`site/qr.js`, own QR encoder, byte mode, level M, versions 1–10, loaded only on click). No external service. |
| Greeting | The panel says “नमस्ते, {owner name}” (editable in Settings → आप); no hard-coded “bhaiya” anywhere in the UI. |

**Isolation (server-side).** Every shop-owned table has `shop_id` (`categories, products, variants, orders, images, offers, push_subscriptions, notification_attempts, audit_log, service_log, admins`; `order_items/order_events/order_ratings/offer_items` hang off a shop-owned parent) and settings live in `shop_settings(shop_id,key,value)`. Each request gets a database handle bound to exactly one shop: the logged-in shopkeeper's shop, the storefront slug (`X-Shop` header, default shop #1), or — for token routes (track, cancel, rating, reorder, push) — the order's own shop. New columns default to `0`, so a row ever written without a shop is invisible to every shop rather than leaking into shop #1 (tests assert no such row exists). Customer data on the device (cart, My Orders, favourites, addresses, area) is stored per shop (`ak_cart@<slug>` …; shop #1 keeps the original keys so existing customers keep their cart/orders). Shopkeeper backup = that shop only; developer backup (`/dev`) = everything. Photos: 60 MB cap per shop. VAPID key is one per server (fine — subscriptions are per shop).

Known limits: SKUs are unique across the whole site (a shop picking an SKU another shop already uses gets “SKU already in use”). Shop #1's slug is fixed as `mahesh-kirana`. No per-shop custom domain.

### Applying v5 to an existing live database
Nothing to run by hand — the migration is **v5 in `MIGRATIONS` inside `_worker.mjs`** and runs automatically, inside one D1 batch (all-or-nothing), on the first request after deploy; `schema_version` makes it run exactly once (idempotent). It:
1. creates `shops` + `shop_settings`; 2. adds `shop_id` to the tables above and sets every existing row to shop #1; 3. creates shop #1 (`mahesh-kirana`, name from `store_name_en` → “Mahesh Agrawal Kirana Store”, owner name “Mahesh Agrawal”, status/paid-until/grace copied from the old global service state); 4. copies all settings into `shop_settings` for shop #1; 5. re-creates the audit triggers so new audit rows carry `shop_id`; 6. adds indexes. Admin rows (password hashes) and sessions are untouched, so bhaiya stays logged in.

Steps: (1) take a backup first (`/dev → Download full backup`, or `wrangler d1 export <db> --remote --output pre-v5.sql`); (2) deploy this `site/` (same D1 binding); (3) open `/health`, then `/` — the first request migrates; (4) check `/dev → Shops` shows shop #1 with its orders. Rollback = restore `pre-v5.sql` into the database and redeploy v4.
**Restore order matters:** an *old (v4) backup/restore SQL* must be loaded **before** v5 runs (into the v4 schema), never into a v5 database — its rows would carry no shop (`shop_id = 0`) and be invisible. Verified: `LIVE_RESTORE_SQL=/path/restore.sql npm test` loads a restore of the current live DB into a v4 database, runs v5, and checks every row count, the shop, and that the password hashes are unchanged (passes: 18 orders, 31 items, 2 ratings, 1 product, bhaiya).

Tests: `npm test` → 38 pass + 1 optional (the live-restore test above). New: `test/multishop.test.mjs` (sign-up/approval/reject/auto-approve/recovery, cross-shop isolation for orders, items, categories, offers, settings, reports, CSVs, backup, push, ratings, audit, cancel-by-token; per-shop pause and billing; storefront routing; migration from a real v4 database using the frozen `test/fixtures/worker-v4.mjs`). Browser check at 390px: `test/ui-mt-local.mjs` against `node dev-server.mjs` (`KIRANA_DEV_PASS` sets a local developer password).

## Architecture
| Part | What it is |
|---|---|
| `site/_worker.mjs` | The whole backend: one Cloudflare Worker (plain ES module, no build). REST API under `/api/*`, serves pages with security headers. |
| Database | Cloudflare **D1** (SQLite) bound as `DB`. Migrations are versioned SQL inside the worker (`schema_version` table) and run automatically on first request. Money is stored as **integer paise**. |
| `site/*.html, *.css, *.js` | Mobile-first frontend, vanilla JS (~60 KB total, no framework, no remote assets). CSS-3D hero crate, card tilt, fly-to-cart; all motion stops under `prefers-reduced-motion` and when off-screen. |
| `test/` | `api.test.mjs` (10 integration tests through the real worker against SQLite), `d1-shim.mjs`, `e2e-browser.mjs` (real-browser flow, mobile viewport), `wa-check.mjs`. |
| `dev-server.mjs` | Local server: runs the same worker against a local SQLite file. |

**Why not Next.js + Supabase (Krish's preferred stack)?** No Supabase/managed-Postgres credentials or paid hosting
were available. This stack runs free on the demo subdomain, has zero build steps, and the schema is plain SQL that
ports to Postgres directly (INTEGER paise → `bigint`, same tables/constraints). The API contract can stay the same
if the backend is later rewritten in Next.js route handlers.

### Data model
`settings` · `admins` · `sessions` · `rate_events` · `categories` · `products` · `variants` (pack sizes: price, MRP, stock with `CHECK (stock >= 0)`)
· `orders` (code, hashed tracking token, unique idempotency key, status, customer details, paise totals) · `order_items` (price snapshot)
· `order_events` (status history) · `images` (uploaded product photos).

### Core rules (all enforced on the server)
- Prices, stock, active/hidden, open/closed, delivery PIN codes/localities and minimum order are **re-validated at checkout**. A changed price returns `409 cart_changed` and the customer sees "रेट बदला: ₹a → ₹b" before re-confirming.
- **Idempotent** order creation (client key, `UNIQUE` in DB) — a double tap or retry never makes two orders.
- **Inventory policy:** stock is deducted when the order is placed, inside one atomic batch; `CHECK (stock >= 0)` aborts the whole order if two people race for the last units. Reject/Cancel puts the stock back **exactly once** (nonce-guarded). Delivered keeps it deducted.
- **Status flow:** Pending Approval → Accepted → Preparing → Out for Delivery → Delivered; Rejected (from Pending, reason required), Cancelled (any time before Delivered, reason required). Every change is checked against the expected current status (no lost updates) and written to history.
- **Tracking:** `/track#AK-XXXXXX.<48-hex token>`; only the SHA-256 of the token is stored; the token sits in the URL fragment (never sent to servers/logs); phone is masked on the tracking page.
- **No invented offers:** MRP and "% off" appear only when the shop enters an MRP. Delivery charge, free-delivery threshold, minimum order, hours and announcement are all settings (defaults: none).
- **Demo data:** 35 sample items in 8 categories, flagged `is_demo`, shown with a "नमूना / Sample" tag and a site-wide demo ribbon; "Remove all demo items" in admin deletes them (the shop's own items stay). Editing a demo item turns it into a real item.

### Admin security
- No PIN or password in frontend code. The first admin is created at `/admin` with a **one-time setup key** (only its SHA-256 is in the worker). After one admin exists, setup is closed.
- Passwords: PBKDF2-SHA256, 100k iterations, per-user salt. Sessions: random 256-bit token, stored hashed, `__Host-` cookie with `Secure; HttpOnly; SameSite=Strict`, 7 days.
- Login rate limit: 8 failures / 15 min per IP and per username. Setup/recovery: 5 attempts / 15 min. Orders: 8 / 10 min per IP.
- CSRF: SameSite=Strict + required `X-Requested-With: kirana` header + JSON-only bodies.
- Forgot password: "पासवर्ड भूल गए?" on the login screen resets it with the setup/recovery key.
- CSP (`script-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `no-referrer` on pages. CSV export escapes formula cells (`=`, `+`, `-`, `@`).

## Setup & local development
Requires Node 20+.
```
npm install
npm test                                   # 10 API/integration tests (checkout, inventory, auth, CSV…)
KIRANA_SETUP_KEY=choose-a-local-key node dev-server.mjs 8787
# open http://localhost:8787  and  http://localhost:8787/admin  (use the same setup key)
BASE=http://localhost:8787 SETUP_KEY=choose-a-local-key ADMIN_USER=bhaiya ADMIN_PASS=localpass123 node test/e2e-browser.mjs
```
`e2e-browser.mjs` needs a Chromium binary (`CHROME=/path/to/chrome`).

## Configuration
See `.env.example`. There are **no secrets in the frontend**; the only server-side value is the hash of the setup key.
Store details (name, phone, WhatsApp number, address, hours, delivery area, charges, payment options, announcement,
demo ribbon) are edited by the shopkeeper in **Admin → Settings**, not in code.

## Deployment
Any Cloudflare Workers account (free plan is enough):
1. Create a D1 database and bind it as `DB`; deploy `site/` with `_worker.mjs` as the main module and the folder as static assets (`html_handling: none`, so pages pass through the worker and get security headers). Tab's publisher does this from `site/tab-site.json`.
2. Generate a long random setup key; put `sha256("kirana-setup:" + key)` into `SETUP_KEY_SHA256` at the top of `_worker.mjs` before deploying.
3. Open `/admin`, enter the setup key, choose username + password. Keep the setup key safe — it is also the password-recovery key.
4. In Settings: shop name, phone, WhatsApp number, delivery PIN codes, charges, hours; then add real items (or CSV import) and remove demo items.

## External services, costs, credentials
| Service | Needed? | Cost | Credential |
|---|---|---|---|
| Cloudflare Workers + D1 + static assets | Yes (hosting + DB) | Free tier covers a single shop comfortably (100k requests/day, 5 GB D1) | Cloudflare account (held by whoever hosts) |
| WhatsApp | Customer-initiated `wa.me` link only | Free | Shop's WhatsApp number (a setting) |
| SMS / WhatsApp Business API notifications | Not implemented | Paid (per message) | Provider API key — future |
| Online payments (UPI gateway) | Not implemented (COD + UPI on delivery only) | Gateway fees | Gateway keys — future |
| Custom domain | Optional | ~₹800–1,200/yr | Registrar account |

## Status
Done and tested: storefront (search, categories, featured, product detail with pack sizes, cart, checkout, confirmation, WhatsApp hand-off, tracking),
admin (setup/login/logout/recovery/change password, dashboard counts + low stock, orders with filters/search/status actions/tap-to-call/WhatsApp customer,
new-order sound + badge via 15-second polling, products with variants/stock/photo upload/icons/featured/hide/delete, categories add/edit/reorder/hide/delete,
settings, CSV export/import with validation, remove demo data).

Not yet: automatic SMS/WhatsApp notifications (needs a paid provider), online payment, multiple admin users/roles UI,
image moderation/cleanup of unused photos, PWA/offline, analytics. Accessibility and performance have had one pass
(labels, focus styles, contrast, reduced motion, 44px targets) but no formal audit.


## v2 (Oct 24, 2026): My Orders, real notifications (Web Push), offers

**My Orders.** At checkout the browser saves the order code plus its private tracking token in `localStorage` (`ak_orders`).
`/track` lists those orders with live status via `POST /api/orders/mine` (one code+token pair per order; a code without its
token returns nothing). The header has a "मेरे ऑर्डर" button and the mobile bottom bar has a My Orders tab, both with a badge
for active orders. The home page shows a strip for the latest active order. Opening any tracking link also saves that order.

**Web Push (free, no SMS/WhatsApp API).** `sw.js` (service worker) + Push API. Encryption is RFC 8291 `aes128gcm` with
RFC 8292 VAPID, written on WebCrypto inside the Worker (no library). Tests decrypt every push with an independent node:crypto
implementation and cross-check it with `http_ece` (the reference RFC 8188 library).
- VAPID key: the publisher has no Worker-secrets support, so the key pair is generated on the server on first use and kept in
  D1 table `server_secrets`; only the public key is ever served (`GET /api/push/key`). It is never in frontend code or the repo.
- Bhaiya: Admin → Orders (top) or Settings → "ऑर्डर अलर्ट चालू करें" subscribes this device and sends a test alert.
  Every new order sends "नया ऑर्डर आया — AK-XXXX, ₹total", opening `/admin#order=ID`. In-page sound/badge polling still runs.
- Customer: after placing an order (and on the order page) "ऑर्डर अपडेट पाने के लिए नोटिफिकेशन चालू करें". The subscription
  is tied to that order (needs its private token). Pushes go on Accepted, Preparing, Out for delivery, Delivered,
  Rejected/Cancelled (with reason). The push carries no token; tapping opens `/track#open=CODE`, resolved from local storage.
- Subscriptions: `push_subscriptions`; 404/410 from the push service deletes the row. Every attempt is logged in
  `notification_attempts` (accepted / expired / rejected / error / no_subscription). "accepted" = the push service took it
  (HTTP 201), not proof the phone displayed it. Only known push-service hosts are accepted as endpoints.
- Where it works: Android Chrome, desktop Chrome/Edge/Firefox. iPhone/iPad: only when the site is added to the Home Screen
  (iOS/iPadOS 16.4+), and the Home Screen app has its own storage, so orders placed in Safari don't appear there.
- Manifest: `manifest.webmanifest` (customer) and `admin.webmanifest` (start_url /admin), plus PNG icons.

**Offers.** Admin → "ऑफर": create, edit, delete, switch on/off. Types: % off (chosen items or a whole category), special price
per pack size, or info only. Optional start/end (IST), banner colour, banner photo. Customers see live offers in a strip on the
home page and an "ऑफर" tag on linked items. The server applies the lowest valid offer price at checkout (re-checked at order
time, so an expired offer stops applying), and snapshots `unit_price_paise`, `base_price_paise`, `offer_id`, `offer_title`
in `order_items`. One demo offer ("डेमो ऑफर: अंडों पर 10% छूट") is seeded switched OFF and is removed with the demo data.

**Tests.** `npm test` (19 tests, incl. push encryption/VAPID verification, sends on new order and each status, expiry cleanup,
offer pricing and expiry, My Orders isolation). `test/e2e-push.mjs` is a real browser test: Chrome subscribes through
Google's push service, an order is placed, and the push arrives in the service worker (BASE, AUSER, APASS env vars).


## v3 (Oct 24, 2026): developer (owner) console, service control, health, error log

**Developer console: `/dev`.** Built for the developer who maintains the shop's site. It is separate from the shopkeeper's `/admin`:
its own table (`dev_accounts`, `dev_sessions`), its own cookie (`__Host-ks_dev`, Secure, HttpOnly, SameSite=Strict, 72 h), and its own CSRF
header (`X-Requested-With: kirana-dev`). Logins are rate-limited (5 failures in 15 min per IP and per username). Passwords use PBKDF2-SHA256
with 100k iterations. A recovery key (only its SHA-256 is in the worker) resets the password. The admin session cannot reach `/api/dev/*` and
the dev session cannot reach `/api/admin/*`. Nothing in the admin UI or admin API reads or changes the developer tables or the service state.
The initial account is seeded from `DEV_SEED` (username, salt and hash) at the top of `_worker.mjs`. To set new credentials, change
`DEV_SEED` before the first deploy on a fresh database, or use the recovery key.

**Health (aggregates only, with no customer names, phones or addresses):** DB check and latency, app version, build time and when the build first served.
Orders today, in the last 7 days and all time, a count per status, the last order time and the 7-day order value. Pending orders older than X minutes (X can be changed),
listed by code and age only. Product totals, out-of-stock items and low-stock pack sizes. Web Push results for the last 24 h (sent, failed, expired),
whether the shopkeeper has order alerts on, and when one last reached the push service. Server errors. Requests per hour for the last 24 h,
with rate-limit hits and 5xx responses. DB size and row counts per table.

**Error log** (`error_log`): uncaught exceptions, 5xx responses and failures in background push jobs. Each row has the route (ids and order codes
normalised), method, status, time and message. Numbers, emails and long hex tokens are masked. The log keeps the latest 500 rows.
"Send a test error" on the Errors tab calls `POST /api/dev/test-error`.

**Metrics** (`metrics`): hourly counters for API requests, page requests, dev requests, 429 responses, 5xx responses and orders blocked while paused. Static assets are not
counted. Metrics are pruned after 8 days. `rate_events` older than 1 day are pruned too.

**Service control** (`service_state`, `service_log`):
- **Active**: normal.
- **Grace**: the site works normally. The shopkeeper's panel shows a yellow "मेंटेनेंस भुगतान बाकी — डेवलपर से संपर्क करें / Maintenance payment due — contact developer" banner, with the developer's phone if set and the date online ordering will pause.
- **Paused**: `/`, `/track` and `/info` serve a polite 503 page ("ऑनलाइन ऑर्डर अभी कुछ समय के लिए बंद है — कृपया दुकान से संपर्क करें"), with the shop phone and WhatsApp buttons when they are set in Settings.
  `POST /api/orders` answers `423 service_paused` on the server. Every write in the shopkeeper's panel answers `423`, except logout, password change and removing an alert device. Every read
  still works, including **Items CSV** (`/api/admin/csv`) and the new **Orders CSV** (`/api/admin/orders.csv`). Both buttons sit in the red banner. No data is deleted.
- **Paid-until date** (optional): once that day ends (IST), the status moves to Grace on its own, then to Paused after the grace days (default 7, can be changed). Automatic moves only ever
  escalate, and each one is logged once (`actor: auto`). **Resume** is one click and clears an expired paid-until date so the site is not paused again straight away. **Payment received: +1 month**
  moves the date forward one month and sets the status to Active. Every change is written to `service_log` with the time, the actor and an optional note.

**`/health`** (public, CORS-open, no secrets): `{ok, db, db_ms, version, build, time}`. It answers 200, or 503 when the DB does not answer. Point a free uptime monitor
(UptimeRobot, Better Stack and similar) at `https://<site>/health` to get an email or app alert when the site or its database is down. The panel cannot report
on itself when the whole site is down.

**Tests**: `npm test` runs 26 tests. The 7 new ones are in `test/dev-panel.test.mjs`: auth separation both ways, CSRF, hashing, rate limit and recovery; aggregates-only health with a PII check;
pause blocking orders on the server, the paused page and read-only admin; exports while paused; automatic Grace and Paused by date, logged once, plus resume and +1 month; the error log capturing a forced error,
dev-only access and pruning to 500; message scrubbing, route normalisation and `/health` returning 503 when the DB is down.
`test/shot-dev.mjs` is the live browser check. It logs in to /dev, switches to Grace, takes the admin banner screenshot, pauses, takes the customer page screenshot, tries a blocked order and the exports, then **always resumes**.


## v4 (2026-10-24): reorder, delivery check, sort, cancel, favourites, ratings, reports, history, cart offers, backup

Everything below runs on the same free Cloudflare Worker + D1. No paid service, SMS or API is used.

**Customer**
- **Reorder / फिर से मंगाएं**: shown on every past order in My Orders and on each order page. `POST /api/orders/reorder {code, token}` returns each item with its *current* price (offers included) or why it is unavailable. The browser adds the available items to the cart; checkout revalidates as usual.
- **पिछली बार का सामान**: a strip on the home page built from this phone's own orders (`/api/orders/mine` now returns the variant ids).
- **Delivery check** on home: PIN (or locality when only localities are set), saved on the phone (`ak_area`), with delivery time, charge, free-delivery and minimum order shown as chips. Checkout prefills the saved PIN. The server still enforces the area at checkout.
- **Sort** (default / price low→high / high→low / popular). "Popular" = items sold in the last 60 days (test, rejected and cancelled orders not counted), returned per product as `pop`.
- **Similar items** in the item sheet (same category, shared words, in-stock first).
- **Tracking page**: call / WhatsApp the shop; **cancel** while the order is *Pending approval* (`POST /api/orders/:code/cancel` with `x-order-token`); after acceptance it says to call the shop. The cancel is server-enforced (only `pending`), uses the same nonce-guarded transition as bhaiya's reject (stock released exactly once), is idempotent (a second call answers `already: true`), and pushes "ग्राहक ने ऑर्डर रद्द किया" to bhaiya's devices.
- **Favourites ❤️, saved addresses, profile sheet (👤)**: all on the phone (`ak_favs`, `ak_addrs`, `ak_customer`). "मेरा डेटा हटाएं" clears every `ak_*` key on that phone. No account or OTP (SMS costs money).
- **Rating** after Delivered: 1–5 stars + optional 300-char comment, one per order (DB unique), needs the order token, `<`/`>` stripped and everything escaped on display. Public display only when bhaiya switches on Settings → Ratings; then the home page shows the average and recent comments with the customer's first name only.
- Loading skeletons, empty states (search, favourites), shop logo in the header.

**Shopkeeper (admin)**
- **Reports tab (📊)**: today / 7 days / 30 days / custom dates (IST). Value = sum of *delivered* orders' totals, labelled "order value, not profit". Counts of delivered / cancelled / rejected / open, average order, discounts given, cash vs UPI, best sellers and slow-moving items by quantity, a CSS bar chart per day, CSV export (`/api/admin/reports.csv`). Orders are grouped by the day they were placed. Ratings list is on the same tab. Dashboard (Orders tab) shows a 30-day best-sellers card.
- **Test orders**: any order whose name starts with `TEST` gets `is_test = 1` and is left out of reports, popularity and public ratings.
- **Stock / price / status history (📜)**: SQL triggers on `variants` and `orders` write `audit_log` rows for every stock change (manual edit, item editor, CSV import, order reserve, release on reject/cancel), every price/MRP change, new/removed pack sizes and every order status change, with time, before → after, actor (`admin:<name>`, `customer`, `system`) and reason. The actor/reason come from the one-row `audit_ctx` table, set as the first statement of the same D1 batch and cleared as the last. Viewable as a list (Items → "स्टॉक और रेट की हिस्ट्री") and per item (edit sheet). Kept: latest 20,000 rows and at most 400 days (pruned when the dashboard loads).
- **Offers**: two new kinds — *₹ off / % off above a cart value* (`cart_flat`, `cart_percent` with optional max ₹) and *free delivery above ₹X* (`free_delivery`) — with the same start/end dates and on/off switch. Stored as `kind='info'` + `rule`; applied only on the server in `createOrder` (one best discount, never stacked; min order is checked on the item subtotal), snapshotted on the order (`discount_paise`, `discount_title`, `free_delivery_offer_id`). Expired offers stop applying automatically.
- **Settings**: shop logo upload, "show ratings on homepage", **Download full backup**.

**Backup & restore**
- Download: Admin → Settings → "पूरा बैकअप डाउनलोड करें" (`GET /api/admin/backup`) or the developer panel → Backup (`GET /api/dev/backup`). One JSON file with every table except `admins`, `sessions`, `dev_accounts`, `dev_sessions`, `server_secrets` (VAPID key), `push_subscriptions`, `rate_events`. Order tracking tokens are stored only as hashes, so old tracking links keep working after a restore. The dev panel shows when the last backup was taken and by whom.
- Restore into a new D1 database:
  1. Deploy the site (same `site/` folder) with an empty D1 bound as `DB`, and open the home page once so the app creates its tables.
  2. `node tools/backup-to-sql.mjs kirana-backup-YYYY-MM-DD-HH-MM.json > restore.sql`
  3. `npx wrangler d1 execute <database-name> --remote --file restore.sql` (or, locally, `sqlite3 local.sqlite < restore.sql`).
  4. Log in: the admin and developer passwords are not in the backup — use the setup/recovery key (`/admin` → "Forgot password?") and the developer recovery key to set new passwords. Customers re-enable notifications from their order page.
  The restore was checked locally: every table's row count matches the backup and `PRAGMA foreign_key_check` is clean (`test/restore-check.mjs`).

**Tests**: `npm test` — 33 tests (26 earlier + 7 in `test/v4.test.mjs`: reorder at current prices, cancellation rules/stock-once/idempotent/push, rating auth & one-per-order & sanitising, report maths, audit entries for each change type, cart offers + expiry, backup exclusions). `test/migrate-check.mjs` upgrades a v3 database to v4.


## v8 — subscriptions (dev panel = subscription control panel)
- /dev no longer shows or edits any shop's items, categories, offers, orders, settings or customers; "Login as shop", the global Orders tab and per-shop backup are gone (their API endpoints return 404).
- Each shop: trial_end (signup + trial days, default 30), paid_until, optional price_paise override, provisional_until. State is computed on every request (no cron):
  TRIAL → ACTIVE (paid until X) → DUE (last 3 days) → EXPIRED (auto-paused: storefront "दुकान अभी बंद है", orders refused, admin shows only the recharge screen; data kept).
- Dev → Platform: monthly price, billing period (1/3/6/12 months, bill = monthly × months), trial days, UPI ID + payee name.
- Dev → Shops: "बिल बनाओ / Send bill" per shop and "Send bill to all due" → invoice (AD-YYYYMM-NNNN) + Web Push to the shopkeeper + "WhatsApp pe bhejo" wa.me link with a Hindi message, amount and /admin#recharge link.
- Shopkeeper recharge screen: amount, in-browser UPI QR (upi://pay?pa=…&pn=…&am=…&tn=<invoice>), UPI deep-link button, 12-digit UTR + optional screenshot.
  UTR submit → 48 h provisional access (PAYMENT_PENDING_VERIFY); duplicate UTR refused; no new provisional access within 7 days of a rejected payment.
- Dev → Payments: ✅ Verify (invoice paid, paid_until += billed months) / ❌ Reject (shop re-pauses, reason shown to the shopkeeper). Unverified after 48 h → EXPIRED by itself.
- Fully automatic payment confirmation needs a payment gateway (per-payment fee); this design stays free by having the developer verify the UTR.
- Any shop, including shop #1, can be deleted from dev (type the link name). The platform keeps working afterwards (setup screen does not reopen: service_state platform_ready).
- Icons: a shop without its own logo uses the platform logo (uploaded brand icons, else the built-in awning mark); no automatic letter tiles. Static icon URLs carry ?v=8.


## v9 — Cloudflare usage tab + Jarvis Helper (dev only)
- Dev → ☁️ Cloud: today's usage vs free-plan limits (Workers requests both Workers combined 100k/day, D1 rows read 5M/day, written 100k/day, D1 storage 5 GB). Yellow ≥60%, red ≥80% + Hindi "Workers Paid" line. Resets 00:00 UTC (5:30 AM IST).
  Source: Cloudflare GraphQL Analytics (workersInvocationsAdaptive, d1AnalyticsAdaptiveGroups, d1StorageAdaptiveGroups), called server-side, cached 5 min in service_state.cf_usage_cache.
  Token: read-only API token (Account → Account Analytics → Read), pasted in the Cloud tab; stored in server_secrets.cf_token (excluded from backups), only ever returned masked (••••••••last4). Account ID auto-detected via GET /accounts; D1 database ID defaults to the bound DB (var D1_DATABASE_ID).
- Dev → 🤖 Helper: Workers AI (binding AI, model @cf/meta/llama-4-scout-17b-16e-instruct, free daily allocation). Server-side snapshot: shops + subscription states, pending payments, invoices, expected/received money, cached usage, dev-panel help. No items/orders/customers.
  The model may only PROPOSE one of: send_bill, send_bill_all_due, pause_shop, resume_shop, extend, verify_payment, reject_payment. The server validates it into a confirm card {title, effect, method, path, body}; the browser calls the existing dev endpoint only on Confirm. 50 messages/day (service_state ai_used:<UTC day>), Hindi message when hit; AI errors refund the count. Chat lives in page memory only.
- Endpoints: GET/POST /api/dev/cloudflare, GET/POST /api/dev/assistant (dev session + x-requested-with: kirana-dev; shopkeeper → 403). Tests: test/v9.test.mjs. Live check: test/live-v9.mjs.


## v10.4 — 🔔 Notification Center (shopkeeper) + 📢 Notify (dev)
- Shopkeeper `/admin`: 🔔 bell with unread badge in the top bar → panel (newest first, pinned on top): 🧾 Bill, ⏰ Due reminder, 🚀 Update, ✨ New feature, ⚠️ Issue, 💬 Message. Tap = open + mark read; "Mark all read". Bills have "Pay now / Submit UTR" (opens the recharge screen). An open ⚠️ issue shows a banner with "कब तक ठीक होगा" until resolved.
- Dev `/dev` → Dukaanein → 📢 Notify: type, title, message, fix-by (issues), pin; send to chosen shops or ALL; sent list with read counts; ✅ Resolve / 🗑 Delete.
- Send bill / Bill all due → the bill lands in the shop's 🔔 panel + free Web Push. WhatsApp is only an optional "also share" link now. Invoices are created exactly as before.
- ⏰ Due reminders: free Cloudflare Cron Trigger daily 09:00 IST (`[triggers] crons = ["30 3 * * *"]` in wrangler.apnadhanda.toml): ~3 days before, on the last day, and once after expiry; never twice per stage per period. Also generated when the shopkeeper opens the panel (fallback).
- D1: new tables `notices` + `notice_recipients` (migration 9, additive).


## v10.6 — Live Dev panel + Dev alerts (2026-10-25)
- **No manual refresh in /dev.** While the Dev panel is open and visible it calls `GET /api/dev/pulse` every 15 s (one tiny JSON, ~250 bytes: shops total/waiting, payments to verify, orders today, errors, notice reads, unread feed events, a change stamp). When something changes, the open list (Home, Dukaanein, Payments, Notify, Errors) redraws in place — never while you are typing or a popup is open. It also checks on tab focus / when the app comes back to the screen, and stops completely when the tab or app is hidden. The poll is not counted in the hourly metrics (no D1 write per poll).
- **Red badges** on the bottom/side menu: Dukaanein = shops waiting for approval, Payments = UTRs to verify, a dot on Home = unread activity. The browser tab title shows the count too.
- **Toast** at the top: e.g. "🆕 Nayi dukaan: Vijay kirana" — tap it to open the right screen.
- **🔔 Activity feed** on Dev Home: new shop, payment/UTR, plan ending (3 days / today), auto-paused, a shop's first order. Unread dots, "✓ Sab padh liya".
- **🔔 Mujhe alert bhejo** (Home + Settings): free Web Push to the developer's devices (phone, laptop… up to 10) through the Dev app's own service worker (scope /dev). Stored in D1 table `dev_push_subs`; events in `dev_events`. Pushes never contain a mobile number, password, recovery key or UTR.
  - Android: open /dev in Chrome (or the installed Dev app) → Home → switch ON → Allow.
  - iPhone: Safari → Share → Add to Home Screen → open the Dev app from the icon → switch ON → Allow (iOS 16.4+).
- Events: signup (immediately), UTR submitted (immediately), plan ending/auto-paused (daily 09:00 IST cron), first order of a shop (immediately).
- New dev routes: `/api/dev/pulse`, `/api/dev/events`, `/api/dev/events/read`, `/api/dev/push`, `/api/dev/push/subscribe`, `/api/dev/push/unsubscribe`, `/api/dev/push/test` (dev login only).


## v10.7 — 📦 Stock (2026-10-25)
- **📦 Stock tab** in /admin (own tab): every item with its stock and its "kam stock" limit, filters ⚠️ Kam stock / 🚫 Khatam / Sab,
  +5 / +10 / +20 / ✏️ custom per item, tick many → "📦 Stock aaya" (qty per item + optional note) → stock register (date, qty, before → after, note).
  "Dukaan me dikhao" switch: stock can be filled while the item is hidden from customers. Shop default limit (5) + per-item limit.
- **📋 Ready list**: 368 common kirana items (13 categories, Hindi + English, pack sizes, NO prices) in `site/kirana-catalog.js`
  (loaded only when opened). Tick, fill price (MRP/stock optional), "Add all". Items already in the shop are marked and skipped; categories auto-created.
- **📝 List / Excel / PDF import**: parsed in the phone by `site/stock-import.js` (text lines, CSV, .xlsx via the browser's own unzip) and
  `site/pdf-text.js` (text PDFs only; scanned/photo PDFs get an honest message). Always a PREVIEW (edit / untick / category / "already in shop →
  add stock / update price / skip"); nothing saves until "Save".
- **Low-stock alerts**: when an order or a manual edit takes an item to/below its limit → one alert in the 🔔 panel (type "stock") + Web Push
  with "+10 / +20" action buttons (deep link `/admin#restock=<alert>:<qty>`). Once per crossing; re-armed when restocked above the limit.
- Exactly-once: every bulk add / stock-in / one-tap restock carries an idempotency key claimed in the same D1 transaction (`bulk_ops`).
- API: `GET /api/admin/stock`, `GET /api/admin/stock/log`, `POST /api/admin/stock/in|restock|limit|show|bulk`. Migration #11 is additive
  (new tables `stock_log`, `stock_alerts`, `bulk_ops`; new column `variants.low_alerted`).


## v10.10.1 — speed + audit fixes
- CSS/JS listed in `site/_headers` are cached for a year by their `?v=` URL. **Bump `APP_VERSION` and every `?v=` in the HTML on every deploy** (test/v10101 checks the HTML matches APP_VERSION). Files loaded on demand without `?v=` (qr.js, appicon.js, kirana-catalog.js, stock-import.js, pdf-text.js, sw.js) are not pinned.
- Note: header rules for static files belong in `site/_headers`; the Worker's own `cache-control` lines for .css/.js never run, because assets are served before the Worker.
- Platform logo has a small `s256` WebP (made by appicon.js on upload) used for the splash, page header and tab icon.
- /admin and /dev start their state fetch from a `<link rel="preload">` in the HTML; the 3D login decoration loads after the form shows.

## v10.16.2: the shop panel's scripts are built (speed)
`site/admin.js` is the readable source of the shop panel. The page loads `admin-core.js` (first screens) and, on first use / quietly after
the first screen, `admin-more.js` (settings, items, stock, offers, reports, recharge …). Both are generated from admin.js:
**after editing site/admin.js run `npm run build` (node tools/build-admin.mjs)** — `npm test` fails if they are stale, and `npm run deploy`
builds first. Bump `?v=` for admin-core.js in admin.html (it follows APP_VERSION) as usual. See NOTES-10.16.2-speed.md.
