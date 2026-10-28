// Apna Kirana — backend: Cloudflare Worker + D1 (SQLite). Money = integer paise.
// Store details (name, phone, WhatsApp, hours, delivery) are edited from /admin → Settings.
// Nothing secret lives in the browser. The only server constant is the SHA-256 of the
// one-time setup/recovery key held by the operator (the key itself is never in code).
const SETUP_KEY_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000";
const SESSION_DAYS = 7;
// ---- v3: developer (owner) panel ----
// The developer account is separate from the shopkeeper's: its own table, cookie, CSRF header and rate limits.
// Only a PBKDF2 hash of the password and a SHA-256 of the recovery key live here; the secrets are with the developer.
const DEV_SEED = {username:"krish-dev", salt:"00000000000000000000000000000000", hash:"0000000000000000000000000000000000000000000000000000000000000000"};
const DEV_RECOVERY_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000";
const DEV_SESSION_HOURS = 72;
const APP_VERSION = "10.14.0";
const BUILD_TIME = "2026-10-26T18:24Z"; // v10.12.5: stamped by tools/stamp-build.mjs right before each deploy (fallback only)
// v10.12.5: /health "build" = the real upload time of the running version (Cloudflare version metadata, free), else the stamped constant
let RUNTIME_BUILD = null;
function buildTime(){ return RUNTIME_BUILD || BUILD_TIME; }
const PBKDF2_ITER = 100000;

const DEFAULT_SETTINGS = {
  store_name_hi: "अपना किराना स्टोर", store_name_en: "Apna Kirana Store",
  tagline_hi: "गली की अपनी दुकान, अब ऑनलाइन", tagline_en: "Your neighbourhood shop, now online",
  phone: "", whatsapp: "", address: "",
  open_time: "00:00", close_time: "00:00", force_closed: false,
  delivery_pincodes: "", delivery_localities: "",
  delivery_charge_paise: 0, free_delivery_above_paise: 0, min_order_paise: 0,
  delivery_time_hi: "", delivery_time_en: "",
  pay_cod: true, pay_upi_on_delivery: false, upi_id: "",
  announcement_hi: "", announcement_en: "",
  demo_mode: false, logo_image_id: "", show_reviews: false,
  auto_accept: false // v10.13: salon / service — online (home) bookings go straight into the queue when ON; QR walk-ins always do
};

const DEMO_CATS = [
  ["आटा, चावल, दाल","Atta, Rice & Dal","🌾"],["तेल और घी","Oil & Ghee","🛢️"],["मसाले","Masale & Spices","🌶️"],
  ["नमकीन, बिस्किट","Snacks & Biscuits","🍪"],["पेय","Drinks","🥤"],["दूध, दही, ब्रेड","Dairy & Bread","🥛"],
  ["सब्ज़ी","Vegetables","🍅"],["साफ़-सफ़ाई","Cleaning & Care","🧼"]
];
// [catIndex, name_hi, name_en, icon, [[label, price₹, stock], ...]]  — sample rates, no MRP/discount claims
const DEMO_PRODUCTS = [
  [0,"गेहूं आटा","Wheat Atta","🌾",[["5 kg",245,20],["10 kg",480,10]]],
  [0,"बासमती चावल","Basmati Rice","🍚",[["1 kg",110,25]]],
  [0,"अरहर (तूर) दाल","Toor Dal","🫘",[["500 g",80,20],["1 kg",155,15]]],
  [0,"मूंग दाल","Moong Dal","🫛",[["1 kg",130,15]]],
  [0,"चना दाल","Chana Dal","🫘",[["1 kg",95,15]]],
  [0,"बेसन","Besan","🥣",[["500 g",55,20]]],
  [0,"पोहा","Poha","🍚",[["500 g",32,20]]],
  [1,"सरसों तेल","Mustard Oil","🛢️",[["1 L",165,15]]],
  [1,"रिफाइंड सोयाबीन तेल","Refined Soybean Oil","🛢️",[["1 L",130,15]]],
  [1,"देसी घी","Desi Ghee","🧈",[["500 ml",310,8],["1 L",590,5]]],
  [2,"हल्दी पाउडर","Turmeric Powder","🟡",[["100 g",28,30]]],
  [2,"लाल मिर्च पाउडर","Red Chilli Powder","🌶️",[["100 g",38,30]]],
  [2,"धनिया पाउडर","Coriander Powder","🌿",[["100 g",25,30]]],
  [2,"गरम मसाला","Garam Masala","🫙",[["50 g",35,20]]],
  [2,"नमक","Salt","🧂",[["1 kg",25,40]]],
  [2,"चीनी","Sugar","🍬",[["1 kg",44,40]]],
  [2,"चाय पत्ती","Tea Leaves","🍵",[["250 g",125,20]]],
  [3,"भुजिया","Bhujia","🥨",[["200 g",50,20]]],
  [3,"बिस्किट","Biscuits","🍪",[["1 pack",30,40]]],
  [3,"आलू चिप्स","Potato Chips","🥔",[["1 pack",20,40]]],
  [3,"नूडल्स","Instant Noodles","🍜",[["1 pack",14,50],["4 pack",56,20]]],
  [4,"कोल्ड ड्रिंक","Cold Drink","🥤",[["750 ml",40,24]]],
  [4,"पानी की बोतल","Water Bottle","💧",[["1 L",20,48]]],
  [5,"दूध (टोंड)","Toned Milk","🥛",[["500 ml",28,30]]],
  [5,"दही","Curd","🍶",[["400 g",40,15]]],
  [5,"पनीर","Paneer","🧀",[["200 g",85,10]]],
  [5,"अंडे","Eggs","🥚",[["6 pcs",45,20],["12 pcs",88,10]]],
  [5,"ब्रेड","Bread","🍞",[["400 g",40,12]]],
  [6,"प्याज़","Onion","🧅",[["1 kg",40,30]]],
  [6,"आलू","Potato","🥔",[["1 kg",30,30]]],
  [6,"टमाटर","Tomato","🍅",[["1 kg",40,25]]],
  [7,"कपड़े धोने का पाउडर","Detergent Powder","🧺",[["1 kg",110,15]]],
  [7,"बर्तन साफ़ करने की बार","Dishwash Bar","🧽",[["1 pc",10,40]]],
  [7,"नहाने का साबुन","Bath Soap","🧼",[["1 pc",35,30]]],
  [7,"टूथपेस्ट","Toothpaste","🪥",[["150 g",95,15]]]
];

const STATUSES = ["pending","accepted","preparing","ready","out_for_delivery","delivered","rejected","cancelled"];
// v10.8: "ready" (तैयार) sits between preparing and out_for_delivery; every old move still works and delivery may skip Ready.
const TRANSITIONS = {
  pending: ["accepted","rejected","cancelled"],
  accepted: ["preparing","ready","out_for_delivery","cancelled"],
  preparing: ["ready","out_for_delivery","delivered","cancelled"],
  ready: ["out_for_delivery","delivered","cancelled"],
  out_for_delivery: ["delivered","cancelled"],
  delivered: [], rejected: [], cancelled: []
};
const RELEASES_STOCK = new Set(["rejected","cancelled"]);

// ---------- helpers ----------
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const now = () => Date.now();
const CODE_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randCode = (n=6) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => CODE_ALPHA[b % CODE_ALPHA.length]).join("");
async function pbkdf2(password, saltHex){
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h,16)));
  return hex(await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations:PBKDF2_ITER}, key, 256));
}
function safeEq(a,b){ if (typeof a!=="string"||typeof b!=="string"||a.length!==b.length) return false; let r=0; for (let i=0;i<a.length;i++) r|=a.charCodeAt(i)^b.charCodeAt(i); return r===0; }

class HttpError extends Error { constructor(status, code, msg, extra){ super(msg); this.status=status; this.code=code; this.extra=extra; } }
// v9.1: delete confirmation accepts the link name (slug) OR the shop name — trimmed, case-insensitive, inner spaces collapsed.
const normConfirm = v => String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const deleteConfirmOk = (typed, sh) => { const t = normConfirm(typed); return !!t && (t === normConfirm(sh.slug) || t === normConfirm(sh.name)); };
const fail = (status, code, msg, extra) => { throw new HttpError(status, code, msg, extra); };
const withCookies = (res, list) => { for (const c of list) res.headers.append("set-cookie", c); return res; };
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});

const str = (v, max, {required=false, field="field"}={}) => {
  const s = String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"").trim();
  if (required && !s) fail(400,"invalid",`${field} required`);
  if (s.length > max) fail(400,"invalid",`${field} too long (max ${max})`);
  return s;
};
const intIn = (v, min, max, field) => { const n = Number(v); if (!Number.isInteger(n) || n<min || n>max) fail(400,"invalid",`${field} must be a whole number ${min}–${max}`); return n; };
// rupees (string/number, up to 2 decimals) -> integer paise, exact (no float drift)
function toPaise(v, field="price"){
  const s = String(v ?? "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) fail(400,"invalid",`${field}: enter an amount like 45 or 45.50`);
  const [r, p=""] = s.split(".");
  return Number(r)*100 + Number((p+"00").slice(0,2));
}
function normPhone(v){
  let d = String(v ?? "").replace(/\D/g,"");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return d;
}
const bool = v => v === true || v === 1 || v === "1" || v === "true";

// ---------- schema ----------
const MIGRATIONS = [
`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_events (k TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_k ON rate_events(k, at);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name_hi TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '🛍️', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, name_hi TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '🛍️', image_id TEXT, featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS variants (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, label TEXT NOT NULL, sku TEXT UNIQUE, price_paise INTEGER NOT NULL CHECK (price_paise > 0), mrp_paise INTEGER CHECK (mrp_paise IS NULL OR mrp_paise >= price_paise), stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), low_stock INTEGER NOT NULL DEFAULT 3, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS variants_product ON variants(product_id);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL, idem_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, locality TEXT NOT NULL DEFAULT '', pincode TEXT NOT NULL DEFAULT '', landmark TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', payment_method TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'unpaid', subtotal_paise INTEGER NOT NULL, delivery_paise INTEGER NOT NULL, total_paise INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', restock_nonce TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, id);
CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, variant_id INTEGER, product_name TEXT NOT NULL, product_name_en TEXT NOT NULL DEFAULT '', variant_label TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '', unit_price_paise INTEGER NOT NULL, mrp_paise INTEGER, qty INTEGER NOT NULL CHECK (qty > 0), line_total_paise INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, from_status TEXT, to_status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);`,
// v2: Web Push (subscriptions + honest attempt log), server-only secrets (VAPID key), offers
`CREATE TABLE IF NOT EXISTS server_secrets (k TEXT PRIMARY KEY, v TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL CHECK (role IN ('admin','customer')), order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_ok_at INTEGER, fail_count INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS push_sub_unique ON push_subscriptions(role, endpoint, COALESCE(order_id,0));
CREATE INDEX IF NOT EXISTS push_sub_order ON push_subscriptions(order_id);
CREATE TABLE IF NOT EXISTS notification_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL DEFAULT 'webpush', role TEXT NOT NULL, subscription_id INTEGER, order_id INTEGER, event TEXT NOT NULL, push_host TEXT NOT NULL DEFAULT '', http_status INTEGER, outcome TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notif_order ON notification_attempts(order_id, id);
CREATE TABLE IF NOT EXISTS offers (id INTEGER PRIMARY KEY AUTOINCREMENT, title_hi TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '', desc_hi TEXT NOT NULL DEFAULT '', desc_en TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK (kind IN ('info','percent','price')), percent_off INTEGER CHECK (percent_off IS NULL OR (percent_off BETWEEN 1 AND 90)), category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, color TEXT NOT NULL DEFAULT '#c2410c', image_id TEXT, starts_at INTEGER, ends_at INTEGER, active INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS offer_items (id INTEGER PRIMARY KEY AUTOINCREMENT, offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, variant_id INTEGER REFERENCES variants(id) ON DELETE CASCADE, offer_price_paise INTEGER CHECK (offer_price_paise IS NULL OR offer_price_paise > 0));
CREATE INDEX IF NOT EXISTS offer_items_offer ON offer_items(offer_id);
ALTER TABLE order_items ADD COLUMN base_price_paise INTEGER;
ALTER TABLE order_items ADD COLUMN offer_id INTEGER;
ALTER TABLE order_items ADD COLUMN offer_title TEXT NOT NULL DEFAULT ''`,
// v3: developer panel — separate dev accounts/sessions, service (subscription) state + log, error log, hourly metrics
`CREATE TABLE IF NOT EXISTS dev_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS dev_sessions (token_hash TEXT PRIMARY KEY, dev_id INTEGER NOT NULL REFERENCES dev_accounts(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS service_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS service_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, from_status TEXT, to_status TEXT NOT NULL, actor TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS error_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, method TEXT NOT NULL DEFAULT '', route TEXT NOT NULL, status INTEGER, kind TEXT NOT NULL DEFAULT 'exception', message TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS metrics (hour INTEGER NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (hour, k));
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS notif_at ON notification_attempts(at);
INSERT OR IGNORE INTO service_state (k,v) VALUES ('status','active');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('paid_until','');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('grace_days','7');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('dev_contact','')`,
// v4: audit log (SQL triggers record every stock/price/status change; actor+reason come from audit_ctx set inside the same batch),
// ratings, test-order flag, cart-level offers (min purchase discount, free delivery) snapshotted on the order
`CREATE TABLE IF NOT EXISTS audit_ctx (id INTEGER PRIMARY KEY CHECK (id=1), actor TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, product_id INTEGER, label TEXT NOT NULL DEFAULT '', field TEXT NOT NULL, before TEXT, after TEXT, actor TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS audit_product ON audit_log(product_id, id);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at);
CREATE TABLE IF NOT EXISTS order_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
ALTER TABLE orders ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_title TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount_offer_id INTEGER;
ALTER TABLE orders ADD COLUMN free_delivery_offer_id INTEGER;
ALTER TABLE offers ADD COLUMN rule TEXT NOT NULL DEFAULT '';
ALTER TABLE offers ADD COLUMN min_cart_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offers ADD COLUMN amount_off_paise INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET is_test=1 WHERE customer_name LIKE 'TEST%' OR reason LIKE 'Test order%' OR reason LIKE 'Automated%test order%';
CREATE TRIGGER IF NOT EXISTS audit_v_stock AFTER UPDATE OF stock ON variants WHEN OLD.stock IS NOT NEW.stock BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'stock',OLD.stock,NEW.stock,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_price AFTER UPDATE OF price_paise ON variants WHEN OLD.price_paise IS NOT NEW.price_paise BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'price',OLD.price_paise,NEW.price_paise,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_mrp AFTER UPDATE OF mrp_paise ON variants WHEN OLD.mrp_paise IS NOT NEW.mrp_paise BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'mrp',OLD.mrp_paise,NEW.mrp_paise,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_ins AFTER INSERT ON variants BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'stock',NULL,NEW.stock,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'price',NULL,NEW.price_paise,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_del AFTER DELETE ON variants BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',OLD.id,OLD.product_id,OLD.label,'deleted',OLD.stock,NULL,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_o_ins AFTER INSERT ON orders BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'order',NEW.id,NULL,NEW.code,'status',NULL,NEW.status,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_o_status AFTER UPDATE OF status ON orders WHEN OLD.status IS NOT NEW.status BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'order',NEW.id,NULL,NEW.code,'status',OLD.status,NEW.status,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END`,
// v5: MULTI-SHOP. Every shop's data carries shop_id; existing single-shop data becomes shop #1 (owner = the existing admin).
// New columns default to 0 (= no shop) so a row written without a shop is invisible to every shop instead of leaking into shop #1.
`CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner_name TEXT NOT NULL DEFAULT '', mobile TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', paid_until TEXT NOT NULL DEFAULT '', grace_days INTEGER NOT NULL DEFAULT 7, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, approved_at INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_settings (shop_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (shop_id, key));
ALTER TABLE admins ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE admins SET shop_id=1;
ALTER TABLE categories ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE categories SET shop_id=1;
ALTER TABLE products ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE products SET shop_id=1;
ALTER TABLE variants ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE variants SET shop_id=1;
ALTER TABLE orders ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET shop_id=1;
ALTER TABLE images ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE images SET shop_id=1;
ALTER TABLE push_subscriptions ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE push_subscriptions SET shop_id=1;
ALTER TABLE notification_attempts ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE notification_attempts SET shop_id=1;
ALTER TABLE offers ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE offers SET shop_id=1;
ALTER TABLE audit_log ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE audit_log SET shop_id=1;
ALTER TABLE service_log ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0;
UPDATE service_log SET shop_id=1;
ALTER TABLE admins ADD COLUMN mobile TEXT;
ALTER TABLE admins ADD COLUMN recovery_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS admins_mobile ON admins(mobile) WHERE mobile IS NOT NULL;
INSERT OR IGNORE INTO shops (id,slug,name,owner_name,mobile,status,paid_until,grace_days,created_at,approved_at,updated_at) VALUES (1,'mahesh-kirana',
 COALESCE((SELECT json_extract(value,'$') FROM settings WHERE key='store_name_en' AND length(value)>2),'Mahesh Agrawal Kirana Store'), '', '',
 CASE WHEN (SELECT v FROM service_state WHERE k='status')='paused' THEN 'paused' ELSE 'active' END,
 COALESCE((SELECT v FROM service_state WHERE k='paid_until'),''), COALESCE(CAST((SELECT v FROM service_state WHERE k='grace_days') AS INTEGER),7),
 CAST((julianday('now')-2440587.5)*86400000 AS INTEGER), CAST((julianday('now')-2440587.5)*86400000 AS INTEGER), CAST((julianday('now')-2440587.5)*86400000 AS INTEGER));
UPDATE shops SET owner_name='Mahesh Agrawal' WHERE id=1 AND owner_name='' AND name LIKE 'Mahesh Agrawal%';
INSERT OR IGNORE INTO shop_settings (shop_id,key,value) SELECT 1, key, value FROM settings WHERE key NOT IN ('seeded','offers_seeded');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('auto_approve','0');
CREATE INDEX IF NOT EXISTS cat_shop ON categories(shop_id, sort);
CREATE INDEX IF NOT EXISTS prod_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS var_shop ON variants(shop_id);
CREATE INDEX IF NOT EXISTS orders_shop ON orders(shop_id, created_at);
CREATE INDEX IF NOT EXISTS offers_shop ON offers(shop_id);
CREATE INDEX IF NOT EXISTS push_shop ON push_subscriptions(shop_id, role);
CREATE INDEX IF NOT EXISTS audit_shop ON audit_log(shop_id, id);
CREATE INDEX IF NOT EXISTS notif_shop ON notification_attempts(shop_id, at);
CREATE INDEX IF NOT EXISTS admins_shop ON admins(shop_id);
DROP TRIGGER IF EXISTS audit_v_stock;
DROP TRIGGER IF EXISTS audit_v_price;
DROP TRIGGER IF EXISTS audit_v_mrp;
DROP TRIGGER IF EXISTS audit_v_ins;
DROP TRIGGER IF EXISTS audit_v_del;
DROP TRIGGER IF EXISTS audit_o_ins;
DROP TRIGGER IF EXISTS audit_o_status;
CREATE TRIGGER IF NOT EXISTS audit_v_stock AFTER UPDATE OF stock ON variants WHEN OLD.stock IS NOT NEW.stock BEGIN INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (NEW.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'stock',OLD.stock,NEW.stock,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_price AFTER UPDATE OF price_paise ON variants WHEN OLD.price_paise IS NOT NEW.price_paise BEGIN INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (NEW.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'price',OLD.price_paise,NEW.price_paise,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_mrp AFTER UPDATE OF mrp_paise ON variants WHEN OLD.mrp_paise IS NOT NEW.mrp_paise BEGIN INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (NEW.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'mrp',OLD.mrp_paise,NEW.mrp_paise,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_ins AFTER INSERT ON variants BEGIN INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (NEW.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'stock',NULL,NEW.stock,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (NEW.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',NEW.id,NEW.product_id,NEW.label,'price',NULL,NEW.price_paise,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_v_del AFTER DELETE ON variants BEGIN INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (OLD.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'variant',OLD.id,OLD.product_id,OLD.label,'deleted',OLD.stock,NULL,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_o_ins AFTER INSERT ON orders BEGIN INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (NEW.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'order',NEW.id,NULL,NEW.code,'status',NULL,NEW.status,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END;
CREATE TRIGGER IF NOT EXISTS audit_o_status AFTER UPDATE OF status ON orders WHEN OLD.status IS NOT NEW.status BEGIN INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (NEW.shop_id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'order',NEW.id,NULL,NEW.code,'status',OLD.status,NEW.status,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END`,
// v6 "Apna Dhanda": shop online/offline switch (approved shops start OFFLINE until the shopkeeper switches on),
// per-shop home-screen app (name, icons, theme, developer lock) and platform brand settings.
`ALTER TABLE shops ADD COLUMN online INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN app_name TEXT NOT NULL DEFAULT '';
ALTER TABLE shops ADD COLUMN app_icons TEXT NOT NULL DEFAULT '';
ALTER TABLE shops ADD COLUMN app_theme TEXT NOT NULL DEFAULT '';
ALTER TABLE shops ADD COLUMN app_lock INTEGER NOT NULL DEFAULT 0;
UPDATE shops SET online=1 WHERE status IN ('active','grace');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('brand_name','Apna Dhanda');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('brand_icons','')`,
// v7: developer "login as shop" sessions + platform settings (signup on/off, landing text)
`ALTER TABLE sessions ADD COLUMN dev_id INTEGER;
INSERT OR IGNORE INTO service_state (k,v) VALUES ('signup_open','1');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('landing_title','');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('landing_text','')`,
// v8: SUBSCRIPTIONS. Trial (default signup + 10 days) → paid periods. States are computed on every request (no cron).
// Dev "login as shop" and the dev shop editor are gone; any leftover dev-in-shop sessions are dropped.
`ALTER TABLE shops ADD COLUMN trial_end INTEGER;
ALTER TABLE shops ADD COLUMN price_paise INTEGER;
ALTER TABLE shops ADD COLUMN provisional_until INTEGER NOT NULL DEFAULT 0;
UPDATE shops SET trial_end = created_at + 30*86400000 WHERE trial_end IS NULL;
UPDATE shops SET status='active' WHERE status='grace';
CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, number TEXT NOT NULL DEFAULT '', months INTEGER NOT NULL, monthly_paise INTEGER NOT NULL, amount_paise INTEGER NOT NULL, period_start INTEGER NOT NULL, period_end INTEGER NOT NULL, due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'unpaid', created_at INTEGER NOT NULL, created_by TEXT NOT NULL DEFAULT '', sent_at INTEGER, sent_count INTEGER NOT NULL DEFAULT 0, paid_at INTEGER);
CREATE INDEX IF NOT EXISTS invoices_shop ON invoices(shop_id, id);
CREATE TABLE IF NOT EXISTS sub_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, invoice_id INTEGER NOT NULL, utr TEXT NOT NULL, amount_paise INTEGER NOT NULL, screenshot TEXT, status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL DEFAULT '', provisional_until INTEGER NOT NULL DEFAULT 0, submitted_at INTEGER NOT NULL, decided_at INTEGER, decided_by TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS sub_payments_utr ON sub_payments(utr);
CREATE INDEX IF NOT EXISTS sub_payments_status ON sub_payments(status, id);
CREATE TABLE IF NOT EXISTS sub_log (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS sub_log_shop ON sub_log(shop_id, id);
INSERT OR IGNORE INTO service_state (k,v) VALUES ('sub_price_paise','19900');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('sub_months','1');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('trial_days','10');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('upi_id','');
INSERT OR IGNORE INTO service_state (k,v) VALUES ('upi_name','');
DELETE FROM sessions WHERE dev_id IS NOT NULL;
INSERT OR IGNORE INTO service_state (k,v) SELECT 'platform_ready','1' WHERE EXISTS (SELECT 1 FROM admins)`,
// v10.4: shopkeeper NOTIFICATION CENTER. One notice row; one recipient row per shop (each shop's own read state).
// dedupe (UNIQUE) stops repeat reminders/bills: once per stage per period. Purely additive — no existing table changes.
`CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('bill','due','update','feature','issue','message')), title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', fix_by INTEGER, pinned INTEGER NOT NULL DEFAULT 0, resolved_at INTEGER, target TEXT NOT NULL DEFAULT 'shops', invoice_id INTEGER, dedupe TEXT UNIQUE, meta TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notice_recipients (notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE, shop_id INTEGER NOT NULL, read_at INTEGER, PRIMARY KEY (notice_id, shop_id));
CREATE INDEX IF NOT EXISTS notice_rcpt_shop ON notice_recipients(shop_id, notice_id);
CREATE INDEX IF NOT EXISTS notices_created ON notices(created_at)`,
// v10.6: DEV live panel — activity feed for the developer (new shop, UTR to verify, plan expiring / auto-paused, first order) and the
// developer's own Web Push devices (phone + laptop…). Purely additive.
`CREATE TABLE IF NOT EXISTS dev_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '/dev', shop_id INTEGER, dedupe TEXT UNIQUE, created_at INTEGER NOT NULL, read_at INTEGER);
CREATE INDEX IF NOT EXISTS dev_events_unread ON dev_events(read_at);
CREATE TABLE IF NOT EXISTS dev_push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, dev_id INTEGER NOT NULL REFERENCES dev_accounts(id) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_ok_at INTEGER, fail_count INTEGER NOT NULL DEFAULT 0)`,
// v10.7: 📦 STOCK — stock-in register, low-stock alerts (once per crossing, re-armed by a restock above the limit), and exactly-once
// bulk operations (catalog "Add all", list/CSV/Excel/PDF import, stock-in). Purely additive: new tables + one new column with a default.
`ALTER TABLE variants ADD COLUMN low_alerted INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS stock_log (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, variant_id INTEGER NOT NULL, product_id INTEGER, qty INTEGER NOT NULL, before_qty INTEGER, after_qty INTEGER, kind TEXT NOT NULL DEFAULT 'in', note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '', op TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS stock_log_shop ON stock_log(shop_id, id);
CREATE TABLE IF NOT EXISTS stock_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, variant_id INTEGER NOT NULL, product_id INTEGER, name TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL, low_stock INTEGER NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER, cleared_at INTEGER);
CREATE INDEX IF NOT EXISTS stock_alerts_shop ON stock_alerts(shop_id, id);
CREATE TABLE IF NOT EXISTS bulk_ops (shop_id INTEGER NOT NULL, idem TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY (shop_id, idem))`,
// v10.8: order tools — packing checklist (per order), "edit"/"sub" order events, substitute suggestions the customer answers. Additive only.
`ALTER TABLE orders ADD COLUMN packed TEXT NOT NULL DEFAULT '[]';
ALTER TABLE order_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'status';
CREATE TABLE IF NOT EXISTS order_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, order_id INTEGER NOT NULL, item_id INTEGER NOT NULL, from_variant_id INTEGER, from_name TEXT NOT NULL, from_label TEXT NOT NULL DEFAULT '', from_icon TEXT NOT NULL DEFAULT '', from_unit_paise INTEGER NOT NULL, to_variant_id INTEGER NOT NULL, to_name TEXT NOT NULL, to_name_en TEXT NOT NULL DEFAULT '', to_label TEXT NOT NULL DEFAULT '', to_icon TEXT NOT NULL DEFAULT '', to_unit_paise INTEGER NOT NULL CHECK (to_unit_paise > 0), to_mrp_paise INTEGER, qty INTEGER NOT NULL CHECK (qty > 0), status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, answered_at INTEGER, read_at INTEGER);
CREATE INDEX IF NOT EXISTS order_subs_order ON order_subs(order_id);
CREATE INDEX IF NOT EXISTS order_subs_shop ON order_subs(shop_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS order_subs_one_pending ON order_subs(order_id, item_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS orders_shop_upd ON orders(shop_id, updated_at)`,
// v10.8.1: shopkeeper details on the customer page (owner photo + address). Additive only: two new nullable/defaulted columns.
`ALTER TABLE shops ADD COLUMN address TEXT DEFAULT '';
ALTER TABLE shops ADD COLUMN owner_photo_id TEXT`,
// v10.9: 📊 Dukaan wise — shopkeeper login/logout + customer shop visits (no IPs, no phone numbers). Additive only: one new table + index.
`CREATE TABLE IF NOT EXISTS shop_events (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, kind TEXT NOT NULL, ts INTEGER NOT NULL, meta TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS shop_events_shop_ts ON shop_events(shop_id, ts)`,
// v10.11: every shop type. Additive only: one defaulted column, so every existing shop is (and stays) a kirana.
`ALTER TABLE shops ADD COLUMN shop_type TEXT NOT NULL DEFAULT 'kirana';
ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'delivery';
ALTER TABLE orders ADD COLUMN table_no TEXT NOT NULL DEFAULT ''`,
// v10.12: nearby shops + dev directory switch. Additive only: two nullable columns (shop location, set once by the shopkeeper)
// and one defaulted flag (1 = the developer hid the shop from the customer directory). No existing row changes.
`ALTER TABLE shops ADD COLUMN lat REAL;
ALTER TABLE shops ADD COLUMN lng REAL;
ALTER TABLE shops ADD COLUMN dir_hidden INTEGER NOT NULL DEFAULT 0`,
// v10.13: salon / service walk-in token. Additive only: two nullable columns (token number, IST day "YYYY-MM-DD") and one index.
// ONE shared serial per shop per IST day for walk-in + online (Krish 10:34 PM): given in one statement (MAX+1), never reused; the UNIQUE
// partial index makes a duplicate impossible. skipped_at = "⏭ Not here" (stored as the existing 'cancelled' status).
// products.duration_min = minutes a service takes (NULL = 20) for the token page's "~25 min" wait.
// source = 'walkin' (shop QR, ?src=qr) | 'online' (home, /s/ link); queued_at = when it entered the queue (token given).
// near/next_notified_at = the "2 ahead" and "you're next" pushes, each sent at most once per booking. Old orders keep NULL; kirana / restaurant orders never get a token.
`ALTER TABLE orders ADD COLUMN token_no INTEGER;
ALTER TABLE orders ADD COLUMN token_day TEXT;
ALTER TABLE orders ADD COLUMN near_notified_at INTEGER;
ALTER TABLE orders ADD COLUMN next_notified_at INTEGER;
ALTER TABLE orders ADD COLUMN source TEXT;
ALTER TABLE orders ADD COLUMN queued_at INTEGER;
ALTER TABLE products ADD COLUMN duration_min INTEGER;
ALTER TABLE orders ADD COLUMN skipped_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS orders_token_day ON orders(shop_id, token_day, token_no) WHERE token_no IS NOT NULL`,
// v10.14: salon catalogue booking (Krish 26 Oct 11:30 PM). Additive only: two nullable columns on orders. svc_items = the JSON list of
// master-catalogue keys the customer picked (["haircut","beard_trim"]); svc_min = their hidden total minutes for the token ETA.
// Old orders keep NULL; kirana / restaurant orders never set them. shop_service_prices (new table, Krish 11:33 PM) = the shopkeeper's
// own optional price and on/off switch per catalogue item; no row = ON with no price. No existing row or table changes.
`ALTER TABLE orders ADD COLUMN svc_items TEXT;
ALTER TABLE orders ADD COLUMN svc_min INTEGER;
CREATE TABLE IF NOT EXISTS shop_service_prices (shop_id INTEGER NOT NULL, item_key TEXT NOT NULL, price_paise INTEGER CHECK (price_paise IS NULL OR price_paise >= 0), active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER, PRIMARY KEY (shop_id, item_key))`
];
// ---- v10.11: shop types ----
// mode = the flow the type is meant for. "booking" (slots + tokens) is Step 2 and is NOT built yet: until BOOKING_LIVE
// is true every type uses the existing order flow (flow:"order") with its own wording. Step 2 only flips this switch
// and adds the booking screens behind flow === "booking".
const SHOP_TYPES = {
  kirana:     {icon: "🛒", hi: "किराना / जनरल स्टोर", en: "Grocery / Kirana", short_hi: "किराना", short_en: "Grocery", mode: "order",   family: "kirana"},
  restaurant: {icon: "🍽️", hi: "रेस्टोरेंट / होटल (खाना)", en: "Restaurant / Hotel", short_hi: "होटल", short_en: "Hotel", mode: "order", family: "food"},
  salon:      {icon: "💇", hi: "सैलून / पार्लर", en: "Salon / Parlour", short_hi: "सैलून", short_en: "Salon", mode: "booking", family: "service"},
  clinic:     {icon: "🩺", hi: "क्लिनिक / डॉक्टर", en: "Clinic / Doctor", short_hi: "क्लिनिक", short_en: "Clinic", mode: "booking", family: "service"},
  repair:     {icon: "🔧", hi: "रिपेयर / सर्विस", en: "Repair / Service", short_hi: "रिपेयर", short_en: "Repair", mode: "booking", family: "service"},
  other:      {icon: "🏪", hi: "अन्य दुकान", en: "Other", short_hi: "अन्य", short_en: "Other", mode: "booking", family: "service"}
};
const BOOKING_LIVE = false;
const shopTypeKey = t => Object.prototype.hasOwnProperty.call(SHOP_TYPES, t) ? t : "kirana";
const shopMode = t => SHOP_TYPES[shopTypeKey(t)].mode;
const shopFlow = t => BOOKING_LIVE && shopMode(t) === "booking" ? "booking" : "order";
// v10.13: walk-in token — per shop, per IST calendar day, starts at 1 every day.
const istDay = (t = now()) => new Date(t + 19800000).toISOString().slice(0, 10);
const TOKEN_ACTIVE = ["pending","accepted","preparing","ready","out_for_delivery"];
const isServiceType = t => SHOP_TYPES[shopTypeKey(t)].family === "service";
// A salon / service booking (source set): queued = has a token; an online request without a token is "waiting for the salon to accept".
// "Ahead" counts only queued (accepted-into-queue) bookings of the same shop and day with a lower token, waiting or in service.
async function tokenInfo(db, o){
  if (!o || (!o.source && o.token_no == null)) return null;
  if (o.token_no == null || !o.token_day) { const day = istDay(o.created_at);
    return {no: null, day, today: day === istDay(), ahead: null, source: o.source || "online", requested: o.status === "pending", not_accepted: o.status === "rejected"}; }
  const today = istDay(), live = o.token_day === today && TOKEN_ACTIVE.includes(o.status);
  const ahead = live ? (await db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE shop_id=? AND token_day=? AND token_no IS NOT NULL AND token_no<? AND status IN (${TOKEN_ACTIVE.map(() => "?").join(",")})`).bind(db.sid, o.token_day, o.token_no, ...TOKEN_ACTIVE).first()).n : null;
  return {no: o.token_no, day: o.token_day, today: o.token_day === today, ahead, eta_min: live ? await etaMin(db, o) : null, source: o.source || "walkin", requested: false, not_accepted: false};
}
// v10.13: wait estimate = the minutes of every queued booking ahead (service minutes × qty, default 20); one already in the chair counts half.
const DEFAULT_SERVICE_MIN = 20;
// v10.14: the fixed master catalogue of male salon services (Krish 26 Oct 11:30 PM). Every shop_type "salon" offers all of it by
// default; the shopkeeper may write his own price (Krish 11:33 PM, optional) or switch one off, both in shop_service_prices.
// Payment is settled at the shop. min = hidden minutes for the token "~25 min" estimate. clinic / repair / other keep the old product flow.
const SALON_GROUPS = [["hair","💇","बाल","Hair"],["beard","🧔","दाढ़ी","Beard"],["face","🧖","चेहरा","Face"],["massage","💆","मसाज","Massage"],["combo","🎁","कॉम्बो","Combos"]];
const SALON_CATALOG = [
  ["haircut","hair","✂️","हेयर कट","Haircut",20], ["kids_haircut","hair","👦","बच्चों का हेयर कट","Kids haircut",15], ["hair_wash","hair","🚿","हेयर वॉश","Hair wash",10],
  ["hair_styling","hair","💈","हेयर स्टाइलिंग","Hair styling",20], ["hair_colour","hair","🎨","हेयर कलर","Hair colour",45], ["hair_spa","hair","🧴","हेयर स्पा","Hair spa",40],
  ["beard_trim","beard","🧔","दाढ़ी ट्रिम","Beard trim",15], ["shave","beard","🪒","शेव","Shave",15], ["beard_styling","beard","✨","दाढ़ी स्टाइलिंग","Beard styling",20], ["beard_colour","beard","🖌️","दाढ़ी कलर","Beard colour",20],
  ["facial","face","🧖","फ़ेशियल","Facial",30], ["cleanup","face","🫧","क्लीनअप","Cleanup",20], ["de_tan","face","☀️","डी-टैन","De-tan",25], ["threading","face","🧵","थ्रेडिंग","Threading",10],
  ["head_massage","massage","💆","हेड मसाज","Head massage",15], ["face_massage","massage","😌","फ़ेस मसाज","Face massage",15],
  ["haircut_beard","combo","💈","हेयर कट + दाढ़ी","Haircut + Beard",30], ["haircut_shave","combo","🪒","हेयर कट + शेव","Haircut + Shave",30]
].map(([key, group, icon, hi, en, min]) => ({key, group, icon, name_hi: hi, name_en: en, min}));
const SALON_BY_KEY = new Map(SALON_CATALOG.map(s => [s.key, s]));
const isSalonCat = t => t === "salon";
async function salonPrefs(db){ const m = new Map();
  for (const r of (await db.prepare(`SELECT item_key, price_paise, active FROM shop_service_prices WHERE shop_id=?`).bind(db.sid).all()).results) if (SALON_BY_KEY.has(r.item_key)) m.set(r.item_key, r);
  return m; }
// Shop view: every catalogue item with its price (null = not set) and on/off. Public view: groups + the items that are ON, price if set; no minutes.
async function salonCatalogAdmin(db){ const pr = await salonPrefs(db);
  return {groups: SALON_GROUPS.map(([key, icon, hi, en]) => ({key, icon, name_hi: hi, name_en: en})), services: SALON_CATALOG.map(({key, group, icon, name_hi, name_en}) => { const p = pr.get(key); return {key, group, icon, name_hi, name_en, price_paise: p && p.price_paise != null ? p.price_paise : null, on: !p || p.active !== 0}; })}; }
async function salonCatalogPublic(db){ const c = await salonCatalogAdmin(db); return {groups: c.groups, services: c.services.filter(s => s.on).map(({on, ...s}) => s)}; }
async function etaMin(db, o){
  const rows = (await db.prepare(`SELECT o.status AS status, o.svc_min AS svc_min, SUM(COALESCE(oi.qty,1) * COALESCE(p.duration_min, ${DEFAULT_SERVICE_MIN})) AS mins FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN variants v ON v.id=oi.variant_id AND v.shop_id=o.shop_id LEFT JOIN products p ON p.id=v.product_id AND p.shop_id=o.shop_id
    WHERE o.shop_id=? AND o.token_day=? AND o.token_no IS NOT NULL AND o.token_no<? AND o.status IN (${TOKEN_ACTIVE.map(() => "?").join(",")}) GROUP BY o.id`).bind(db.sid, o.token_day, o.token_no, ...TOKEN_ACTIVE).all()).results;
  return Math.round(rows.reduce((a, r) => a + (Number(r.svc_min) || Number(r.mins) || DEFAULT_SERVICE_MIN) * (r.status === "pending" ? 1 : 0.5), 0));
}
const ON_TIME = ["कृपया समय पर पहुँचें; नंबर आने पर आप नहीं मिले तो आपकी बारी छोड़ी जा सकती है।", "Please reach on time; if you're not there when your number comes, your turn may be skipped."];
const SKIP_REASON = "⏭ नंबर आने पर नहीं मिले · Not here when the number came — skipped";
// v10.13 (Krish 10:31 PM): ONE "accepted" push when an online request joins the queue (✅ Accept or auto-accept).
async function notifyAccepted(env, db, o, origin){
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='customer' AND order_id=? AND shop_id=?`).bind(o.id, db.sid).all()).results;
  if (!subs.length) return [];
  const sh = await db.prepare(`SELECT slug, name FROM shops WHERE id=?`).bind(db.sid).first() || {};
  const tk = await tokenInfo(db, o); const eta = tk && tk.eta_min ? `, about ${tk.eta_min} min` : "";
  return pushTo(env, db, subs, "queue:accepted", {role: "customer", title: `✅ बुकिंग स्वीकार · Booking accepted — #${o.token_no}`,
    body: `✅ Your booking at ${sh.name || ""} is accepted. Token #${o.token_no}${eta}. ${ON_TIME[1]} · ${ON_TIME[0]}`.slice(0, 400),
    url: `/track?s=${encodeURIComponent(sh.slug || "")}#open=${o.code}`, tag: "order-" + o.code}, o.id, origin);
}
// v10.13: the salon's ✅ Accept on an online request = it joins today's queue with the next token. Atomic: only a pending, token-less booking.
async function queueOrder(db, id){
  const sh = await db.prepare(`SELECT shop_type FROM shops WHERE id=?`).bind(db.sid).first();
  if (!isServiceType(sh?.shop_type)) fail(400, "not_service", "Only salon / service shops have a queue");
  const o = await db.prepare(`SELECT id, status, token_no FROM orders WHERE id=? AND shop_id=?`).bind(id, db.sid).first();
  if (!o) fail(404, "not_found", "Booking not found");
  if (o.token_no != null) return {already: true, order: await loadOrder(db, "id=?", id)};
  if (o.status !== "pending") fail(409, "stale", "This booking was already updated. Refresh.", {status: o.status});
  const t = now(), day = istDay(t);
  const r = await db.prepare(`UPDATE orders SET token_day=?, token_no=(SELECT COALESCE(MAX(token_no),0)+1 FROM orders WHERE shop_id=? AND token_day=?), queued_at=?, updated_at=? WHERE id=? AND shop_id=? AND status='pending' AND token_no IS NULL`).bind(day, db.sid, day, t, t, id, db.sid).run();
  if (!r.meta?.changes) fail(409, "stale", "This booking was already updated. Refresh.");
  return {already: false, order: await loadOrder(db, "id=?", id)};
}
const shopTypeView = t => { const k = shopTypeKey(t), d = SHOP_TYPES[k]; return {type: k, icon: d.icon, hi: d.hi, en: d.en, short_hi: d.short_hi, short_en: d.short_en, mode: d.mode, family: d.family, flow: shopFlow(k)}; };
// Strict reader for writes: missing = kirana (old app versions), anything else unknown = 400.
function readShopType(v){ if (v === undefined || v === null || v === "") return "kirana"; const k = String(v).trim().toLowerCase(); if (!Object.prototype.hasOwnProperty.call(SHOP_TYPES, k)) fail(400, "invalid_shop_type", "दुकान का प्रकार चुनें · Choose your shop type"); return k; }
// A restaurant starts with food categories (names only, no items, no prices). Kirana and service shops start empty as before.
// Restaurant orders: 🥡 parcel (pick up) · 🛵 delivery · 🍽️ table (eat here, table no. required). Every other type = delivery, as before.
const ORDER_TYPES = ["parcel", "delivery", "table"];
function readOrderType(shopType, b){
  if (shopTypeKey(shopType) !== "restaurant") return {order_type: "delivery", table_no: ""};
  const ot = b.order_type === undefined || b.order_type === null || b.order_type === "" ? "delivery" : String(b.order_type);
  if (!ORDER_TYPES.includes(ot)) fail(400, "invalid_order_type", "पार्सल, डिलीवरी या टेबल चुनें · Choose parcel, delivery or table");
  if (ot !== "table") return {order_type: ot, table_no: ""};
  const tn = String(b.table_no ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,7}$/.test(tn)) fail(400, "invalid_table_no", "टेबल नंबर डालें · Enter the table no.");
  return {order_type: "table", table_no: tn};
}
// v10.12: customer directory (/shops). Only shops that are approved, switched ONLINE, inside their plan and not hidden by the
// developer; "TEST …" shops are never listed. Public fields only: name, link, type, open now, logo, distance (never owner, phone
// or the shop's coordinates). With a customer position the list is sorted by distance (haversine); shops without a location go last.
const haversineKm = (a1, o1, a2, o2) => { const r = x => x * Math.PI / 180, dA = r(a2 - a1), dO = r(o2 - o1);
  const h = Math.sin(dA/2)**2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(dO/2)**2; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))); };
const validLatLng = (la, lo) => Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180 && !(la === 0 && lo === 0);
const isTestShop = name => /^TEST\b/i.test(String(name || ""));
async function publicShopList(db, pos = null, type = null){
  const t = now();
  const rows = (await db.prepare(`SELECT id, slug, name, status, online, paid_until, trial_end, provisional_until, shop_type, lat, lng, app_name, app_icons, app_theme, app_lock FROM shops WHERE status IN ('active','grace') AND online=1 AND dir_hidden=0 ORDER BY id`).all()).results
    .filter(s => !isTestShop(s.name) && subState(s, t).can_operate && (!type || shopTypeKey(s.shop_type) === type));
  const hours = {};
  if (rows.length) { const ids = rows.map(s => Number(s.id));
    for (const r of (await db.prepare(`SELECT shop_id, key, value FROM shop_settings WHERE key IN ('force_closed','open_time','close_time') AND shop_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results) {
      try { (hours[r.shop_id] = hours[r.shop_id] || {})[r.key] = JSON.parse(r.value); } catch {} } }
  const list = rows.map(s => { const hs = {...DEFAULT_SETTINGS, ...(hours[s.id] || {})}; const ap = shopAppView(s);
    const o = {slug: s.slug, name: s.name, type: shopTypeKey(s.shop_type), open: storeStatus(hs, t).open, logo: ap.icon_urls.i192 || null, km: null};
    if (pos && s.lat != null && s.lng != null) o.km = Math.round(haversineKm(pos.lat, pos.lng, Number(s.lat), Number(s.lng)) * 10) / 10;
    return o; });
  if (pos) list.sort((a, b) => (a.km == null) - (b.km == null) || (a.km ?? 0) - (b.km ?? 0) || (b.open - a.open));
  else list.sort((a, b) => (b.open - a.open));
  return list;
}
const fmtKm = km => km == null ? "" : km < 1 ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
const DIR_TYPE_STYLE = {kirana: "grocery", restaurant: "food", salon: "salon", clinic: "clinic", repair: "repair", other: "other"};
const DIR_NAMES = {kirana: ["Grocery","किराना"], restaurant: ["Restaurant","होटल"], salon: ["Salon","सैलून"], clinic: ["Clinic","क्लिनिक"], repair: ["Repair","रिपेयर"], other: ["Other","अन्य"]};
// v10.12.3 privacy (Krish 8:49 PM IST): the first customer screen shows categories only — never a shop name, slug or id.
// A category is "active" when at least one listable shop of that type exists (same rules as the list); otherwise "Coming soon".
// URL key → shop_type. /shops/<key> lists only that type, rendered and filtered on the server.
const DIR_CATS = [
  {key: "grocery", type: "kirana", icon: "🛒", en: "Grocery / Kirana", hi: "किराना / ग्रोसरी", style: "grocery"},
  {key: "restaurant", type: "restaurant", icon: "🍽️", en: "Restaurant / Hotel", hi: "होटल / रेस्टोरेंट", style: "food"},
  {key: "salon", type: "salon", icon: "💇", en: "Salon / Parlour", hi: "सैलून / पार्लर", style: "salon"},
  {key: "clinic", type: "clinic", icon: "🩺", en: "Clinic / Doctor", hi: "क्लिनिक / डॉक्टर", style: "clinic"},
  {key: "repair", type: "repair", icon: "🔧", en: "Repair / Service", hi: "रिपेयर / सर्विस", style: "repair"},
  {key: "other", type: "other", icon: "🏪", en: "Other", hi: "अन्य दुकानें", style: "other"}];
const dirCat = x => DIR_CATS.find(c => c.key === x || c.type === x) || null;
async function publicCategories(db){
  const have = new Set((await publicShopList(db)).map(s => s.type));
  return DIR_CATS.map(c => ({key: c.key, active: have.has(c.type)}));
}
function renderCategoryTiles(cats){
  return cats.map(x => { const c = dirCat(x.key);
    return `<li><a class="cat t-${c.style}${x.active ? "" : " soon"}" href="/shops/${c.key}" data-cat="${c.key}">
      <span class="cat-ic" aria-hidden="true">${c.icon}</span><b data-en="${c.en}" data-hi="${c.hi}">${c.en}</b>
      ${x.active ? `<small class="cat-go" data-en="See shops ›" data-hi="दुकानें देखें ›">See shops ›</small>` : `<small class="cat-soon" data-en="Coming soon" data-hi="जल्द आ रहा है">Coming soon</small>`}</a></li>`; }).join("\n");
}
function renderShopCards(list){
  const H2 = x => H(String(x));
  return list.map(s => { const d = SHOP_TYPES[s.type];
    return `<li class="sc t-${DIR_TYPE_STYLE[s.type]}" data-t="${s.type}" data-n="${H2(s.name.toLowerCase())}"><a href="/s/${H2(s.slug)}">
      <span class="sc-ic" aria-hidden="true">${s.logo ? `<img src="${H2(s.logo)}" alt="" width="48" height="48" loading="lazy" decoding="async">` : d.icon}</span>
      <span class="sc-tx"><b>${H2(s.name)}</b><span class="sc-meta"><em class="sc-badge" data-en="${DIR_NAMES[s.type][0]}" data-hi="${DIR_NAMES[s.type][1]}">${DIR_NAMES[s.type][0]}</em><i class="dot ${s.open ? "on" : "off"}" aria-hidden="true"></i><span class="sc-st" data-en="${s.open ? "Open" : "Closed"}" data-hi="${s.open ? "खुला है" : "बंद है"}">${s.open ? "Open" : "Closed"}</span>${s.km != null ? `<span class="sc-km">📍 ${H2(fmtKm(s.km))}</span>` : ""}</span></span>
      <span class="sc-go" aria-hidden="true">›</span></a></li>`; }).join("\n");
}
const STARTER_CATS = {restaurant: [["थाली","Thali","🍛"],["नाश्ता","Snacks","🥟"],["खाना","Main course","🍲"],["पेय","Drinks","🥤"],["मिठाई","Sweets","🍮"]]};
// v10.13.1 (Krish 26 Oct 11:02 + 11:04 PM): a NEW salon starts with these services preset (name + hidden minutes) but NO price —
// "price shopkeeper set karega". With no price row a service is invisible to customers (the public catalog lists only priced items) and
// cannot be booked; it appears the moment the shopkeeper saves a price. Same list as AK_PROFILE.SALON_DEFAULTS (site/type-profile.js).
// Only the signup of a NEW shop inserts them; existing shops (and a shop-type switch) never get rows inserted.
const SALON_DEFAULTS = [["✂️","हेयर कट","Haircut",20],["🧔","दाढ़ी ट्रिम","Beard trim",15],["🪒","शेव","Shave",15],["🎨","हेयर कलर","Hair colour",45],["🧖","फ़ेशियल","Facial",30],["💆","हेड मसाज","Head massage",15]];
const SVC_STOCK = 100000; // the highest stock productInput accepts = a service is never "out of stock"
const starterSvcStmts = (db, sid, type, t) => type !== "salon" ? [] : SALON_DEFAULTS.slice().reverse().map( // reversed: the panel lists newest first, so Haircut shows on top
  ([icon, hi, en, min]) =>
  db.prepare(`INSERT INTO products (shop_id,category_id,name_hi,name_en,brand,description,icon,image_id,featured,active,is_demo,created_at,updated_at,duration_min) VALUES (?,NULL,?,?,'','',?,NULL,0,1,0,?,?,?)`).bind(sid, hi, en, icon, t, t, min));
const starterCatStmts = (db, sid, type) => (STARTER_CATS[type] || []).map((c, i) => db.prepare(`INSERT INTO categories (shop_id,name_hi,name_en,icon,sort,active,is_demo) VALUES (?,?,?,?,?,1,0)`).bind(sid, c[0], c[1], c[2], i));
// v8: "set up" = the platform has been initialised once (shop #1 may later be deleted by the developer).
const setupDone = async db => (await db.prepare(`SELECT (SELECT COUNT(*) FROM admins WHERE shop_id=1) + (SELECT COUNT(*) FROM service_state WHERE k='platform_ready') AS n`).first()).n > 0;

let migrated = false;
async function migrate(db){
  if (migrated) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)`).run();
  const row = await db.prepare(`SELECT MAX(v) AS v FROM schema_version`).first();
  let v = row?.v ?? 0;
  for (let i = v; i < MIGRATIONS.length; i++) {
    const stmts = MIGRATIONS[i].split(/;\s*\n/).map(s=>s.trim()).filter(Boolean).map(s => db.prepare(s));
    stmts.push(db.prepare(`INSERT INTO schema_version (v) VALUES (?)`).bind(i+1));
    await db.batch(stmts);
  }
  const seeded = await db.prepare(`SELECT value FROM settings WHERE key='seeded'`).first();
  if (!seeded) { await seedDemo(scoped(db, 1), true); await db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded',?)`).bind(String(now())).run(); }
  const os = await db.prepare(`SELECT value FROM settings WHERE key='offers_seeded'`).first();
  if (!os) {
    // One clearly-labelled demo offer, switched OFF. Shown to customers only if the shopkeeper turns it on.
    const eggs = await db.prepare(`SELECT id FROM products WHERE is_demo=1 AND name_en='Eggs' AND shop_id=1 LIMIT 1`).first(); const t = now();
    const st = [db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('offers_seeded',?)`).bind(String(t))];
    if (eggs) {
      st.push(db.prepare(`INSERT INTO offers (shop_id,title_hi,title_en,desc_hi,desc_en,kind,percent_off,color,active,is_demo,created_at,updated_at) VALUES (1,?,?,?,?,'percent',10,'#c2410c',0,1,?,?)`)
        .bind("डेमो ऑफर: अंडों पर 10% छूट","Demo offer: 10% off eggs","यह नमूना ऑफर है — दुकानदार इसे चालू/बंद या बदल सकते हैं","Sample offer — the shopkeeper can switch it on/off or edit it", t, t));
      st.push(db.prepare(`INSERT INTO offer_items (offer_id,product_id) VALUES ((SELECT MAX(id) FROM offers WHERE is_demo=1 AND shop_id=1),?)`).bind(eggs.id));
    }
    await db.batch(st);
  }
  const t0 = now();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO dev_accounts (username,pass_hash,salt,created_at) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM dev_accounts)`).bind(DEV_SEED.username, DEV_SEED.hash, DEV_SEED.salt, t0),
    db.prepare(`INSERT OR IGNORE INTO service_state (k,v) VALUES (?,?)`).bind("first_seen:" + APP_VERSION + "@" + BUILD_TIME, String(t0))
  ]);
  migrated = true;
}
// Per-request database handle bound to ONE shop. Every shop-owned query binds db.sid; a handle without a shop has sid 0 (matches nothing).
function scoped(raw, sid){ raw = raw.raw || raw; return {raw, sid: Number(sid) || 0, prepare: s => raw.prepare(s), batch: a => raw.batch(a)}; }
async function seedDemo(db, withSettings, {products = true, demo = true} = {}){
  const t = now(); const st = []; const sid = db.sid;
  if (withSettings) {
    for (const [k,v] of Object.entries(DEFAULT_SETTINGS)) st.push(db.prepare(`INSERT OR IGNORE INTO shop_settings (shop_id,key,value) VALUES (?,?,?)`).bind(sid, k, JSON.stringify(v)));
  }
  DEMO_CATS.forEach((c,i) => st.push(db.prepare(`INSERT INTO categories (shop_id,name_hi,name_en,icon,sort,active,is_demo) VALUES (?,?,?,?,?,1,?)`).bind(sid,c[0],c[1],c[2],i,demo?1:0)));
  await db.batch(st);
  if (!products) return;
  const cats = (await db.prepare(`SELECT id FROM categories WHERE is_demo=1 AND shop_id=? ORDER BY sort, id`).bind(sid).all()).results;
  const st2 = [];
  DEMO_PRODUCTS.forEach((p,i) => {
    st2.push(db.prepare(`INSERT INTO products (shop_id,category_id,name_hi,name_en,icon,featured,active,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1,?,?)`).bind(sid, cats[p[0]].id, p[1], p[2], p[3], [0,7,23,26,15,29].includes(i)?1:0, t, t+i));
    p[4].forEach((v,j) => st2.push(db.prepare(`INSERT INTO variants (shop_id,product_id,label,price_paise,stock,low_stock,active,sort) VALUES (?,(SELECT id FROM products WHERE is_demo=1 AND name_en=? AND shop_id=? ORDER BY id DESC LIMIT 1),?,?,?,3,1,?)`).bind(sid, p[2], sid, v[0], v[1]*100, v[2], j)));
  });
  await db.batch(st2);
}

async function getSettings(db){
  const rows = (await db.prepare(`SELECT key,value FROM shop_settings WHERE shop_id=?`).bind(db.sid).all()).results;
  const s = {...DEFAULT_SETTINGS};
  for (const r of rows) { if (r.key in DEFAULT_SETTINGS) { try { s[r.key] = JSON.parse(r.value); } catch {} } }
  s.demo_mode = false; // v6: no demo mode any more
  return s;
}
// Store open? (Asia/Kolkata wall clock)
function storeStatus(s, at = now()){
  if (s.force_closed) return {open:false, reason:"closed_today"};
  const ist = new Date(at + 330*60000); const mins = ist.getUTCHours()*60 + ist.getUTCMinutes();
  const toM = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t||""); return m ? Number(m[1])*60+Number(m[2]) : null; };
  const o = toM(s.open_time), c = toM(s.close_time);
  if (o == null || c == null || o === c) return {open:true};
  const open = o < c ? (mins >= o && mins < c) : (mins >= o || mins < c);
  return open ? {open:true} : {open:false, reason:"outside_hours"};
}
const listOf = s => String(s||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
function deliveryFee(s, subtotal){
  if (s.free_delivery_above_paise > 0 && subtotal >= s.free_delivery_above_paise) return 0;
  return Math.max(0, Number(s.delivery_charge_paise)||0);
}
// ---- v4: cart-level offers (server-applied). One best discount (never stacked) + free delivery. Min order is checked on the item subtotal.
function cartQuote(s, subtotal, offers){
  let discount = 0, dOffer = null, freeOffer = null;
  for (const o of offers || []) {
    if (!o.rule || subtotal < (o.min_cart_paise || 0)) continue;
    let d = 0;
    if (o.rule === "cart_flat") d = Math.min(o.amount_off_paise || 0, subtotal);
    else if (o.rule === "cart_percent") { d = Math.round(subtotal * (o.percent_off || 0) / 100); if (o.amount_off_paise > 0) d = Math.min(d, o.amount_off_paise); d = Math.min(d, subtotal); }
    else if (o.rule === "free_delivery") { if (!freeOffer) freeOffer = o; continue; }
    if (d > discount) { discount = d; dOffer = o; }
  }
  const normalFee = deliveryFee(s, subtotal);
  const delivery = freeOffer ? 0 : normalFee;
  return {subtotal, discount, discount_offer: dOffer, delivery, free_offer: freeOffer && normalFee > 0 ? freeOffer : null, total: subtotal - discount + delivery};
}
// ---- v4: audit context — set as the first statement of a batch, cleared as the last; SQL triggers read it.
const ctxSet = (db, actor, reason) => db.prepare(`INSERT OR REPLACE INTO audit_ctx (id,actor,reason) VALUES (1,?,?)`).bind(String(actor||"system").slice(0,40), String(reason||"").slice(0,160));
const ctxClear = db => db.prepare(`DELETE FROM audit_ctx`);
const AUDIT_KEEP_ROWS = 20000, AUDIT_KEEP_DAYS = 400;
async function pruneAudit(db){ await db.prepare(`DELETE FROM audit_log WHERE shop_id=? AND (at < ? OR id <= (SELECT MAX(id) FROM audit_log WHERE shop_id=?) - ?)`).bind(db.sid, now() - AUDIT_KEEP_DAYS*864e5, db.sid, AUDIT_KEEP_ROWS).run(); }
function publicSettings(s){
  const {upi_id, ...rest} = s;
  return {...rest, logo: s.logo_image_id ? `/api/img/${s.logo_image_id}` : null, upi_id: s.pay_upi_on_delivery ? upi_id : "", delivery_pincodes: listOf(s.delivery_pincodes), delivery_localities: listOf(s.delivery_localities), status: storeStatus(s)};
}

// ---------- rate limiting ----------
async function rateCheck(db, key, max, windowMs){
  const since = now() - windowMs;
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM rate_events WHERE k=? AND at>?`).bind(key, since).first();
  return (r?.n ?? 0) < max;
}
const rateHit = (db, key) => db.prepare(`INSERT INTO rate_events (k,at) VALUES (?,?)`).bind(key, now()).run();
// v10.9: 📊 Dukaan wise events. kind = admin_login | admin_logout | cust_visit. meta never holds an IP or a phone number.
const deviceOf = req => /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(req.headers.get("user-agent") || "") ? "mobile" : "desktop";
const shopEvent = (db, shopId, kind, meta = {}, ts = now()) => db.prepare(`INSERT INTO shop_events (shop_id,kind,ts,meta) VALUES (?,?,?,?)`).bind(shopId, kind, ts, JSON.stringify(meta));
const logShopEvent = async (db, shopId, kind, meta) => { try { await shopEvent(db, shopId, kind, meta).run(); } catch (e) { console.error("shop_event", e); } }; // never breaks the login/logout itself
// expired shopkeeper sessions → one "admin_logout" (how: expired) each, at the moment they expired, then the session row is dropped
const expireSessionsSql = [`INSERT INTO shop_events (shop_id,kind,ts,meta) SELECT a.shop_id, 'admin_logout', s.expires_at, '{"how":"expired"}' FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.expires_at < ? AND s.dev_id IS NULL`, `DELETE FROM sessions WHERE expires_at < ?`];
// per-isolate limiter for the public visit beacon (no DB write for rate keeping); the per-shop hourly cap below is the hard bound
const memHits = new Map();
function memRate(key, max, windowMs, at = now()){
  if (memHits.size > 5000) for (const [k, v] of memHits) if (v.at + windowMs < at) memHits.delete(k);
  let e = memHits.get(key); if (!e || e.at + windowMs < at) { e = {at, n: 0}; memHits.set(key, e); }
  return ++e.n <= max;
}
const VISIT_GAP = 30*60000, VISIT_SHOP_HOURLY_CAP = 600;
function visitName(v){ return String(v ?? "").replace(/[0-9०-९]{5,}/g, "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40); }

// ---------- auth ----------
// v10.5: the shopkeeper session cookie only travels to /api/admin (Path-scoped), so customer pages /s/<slug> and /dev never even
// receive it. A path other than "/" is not allowed with the __Host- prefix, so the cookie is __Secure- (host-only: no Domain attribute).
// The old __Host- cookie (Path=/) is still read once and swapped for the new one, so nobody has to log in again.
const COOKIE = "__Secure-ks_admin", COOKIE_PATH = "/api/admin", LEGACY_COOKIE = "__Host-ks_admin";
const cookieVal = (req, name) => { const m = (req.headers.get("cookie")||"").match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})`)); return m ? m[1] : null; };
function cookieOf(req){ return cookieVal(req, COOKIE) || cookieVal(req, LEGACY_COOKIE); }
const clearAdminCookies = () => [`${COOKIE}=; Path=${COOKIE_PATH}; Secure; HttpOnly; SameSite=Strict; Max-Age=0`, `${LEGACY_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`];
async function currentAdmin(db, req){
  const tok = cookieOf(req); if (!tok) return null;
  const row = await db.prepare(`SELECT a.id, a.username, a.must_change, a.shop_id, s.expires_at, s.dev_id, (SELECT username FROM dev_accounts WHERE id=s.dev_id) AS dev, sh.owner_name, sh.name AS shop_name, sh.slug AS shop_slug, sh.status AS shop_status, sh.online AS shop_online, sh.app_name, sh.app_icons, sh.app_theme, sh.app_lock, sh.shop_type, sh.lat AS shop_lat, sh.lng AS shop_lng FROM sessions s JOIN admins a ON a.id=s.admin_id JOIN shops sh ON sh.id=a.shop_id WHERE s.token_hash=?`).bind(await sha256(tok)).first();
  if (row && row.expires_at < now() && !row.dev_id) { // v10.9: session ran out → counted once as a logout (how: expired)
    try { const th = await sha256(tok); await db.batch([db.prepare(`INSERT INTO shop_events (shop_id,kind,ts,meta) SELECT ?, 'admin_logout', expires_at, '{"how":"expired"}' FROM sessions WHERE token_hash=?`).bind(row.shop_id, th), db.prepare(`DELETE FROM sessions WHERE token_hash=?`).bind(th)]); } catch (e) { console.error("expire", e); }
    return null;
  }
  if (!row || row.expires_at < now() || row.dev_id) return null; // v8: no developer-inside-a-shop sessions
  return row;
}
async function newSession(db, adminId, devId = null){
  const tok = randHex(32); const ttl = devId ? 2*3600e3 : SESSION_DAYS*864e5; // a developer's "login as shop" session lasts 2 hours
  await db.prepare(`INSERT INTO sessions (token_hash,admin_id,expires_at,created_at,dev_id) VALUES (?,?,?,?,?)`).bind(await sha256(tok), adminId, now()+ttl, now(), devId).run();
  return `${COOKIE}=${tok}; Path=${COOKIE_PATH}; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.round(ttl/1000)}`;
}
// Who did it: the shopkeeper, or the developer acting inside a shop ("login as shop" or the /dev shop editor)
const actorOf = a => a.dev ? "dev:" + a.dev : "admin:" + a.username;
function checkPassword(p){ if (typeof p!=="string" || p.length < 8 || p.length > 128) fail(400,"weak_password","Password must be 8–128 characters"); return p; }
async function setupKeyOk(key){ return typeof key==="string" && key.length >= 8 && safeEq(await sha256("kirana-setup:"+key), SETUP_KEY_SHA256); }

// ---------- serialisation ----------
async function catalog(db, {admin=false}={}){
  const cats = (await db.prepare(`SELECT * FROM categories WHERE shop_id=? ${admin?"":"AND active=1"} ORDER BY sort, id`).bind(db.sid).all()).results;
  const prods = (await db.prepare(`SELECT * FROM products WHERE shop_id=? ${admin?"":"AND active=1"} ORDER BY featured DESC, updated_at DESC, id DESC`).bind(db.sid).all()).results;
  const vars = (await db.prepare(`SELECT * FROM variants WHERE shop_id=? ${admin?"":"AND active=1"} ORDER BY sort, id`).bind(db.sid).all()).results;
  const byP = {}; const lo = admin ? null : await liveOffers(db); const pr = admin ? null : offerPricer(lo);
  const prodById = new Map(prods.map(p => [p.id, p]));
  for (const v of vars) {
    if (admin) { (byP[v.product_id] ||= []).push(v); continue; }
    const pp = prodById.get(v.product_id); const ep = pp ? pr.price(v, pp) : {price: v.price_paise, offer: null};
    (byP[v.product_id] ||= []).push({id:v.id, label:v.label, price_paise:ep.price, base_price_paise: ep.offer ? v.price_paise : null, offer_id: ep.offer ? ep.offer.id : null, mrp_paise:v.mrp_paise, in_stock: v.stock > 0, few_left: v.stock > 0 && v.stock <= v.low_stock, max_qty: Math.min(v.stock, 20)});
  }
  const activeCat = new Set(cats.map(c=>c.id));
  const pop = new Map();
  if (!admin) for (const r of (await db.prepare(`SELECT v.product_id AS pid, SUM(oi.qty) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN variants v ON v.id=oi.variant_id WHERE o.shop_id=? AND o.status NOT IN ('rejected','cancelled') AND o.is_test=0 AND o.created_at > ? GROUP BY v.product_id`).bind(db.sid, now() - 60*864e5).all()).results) pop.set(r.pid, r.n);
  const products = prods.filter(p => admin || (byP[p.id]?.length && (p.category_id==null || activeCat.has(p.category_id)))).map(p => ({
    id:p.id, category_id:p.category_id, name_hi:p.name_hi, name_en:p.name_en, brand:p.brand, description:p.description, icon:p.icon,
    image: p.image_id ? `/api/img/${p.image_id}` : null, image_id: admin ? p.image_id : undefined, duration_min: admin ? p.duration_min : undefined, featured: !!p.featured, active: !!p.active, is_demo: !!p.is_demo, variants: byP[p.id] || [],
    offer_id: admin ? undefined : (pr.tag(p)?.id ?? null), pop: admin ? undefined : (pop.get(p.id) || 0) }));
  const out = {categories: cats.map(c => ({...c, active: !!c.active, is_demo: !!c.is_demo})), products};
  if (!admin) out.offers = lo.offers.map(o => publicOffer(o, lo.items));
  return out;
}
async function loadOrder(db, where, arg){
  const o = await db.prepare(`SELECT * FROM orders WHERE shop_id=? AND (${where})`).bind(db.sid, arg).first();
  if (!o) return null;
  o.items = (await db.prepare(`SELECT * FROM order_items WHERE order_id=? ORDER BY id`).bind(o.id).all()).results;
  o.events = (await db.prepare(`SELECT from_status,to_status,note,actor,at,kind FROM order_events WHERE order_id=? ORDER BY id`).bind(o.id).all()).results;
  o.subs = (await db.prepare(`SELECT * FROM order_subs WHERE order_id=? AND shop_id=? ORDER BY id`).bind(o.id, db.sid).all()).results; // v10.8
  try { o.packed = JSON.parse(o.packed || "[]"); } catch { o.packed = []; }
  delete o.token_hash; delete o.restock_nonce; delete o.idem_key;
  return o;
}
function customerView(o){
  return {code:o.code, status:o.status, reason:o.reason, created_at:o.created_at, updated_at:o.updated_at, customer_name:o.customer_name,
    phone_masked: o.phone ? "XXXXXX" + o.phone.slice(-4) : "", locality:o.locality, pincode:o.pincode, payment_method:o.payment_method, payment_status:o.payment_status,
    subtotal_paise:o.subtotal_paise, delivery_paise:o.delivery_paise, total_paise:o.total_paise, discount_paise:o.discount_paise || 0, discount_title:o.discount_title || "", free_delivery_offer: !!o.free_delivery_offer_id, order_type: o.order_type || "delivery", table_no: o.table_no || "", token_no: o.token_no ?? null, source: o.source || null, skipped: !!o.skipped_at, salon_booking: !!o.svc_items,
    items:o.items.map(i=>({product_name:i.product_name, product_name_en:i.product_name_en, variant_label:i.variant_label, icon:i.icon, unit_price_paise:i.unit_price_paise, base_price_paise: i.offer_id ? i.base_price_paise : null, offer_title: i.offer_title || "", qty:i.qty, line_total_paise:i.line_total_paise})),
    events:o.events.filter(e => !e.kind || e.kind === "status").map(e=>({to_status:e.to_status, note: e.to_status==="rejected"||e.to_status==="cancelled" ? e.note : "", at:e.at})),
    // v10.8: what the shop changed (qty lowered / item removed / substitute answered) and why, plus open substitute suggestions
    changes: o.events.filter(e => e.kind === "edit" || e.kind === "sub").map(e => ({kind: e.kind, note: e.note, at: e.at})),
    subs: (o.subs || []).filter(s => s.status !== "withdrawn").map(subView)};
}
function subView(s){ return {id: s.id, item_id: s.item_id, status: s.status, qty: s.qty, from: {name: s.from_name, label: s.from_label, icon: s.from_icon, unit_paise: s.from_unit_paise},
  to: {name: s.to_name, name_en: s.to_name_en, label: s.to_label, icon: s.to_icon, unit_paise: s.to_unit_paise}, diff_paise: (s.to_unit_paise - s.from_unit_paise) * s.qty, created_at: s.created_at, answered_at: s.answered_at}; }

// ---------- offers (server is the only place an offer price is applied) ----------
async function liveOffers(db, at = now()){
  const offers = (await db.prepare(`SELECT * FROM offers WHERE shop_id=? AND active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?) ORDER BY sort, id DESC`).bind(db.sid, at, at).all()).results;
  if (!offers.length) return {offers, items: []};
  const items = (await db.prepare(`SELECT * FROM offer_items WHERE offer_id IN (${offers.map(()=>"?").join(",")})`).bind(...offers.map(o=>o.id)).all()).results;
  return {offers, items};
}
// Returns price(v, product) -> {price, base, offer}. Picks the lowest valid offer price; never above the base price.
function offerPricer({offers, items}){
  const byId = new Map(offers.map(o => [o.id, o]));
  const varPrice = new Map(), prodPct = new Map(), tags = new Map();
  for (const it of items) {
    const o = byId.get(it.offer_id); if (!o) continue;
    if (!tags.has(it.product_id)) tags.set(it.product_id, o);
    if (o.kind === "price" && it.variant_id && it.offer_price_paise) (varPrice.get(it.variant_id) || varPrice.set(it.variant_id, []).get(it.variant_id)).push({o, price: it.offer_price_paise});
    if (o.kind === "percent") (prodPct.get(it.product_id) || prodPct.set(it.product_id, []).get(it.product_id)).push(o);
  }
  const catPct = new Map();
  for (const o of offers) if (o.category_id && (o.kind === "percent" || o.kind === "info")) { if (o.kind === "percent") (catPct.get(o.category_id) || catPct.set(o.category_id, []).get(o.category_id)).push(o); }
  const catTag = new Map(); for (const o of offers) if (o.category_id && !catTag.has(o.category_id)) catTag.set(o.category_id, o);
  function price(v, p){
    const base = v.price_paise; let best = {price: base, base, offer: null};
    const cands = [...(varPrice.get(v.id) || [])];
    for (const o of [...(prodPct.get(p.id) || []), ...(p.category_id ? catPct.get(p.category_id) || [] : [])]) cands.push({o, price: Math.max(1, Math.round(base * (100 - o.percent_off) / 100))});
    for (const c of cands) if (c.price > 0 && c.price < best.price) best = {price: c.price, base, offer: c.o};
    return best;
  }
  const tag = p => tags.get(p.id) || (p.category_id ? catTag.get(p.category_id) : null) || null;
  return {price, tag};
}
function publicOffer(o, items){
  return {id:o.id, title_hi:o.title_hi, title_en:o.title_en, desc_hi:o.desc_hi, desc_en:o.desc_en, kind:o.kind, percent_off:o.percent_off,
    category_id:o.category_id, rule:o.rule || "", min_cart_paise:o.min_cart_paise || 0, amount_off_paise:o.amount_off_paise || 0, color:o.color, image: o.image_id ? `/api/img/${o.image_id}` : null, starts_at:o.starts_at, ends_at:o.ends_at, is_demo: !!o.is_demo,
    product_ids: [...new Set(items.filter(i => i.offer_id === o.id).map(i => i.product_id))]};
}
function offerState(o, at = now()){
  if (!o.active) return "off";
  if (o.starts_at && o.starts_at > at) return "scheduled";
  if (o.ends_at && o.ends_at <= at) return "expired";
  return "live";
}
async function saveOffer(db, id, b){
  const CART_RULES = ["cart_flat","cart_percent","free_delivery"];
  const rule = CART_RULES.includes(b.kind) ? b.kind : "";
  const kind = rule ? "info" : ["info","percent","price"].includes(b.kind) ? b.kind : fail(400,"invalid","Choose an offer type");
  const o = {
    title_hi: str(b.title_hi, 80, {required:true, field:"Offer title (Hindi)"}), title_en: str(b.title_en, 80), desc_hi: str(b.desc_hi, 200), desc_en: str(b.desc_en, 200),
    kind, percent_off: kind === "percent" || rule === "cart_percent" ? intIn(b.percent_off, 1, 90, "% off") : null,
    category_id: !rule && b.category_id ? intIn(b.category_id, 1, 1e9, "category") : null,
    rule, min_cart_paise: rule && b.min_cart != null && b.min_cart !== "" ? toPaise(b.min_cart, "Minimum cart value") : 0,
    amount_off_paise: (rule === "cart_flat" || rule === "cart_percent") && b.amount_off != null && b.amount_off !== "" ? toPaise(b.amount_off, rule === "cart_flat" ? "Amount off" : "Maximum discount") : 0,
    color: /^#[0-9a-fA-F]{6}$/.test(b.color || "") ? b.color : "#c2410c",
    image_id: b.image_id ? (/^[a-f0-9]{16,40}$/.test(b.image_id) ? b.image_id : fail(400,"invalid","bad image")) : null,
    starts_at: b.starts_at == null || b.starts_at === "" ? null : intIn(b.starts_at, 0, 9e15, "start"),
    ends_at: b.ends_at == null || b.ends_at === "" ? null : intIn(b.ends_at, 0, 9e15, "end"),
    active: bool(b.active) ? 1 : 0
  };
  if (o.starts_at && o.ends_at && o.ends_at <= o.starts_at) fail(400,"invalid","End date must be after the start date");
  if (rule === "cart_flat" && !(o.amount_off_paise > 0)) fail(400,"invalid","Enter the ₹ amount off");
  if (rule === "cart_flat" && o.min_cart_paise && o.amount_off_paise >= o.min_cart_paise) fail(400,"invalid","Amount off must be less than the minimum cart value");
  if ((rule === "cart_flat" || rule === "cart_percent") && !o.min_cart_paise) fail(400,"invalid","Enter the minimum cart value (e.g. 500)");
  if (o.category_id && !(await db.prepare(`SELECT id FROM categories WHERE id=? AND shop_id=?`).bind(o.category_id, db.sid).first())) fail(400,"invalid","Category not found");
  const pids = rule ? [] : [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(x => intIn(x, 1, 1e9, "product")))].slice(0, 200);
  if (pids.length) { const n = (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE shop_id=? AND id IN (${pids.map(()=>"?").join(",")})`).bind(db.sid, ...pids).first()).n; if (n !== pids.length) fail(400,"invalid","Some linked items no longer exist"); }
  const vprices = [];
  if (kind === "price") {
    for (const x of (Array.isArray(b.variant_prices) ? b.variant_prices : []).slice(0, 300)) {
      if (x == null || x.offer_price == null || x.offer_price === "") continue;
      const vid = intIn(x.variant_id, 1, 1e9, "variant"); const pp = toPaise(x.offer_price, "offer price");
      const v = await db.prepare(`SELECT v.id, v.product_id, v.price_paise, v.label, p.name_hi FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.shop_id=? AND p.shop_id=?`).bind(vid, db.sid, db.sid).first();
      if (!v) fail(400,"invalid","Item size not found");
      if (!(pp > 0 && pp < v.price_paise)) fail(400,"invalid",`Offer price for ${v.name_hi} (${v.label}) must be less than its normal price ₹${v.price_paise/100}`);
      vprices.push({v, pp});
    }
    if (!vprices.length) fail(400,"invalid","Add an offer price for at least one item");
  }
  if (kind === "percent" && !pids.length && !o.category_id) fail(400,"invalid","Pick the items or the category this % off applies to");
  const t = now(); const st = [];
  if (id) {
    const ex = await db.prepare(`SELECT id FROM offers WHERE id=? AND shop_id=?`).bind(id, db.sid).first(); if (!ex) fail(404,"not_found","Offer not found");
    st.push(db.prepare(`UPDATE offers SET title_hi=?,title_en=?,desc_hi=?,desc_en=?,kind=?,percent_off=?,category_id=?,color=?,image_id=?,starts_at=?,ends_at=?,active=?,rule=?,min_cart_paise=?,amount_off_paise=?,is_demo=0,updated_at=? WHERE id=? AND shop_id=?`)
      .bind(o.title_hi,o.title_en,o.desc_hi,o.desc_en,o.kind,o.percent_off,o.category_id,o.color,o.image_id,o.starts_at,o.ends_at,o.active,o.rule,o.min_cart_paise,o.amount_off_paise,t,id,db.sid));
    st.push(db.prepare(`DELETE FROM offer_items WHERE offer_id=?`).bind(id));
  } else {
    st.push(db.prepare(`INSERT INTO offers (shop_id,title_hi,title_en,desc_hi,desc_en,kind,percent_off,category_id,color,image_id,starts_at,ends_at,active,rule,min_cart_paise,amount_off_paise,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`)
      .bind(db.sid,o.title_hi,o.title_en,o.desc_hi,o.desc_en,o.kind,o.percent_off,o.category_id,o.color,o.image_id,o.starts_at,o.ends_at,o.active,o.rule,o.min_cart_paise,o.amount_off_paise,t,t));
  }
  const oid = id ? id : null; const ref = oid ? "?" : `(SELECT MAX(id) FROM offers WHERE shop_id=${Number(db.sid)})`; const refArgs = oid ? [oid] : [];
  const linked = new Set();
  for (const {v, pp} of vprices) { linked.add(v.product_id); st.push(db.prepare(`INSERT INTO offer_items (offer_id,product_id,variant_id,offer_price_paise) VALUES (${ref},?,?,?)`).bind(...refArgs, v.product_id, v.id, pp)); }
  for (const pid of pids) if (!linked.has(pid)) st.push(db.prepare(`INSERT INTO offer_items (offer_id,product_id) VALUES (${ref},?)`).bind(...refArgs, pid));
  await db.batch(st);
  return id || (await db.prepare(`SELECT MAX(id) AS id FROM offers WHERE shop_id=?`).bind(db.sid).first()).id;
}
async function adminOffers(db){
  const offers = (await db.prepare(`SELECT * FROM offers WHERE shop_id=? ORDER BY sort, id DESC`).bind(db.sid).all()).results;
  const items = (await db.prepare(`SELECT oi.*, p.name_hi, p.name_en, v.label, v.price_paise FROM offer_items oi JOIN offers o ON o.id=oi.offer_id JOIN products p ON p.id=oi.product_id LEFT JOIN variants v ON v.id=oi.variant_id WHERE o.shop_id=? ORDER BY oi.id`).bind(db.sid).all()).results;
  return offers.map(o => ({...o, active: !!o.active, is_demo: !!o.is_demo, state: offerState(o), image: o.image_id ? `/api/img/${o.image_id}` : null, items: items.filter(i => i.offer_id === o.id)}));
}

// ---------- Web Push (RFC 8030 + RFC 8291 aes128gcm + RFC 8292 VAPID), WebCrypto only ----------
// The VAPID private key is generated on the server the first time it is needed and kept in D1 (server_secrets);
// no API ever returns it. Only the public key is served (GET /api/push/key).
const b64u = buf => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); };
const unb64u = s => { s = String(s).replace(/-/g,"+").replace(/_/g,"/"); s += "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const cat = (...parts) => { const n = parts.reduce((a,p)=>a+p.length,0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
async function hmac(key, data){ const k = await crypto.subtle.importKey("raw", key, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", k, data)); }
let vapidCache = null;
async function getVapid(db){
  if (vapidCache) return vapidCache;
  let row = await db.prepare(`SELECT v FROM server_secrets WHERE k='vapid'`).first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, true, ["sign","verify"]);
    const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey)); const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    await db.prepare(`INSERT OR IGNORE INTO server_secrets (k,v,created_at) VALUES ('vapid',?,?)`).bind(JSON.stringify({pub, jwk}), now()).run();
    row = await db.prepare(`SELECT v FROM server_secrets WHERE k='vapid'`).first();
  }
  const {pub, jwk} = JSON.parse(row.v);
  const key = await crypto.subtle.importKey("jwk", {kty:jwk.kty, crv:jwk.crv, x:jwk.x, y:jwk.y, d:jwk.d}, {name:"ECDSA", namedCurve:"P-256"}, false, ["sign"]);
  return (vapidCache = {pub, key});
}
async function vapidHeader(vapid, endpoint, subject){
  const aud = new URL(endpoint).origin;
  const h = b64u(enc.encode(JSON.stringify({typ:"JWT", alg:"ES256"})));
  const c = b64u(enc.encode(JSON.stringify({aud, exp: Math.floor(now()/1000) + 12*3600, sub: subject})));
  const sig = await crypto.subtle.sign({name:"ECDSA", hash:"SHA-256"}, vapid.key, enc.encode(h + "." + c)); // IEEE P1363 r||s, as JWS ES256 wants
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${vapid.pub}`;
}
async function encryptPush(plaintext, p256dh, authSecret){
  const uaPub = unb64u(p256dh), auth = unb64u(authSecret);
  const uaKey = await crypto.subtle.importKey("raw", uaPub, {name:"ECDH", namedCurve:"P-256"}, false, []);
  const as = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH", public: uaKey}, as.privateKey, 256));
  const ikm = await hmac(await hmac(auth, ecdh), cat(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv: nonce}, key, cat(plaintext, new Uint8Array([2]))));
  const head = new Uint8Array(21 + asPub.length); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length; head.set(asPub, 21);
  return cat(head, ct);
}
// Push services browsers really use (Chrome/Edge/Firefox/Safari). Anything else is refused, so the server never POSTs to arbitrary URLs.
const PUSH_HOST_RE = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$|^jmt\d+\.google\.com$/;
function parseSubscription(sub, env){
  const ep = str(sub?.endpoint, 1000, {required:true, field:"endpoint"});
  let u; try { u = new URL(ep); } catch { fail(400,"invalid","Bad push endpoint"); }
  const extra = String(env?.PUSH_EXTRA_HOSTS || "").split(",").map(x=>x.trim()).filter(Boolean);
  if (u.protocol !== "https:" || !(PUSH_HOST_RE.test(u.hostname) || extra.includes(u.hostname))) fail(400,"invalid","Unsupported push service");
  const p256dh = str(sub?.keys?.p256dh, 200, {required:true, field:"p256dh"}), auth = str(sub?.keys?.auth, 64, {required:true, field:"auth"});
  let pk, ak; try { pk = unb64u(p256dh); ak = unb64u(auth); } catch { fail(400,"invalid","Bad push keys"); }
  if (pk.length !== 65 || pk[0] !== 4 || ak.length !== 16) fail(400,"invalid","Bad push keys");
  return {endpoint: ep, p256dh, auth};
}
// Sends one push to each matching subscription; logs every attempt honestly. "accepted" = the push service took it (HTTP 201),
// which is NOT proof the phone showed it.
async function pushTo(env, db, subs, event, payload, orderId, subject, table = "push_subscriptions"){
  if (table !== "push_subscriptions" && table !== "dev_push_subs") throw new Error("bad push table");
  const role = payload.role || "customer";
  if (!subs.length) { await db.prepare(`INSERT INTO notification_attempts (shop_id,role,order_id,event,outcome,detail,at) VALUES (?,?,?,?,'no_subscription','',?)`).bind(db.sid, role, orderId, event, now()).run(); return []; }
  const vapid = await getVapid(db); const doFetch = env.PUSH_FETCH || fetch;
  const data = enc.encode(JSON.stringify({title: payload.title, body: payload.body, url: payload.url, tag: payload.tag, ...(payload.actions ? {actions: payload.actions} : {}), at: now()}));
  return Promise.all(subs.map(async sub => {
    let status = null, outcome, detail = "";
    try {
      const bodyBytes = await encryptPush(data, sub.p256dh, sub.auth);
      const r = await doFetch(sub.endpoint, {method:"POST", headers:{"TTL":"86400", "Urgency":"high", "Content-Encoding":"aes128gcm", "Content-Type":"application/octet-stream", "Authorization": await vapidHeader(vapid, sub.endpoint, subject)}, body: bodyBytes});
      status = r.status;
      outcome = r.status >= 200 && r.status < 300 ? "accepted" : (r.status === 404 || r.status === 410) ? "expired" : "rejected";
      if (outcome !== "accepted") detail = (await r.text().catch(()=>"")).slice(0, 200);
    } catch (e) { outcome = "error"; detail = String(e?.message || e).slice(0, 200); }
    const st = [db.prepare(`INSERT INTO notification_attempts (shop_id,role,subscription_id,order_id,event,push_host,http_status,outcome,detail,at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(db.sid, role, sub.id, orderId, event, new URL(sub.endpoint).hostname, status, outcome, detail, now())];
    if (outcome === "expired") st.push(db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(sub.id));
    else if (outcome === "accepted") st.push(db.prepare(`UPDATE ${table} SET last_ok_at=?, fail_count=0 WHERE id=?`).bind(now(), sub.id));
    else st.push(db.prepare(`UPDATE ${table} SET fail_count=fail_count+1 WHERE id=?`).bind(sub.id));
    await db.batch(st);
    return {id: sub.id, status, outcome};
  }));
}
const CUST_MSG = {
  accepted: ["✅ ऑर्डर मंज़ूर हो गया", "दुकान ने आपका ऑर्डर {c} मान लिया है। Order accepted."],
  preparing: ["🧺 ऑर्डर तैयार हो रहा है", "आपका ऑर्डर {c} पैक हो रहा है। Being prepared."],
  ready: ["✅ ऑर्डर तैयार है", "आपका ऑर्डर {c} पैक होकर तैयार है। Ready."],
  out_for_delivery: ["🛵 ऑर्डर रास्ते में है", "आपका ऑर्डर {c} डिलीवरी के लिए निकल गया है। Out for delivery."],
  delivered: ["🏠 ऑर्डर पहुँच गया", "ऑर्डर {c} डिलीवर हो गया। धन्यवाद! Delivered."],
  rejected: ["❌ ऑर्डर नहीं लिया जा सका", "ऑर्डर {c}: {r}"],
  cancelled: ["⚠️ ऑर्डर रद्द हुआ", "ऑर्डर {c}: {r}"]
};
// v10.13: a salon / service customer hears appointment words, not delivery words
const SVC_CUST_MSG = {
  accepted: ["✂️ आपकी बारी — सेवा शुरू", "{c}: आपकी सेवा शुरू हो गई। Your service has started."],
  delivered: ["✅ सेवा पूरी हुई", "{c}: धन्यवाद! Service completed."],
  rejected: ["❌ बुकिंग नहीं ली जा सकी", "{c}: {r}"],
  cancelled: ["⚠️ बुकिंग रद्द हुई", "{c}: {r}"]
};
// v10.13: walk-in queue alerts. After the shopkeeper starts / completes / cancels a booking, today's waiting tokens are re-counted:
// whoever now has exactly 2 ahead gets ONE "leave now" push, whoever is next (0 ahead) gets ONE "you're next" push.
// The flag is claimed atomically before sending, so each alert goes at most once per booking; only a booking with alerts turned on is flagged.
const QUEUE_MSG = {
  near: (shop, no) => ["⏰ आपकी बारी पास है · Your turn is coming soon", `${shop}: आपसे आगे 2 लोग (#${no}) — अब निकलें। Your turn is coming soon at ${shop}, 2 ahead. Please leave now.`],
  next: (shop, no) => ["🔔 अगला नंबर आपका · You're next!", `${shop}: #${no} — अगला नंबर आपका है। You're next at ${shop}!`]
};
async function queuePlan(db, day = istDay()){
  const rows = (await db.prepare(`SELECT id, code, token_no, status, near_notified_at, next_notified_at FROM orders WHERE shop_id=? AND token_day=? AND token_no IS NOT NULL AND status IN (${TOKEN_ACTIVE.map(() => "?").join(",")}) ORDER BY token_no`).bind(db.sid, day, ...TOKEN_ACTIVE).all()).results;
  const plan = [];
  rows.forEach((o, ahead) => { if (o.status !== "pending") return;
    if (ahead === 2 && !o.near_notified_at && !o.next_notified_at) plan.push({o, kind: "near", ahead});
    if (ahead === 0 && !o.next_notified_at) plan.push({o, kind: "next", ahead}); });
  return plan;
}
async function notifyQueue(env, db, origin){
  const sh = await db.prepare(`SELECT slug, name, shop_type FROM shops WHERE id=?`).bind(db.sid).first();
  if (!sh || !isServiceType(sh.shop_type)) return [];
  const sent = [];
  for (const {o, kind} of await queuePlan(db)) {
    const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='customer' AND order_id=? AND shop_id=?`).bind(o.id, db.sid).all()).results;
    if (!subs.length) continue; // alerts off: nothing sent and no flag, so turning alerts on later still works
    const col = kind === "near" ? "near_notified_at" : "next_notified_at";
    const r = await db.prepare(`UPDATE orders SET ${col}=? WHERE id=? AND shop_id=? AND ${col} IS NULL`).bind(now(), o.id, db.sid).run();
    if (!r.meta?.changes) continue;
    const m = QUEUE_MSG[kind](sh.name, o.token_no);
    await pushTo(env, db, subs, "queue:" + kind, {role: "customer", title: m[0], body: m[1].slice(0, 200), url: `/track?s=${encodeURIComponent(sh.slug || "")}#open=${o.code}`, tag: "queue-" + o.code}, o.id, origin);
    sent.push({code: o.code, kind});
  }
  return sent;
}
async function notifyCustomer(env, db, order, origin){
  const svcShop = order.token_no != null;
  const m = (svcShop && SVC_CUST_MSG[order.status]) || CUST_MSG[order.status]; if (!m) return [];
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='customer' AND order_id=? AND shop_id=?`).bind(order.id, db.sid).all()).results;
  return pushTo(env, db, subs, "status:" + order.status, {role:"customer", title: m[0], body: m[1].replace("{c}", order.code).replace("{r}", order.reason || "—"), url: (db.sid === 1 ? "/track" : `/track?s=${encodeURIComponent((await db.prepare(`SELECT slug FROM shops WHERE id=?`).bind(db.sid).first())?.slug || "")}`) + `#open=${order.code}`, tag: "order-" + order.code}, order.id, origin);
}
async function notifyAdmins(env, db, order, origin){
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(db.sid).all()).results;
  const n = order.items.reduce((a,i)=>a+i.qty, 0);
  // v10.14: a salon catalogue booking has no money — the alert names the services instead of a ₹ total
  if (order.svc_items) return pushTo(env, db, subs, "new_order", {role:"admin", title: `📅 ${order.token_no == null ? "नई बुकिंग रिक्वेस्ट" : "नई बुकिंग"} — ${order.customer_name}${order.token_no != null ? ` · #${order.token_no}` : ""}`.slice(0, 120), body: `✂️ ${order.items.map(i => i.product_name).join(", ")}`.slice(0, 160), url: "/admin", tag: "new-" + order.code}, order.id, origin);
  // v10.9: a tap opens this order's 🧾 bill in /admin (order ID + total in the title, customer name in the text)
  return pushTo(env, db, subs, "new_order", {role:"admin", title: `नया ऑर्डर आया — ${order.code}, ₹${(order.total_paise/100).toLocaleString("en-IN")}${order.order_type === "table" ? ` · 🍽️ टेबल ${order.table_no}` : order.order_type === "parcel" ? " · 🥡 पार्सल" : ""}`, body: `👤 ${order.customer_name} · ${n} सामान · 🧾 बिल देखने के लिए टैप करें`.slice(0, 160), url: `/admin#bill=${order.id}`, tag: "new-" + order.code}, order.id, origin);
}
async function notifyAdminsCancelled(env, db, order, origin){
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(db.sid).all()).results;
  return pushTo(env, db, subs, "customer_cancelled", {role:"admin", title: `ग्राहक ने ऑर्डर रद्द किया — ${order.code}`, body: `${order.customer_name} · ₹${(order.total_paise/100).toLocaleString("en-IN")} · स्टॉक वापस जुड़ गया`.slice(0, 160), url: `/admin#order=${order.id}`, tag: "cancel-" + order.code}, order.id, origin);
}
// ---------- v4: reorder at CURRENT prices (never the old snapshot) ----------
async function reorderItems(db, orderId){
  const its = (await db.prepare(`SELECT variant_id, product_name, product_name_en, variant_label, icon, unit_price_paise, qty FROM order_items WHERE order_id=? ORDER BY id`).bind(orderId).all()).results;
  const pricer = offerPricer(await liveOffers(db)); const out = [];
  for (const i of its) {
    const r = i.variant_id ? await db.prepare(`SELECT v.*, p.category_id, p.active AS p_active, c.active AS c_active FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE v.id=? AND v.shop_id=?`).bind(i.variant_id, db.sid).first() : null;
    const base = {variant_id: i.variant_id, name: i.product_name, name_en: i.product_name_en, label: i.variant_label, icon: i.icon, was_paise: i.unit_price_paise, wanted: i.qty};
    if (!r || !r.active || !r.p_active || r.c_active === 0) { out.push({...base, available:false, problem:"unavailable"}); continue; }
    if (r.stock <= 0) { out.push({...base, available:false, problem:"out_of_stock"}); continue; }
    const price = pricer.price(r, {id: r.product_id, category_id: r.category_id}).price;
    const qty = Math.min(i.qty, r.stock, 50);
    out.push({...base, available:true, qty, price_paise: price, problem: qty < i.qty ? "less_stock" : null});
  }
  return out;
}
async function publicReviews(db){
  const agg = await db.prepare(`SELECT COUNT(*) AS n, AVG(r.stars) AS avg FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0 AND o.shop_id=?`).bind(db.sid).first();
  const recent = (await db.prepare(`SELECT r.stars, r.comment, r.created_at, o.customer_name FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0 AND o.shop_id=? AND r.comment != '' ORDER BY r.id DESC LIMIT 6`).bind(db.sid).all()).results;
  return {count: agg.n, avg: agg.n ? Math.round(agg.avg * 10) / 10 : null, recent: recent.map(x => ({stars: x.stars, comment: x.comment, at: x.created_at, name: String(x.customer_name || "").trim().split(/\s+/)[0].slice(0, 20)}))};
}
// ---------- v4: reports (only DELIVERED orders count as value; test orders excluded; IST days) ----------
const DAY = 864e5, IST = 330*60000;
const istDayStart = t => Math.floor((t + IST) / DAY) * DAY - IST;
function reportRange(sp, at = now()){
  const r = sp.get("range") || "7d"; const today = istDayStart(at);
  if (r === "today") return {range:r, from: today, to: today + DAY};
  if (r === "30d") return {range:r, from: today - 29*DAY, to: today + DAY};
  if (r === "custom") {
    const d = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2]-1, +m[3]) - IST : null; };
    const f = d(sp.get("from")), t = d(sp.get("to"));
    if (f == null || t == null) fail(400,"invalid","Pick a start and end date");
    if (t < f) fail(400,"invalid","End date must be on or after the start date");
    if (t - f > 366*DAY) fail(400,"invalid","Pick at most one year");
    return {range:r, from: f, to: t + DAY};
  }
  return {range:"7d", from: today - 6*DAY, to: today + DAY};
}
async function reports(db, from, to){
  const SID = Number(db.sid) || 0; const W = `o.shop_id=${SID} AND o.is_test=0 AND o.created_at>=? AND o.created_at<?`;
  const counts = Object.fromEntries((await db.prepare(`SELECT status, COUNT(*) AS n FROM orders o WHERE ${W} GROUP BY status`).bind(from, to).all()).results.map(x => [x.status, x.n]));
  const dv = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS value, COALESCE(SUM(subtotal_paise),0) AS items, COALESCE(SUM(discount_paise),0) AS discount, COALESCE(SUM(delivery_paise),0) AS delivery FROM orders o WHERE ${W} AND status='delivered'`).bind(from, to).first();
  const pay = (await db.prepare(`SELECT payment_method AS method, COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS value FROM orders o WHERE ${W} AND status='delivered' GROUP BY payment_method`).bind(from, to).all()).results;
  const best = (await db.prepare(`SELECT COALESCE(v.product_id, 0) AS product_id, MAX(oi.product_name) AS name, MAX(oi.product_name_en) AS name_en, MAX(oi.icon) AS icon, SUM(oi.qty) AS qty, SUM(oi.line_total_paise) AS value FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN variants v ON v.id=oi.variant_id WHERE ${W} AND o.status='delivered' GROUP BY COALESCE(CAST(v.product_id AS TEXT), 'n:' || oi.product_name) ORDER BY qty DESC, value DESC LIMIT 10`).bind(from, to).all()).results;
  const slow = (await db.prepare(`SELECT p.id AS product_id, p.name_hi AS name, p.name_en, p.icon, COALESCE(s.qty,0) AS qty, (SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=p.id AND active=1 AND shop_id=${SID}) AS stock FROM products p LEFT JOIN (SELECT v.product_id, SUM(oi.qty) AS qty FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN variants v ON v.id=oi.variant_id WHERE ${W} AND o.status='delivered' GROUP BY v.product_id) s ON s.product_id=p.id WHERE p.active=1 AND p.shop_id=${SID} ORDER BY qty ASC, stock DESC, p.name_hi LIMIT 10`).bind(from, to).all()).results;
  const dayRows = (await db.prepare(`SELECT CAST((o.created_at + ${IST}) / ${DAY} AS INTEGER) AS d, COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS value FROM orders o WHERE ${W} AND status='delivered' GROUP BY d`).bind(from, to).all()).results;
  const days = []; for (let t = from; t < to && days.length < 370; t += DAY) { const d = Math.floor((t + IST) / DAY); const r = dayRows.find(x => x.d === d); days.push({day: new Date(d * DAY).toISOString().slice(0,10), n: r ? r.n : 0, value: r ? r.value : 0}); }
  const tests = (await db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE o.shop_id=${SID} AND o.is_test=1 AND o.created_at>=? AND o.created_at<?`).bind(from, to).first()).n;
  return {from, to, counts, delivered: {orders: dv.n, value_paise: dv.value, items_paise: dv.items, discount_paise: dv.discount, delivery_paise: dv.delivery, avg_order_paise: dv.n ? Math.round(dv.value / dv.n) : 0},
    cancelled: counts.cancelled || 0, rejected: counts.rejected || 0, open: (counts.pending||0)+(counts.accepted||0)+(counts.preparing||0)+(counts.ready||0)+(counts.out_for_delivery||0),
    payment: pay, best_sellers: best, slow_moving: slow, days, test_orders_excluded: tests,
    note: "Order value of delivered orders (what customers paid), not profit. Test orders are excluded."};
}
function reportsCSV(r){
  const d = ms => new Date(ms + IST).toISOString().slice(0,10); const rs = x => (x/100).toFixed(2); const out = [];
  out.push(["Report","From","To (inclusive)"].map(csvCell).join(","), ["Delivered orders — order value, not profit", d(r.from), d(r.to - 1)].map(csvCell).join(","), "");
  out.push("metric,value");
  for (const [k, v] of [["delivered_orders", r.delivered.orders], ["delivered_order_value_rs", rs(r.delivered.value_paise)], ["average_order_value_rs", rs(r.delivered.avg_order_paise)], ["discounts_given_rs", rs(r.delivered.discount_paise)], ["delivery_charges_rs", rs(r.delivered.delivery_paise)], ["cancelled_orders", r.cancelled], ["rejected_orders", r.rejected], ["open_orders", r.open]]) out.push(`${k},${v}`);
  for (const pm of r.payment) out.push(`${pm.method}_orders,${pm.n}`, `${pm.method}_value_rs,${rs(pm.value)}`);
  out.push("", "day,delivered_orders,delivered_value_rs"); for (const x of r.days) out.push(`${x.day},${x.n},${rs(x.value)}`);
  out.push("", "best_sellers,qty,value_rs"); for (const b of r.best_sellers) out.push([b.name, b.qty, rs(b.value)].map(csvCell).join(","));
  out.push("", "slow_moving,qty_sold,stock_now"); for (const b of r.slow_moving) out.push([b.name, b.qty, b.stock].map(csvCell).join(","));
  return "\ufeff" + out.join("\n");
}
// ---------- v4: full backup (no passwords, sessions, server keys, push endpoints or rate-limit rows) ----------
const BACKUP_TABLES = ["schema_version","settings","categories","products","variants","images","offers","offer_items","orders","order_items","order_events","order_ratings","audit_log","service_state","service_log","notification_attempts","error_log","metrics"];
const BACKUP_EXCLUDED = ["admins","sessions","dev_accounts","dev_sessions","server_secrets","push_subscriptions","rate_events","audit_ctx"];
// Per-shop backup (shopkeeper): only that shop's rows. Full backup (developer, shopId == null): every table below + shops.
const SHOP_BACKUP = {
  shops: "id=?", shop_settings: "shop_id=?", categories: "shop_id=?", products: "shop_id=?", variants: "shop_id=?", images: "shop_id=?", offers: "shop_id=?",
  offer_items: "offer_id IN (SELECT id FROM offers WHERE shop_id=?)", orders: "shop_id=?", order_items: "order_id IN (SELECT id FROM orders WHERE shop_id=?)",
  order_events: "order_id IN (SELECT id FROM orders WHERE shop_id=?)", order_ratings: "order_id IN (SELECT id FROM orders WHERE shop_id=?)", order_subs: "shop_id=?", audit_log: "shop_id=?", notification_attempts: "shop_id=?", shop_service_prices: "shop_id=?"
};
async function backup(db, actor, shopId = null){
  const tables = {};
  if (shopId != null) {
    for (const [t, where] of Object.entries(SHOP_BACKUP)) tables[t] = (await db.prepare(`SELECT * FROM ${t} WHERE ${where}`).bind(shopId).all()).results;
  } else {
    for (const t of [...BACKUP_TABLES, "shops", "shop_settings"]) { try { tables[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).results; } catch { tables[t] = []; } }
  }
  const at = now(); const sfx = shopId != null ? ":" + shopId : "";
  const st = []; for (const s of new Set(["", sfx])) st.push(db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES (?,?)`).bind("last_backup_at" + s, String(at)), db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES (?,?)`).bind("last_backup_by" + s, actor));
  await db.batch(st);
  return {format: "kirana-backup", format_version: shopId != null ? 2 : 1, scope: shopId != null ? {shop_id: shopId} : "all_shops", app_version: APP_VERSION, created_at: at, created_at_iso: new Date(at).toISOString(), created_by: actor,
    excluded_tables: BACKUP_EXCLUDED, note: "Restore steps: README → Backup & restore. Logins are not in the backup; use the recovery keys after a restore.", tables};
}
const backupResponse = data => new Response(JSON.stringify(data), {headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="kirana-backup-${new Date(data.created_at + IST).toISOString().slice(0,16).replace(/[:T]/g,"-")}.json"`,"cache-control":"no-store","x-content-type-options":"nosniff"}});
// In production the push runs after the response (ctx.waitUntil); in tests (no ctx) it is awaited.
async function later(ctx, fn){ const p = Promise.resolve().then(fn).catch(e => { console.error("push", e); return logError(null, {route:"background:push", kind:"background", message: errText(e)}); }); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p; }
// v10.6: one developer event → the dev panel's 🔔 activity feed (+ free Web Push to every dev device). Deduped by key; never throws
// into the request that caused it (a signup / UTR must succeed even if the feed or the push fails). Push text carries no secrets:
// shop name, owner name, amount — never a mobile number, password, recovery key, UTR or token.
const DEV_EV_ICON = {signup:"🆕", utr:"💰", expiring:"⏰", expired:"⛔", first_order:"🎉", test:"🔔"};
async function devEvent(env, raw, ctx, ev, origin = "", quiet = false){
  try {
    raw = raw.raw || raw;
    const row = await raw.prepare(`INSERT OR IGNORE INTO dev_events (kind,title,body,label,url,shop_id,dedupe,created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(ev.kind, String(ev.title).slice(0, 140), String(ev.body || "").slice(0, 240), String(ev.label || "").slice(0, 80), ev.url || "/dev", ev.shop_id ?? null, ev.dedupe ?? null, now()).first();
    if (!row) return null;
    if (ev.push !== false && !quiet) await later(ctx, () => pushDev(env, raw, {...ev, id: row.id}, origin || String(env?.PUBLIC_ORIGIN || "")));
    return row.id;
  } catch (e) { console.error("dev event", e); try { await logError(raw, {route: "background:dev-event", kind: "background", message: errText(e)}); } catch {} return null; }
}
async function pushDev(env, raw, ev, origin){
  const subs = (await raw.prepare(`SELECT * FROM dev_push_subs`).all()).results;
  if (!subs.length) return []; // no dev device has alerts on: the event still sits in the panel's 🔔 feed
  return pushTo(env, scoped(raw, 0), subs, "dev:" + ev.kind, {role: "dev", title: ev.title, body: ev.body || "", url: ev.url || "/dev", tag: "dev-" + ev.kind + "-" + (ev.id || now())}, null, origin, "dev_push_subs");
}
async function orderByToken(db, code, token){
  if (!/^AK-[A-Z0-9]{6}$/.test(code || "") || !/^[a-f0-9]{48}$/.test(token || "")) return null;
  const o = await db.prepare(`SELECT id, token_hash, shop_id FROM orders WHERE code=?`).bind(code).first();
  return o && safeEq(await sha256(token), o.token_hash) ? o : null;
}

// ---------- order creation ----------
async function createOrder(db, req, body){
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const idem = str(body.idempotency_key, 64, {required:true, field:"idempotency_key"});
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(idem)) fail(400,"invalid","bad idempotency_key");
  const existing = await db.prepare(`SELECT code FROM orders WHERE idem_key=? AND shop_id=?`).bind(idem, db.sid).first();
  if (existing) return {duplicate:true, order: customerView(await loadOrder(db,"code=?",existing.code)), token:null};
  // Service paused by the developer (e.g. maintenance payment lapsed): no new orders, enforced here on the server.
  if (!canOrder((await service(db)).status) || !(await db.prepare(`SELECT online FROM shops WHERE id=?`).bind(db.sid).first())?.online) { await bump(db, ["blocked"]); const ss = await getSettings(db); fail(423,"service_paused","Online ordering is temporarily unavailable — please contact the shop", {phone: ss.phone || ""}); }
  if (!(await rateCheck(db, "order:"+ip, 8, 10*60000))) fail(429,"rate_limited","Too many orders from this connection. Please wait a few minutes.");

  const s = await getSettings(db);
  const st = storeStatus(s); if (!st.open) fail(409,"store_closed","Store is closed right now", {reason: st.reason});
  const name = str(body.name, 60, {required:true, field:"name"});
  // v10.11: restaurant order type. Parcel / table orders need no address, skip the delivery-area check and pay no delivery fee.
  const shopType = (await db.prepare(`SELECT shop_type FROM shops WHERE id=?`).bind(db.sid).first())?.shop_type;
  // v10.14: salon catalogue booking — the customer ticks master-catalogue services and gives a NAME only (Krish 11:31 PM). No mobile,
  // no address, no payment; mobile is kept if a client still sends one. Old salon clients that send items[] keep the old path below.
  if (isSalonCat(shopType) && Array.isArray(body.services)) return createSalonBooking(db, ip, idem, s, st, name, body);
  const phone = normPhone(body.phone); if (!phone) fail(400,"invalid_phone","Enter a valid 10-digit mobile number");
  const ot = readOrderType(shopType, body);
  // v10.13: salon / service = walk-in booking. No address, no delivery-area check, no delivery fee; the order gets today's token.
  const svc = isServiceType(shopType);
  const deliver = !svc && ot.order_type === "delivery";
  // v10.13 (Krish 10:27 PM): a QR walk-in goes straight into the queue; an online (home) booking waits for the salon's ✅ Accept unless auto-accept is ON
  const source = svc ? (body.source === "walkin" ? "walkin" : "online") : null;
  const address = deliver ? str(body.address, 300, {required:true, field:"address"}) : str(body.address, 300);
  const locality = deliver ? str(body.locality, 80) : ""; const pincode = deliver ? str(body.pincode, 6) : ""; const landmark = deliver ? str(body.landmark, 120) : ""; const instructions = str(body.instructions, 300);
  if (pincode && !/^\d{6}$/.test(pincode)) fail(400,"invalid","PIN code must be 6 digits");
  const pins = deliver ? listOf(s.delivery_pincodes) : [], locs = deliver ? listOf(s.delivery_localities) : [];
  if (pins.length && !pins.includes(pincode)) fail(409,"outside_area","We don't deliver to this PIN code yet", {pincodes:pins});
  if (!pins.length && locs.length && !locs.some(l => l.toLowerCase() === locality.toLowerCase())) fail(409,"outside_area","We don't deliver to this area yet", {localities:locs});
  const pm = body.payment_method === "upi_on_delivery" ? "upi_on_delivery" : "cod";
  if (pm === "cod" && !s.pay_cod) fail(400,"invalid","Cash on delivery is not available");
  if (pm === "upi_on_delivery" && !s.pay_upi_on_delivery) fail(400,"invalid","UPI on delivery is not available");

  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length) fail(400,"empty_cart","Cart is empty");
  if (lines.length > 60) fail(400,"invalid","Too many items");
  const merged = new Map();
  for (const l of lines) { const id = intIn(l.variant_id, 1, 1e9, "variant_id"); const q = intIn(l.qty, 1, 50, "qty"); const m = merged.get(id) || {qty:0, seen_price:null}; m.qty += q; if (l.price_paise != null) m.seen_price = Number(l.price_paise); merged.set(id, m); }
  const ids = [...merged.keys()];
  const rows = (await db.prepare(`SELECT v.*, p.name_hi, p.name_en, p.icon, p.category_id, p.active AS p_active, c.active AS c_active FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE v.shop_id=? AND p.shop_id=? AND v.id IN (${ids.map(()=>"?").join(",")})`).bind(db.sid, db.sid, ...ids).all()).results;
  const byId = new Map(rows.map(r => [r.id, r]));
  const lo = await liveOffers(db); const pricer = offerPricer(lo); // offers re-checked now: an expired offer no longer applies
  const problems = []; let subtotal = 0; const items = [];
  for (const [id, {qty, seen_price}] of merged) {
    const r = byId.get(id);
    if (!r || !r.active || !r.p_active || r.c_active === 0) { problems.push({variant_id:id, problem:"unavailable"}); continue; }
    if (r.stock < qty) { problems.push({variant_id:id, problem:"stock", available:r.stock}); continue; }
    const ep = pricer.price(r, {id: r.product_id, category_id: r.category_id});
    if (seen_price != null && seen_price !== ep.price) problems.push({variant_id:id, problem:"price_changed", price_paise:ep.price, was_paise:seen_price});
    items.push({r, qty, ep}); subtotal += ep.price * qty;
  }
  if (problems.length) fail(409,"cart_changed","Some items changed. Please review your cart.", {problems});
  if (s.min_order_paise > 0 && subtotal < s.min_order_paise) fail(409,"below_minimum","Minimum order not reached", {min_order_paise:s.min_order_paise});
  const cq = cartQuote(s, subtotal, lo.offers); // min-purchase discount + free-delivery offers, applied here only
  const delivery = deliver ? cq.delivery : 0, discount = cq.discount;
  const total = subtotal - discount + delivery;
  const queued = svc && (source === "walkin" || !!s.auto_accept);
  const isTest = /^TEST\b/.test(name) ? 1 : 0; // test orders ("TEST – …") are kept out of reports
  const token = randHex(24); const code = "AK-" + randCode(6); const t = now();

  const stmts = [ctxSet(db, "customer", `order ${code} placed — stock reserved`)];
  for (const {r, qty} of items) stmts.push(db.prepare(`UPDATE variants SET stock = stock - ? WHERE id=? AND shop_id=?`).bind(qty, r.id, db.sid)); // CHECK(stock>=0) aborts the whole batch on oversell
  stmts.push(db.prepare(`INSERT INTO orders (shop_id,code,token_hash,idem_key,status,customer_name,phone,address,locality,pincode,landmark,instructions,payment_method,subtotal_paise,delivery_paise,total_paise,discount_paise,discount_title,discount_offer_id,free_delivery_offer_id,is_test,created_at,updated_at,order_type,table_no,source,queued_at,token_day,token_no) VALUES (?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${queued ? "(SELECT COALESCE(MAX(token_no),0)+1 FROM orders WHERE shop_id=? AND token_day=?)" : "NULL"})`)
    .bind(db.sid, code, await sha256(token), idem, name, phone, address, locality, pincode, landmark, instructions, pm, subtotal, delivery, total, discount, cq.discount_offer ? cq.discount_offer.title_hi : "", cq.discount_offer ? cq.discount_offer.id : null, deliver && cq.free_offer ? cq.free_offer.id : null, isTest, t, t, ot.order_type, ot.table_no, source, queued ? t : null, queued ? istDay(t) : null, ...(queued ? [db.sid, istDay(t)] : [])));
  for (const {r, qty, ep} of items) stmts.push(db.prepare(`INSERT INTO order_items (order_id,variant_id,product_name,product_name_en,variant_label,icon,unit_price_paise,mrp_paise,qty,line_total_paise,base_price_paise,offer_id,offer_title) VALUES ((SELECT id FROM orders WHERE code=?),?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(code, r.id, r.name_hi, r.name_en, r.label, r.icon, ep.price, r.mrp_paise, qty, ep.price*qty, r.price_paise, ep.offer ? ep.offer.id : null, ep.offer ? ep.offer.title_hi : ""));
  stmts.push(db.prepare(`INSERT INTO order_events (order_id,from_status,to_status,note,actor,at) VALUES ((SELECT id FROM orders WHERE code=?),NULL,'pending','','customer',?)`).bind(code, t));
  stmts.push(ctxClear(db));
  try { await db.batch(stmts); }
  catch (e) {
    const m = String(e?.message || e);
    if (/UNIQUE/i.test(m) && /idem_key/i.test(m)) { const ex = await db.prepare(`SELECT code FROM orders WHERE idem_key=? AND shop_id=?`).bind(idem, db.sid).first(); if (ex) return {duplicate:true, order: customerView(await loadOrder(db,"code=?",ex.code)), token:null}; }
    if (/CHECK/i.test(m)) fail(409,"cart_changed","Some items just went out of stock. Please review your cart.", {problems:[{problem:"stock"}]});
    throw e;
  }
  await rateHit(db, "order:"+ip);
  const full = await loadOrder(db,"code=?",code);
  return {duplicate:false, order: customerView(full), token, _full: full};
}

// v10.14: salon catalogue booking (Krish 26 Oct 11:30–11:33 PM). The order references catalogue items (orders.svc_items JSON + one
// order_items line per service with variant_id NULL, so every existing order screen lists the names). No stock, no offers, no payment:
// total stays 0 and each line carries the shop's own price if he set one (shown on the card, never charged here). Token rules unchanged:
// a QR walk-in is queued at once; an online request waits for ✅ Accept unless auto-accept is ON.
async function createSalonBooking(db, ip, idem, s, st, name, body){
  const keys = [...new Set(body.services.map(k => String(k || "")))];
  if (!keys.length) fail(400, "empty_cart", "कोई सेवा चुनें · Pick at least one service");
  if (keys.length > 12) fail(400, "invalid", "Too many services");
  const pr = await salonPrefs(db);
  const bad = keys.filter(k => !SALON_BY_KEY.has(k) || (pr.get(k) && pr.get(k).active === 0));
  if (bad.length) fail(409, "cart_changed", "कुछ सेवा अभी उपलब्ध नहीं · Some services are not available right now", {problems: bad.map(k => ({key: k, problem: "unavailable"}))});
  const items = keys.map(k => { const c = SALON_BY_KEY.get(k), p = pr.get(k); return {c, price: p && p.price_paise != null ? p.price_paise : 0}; });
  const phone = body.phone ? (normPhone(body.phone) || "") : "";
  const instructions = str(body.instructions, 300);
  const source = body.source === "walkin" ? "walkin" : "online";
  const queued = source === "walkin" || !!s.auto_accept;
  const mins = items.reduce((a, i) => a + i.c.min, 0);
  const isTest = /^TEST\b/.test(name) ? 1 : 0;
  const token = randHex(24); const code = "AK-" + randCode(6); const t = now();
  const stmts = [ctxSet(db, "customer", `booking ${code} requested`)];
  stmts.push(db.prepare(`INSERT INTO orders (shop_id,code,token_hash,idem_key,status,customer_name,phone,address,locality,pincode,landmark,instructions,payment_method,subtotal_paise,delivery_paise,total_paise,discount_paise,discount_title,discount_offer_id,free_delivery_offer_id,is_test,created_at,updated_at,order_type,table_no,source,queued_at,token_day,token_no,svc_items,svc_min) VALUES (?,?,?,?,'pending',?,?,'','','','',?,'cod',0,0,0,0,'',NULL,NULL,?,?,?,'delivery','',?,?,?,${queued ? "(SELECT COALESCE(MAX(token_no),0)+1 FROM orders WHERE shop_id=? AND token_day=?)" : "NULL"},?,?)`)
    .bind(db.sid, code, await sha256(token), idem, name, phone, instructions, isTest, t, t, source, queued ? t : null, queued ? istDay(t) : null, ...(queued ? [db.sid, istDay(t)] : []), JSON.stringify(keys), mins));
  for (const {c, price} of items) stmts.push(db.prepare(`INSERT INTO order_items (order_id,variant_id,product_name,product_name_en,variant_label,icon,unit_price_paise,mrp_paise,qty,line_total_paise,base_price_paise,offer_id,offer_title) VALUES ((SELECT id FROM orders WHERE code=?),NULL,?,?,'',?,?,NULL,1,0,?,NULL,'')`)
    .bind(code, c.name_hi, c.name_en, c.icon, price, price));
  stmts.push(db.prepare(`INSERT INTO order_events (order_id,from_status,to_status,note,actor,at) VALUES ((SELECT id FROM orders WHERE code=?),NULL,'pending','','customer',?)`).bind(code, t));
  stmts.push(ctxClear(db));
  try { await db.batch(stmts); }
  catch (e) {
    const m = String(e?.message || e);
    if (/UNIQUE/i.test(m) && /idem_key/i.test(m)) { const ex = await db.prepare(`SELECT code FROM orders WHERE idem_key=? AND shop_id=?`).bind(idem, db.sid).first(); if (ex) return {duplicate:true, order: customerView(await loadOrder(db,"code=?",ex.code)), token:null}; }
    throw e;
  }
  await rateHit(db, "order:"+ip);
  const full = await loadOrder(db,"code=?",code);
  return {duplicate:false, order: customerView(full), token, _full: full};
}

// ---------- order status ----------
async function transition(db, id, to, expectedFrom, reason, actor){
  if (!STATUSES.includes(to)) fail(400,"invalid","Unknown status");
  const o = await db.prepare(`SELECT id,status,code,source,token_no FROM orders WHERE id=? AND shop_id=?`).bind(id, db.sid).first();
  if (!o) fail(404,"not_found","Order not found");
  const from = expectedFrom || o.status;
  // v10.13: an online salon request must be ✅ accepted into the queue (token) before ✂️ Start service
  if (o.source && o.token_no == null && from === "pending" && to === "accepted") fail(409, "not_queued", "पहले बुकिंग स्वीकार करें · Accept the booking first");
  if (from !== o.status) fail(409,"stale","This order was already updated. Refresh.", {status:o.status});
  // v10.13: a salon / service shop finishes in one tap — "In Service" (accepted) → "Completed" (delivered). Same stored statuses; kirana/food unchanged.
  const svcDone = from === "accepted" && to === "delivered" && SHOP_TYPES[shopTypeKey((await db.prepare(`SELECT shop_type FROM shops WHERE id=?`).bind(db.sid).first() || {}).shop_type)].family === "service";
  if (!TRANSITIONS[from].includes(to) && !svcDone) fail(409,"bad_transition",`Cannot move from ${from} to ${to}`);
  if ((to === "rejected" || to === "cancelled") && !reason) fail(400,"reason_required","Please give a reason");
  const nonce = randHex(12); const t = now();
  const stmts = [ctxSet(db, actor, RELEASES_STOCK.has(to) ? `order ${o.code} ${to} — stock released` : `order ${o.code}`), db.prepare(`UPDATE orders SET status=?, reason=CASE WHEN ? != '' THEN ? ELSE reason END, restock_nonce=?, updated_at=?, payment_status=CASE WHEN ?='delivered' THEN 'collected_on_delivery' ELSE payment_status END WHERE id=? AND status=? AND shop_id=?`).bind(to, reason, reason, nonce, t, to, id, from, db.sid)];
  if (RELEASES_STOCK.has(to)) stmts.push(db.prepare(`UPDATE variants SET stock = stock + (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id=? AND variant_id=variants.id) WHERE shop_id=? AND id IN (SELECT variant_id FROM order_items WHERE order_id=?) AND EXISTS (SELECT 1 FROM orders WHERE id=? AND restock_nonce=? AND shop_id=?)`).bind(id, db.sid, id, id, nonce, db.sid));
  stmts.push(db.prepare(`INSERT INTO order_events (order_id,from_status,to_status,note,actor,at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND restock_nonce=?)`).bind(id, from, to, reason, actor, t, id, nonce));
  stmts.push(ctxClear(db));
  const res = await db.batch(stmts);
  if (!res[1]?.meta?.changes) { const cur = await db.prepare(`SELECT status FROM orders WHERE id=?`).bind(id).first(); fail(409,"stale","This order was already updated. Refresh.", {status:cur?.status}); }
  return loadOrder(db, "id=?", id);
}

// ---------- products ----------
function productInput(b){
  const p = {
    name_hi: str(b.name_hi, 80, {required:true, field:"Hindi name"}), name_en: str(b.name_en, 80), brand: str(b.brand, 60), description: str(b.description, 500),
    icon: str(b.icon, 16) || "🛍️", image_id: b.image_id ? str(b.image_id, 40) : null, featured: bool(b.featured)?1:0, active: b.active===undefined ? 1 : (bool(b.active)?1:0),
    category_id: b.category_id ? intIn(b.category_id, 1, 1e9, "category") : null
  };
  if (p.image_id && !/^[a-f0-9]{16,40}$/.test(p.image_id)) fail(400,"invalid","bad image");
  const vs = Array.isArray(b.variants) ? b.variants : [];
  if (!vs.length) fail(400,"invalid","Add at least one pack size / price");
  if (vs.length > 12) fail(400,"invalid","Too many pack sizes");
  p.variants = vs.map((v,i) => {
    const price = toPaise(v.price, "Price"); const mrp = (v.mrp === "" || v.mrp == null) ? null : toPaise(v.mrp, "MRP");
    if (price <= 0) fail(400,"invalid","Price must be more than 0");
    if (mrp != null && mrp < price) fail(400,"invalid","MRP cannot be less than selling price");
    return { id: v.id ? intIn(v.id,1,1e9,"variant") : null, label: str(v.label, 40, {required:true, field:"Pack size"}), sku: str(v.sku, 40) || null,
      price_paise: price, mrp_paise: mrp, stock: intIn(v.stock ?? 0, 0, 100000, "Stock"), low_stock: intIn(v.low_stock ?? 3, 0, 10000, "Low-stock alert"), active: v.active===undefined?1:(bool(v.active)?1:0), sort:i };
  });
  return p;
}
async function saveProduct(db, id, b, actor = "admin", reason = "item edited"){
  const p = productInput(b); const t = now();
  // v10.13.1: a salon / service has no stock — every variant is always available (kirana / restaurant unchanged)
  if (isServiceType((await db.prepare(`SELECT shop_type FROM shops WHERE id=?`).bind(db.sid).first())?.shop_type)) for (const v of p.variants) { v.stock = SVC_STOCK; v.mrp_paise = null; }
  if (p.category_id) { const c = await db.prepare(`SELECT id FROM categories WHERE id=? AND shop_id=?`).bind(p.category_id, db.sid).first(); if (!c) fail(400,"invalid","Category not found"); }
  if (!id) {
    const r = await db.prepare(`INSERT INTO products (shop_id,category_id,name_hi,name_en,brand,description,icon,image_id,featured,active,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?) RETURNING id`)
      .bind(db.sid,p.category_id,p.name_hi,p.name_en,p.brand,p.description,p.icon,p.image_id,p.featured,p.active,t,t).first();
    id = r.id;
  } else {
    const ex = await db.prepare(`SELECT id FROM products WHERE id=? AND shop_id=?`).bind(id, db.sid).first(); if (!ex) fail(404,"not_found","Product not found");
  }
  const existing = (await db.prepare(`SELECT id FROM variants WHERE product_id=? AND shop_id=?`).bind(id, db.sid).all()).results.map(r=>r.id);
  const keep = new Set(p.variants.filter(v=>v.id && existing.includes(v.id)).map(v=>v.id));
  const st = [ctxSet(db, actor, reason), db.prepare(`UPDATE products SET category_id=?,name_hi=?,name_en=?,brand=?,description=?,icon=?,image_id=?,featured=?,active=?,is_demo=0,updated_at=? WHERE id=? AND shop_id=?`).bind(p.category_id,p.name_hi,p.name_en,p.brand,p.description,p.icon,p.image_id,p.featured,p.active,t,id,db.sid)];
  for (const vid of existing) if (!keep.has(vid)) st.push(db.prepare(`DELETE FROM variants WHERE id=? AND shop_id=?`).bind(vid, db.sid));
  for (const v of p.variants) {
    if (v.id && keep.has(v.id)) st.push(db.prepare(`UPDATE variants SET label=?,sku=?,price_paise=?,mrp_paise=?,stock=?,low_stock=?,active=?,sort=? WHERE id=? AND product_id=? AND shop_id=?`).bind(v.label,v.sku,v.price_paise,v.mrp_paise,v.stock,v.low_stock,v.active,v.sort,v.id,id,db.sid));
    else st.push(db.prepare(`INSERT INTO variants (shop_id,product_id,label,sku,price_paise,mrp_paise,stock,low_stock,active,sort) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(db.sid,id,v.label,v.sku,v.price_paise,v.mrp_paise,v.stock,v.low_stock,v.active,v.sort));
  }
  // v10.13: salon / service minutes (5–600, empty = default 20) for the walk-in wait estimate
  if ("duration_min" in b) { const d = b.duration_min === "" || b.duration_min == null ? null : intIn(b.duration_min, 5, 600, "minutes"); st.push(db.prepare(`UPDATE products SET duration_min=? WHERE id=? AND shop_id=?`).bind(d, id, db.sid)); }
  st.push(ctxClear(db));
  try { await db.batch(st); } catch (e) { if (/UNIQUE/i.test(String(e.message))) fail(409,"duplicate_sku","That SKU is already in use — choose a different SKU"); throw e; }
  return id;
}

// ---------- CSV ----------
const CSV_COLS = ["category_hi","category_en","name_hi","name_en","brand","pack_size","sku","price","mrp","stock","low_stock","featured","active"];
function parseCSV(text){
  const rows = []; let row = [], f = "", q = false;
  for (let i=0;i<text.length;i++){ const c=text[i];
    if (q) { if (c==='"') { if (text[i+1]==='"') { f+='"'; i++; } else q=false; } else f+=c; }
    else if (c==='"') q=true; else if (c===',') { row.push(f); f=""; } else if (c==='\n' || c==='\r') { if (c==='\r' && text[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=""; } else f+=c; }
  if (f!=="" || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()!==""));
}
const csvCell = v => { const s = String(v ?? ""); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g,'""')}"` : safe; };
async function exportCSV(db){
  const rows = (await db.prepare(`SELECT c.name_hi AS category_hi, c.name_en AS category_en, p.name_hi, p.name_en, p.brand, v.label AS pack_size, v.sku, v.price_paise, v.mrp_paise, v.stock, v.low_stock, p.featured, (p.active AND v.active) AS active FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE v.shop_id=? AND p.shop_id=? ORDER BY c.sort, p.id, v.sort`).bind(db.sid, db.sid).all()).results;
  const out = [CSV_COLS.join(",")];
  for (const r of rows) out.push([r.category_hi, r.category_en, r.name_hi, r.name_en, r.brand, r.pack_size, r.sku, (r.price_paise/100).toFixed(2), r.mrp_paise==null?"":(r.mrp_paise/100).toFixed(2), r.stock, r.low_stock, r.featured?1:0, r.active?1:0].map(csvCell).join(","));
  return "\ufeff" + out.join("\n");
}
async function importCSV(db, text, dryRun){
  const rows = parseCSV(String(text||"").replace(/^\ufeff/,""));
  if (rows.length < 2) fail(400,"invalid","CSV has no data rows");
  const head = rows[0].map(h=>h.trim().toLowerCase());
  for (const c of ["name_hi","pack_size","price"]) if (!head.includes(c)) fail(400,"invalid",`CSV header must include ${c}`);
  if (rows.length > 1001) fail(400,"invalid","Max 1000 rows per import");
  const errors = []; const groups = new Map();
  rows.slice(1).forEach((r, i) => {
    const o = Object.fromEntries(head.map((h,j)=>[h,(r[j]??"").trim().replace(/^'(?=[=+\-@])/,"")]));
    try {
      const v = { label: str(o.pack_size,40,{required:true,field:"pack_size"}), sku: str(o.sku,40)||null, price: o.price, mrp: o.mrp||null, stock: o.stock===""||o.stock==null?0:Number(o.stock), low_stock: o.low_stock===""||o.low_stock==null?3:Number(o.low_stock), active: o.active===""||o.active==null?1:bool(o.active)?1:0 };
      const p = { name_hi: str(o.name_hi,80,{required:true,field:"name_hi"}), name_en: str(o.name_en,80), brand: str(o.brand,60), featured: bool(o.featured), cat_hi: str(o.category_hi,60), cat_en: str(o.category_en,60) };
      productInput({name_hi:p.name_hi, variants:[v]}); // validates money/stock
      const key = (p.name_hi+"|"+p.brand).toLowerCase();
      const g = groups.get(key) || {...p, variants:[]}; g.variants.push(v); groups.set(key, g);
    } catch (e) { errors.push({row:i+2, error: e.message}); }
  });
  if (errors.length || dryRun) return {ok: !errors.length, errors, products: groups.size, rows: rows.length-1, applied:false};
  const cats = (await db.prepare(`SELECT id,name_hi,name_en FROM categories WHERE shop_id=?`).bind(db.sid).all()).results;
  let created = 0, updated = 0;
  for (const g of groups.values()) {
    let cat = cats.find(c => (g.cat_hi && c.name_hi===g.cat_hi) || (g.cat_en && c.name_en.toLowerCase()===g.cat_en.toLowerCase()));
    if (!cat && (g.cat_hi || g.cat_en)) { const r = await db.prepare(`INSERT INTO categories (shop_id,name_hi,name_en,icon,sort) VALUES (?,?,?,?,?) RETURNING id,name_hi,name_en`).bind(db.sid, g.cat_hi||g.cat_en, g.cat_en, "🛍️", cats.length).first(); cats.push(r); cat = r; }
    const ex = await db.prepare(`SELECT id FROM products WHERE name_hi=? AND brand=? AND shop_id=? ORDER BY id LIMIT 1`).bind(g.name_hi, g.brand, db.sid).first();
    const exVars = ex ? (await db.prepare(`SELECT * FROM variants WHERE product_id=? AND shop_id=?`).bind(ex.id, db.sid).all()).results : [];
    const variants = g.variants.map(v => { const m = exVars.find(x => (v.sku && x.sku===v.sku) || x.label===v.label); return {...v, id: m?.id}; });
    for (const x of exVars) if (!variants.some(v=>v.id===x.id)) variants.push({id:x.id, label:x.label, sku:x.sku, price:(x.price_paise/100).toFixed(2), mrp:x.mrp_paise==null?null:(x.mrp_paise/100).toFixed(2), stock:x.stock, low_stock:x.low_stock, active:x.active});
    const prev = ex ? await db.prepare(`SELECT * FROM products WHERE id=? AND shop_id=?`).bind(ex.id, db.sid).first() : null;
    await saveProduct(db, ex?.id || null, {name_hi:g.name_hi, name_en:g.name_en||prev?.name_en, brand:g.brand, description:prev?.description, icon:prev?.icon||"🛍️", image_id:prev?.image_id, featured:g.featured, active:1, category_id:cat?.id||prev?.category_id||null, variants}, "admin", "CSV import");
    ex ? updated++ : created++;
  }
  return {ok:true, errors:[], created, updated, applied:true};
}

// ---------- router ----------
async function body(req){
  const ct = req.headers.get("content-type")||"";
  if (!ct.includes("application/json")) fail(415,"bad_content_type","JSON expected");
  const t = await req.text(); if (t.length > 900000) fail(413,"too_large","Request too large");
  try { return JSON.parse(t || "{}"); } catch { fail(400,"bad_json","Invalid JSON"); }
}

// Customer requests name their shop with the X-Shop header (or ?shop=); none = shop #1 (old links / cached pages keep working).
async function shopBySlug(raw, slug){
  slug = String(slug || "").trim().toLowerCase();
  if (!slug) return raw.prepare(`SELECT * FROM shops WHERE id=1`).first();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  return raw.prepare(`SELECT * FROM shops WHERE slug=?`).bind(slug).first();
}
const shopPublic = sh => ({id: sh.id, slug: sh.slug, name: sh.name, status: sh.status, online: !!sh.online, type: shopTypeKey(sh.shop_type), type_info: shopTypeView(sh.shop_type)});
// v10.8.1: "🏪 Dukaan ki jaankari" on /s/<slug> — exactly these four public fields, nothing else about the shopkeeper.
const OWNER_PHOTO_MAX = 30 * 1024;
const shopInfoAdmin = sh => sh ? ({...shopOwnerPublic(sh), owner_photo_id: sh.owner_photo_id || ""}) : null;
const shopOwnerPublic = sh => ({owner_name: sh.owner_name || "", mobile: sh.mobile || "", address: sh.address || "", photo: sh.owner_photo_id ? `/api/img/${sh.owner_photo_id}` : null});
// ---- v6: home-screen app (PWA) per shop + platform brand ----
const ICON_KEYS = ["i192","i512","m512","a180","s256"]; // v10.10.1: s256 = small WebP of the same logo for the page header + splash (a 512 PNG was ~350 KB)
const BRAND_MARK_SVG = '<svg class="bm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Apna Dhanda"><rect width="64" height="64" rx="15" fill="#1f6b3a"/><rect x="9" y="11" width="46" height="5" rx="2.5" fill="#fff8e7"/><path d="M9.0 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#fff8e7"/><path d="M18.2 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#f2c14e"/><path d="M27.4 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#fff8e7"/><path d="M36.6 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#f2c14e"/><path d="M45.8 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#fff8e7"/><rect x="13" y="29.5" width="38" height="22" fill="#fff8e7"/><rect x="18" y="34" width="13" height="10" rx="1.6" fill="#1f6b3a"/><path d="M18 40.5h13" stroke="#fff8e7" stroke-width="1.4"/><circle cx="21.5" cy="38" r="1.6" fill="#f2c14e"/><circle cx="26.5" cy="38" r="1.6" fill="#9fd3a9"/><rect x="35" y="35" width="11" height="16.5" rx="1.6" fill="#1f6b3a"/><circle cx="43.2" cy="43.5" r="1.1" fill="#fff8e7"/><rect x="8" y="51" width="48" height="3.5" rx="1.75" fill="#fff8e7"/></svg>';
const PLATFORM_MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#1f6b3a"/><rect x="9" y="11" width="46" height="5" rx="2.5" fill="#fff8e7"/><path d="M9.0 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#fff8e7"/><path d="M18.2 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#f2c14e"/><path d="M27.4 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#fff8e7"/><path d="M36.6 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#f2c14e"/><path d="M45.8 16h9.2v7a4.6 4.6 0 0 1-9.2 0z" fill="#fff8e7"/><rect x="13" y="29.5" width="38" height="22" fill="#fff8e7"/><rect x="18" y="34" width="13" height="10" rx="1.6" fill="#1f6b3a"/><path d="M18 40.5h13" stroke="#fff8e7" stroke-width="1.4"/><circle cx="21.5" cy="38" r="1.6" fill="#f2c14e"/><circle cx="26.5" cy="38" r="1.6" fill="#9fd3a9"/><rect x="35" y="35" width="11" height="16.5" rx="1.6" fill="#1f6b3a"/><circle cx="43.2" cy="43.5" r="1.1" fill="#fff8e7"/><rect x="8" y="51" width="48" height="3.5" rx="1.75" fill="#fff8e7"/></svg>';
const PLATFORM_IMG_SHOP = -1; // brand images belong to no shop
function parseIcons(v){ try { const o = JSON.parse(v || "{}"); const r = {}; if (o && typeof o === "object") for (const k of ICON_KEYS) if (/^[a-f0-9]{16,40}$/.test(String(o[k]||""))) r[k] = o[k]; return r; } catch { return {}; } }
function graphemes(v){ try { return [...new Intl.Segmenter("hi", {granularity:"grapheme"}).segment(v)].map(x => x.segment); } catch { return [...v]; } }
function cleanAppName(v){ v = String(v ?? "").replace(/\s+/g, " ").trim(); if (graphemes(v).length > 12) fail(400,"too_long","होम-स्क्रीन नाम 12 अक्षर तक · Home-screen name: max 12 characters"); return v; }
function cleanTheme(v){ v = String(v ?? "").trim().toLowerCase(); if (v && !/^#[0-9a-f]{6}$/.test(v)) fail(400,"invalid","Colour must look like #1f6b3a"); return v; }
async function cleanIcons(db, v, ownerSid){
  const o = {}; if (!v || typeof v !== "object") return o;
  for (const k of ICON_KEYS) { const x = String(v[k] || ""); if (!x) continue; if (!/^[a-f0-9]{16,40}$/.test(x)) fail(400,"invalid","bad icon");
    if (!(await db.prepare(`SELECT 1 AS x FROM images WHERE id=? AND shop_id=?`).bind(x, ownerSid).first())) fail(400,"invalid","icon not found"); o[k] = x; }
  return o;
}
const homeName = sh => graphemes(sh.app_name || sh.name || "").slice(0, 12).join("").trim();
const TILE_COLORS = ["#1f6b3a","#b45309","#7c3aed","#0e7490","#be123c","#1d4ed8","#4d7c0f","#c2410c"];
function tileColor(seed){ let h = 0; for (const c of String(seed)) h = (h*31 + c.codePointAt(0)) >>> 0; return TILE_COLORS[h % TILE_COLORS.length]; }
function initialsOf(name){ const w = String(name || "").trim().split(/\s+/).filter(x => /[\p{L}\p{N}]/u.test(x)); const g = x => (graphemes(x)[0] || ""); const r = (w.length > 1 ? g(w[0]) + g(w[1]) : g(w[0] || "?")); return r.toUpperCase() || "?"; }
function initialsSvg(name, color){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${H(color)}"/><text x="256" y="256" dy=".35em" text-anchor="middle" font-family="system-ui,'Noto Sans Devanagari',sans-serif" font-weight="700" font-size="${[...initialsOf(name)].length > 2 ? 150 : 210}" fill="#fff">${H(initialsOf(name))}</text></svg>`;
}
function shopAppView(sh){ const icons = parseIcons(sh.app_icons); const url = k => icons[k] ? `/api/img/${icons[k]}` : null;
  return {name: sh.app_name || "", home_name: homeName(sh), theme: sh.app_theme || "", color: sh.app_theme || tileColor(sh.slug), lock: !!sh.app_lock, icons, icon_urls: {i192: url("i192"), i512: url("i512"), m512: url("m512"), a180: url("a180"), s256: url("s256")}, fallback: `/s/${sh.slug}/icon.svg`, slug: sh.slug, initials: initialsOf(sh.app_name || sh.name)}; }
const STATIC_V = "9"; // bump to make installed apps / browsers refetch the static icons
const brandIconList = b => { const u = (b && b.icon_urls) || {}; const icons = [];
  if (u.i192) icons.push({src: u.i192, sizes: "192x192", type: "image/png", purpose: "any"}); if (u.i512) icons.push({src: u.i512, sizes: "512x512", type: "image/png", purpose: "any"});
  if (u.m512) icons.push({src: u.m512, sizes: "512x512", type: "image/png", purpose: "maskable"});
  if (!icons.length) icons.push({src: `/icon-192.png?v=${STATIC_V}`, sizes: "192x192", type: "image/png", purpose: "any"}, {src: `/icon-512.png?v=${STATIC_V}`, sizes: "512x512", type: "image/png", purpose: "any"}, {src: `/icon-maskable-512.png?v=${STATIC_V}`, sizes: "512x512", type: "image/png", purpose: "maskable"});
  return icons; };
// v8: a shop with no logo of its own shows the PLATFORM logo (Krish's uploaded brand logo, else the built-in awning mark) — never a letter tile.
function shopManifest(sh, b){
  const a = shopAppView(sh); const u = a.icon_urls; const icons = [];
  if (u.i192) icons.push({src: u.i192, sizes: "192x192", type: "image/png", purpose: "any"});
  if (u.i512) icons.push({src: u.i512, sizes: "512x512", type: "image/png", purpose: "any"});
  if (u.m512) icons.push({src: u.m512, sizes: "512x512", type: "image/png", purpose: "maskable"});
  // v10.5: no icon of its own → Krish's uploaded platform logo (v8), else the customer-app icon (orange bag) — never the Dukaan/Dev icon
  if (!icons.length) { const bu = (b && b.icon_urls) || {}; if (bu.i192 || bu.i512) icons.push(...brandIconList(b)); else icons.push(...roleIcons("shop")); }
  return {id: `/s/${sh.slug}`, name: sh.app_name || sh.name, short_name: a.home_name || sh.slug, description: sh.name, lang: "hi", dir: "auto",
    start_url: `/s/${sh.slug}`, scope: `/s/${sh.slug}`, display: "standalone", background_color: "#ffffff", theme_color: a.color, icons};
}
async function brand(raw){
  const rows = (await raw.prepare(`SELECT k,v FROM service_state WHERE k IN ('brand_name','brand_icons')`).all()).results; const g = k => rows.find(r => r.k === k)?.v || "";
  const name = g("brand_name") || "Apna Dhanda"; const icons = parseIcons(g("brand_icons")); const url = k => icons[k] ? `/api/img/${icons[k]}` : null;
  return {name, icons, icon_urls: {i192: url("i192"), i512: url("i512"), m512: url("m512"), a180: url("a180"), s256: url("s256")}, fallback: "/brand.svg"};
}
// v10.5: three separate installable apps on one origin. Each has its own id, scope, start_url, name, icon and colour, and the
// scopes never overlap: Dev = /dev, Dukaan (shopkeeper) = /admin, customer = /s/<slug>. The landing page "/" is NOT an app any more
// (a scope of "/" would swallow /admin, /dev and every shop's /s/ link), so it links no manifest; /manifest.webmanifest stays for
// old links but is a plain browser bookmark (display "browser"), never an app that captures links.
const roleIcons = k => [{src: `/app-${k}-192.png?v=${STATIC_V}`, sizes: "192x192", type: "image/png", purpose: "any"}, {src: `/app-${k}-512.png?v=${STATIC_V}`, sizes: "512x512", type: "image/png", purpose: "any"}, {src: `/app-${k}-maskable-512.png?v=${STATIC_V}`, sizes: "512x512", type: "image/png", purpose: "maskable"}];
const APP_ROLES = {
  dev: {id: "/dev-app", scope: "/dev", start_url: "/dev", sfx: " Dev", short: "Dhanda Dev", theme: "#4c1d95", bg: "#1e1b4b", icon: "dev", desc: "Developer panel (owner only)"},
  admin: {id: "/admin-app", scope: "/admin", start_url: "/admin", sfx: " Dukaan", short: "My Dukaan", theme: "#1f6b3a", bg: "#fffaf0", icon: "admin", desc: "दुकानदार पैनल · Shopkeeper panel"},
};
function brandManifest(b, kind){
  const r = APP_ROLES[kind];
  if (!r) return {name: b.name, short_name: graphemes(b.name).slice(0, 12).join(""), start_url: "/", display: "browser", background_color: "#fffaf0", theme_color: "#1f6b3a", lang: "hi", icons: roleIcons("admin").slice(0, 2)};
  return {id: r.id, name: b.name + r.sfx, short_name: r.short, description: r.desc, start_url: r.start_url, scope: r.scope, display: "standalone", background_color: r.bg, theme_color: r.theme, lang: "hi", dir: "auto", icons: roleIcons(r.icon)};
}
function publicOrigin(env, url){ const o = String(env?.PUBLIC_ORIGIN || "").replace(/\/+$/, ""); return /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : url.origin; }
function slugify(s){ return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/,""); }
const RESERVED_SLUGS = new Set(["admin","dev","api","s","track","info","static","assets","www","new","login","signup","shop","shops"]);
async function uniqueSlug(raw, want){
  let base = slugify(want); if (base.length < 3 || RESERVED_SLUGS.has(base)) base = (base ? base + "-" : "") + "dukan";
  for (let i = 0; i < 50; i++) { const s = i ? `${base}-${i+1}` : base; if (!(await raw.prepare(`SELECT 1 AS x FROM shops WHERE slug=?`).bind(s).first())) return s; }
  return base + "-" + randHex(3);
}

async function api(req, env, url, ctx){
  const raw = env.DB; await migrate(raw);
  const p = url.pathname, m = req.method;
  let mm;
  // Customer-side handle: the shop named by the request. Token routes re-scope to the order's own shop.
  const reqShop = (p === "/api/store" || p === "/api/orders" || p === "/api/visit") ? await shopBySlug(raw, req.headers.get("x-shop") || url.searchParams.get("shop")) : null;
  if ((p === "/api/store" || p === "/api/orders" || p === "/api/visit") && !reqShop) fail(404,"shop_not_found","दुकान नहीं मिली · Shop not found");
  let db = scoped(raw, reqShop ? reqShop.id : 0);
  const byOrder = o => scoped(raw, o.shop_id);
  // CSRF: state-changing admin calls must be same-origin JSON with our header
  if (m !== "GET" && p.startsWith("/api/admin/") && req.headers.get("x-requested-with") !== "kirana") fail(403,"csrf","Missing header");

  // ----- public -----
  if (p === "/api/store" && m === "GET") { const s = await getSettings(db); const sv = await service(db); return json({ok:true, shop: {...shopPublic(reqShop), status: sv.status, owner: shopOwnerPublic(reqShop), app: {home_name: homeName(reqShop)}}, settings: publicSettings(s), service_paused: !canOrder(sv.status) || !reqShop.online, reviews: s.show_reviews ? await publicReviews(db) : null, ...(await catalog(db)), ...(isSalonCat(reqShop.shop_type) ? {salon: await salonCatalogPublic(db)} : {})}); }
  if ((mm = p.match(/^\/api\/img\/([a-f0-9]{16,40})$/)) && m === "GET") {
    const r = await db.prepare(`SELECT mime,data FROM images WHERE id=?`).bind(mm[1]).first();
    if (!r) return new Response("Not found", {status:404});
    const bin = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    return new Response(bin, {headers:{"content-type":r.mime, "cache-control":"public, max-age=31536000, immutable", "x-content-type-options":"nosniff"}});
  }
  // v10.9 📊: customer opened /s/<slug>. Fire-and-forget beacon from the page; at most one row per device per shop per 30 min.
  // Anonymous random device id + the name the customer already typed (if any). Shop comes only from the slug; no IP/phone is stored.
  // v10.12: customer directory (/shops). Public, read-only. Optional lat/lng (the customer's phone, never stored) → sorted by distance.
  if (p === "/api/shops" && m === "GET") {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (!memRate("dir:" + ip, 60, 60000)) fail(429, "rate_limited", "बहुत ज़्यादा बार खोजा — थोड़ी देर बाद · Too many requests, try again in a minute");
    const la = parseFloat(url.searchParams.get("lat")), lo = parseFloat(url.searchParams.get("lng"));
    const pos = url.searchParams.has("lat") || url.searchParams.has("lng") ? (validLatLng(la, lo) ? {lat: la, lng: lo} : fail(400, "invalid_location", "लोकेशन सही नहीं है · Location looks wrong")) : null;
    // v10.12.3: without ?type= the answer is the category list only (no shop names, slugs or ids); with ?type= only that type's shops.
    if (!url.searchParams.get("type")) return json({ok: true, categories: await publicCategories(raw)}, 200, {"cache-control": "no-store"});
    const cat = dirCat(String(url.searchParams.get("type")).toLowerCase()) || fail(400, "invalid_type", "Unknown category");
    const shops = await publicShopList(raw, pos, cat.type);
    return json({ok: true, category: cat.key, shops: shops.map(s => ({...s, km_text: fmtKm(s.km)})), sorted_by: pos ? "distance" : "default"}, 200, {"cache-control": "no-store"});
  }
  if (p === "/api/visit" && m === "POST") {
    const b = await body(req); const did = String(b.did || "");
    if (!/^[a-z0-9]{16,40}$/i.test(did)) fail(400,"invalid","Bad device id");
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (!memRate("visit:" + ip, 30, 10*60000)) fail(429,"rate_limited","Too many requests");
    const t = now();
    const r = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN ts > ? AND json_extract(meta,'$.d') = ? THEN 1 ELSE 0 END),0) AS mine FROM shop_events WHERE shop_id=? AND kind='cust_visit' AND ts > ?`).bind(t - VISIT_GAP, did, db.sid, t - 3600e3).first();
    if (r.mine > 0) return json({ok:true, recorded:false});
    if (r.n >= VISIT_SHOP_HOURLY_CAP) fail(429,"rate_limited","Too many requests");
    const name = visitName(b.name); const meta = {d: did}; if (name) meta.n = name;
    await shopEvent(db, db.sid, "cust_visit", meta, t).run();
    return json({ok:true, recorded:true});
  }
  if (p === "/api/orders" && m === "POST") {
    const r = await createOrder(db, req, await body(req)); const full = r._full; delete r._full;
    if (full) await later(ctx, () => notifyAdmins(env, db, full, url.origin));
    if (full && !r.duplicate) await later(ctx, () => stockCheck(env, raw, db.sid, full.items.map(i => i.variant_id), url.origin)); // v10.7 low-stock alert
    // v10.6: a shop's FIRST real order → developer event (once per shop, ever)
    if (full && !r.duplicate) await later(ctx, async () => { const n = (await raw.prepare(`SELECT COUNT(*) AS n FROM orders WHERE shop_id=? AND is_test=0`).bind(db.sid).first()).n;
      if (n === 1) await devEvent(env, raw, null, {kind: "first_order", label: reqShop.name, shop_id: db.sid, dedupe: "first_order:" + db.sid, url: "/dev#shops", title: `🎉 First order for ${reqShop.name}!`, body: full.svc_items ? "first booking · the new shop is up and running" : `₹${rs(full.total_paise)} · the new shop is up and running`}, url.origin); });
    return json({ok:true, ...r}, r.duplicate ? 200 : 201);
  }
  // My Orders: the browser sends the (code, private token) pairs it saved; only matching orders come back.
  if (p === "/api/orders/mine" && m === "POST") {
    const b = await body(req); const list = (Array.isArray(b.orders) ? b.orders : []).slice(0, 30);
    const out = [];
    for (const x of list) {
      const o = await orderByToken(raw, String(x?.code||""), String(x?.token||""));
      if (!o) { out.push({code: String(x?.code||"").slice(0,12), missing:true}); continue; }
      const full = await loadOrder(byOrder(o), "id=?", o.id); const cv = customerView(full);
      const subs = (await db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE role='customer' AND order_id=?`).bind(o.id).first()).n;
      out.push({code: cv.code, status: cv.status, reason: cv.reason, created_at: cv.created_at, updated_at: cv.updated_at, total_paise: cv.total_paise,
        item_count: cv.items.reduce((a,i)=>a+i.qty,0), vids: full.items.map(i => i.variant_id).filter(Boolean), preview: cv.items.slice(0,3).map(i => ({icon:i.icon, name:i.product_name, name_en:i.product_name_en})), push_on: subs > 0});
    }
    return json({ok:true, orders: out});
  }
  if (p === "/api/push/key" && m === "GET") return json({ok:true, public_key: (await getVapid(raw)).pub});
  if (p === "/api/push/order" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip") || "local";
    if (!(await rateCheck(db, "push:"+ip, 30, 10*60000))) fail(429,"rate_limited","Too many requests");
    const o = await orderByToken(raw, String(b.code||""), String(b.token||"")); if (!o) fail(404,"not_found","Order not found");
    const sub = parseSubscription(b.subscription, env);
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE role='customer' AND order_id=? AND endpoint != ?`).bind(o.id, sub.endpoint).first()).n;
    if (n >= 5) fail(409,"too_many","Too many devices for this order");
    await db.prepare(`INSERT INTO push_subscriptions (shop_id,role,order_id,endpoint,p256dh,auth,user_agent,created_at) VALUES (?,'customer',?,?,?,?,?,?) ON CONFLICT(role, endpoint, COALESCE(order_id,0)) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, shop_id=excluded.shop_id, fail_count=0`)
      .bind(o.shop_id, o.id, sub.endpoint, sub.p256dh, sub.auth, str(req.headers.get("user-agent"), 200).slice(0,200), now()).run();
    await rateHit(db, "push:"+ip);
    return json({ok:true, subscribed:true});
  }
  if (p === "/api/push/order/remove" && m === "POST") {
    const b = await body(req); const o = await orderByToken(raw, String(b.code||""), String(b.token||"")); if (!o) fail(404,"not_found","Order not found");
    const r = await db.prepare(`DELETE FROM push_subscriptions WHERE role='customer' AND order_id=? AND endpoint=?`).bind(o.id, str(b.endpoint, 1000)).run();
    return json({ok:true, removed: r.meta?.changes || 0});
  }
  if ((mm = p.match(/^\/api\/orders\/(AK-[A-Z0-9]{6})$/)) && m === "GET") {
    const tok = req.headers.get("x-order-token") || "";
    const o = await db.prepare(`SELECT token_hash, shop_id FROM orders WHERE code=?`).bind(mm[1]).first();
    if (!o || !/^[a-f0-9]{48}$/.test(tok) || !safeEq(await sha256(tok), o.token_hash)) fail(404,"not_found","Order not found");
    db = byOrder(o); const sh = await raw.prepare(`SELECT slug, name FROM shops WHERE id=?`).bind(o.shop_id).first();
    const full = await loadOrder(db,"code=?",mm[1]); const s = await getSettings(db);
    const rt = await db.prepare(`SELECT stars, comment, created_at FROM order_ratings WHERE order_id=?`).bind(full.id).first();
    return json({ok:true, order: {...customerView(full), can_cancel: full.status === "pending", rating: rt || null, token: await tokenInfo(db, full)}, shop: {slug: sh?.slug || "", name: sh?.name || "", name_hi: s.store_name_hi, name_en: s.store_name_en, phone: s.phone || "", whatsapp: s.whatsapp || s.phone || ""}});
  }
  // ----- v10.8: customer answers a substitute suggestion (private order token) -----
  if ((mm = p.match(/^\/api\/orders\/(AK-[A-Z0-9]{6})\/substitute$/)) && m === "POST") {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (!(await rateCheck(db, "cust:"+ip, 20, 10*60000))) fail(429,"rate_limited","Too many requests. Please wait a few minutes.");
    await rateHit(db, "cust:"+ip);
    const o = await orderByToken(raw, mm[1], req.headers.get("x-order-token") || ""); if (!o) fail(404,"not_found","Order not found");
    db = byOrder(o);
    const r = await answerSub(db, o.id, await body(req));
    if (!r.already) { await stockCheck(env, raw, db.sid, r.order.items.map(i => i.variant_id), url.origin); await later(ctx, () => notifySubAnswer(env, db, r.order, r.sub, url.origin)); }
    return json({ok:true, already: !!r.already, kept_last: !!r.kept_last, order: customerView(r.order)});
  }
  // ----- v4: reorder (current prices), customer cancellation (pending only), rating (after delivery) — all need the order's private token -----
  if (p === "/api/orders/reorder" && m === "POST") {
    const b = await body(req); const o = await orderByToken(raw, String(b.code||""), String(b.token||"")); if (!o) fail(404,"not_found","Order not found");
    return json({ok:true, items: await reorderItems(byOrder(o), o.id)});
  }
  if ((mm = p.match(/^\/api\/orders\/(AK-[A-Z0-9]{6})\/(cancel|rating)$/)) && m === "POST") {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (!(await rateCheck(db, "cust:"+ip, 20, 10*60000))) fail(429,"rate_limited","Too many requests. Please wait a few minutes.");
    await rateHit(db, "cust:"+ip);
    const o = await orderByToken(raw, mm[1], req.headers.get("x-order-token") || ""); if (!o) fail(404,"not_found","Order not found");
    db = byOrder(o); const b = await body(req);
    if (mm[2] === "cancel") {
      const cur = await db.prepare(`SELECT status FROM orders WHERE id=?`).bind(o.id).first();
      if (cur.status === "cancelled") return json({ok:true, already:true, order: customerView(await loadOrder(db,"id=?",o.id))});
      if (cur.status !== "pending") fail(409,"not_cancellable","The shop has already accepted this order. Please call the shop to cancel.", {status: cur.status});
      let full;
      try { full = await transition(db, o.id, "cancelled", "pending", "ग्राहक ने रद्द किया · Cancelled by customer" + (b.reason ? ": " + str(b.reason, 120).replace(/[<>]/g,"") : ""), "customer"); }
      catch (e) { if (e instanceof HttpError && e.code === "stale") { const now2 = await db.prepare(`SELECT status FROM orders WHERE id=?`).bind(o.id).first(); if (now2.status === "cancelled") return json({ok:true, already:true, order: customerView(await loadOrder(db,"id=?",o.id))}); fail(409,"not_cancellable","The shop has already accepted this order. Please call the shop to cancel.", {status: now2.status}); } throw e; }
      await later(ctx, () => notifyAdminsCancelled(env, db, full, url.origin));
      if (full.token_no != null) await later(ctx, () => notifyQueue(env, db, url.origin)); // v10.13: a cancelled token moves the queue up
      return json({ok:true, already:false, order: customerView(full)});
    }
    const cur = await db.prepare(`SELECT status FROM orders WHERE id=?`).bind(o.id).first();
    if (cur.status !== "delivered") fail(409,"not_delivered","You can rate an order after it is delivered.");
    const stars = intIn(b.stars, 1, 5, "stars");
    const comment = str(b.comment, 300).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    try { await db.prepare(`INSERT INTO order_ratings (order_id, stars, comment, created_at) VALUES (?,?,?,?)`).bind(o.id, stars, comment, now()).run(); }
    catch (e) { if (/UNIQUE/i.test(String(e.message))) fail(409,"already_rated","This order has already been rated. Thank you!"); throw e; }
    return json({ok:true, rating:{stars, comment}}, 201);
  }

  // ----- developer (owner) panel: separate auth, never reachable with the shopkeeper's session -----
  if (p.startsWith("/api/dev/")) return devApi(req, env, url, ctx);

  // ----- admin auth -----
  if (p === "/api/admin/state" && m === "GET") {
    const n = (await setupDone(db)) ? 1 : 0;
    const a = await currentAdmin(db, req);
    const so = (await db.prepare(`SELECT v FROM service_state WHERE k='signup_open'`).first())?.v !== "0";
    return json({ok:true, needs_setup: n === 0, signup_open: n > 0 && so, admin: a ? adminView(a, publicOrigin(env, url)) : null, service: a ? adminServiceView(await service(scoped(raw, a.shop_id))) : null});
  }
  // v5: a shopkeeper creates their OWN shop account (owner name, shop name, mobile, password). Starts PENDING unless auto-approve is on.
  if (p === "/api/admin/signup" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip")||"local";
    if (!(await rateCheck(db, "signup:"+ip, 5, 60*60000))) fail(429,"rate_limited","Too many new accounts from this connection. Try again in an hour.");
    if (!(await setupDone(db))) fail(409,"needs_setup","The first shop is not set up yet.");
    if ((await db.prepare(`SELECT v FROM service_state WHERE k='signup_open'`).first())?.v === "0") fail(403,"signup_closed","नई दुकान का रजिस्ट्रेशन अभी बंद है। · New shop sign-up is closed right now.");
    const owner = str(b.owner_name, 60, {required:true, field:"Your name"});
    const shopName = str(b.shop_name, 80, {required:true, field:"Shop name"});
    const mobile = normPhone(b.mobile); if (!mobile) fail(400,"invalid_phone","Enter a valid 10-digit mobile number");
    const pw = checkPassword(b.password);
    const shopType = readShopType(b.shop_type);
    if (await db.prepare(`SELECT 1 AS x FROM admins WHERE mobile=? OR username=?`).bind(mobile, mobile).first()) fail(409,"mobile_taken","इस मोबाइल नंबर से पहले ही अकाउंट बना है — लॉगिन करें। · An account already exists for this mobile.");
    await rateHit(db, "signup:"+ip);
    const slug = await uniqueSlug(raw, b.slug || shopName || owner);
    const auto = (await db.prepare(`SELECT v FROM service_state WHERE k='auto_approve'`).first())?.v === "1";
    const t = now(); const status = auto ? "active" : "pending";
    const trialDays = intOr((await db.prepare(`SELECT v FROM service_state WHERE k='trial_days'`).first())?.v, 10, 0, 365);
    const sh = await db.prepare(`INSERT INTO shops (slug,name,owner_name,mobile,status,paid_until,grace_days,created_at,approved_at,updated_at,trial_end,shop_type) VALUES (?,?,?,?,?,'',7,?,?,?,?,?) RETURNING id`).bind(slug, shopName, owner, mobile, status, t, auto ? t : null, t, t + trialDays*DAY, shopType).first();
    const recovery = randCode(4) + "-" + randCode(4) + "-" + randCode(4); const salt = randHex(16);
    const ascii = /^[\x20-\x7e]+$/.test(shopName);
    const sdb = scoped(raw, sh.id);
    const st = [
      db.prepare(`INSERT INTO admins (shop_id,username,mobile,pass_hash,salt,must_change,recovery_hash,created_at) VALUES (?,?,?,?,?,0,?,?)`).bind(sh.id, mobile, mobile, await pbkdf2(pw, salt), salt, await sha256("kirana-recover:" + recovery.toUpperCase()), t),
      db.prepare(`INSERT INTO service_log (shop_id,at,from_status,to_status,actor,note) VALUES (?,?,NULL,?,?,?)`).bind(sh.id, t, status, "signup", auto ? "new shop (auto-approved)" : "new shop — waiting for approval")
    ];
    for (const [k,v] of Object.entries({...DEFAULT_SETTINGS, store_name_hi: shopName, store_name_en: ascii ? shopName : "", tagline_hi: "", tagline_en: "", phone: mobile, whatsapp: mobile, demo_mode: false}))
      st.push(db.prepare(`INSERT OR IGNORE INTO shop_settings (shop_id,key,value) VALUES (?,?,?)`).bind(sh.id, k, JSON.stringify(v)));
    st.push(...starterCatStmts(db, sh.id, shopType));
    st.push(...starterSvcStmts(db, sh.id, shopType, t)); // v10.13.1: a NEW salon gets its default services
    try { await db.batch(st); } catch (e) { await db.prepare(`DELETE FROM shops WHERE id=? AND NOT EXISTS (SELECT 1 FROM admins WHERE shop_id=?)`).bind(sh.id, sh.id).run(); if (/UNIQUE/i.test(String(e.message))) fail(409,"mobile_taken","An account already exists for this mobile."); throw e; }
    // v6: a new shop starts completely empty (no demo data, no categories); stickers create categories on demand
    const a = await db.prepare(`SELECT id FROM admins WHERE shop_id=?`).bind(sh.id).first();
    // v10.6: tell the developer at once (dev panel 🔔 feed + Web Push to Krish's devices). No mobile number / recovery key in it.
    await devEvent(env, raw, ctx, auto
      ? {kind: "signup", label: shopName, shop_id: sh.id, dedupe: "signup:" + sh.id, url: "/dev#shops", title: `🆕 New shop registered: ${shopName} (auto-approved)`, body: `${owner} · ${trialDays}-day free trial started`}
      : {kind: "signup", label: shopName, shop_id: sh.id, dedupe: "signup:" + sh.id, url: "/dev#waiting", title: `🆕 New shop registered: ${shopName} — please approve`, body: `${owner} · Dev → Shops → Waiting → Approve`},
      publicOrigin(env, url), isTestShop(shopName)); // v10.13: a "TEST …" shop is recorded in the feed but never pushed to the developer's phone
    return json({ok:true, shop: {id: sh.id, slug, name: shopName, status, type: shopType, type_info: shopTypeView(shopType)}, recovery_key: recovery, link: `/s/${slug}`, customer_url: `${publicOrigin(env, url)}/s/${slug}`, trial_days: trialDays}, 201, {"set-cookie": await newSession(db, a.id)});
  }
  if (p === "/api/admin/setup" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip")||"local";
    if (!(await rateCheck(db, "setup:"+ip, 5, 15*60000))) fail(429,"rate_limited","Too many attempts. Try again in 15 minutes.");
    if (await setupDone(db)) fail(409,"already_setup","Admin already exists. Log in instead.");
    if (!(await setupKeyOk(b.setup_key))) { await rateHit(db,"setup:"+ip); fail(403,"bad_setup_key","Setup key is not correct"); }
    const username = str(b.username, 40, {required:true, field:"username"}).toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400,"invalid","Username: 3–40 letters/numbers");
    const pw = checkPassword(b.password); const salt = randHex(16);
    const r = await db.prepare(`INSERT INTO admins (shop_id,username,pass_hash,salt,must_change,created_at) VALUES (1,?,?,?,?,?) RETURNING id`).bind(username, await pbkdf2(pw, salt), salt, bool(b.must_change)?1:0, now()).first();
    await db.prepare(`INSERT OR IGNORE INTO service_state (k,v) VALUES ('platform_ready','1')`).run();
    return json({ok:true}, 200, {"set-cookie": await newSession(db, r.id)});
  }
  if (p === "/api/admin/login" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip")||"local";
    const username = String(b.username||"").trim().toLowerCase(); const asMobile = normPhone(username);
    if (!(await rateCheck(db, "login:"+ip, 8, 15*60000)) || !(await rateCheck(db, "login-user:"+username, 8, 15*60000))) fail(429,"rate_limited","Too many wrong attempts. Try again in 15 minutes.");
    const a = await db.prepare(`SELECT * FROM admins WHERE username=? OR (mobile IS NOT NULL AND mobile=?) ORDER BY id LIMIT 1`).bind(username, asMobile || "-").first();
    const hash = await pbkdf2(String(b.password||""), a?.salt || "00".repeat(16));
    if (!a || !safeEq(hash, a.pass_hash)) { await rateHit(db,"login:"+ip); await rateHit(db,"login-user:"+username); fail(401,"bad_login","Wrong username or password"); }
    const shopRow = await db.prepare(`SELECT status FROM shops WHERE id=?`).bind(a.shop_id).first();
    if (!shopRow || shopRow.status === "rejected") fail(403,"shop_rejected","यह दुकान अकाउंट मंज़ूर नहीं हुआ। · This shop account was not approved — please contact the developer.");
    { const t = now(); await db.batch(expireSessionsSql.map(q => db.prepare(q).bind(t))); }
    const cookie = await newSession(db, a.id);
    await logShopEvent(db, a.shop_id, "admin_login", {dev: deviceOf(req)}); // v10.9 📊
    return json({ok:true, must_change: !!a.must_change}, 200, {"set-cookie": cookie});
  }
  if (p === "/api/admin/recover" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip")||"local";
    if (!(await rateCheck(db, "setup:"+ip, 5, 15*60000))) fail(429,"rate_limited","Too many attempts. Try again in 15 minutes.");
    const username = String(b.username||"").trim().toLowerCase(); const asMobile = normPhone(username);
    const a = await db.prepare(`SELECT id, shop_id, recovery_hash FROM admins WHERE username=? OR (mobile IS NOT NULL AND mobile=?) ORDER BY id LIMIT 1`).bind(username, asMobile || "-").first();
    // Shop #1 keeps its original setup/recovery key; every other shop has the recovery key shown once at sign-up.
    const keyOk = a && ((a.recovery_hash && typeof b.setup_key === "string" && safeEq(await sha256("kirana-recover:" + b.setup_key.trim().toUpperCase()), a.recovery_hash)) || (a.shop_id === 1 && await setupKeyOk(b.setup_key)));
    if (!keyOk) { await rateHit(db,"setup:"+ip); fail(403,"bad_setup_key","Recovery key is not correct"); }
    const salt = randHex(16);
    await db.batch([db.prepare(`UPDATE admins SET pass_hash=?, salt=?, must_change=0 WHERE id=?`).bind(await pbkdf2(checkPassword(b.password), salt), salt, a.id), db.prepare(`DELETE FROM sessions WHERE admin_id=?`).bind(a.id)]);
    return json({ok:true});
  }

  const admin = await currentAdmin(db, req);
  if (p.startsWith("/api/admin/") && !admin) fail(401,"login_required","Please log in");
  if (!p.startsWith("/api/admin/")) fail(404,"not_found","Not found");
  return adminApi(req, env, url, ctx, raw, admin, p);
}

// The shopkeeper panel's API for ONE shop. Reached by the shopkeeper's own session, by a developer's "login as shop"
// session, or by the /dev shop editor (/api/dev/shops/<id>/a/...). Every query below is scoped to admin.shop_id.

// ---------- v8: subscription bills, payments, notifications ----------
const SUB_OPEN_PATHS = new Set(["/api/admin/logout","/api/admin/password","/api/admin/subscription","/api/admin/subscription/invoice","/api/admin/subscription/pay","/api/admin/push","/api/admin/push/subscribe","/api/admin/push/unsubscribe","/api/admin/push/test","/api/admin/notifications","/api/admin/notifications/read"]);
const rs = p => (p/100).toLocaleString("en-IN", {maximumFractionDigits: 2});
function addMonths(t, n){ const d = new Date(t + IST); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime() - IST; }
const invoiceNo = (id, at) => `AD-${istYMD(at).slice(0,7).replace("-","")}-${String(id).padStart(4,"0")}`;
const invView = i => i ? {id: i.id, number: i.number, months: i.months, monthly_paise: i.monthly_paise, amount_paise: i.amount_paise, period_start: i.period_start, period_end: i.period_end, due_at: i.due_at, status: i.status, created_at: i.created_at, sent_at: i.sent_at, sent_count: i.sent_count, paid_at: i.paid_at} : null;
const openInvoice = (raw, sid) => raw.prepare(`SELECT * FROM invoices WHERE shop_id=? AND status IN ('unpaid','pending_verify') ORDER BY id DESC LIMIT 1`).bind(sid).first();
async function ensureInvoice(raw, sid, actor, at = now()){
  const ex = await openInvoice(raw, sid); if (ex) return {inv: ex, created: false};
  const sh = await raw.prepare(`SELECT * FROM shops WHERE id=?`).bind(sid).first(); if (!sh) fail(404,"not_found","Shop not found");
  const cfg = await subConfig(raw); const monthly = shopMonthly(sh, cfg); const months = cfg.months;
  if (!(monthly > 0)) fail(409,"no_price","पहले Dev → Platform में महीने का दाम डालें · Set a monthly price first");
  const sub = subState(sh, at); const start = Math.max(at, sub.ends_at || 0);
  const r = await raw.prepare(`INSERT INTO invoices (shop_id,months,monthly_paise,amount_paise,period_start,period_end,due_at,status,created_at,created_by) VALUES (?,?,?,?,?,?,?,'unpaid',?,?) RETURNING id`)
    .bind(sid, months, monthly, monthly*months, start, addMonths(start, months), start, at, actor).first();
  const number = invoiceNo(r.id, at);
  await raw.batch([raw.prepare(`UPDATE invoices SET number=? WHERE id=?`).bind(number, r.id), subLog(raw, sid, actor, "bill_created", `${number} · ₹${rs(monthly*months)} · ${months} month${months > 1 ? "s" : ""}`)]);
  return {inv: await raw.prepare(`SELECT * FROM invoices WHERE id=?`).bind(r.id).first(), created: true};
}
const hiDate = t => { const d = new Date(t + IST); return `${d.getUTCDate()}/${d.getUTCMonth()+1}/${d.getUTCFullYear()}`; };
function billWhatsApp(sh, inv, origin){
  const mob = String(sh.mobile || "").replace(/\D/g, "").slice(-10);
  const msg = `नमस्ते ${sh.owner_name || ""} जी 🙏\n"${sh.name}" का Apna Dhanda सब्सक्रिप्शन बिल\nबिल नं: ${inv.number}\nराशि: ₹${rs(inv.amount_paise)} (${inv.months} महीना)\nआखिरी तारीख: ${hiDate(inv.due_at)}\n\nयहाँ से पे करें: ${origin}/admin#recharge\nपेमेंट के बाद UTR नंबर डालें, दुकान अपने आप चालू हो जाएगी।`;
  return mob.length === 10 ? `https://wa.me/91${mob}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
async function pushShopkeeper(env, raw, sid, event, title, bodyText, origin){
  const sdb = scoped(raw, sid);
  const subs = (await sdb.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(sid).all()).results;
  try { const r = await pushTo(env, sdb, subs, event, {role: "admin", title, body: bodyText, url: "/admin#recharge", tag: "sub-" + event}, null, origin); return {devices: subs.length, accepted: r.filter(x => x.outcome === "accepted").length}; }
  catch (e) { console.error("sub push", e); return {devices: subs.length, accepted: 0, error: true}; }
}
async function sendBill(env, raw, sid, actor, origin){
  const {inv, created} = await ensureInvoice(raw, sid, actor);
  const sh = await raw.prepare(`SELECT * FROM shops WHERE id=?`).bind(sid).first();
  // v10.4: the bill goes straight into the shop's 🔔 notification panel (+ a free Web Push). WhatsApp is only an optional share link now.
  const notice = await billNotice(env, raw, sh, inv, actor, origin);
  const push = notice.push;
  await raw.batch([raw.prepare(`UPDATE invoices SET sent_at=?, sent_count=sent_count+1 WHERE id=?`).bind(now(), inv.id), subLog(raw, sid, actor, "bill_sent", `${inv.number} · notification panel + push to ${push.accepted}/${push.devices} device(s)`)]);
  return {shop_id: sid, shop_name: sh.name, created, invoice: invView(await raw.prepare(`SELECT * FROM invoices WHERE id=?`).bind(inv.id).first()), notice_id: notice.id, push, wa_url: billWhatsApp(sh, inv, origin)};
}

// ---------- v10.4: shopkeeper Notification Center ----------
// Types: 🧾 bill · ⏰ due (reminder) · 🚀 update · ✨ feature · ⚠️ issue (banner with "kab tak theek hoga" until resolved) · 💬 message.
// Stored in D1 (always visible next time /admin opens) + a free Web Push to the shop's devices when push is on.
const NOTICE_TYPES = ["bill","due","update","feature","issue","message"];
const NOTICE_ICON = {bill:"🧾", due:"⏰", update:"🚀", feature:"✨", issue:"⚠️", message:"💬"};
const istDT = t => { const d = new Date(t + IST); return `${hiDate(t)} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`; };
function parseFixBy(v){
  if (v == null || v === "") return null;
  const mt = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(v).trim());
  const t = mt ? Date.UTC(+mt[1], +mt[2]-1, +mt[3], mt[4] ? +mt[4] : 23, mt[5] ? +mt[5] : 59) - IST : NaN;
  if (!Number.isFinite(t)) fail(400,"invalid","Fix-by time looks wrong (example 2026-10-25T18:00)");
  return t;
}
async function pushNotice(env, raw, sid, n, origin){
  const sdb = scoped(raw, sid);
  const subs = (await sdb.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(sid).all()).results;
  const body = String(n.body || "").split("\n").filter(Boolean).slice(0, 3).join(" · ").slice(0, 160);
  try { const r = await pushTo(env, sdb, subs, "notice:" + n.type, {role: "admin", title: `${NOTICE_ICON[n.type] || "🔔"} ${n.title}`.slice(0, 120), body, url: `/admin#notif=${n.id}`, tag: "n-" + n.id}, null, origin);
    return {devices: subs.length, accepted: r.filter(x => x.outcome === "accepted").length}; }
  catch (e) { console.error("notice push", e); return {devices: subs.length, accepted: 0, error: true}; }
}
// Creates ONE notice for the given shops (ids already validated by the caller). A repeated dedupe key creates nothing.
async function createNotice(env, raw, n, shopIds, {push = true, origin = ""} = {}){
  const t = now();
  const row = await raw.prepare(`INSERT OR IGNORE INTO notices (type,title,body,action,fix_by,pinned,target,invoice_id,dedupe,meta,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(n.type, n.title, n.body || "", n.action || "", n.fix_by ?? null, n.pinned ? 1 : 0, n.target || "shops", n.invoice_id ?? null, n.dedupe ?? null, JSON.stringify(n.meta || {}), n.created_by || "", t).first();
  if (!row) return {id: null, duplicate: true, recipients: 0, push: {devices: 0, accepted: 0}};
  const ids = [...new Set(shopIds.map(Number).filter(x => x > 0))];
  if (ids.length) await raw.batch(ids.map(s => raw.prepare(`INSERT OR IGNORE INTO notice_recipients (notice_id, shop_id) VALUES (?,?)`).bind(row.id, s)));
  const pr = {devices: 0, accepted: 0};
  if (push) for (const s of ids) { const r = await pushNotice(env, raw, s, {...n, id: row.id}, origin); pr.devices += r.devices; pr.accepted += r.accepted; }
  return {id: row.id, duplicate: false, recipients: ids.length, push: pr};
}
async function billNotice(env, raw, sh, inv, actor, origin){
  const cfg = await subConfig(raw);
  const meta = {number: inv.number, amount_paise: inv.amount_paise, months: inv.months, period_start: inv.period_start, period_end: inv.period_end, due_at: inv.due_at, upi_id: cfg.upi_id, upi_name: cfg.upi_name};
  const title = `सब्सक्रिप्शन बिल · ₹${rs(inv.amount_paise)} · Bill ${inv.number}`;
  const body = `राशि / Amount: ₹${rs(inv.amount_paise)} (${inv.months} ${inv.months > 1 ? "महीने" : "महीना"})\nअवधि / Period: ${hiDate(inv.period_start)} – ${hiDate(inv.period_end)}\nआखिरी तारीख / Due: ${hiDate(inv.due_at)}\nUPI: ${cfg.upi_id ? cfg.upi_id + (cfg.upi_name ? " (" + cfg.upi_name + ")" : "") : "Krish जल्द भेजेंगे"}\nपे करके UTR नंबर डालें — दुकान चालू रहेगी। Pay by UPI, then submit the UTR.`;
  const dedupe = `bill:${inv.id}`;
  const ex = await raw.prepare(`SELECT id FROM notices WHERE dedupe=?`).bind(dedupe).first();
  if (ex) { // the same bill sent again: refresh it, move it to the top and make it unread again (no second copy in the panel)
    await raw.batch([raw.prepare(`UPDATE notices SET title=?, body=?, meta=?, created_at=?, created_by=? WHERE id=?`).bind(title, body, JSON.stringify(meta), now(), actor, ex.id),
      raw.prepare(`INSERT OR IGNORE INTO notice_recipients (notice_id, shop_id) VALUES (?,?)`).bind(ex.id, sh.id),
      raw.prepare(`UPDATE notice_recipients SET read_at=NULL WHERE notice_id=? AND shop_id=?`).bind(ex.id, sh.id)]);
    return {id: ex.id, resent: true, push: await pushNotice(env, raw, sh.id, {id: ex.id, type: "bill", title, body}, origin)};
  }
  return createNotice(env, raw, {type: "bill", title, body, action: "recharge", invoice_id: inv.id, dedupe, meta, created_by: actor}, [sh.id], {origin});
}
// ⏰ Automatic due reminders: ~3 days before, on the last day, and once right after expiry. Once per stage per period (dedupe = shop + period end + stage).
// Run by the Cloudflare Cron Trigger (free) and, as a fallback, lazily whenever the shopkeeper opens their panel (no push then — they are already looking).
async function runReminders(env, raw, {shopId = null, push = true, origin = "", at = now()} = {}){
  const shops = shopId ? (await raw.prepare(`SELECT * FROM shops WHERE id=? AND status IN ('active','grace')`).bind(shopId).all()).results
    : (await raw.prepare(`SELECT * FROM shops WHERE status IN ('active','grace') ORDER BY id`).all()).results;
  if (!shops.length) return {checked: 0, created: []};
  const cfg = await subConfig(raw); const created = [];
  for (const sh of shops) {
    const sub = subState(sh, at); const end = sub.ends_at; if (!end || sub.state === "PAYMENT_PENDING_VERIFY") continue;
    const inv = await openInvoice(raw, sh.id); if (inv && inv.status === "pending_verify") continue; // they already paid; Krish is verifying
    const left = end - at; let stage = null;
    if (left > DAY && left <= 3*DAY) stage = "d3"; else if (left > 0 && left <= DAY) stage = "d0"; else if (left <= 0 && -left <= 3*DAY && sub.state === "EXPIRED") stage = "exp";
    if (!stage) continue;
    const amount = inv ? inv.amount_paise : shopMonthly(sh, cfg) * cfg.months; const what = sub.in_trial ? ["फ्री ट्रायल", "free trial"] : ["प्लान", "plan"];
    const title = stage === "d3" ? `${sub.days_left} दिन में आपका ${what[0]} खत्म होगा · ${what[1]} ends in ${sub.days_left} days`
      : stage === "d0" ? `आज आपका ${what[0]} खत्म हो रहा है · ${what[1]} ends today` : `${what[0]} खत्म — दुकान रुकी है · ${what[1]} ended, shop paused`;
    const body = `आखिरी तारीख / Due: ${istDT(end)}\nराशि / Amount: ₹${rs(amount)} (${cfg.months} ${cfg.months > 1 ? "महीने" : "महीना"})${cfg.upi_id ? "\nUPI: " + cfg.upi_id + (cfg.upi_name ? " (" + cfg.upi_name + ")" : "") : ""}\n${stage === "exp" ? "रिचार्ज करते ही दुकान फिर चालू होगी। Recharge to reopen." : "समय पर रिचार्ज करें ताकि दुकान बंद न हो। Recharge on time so the shop doesn't pause."}`;
    const r = await createNotice(env, raw, {type: "due", title, body, action: "recharge", invoice_id: inv ? inv.id : null, dedupe: `due:${sh.id}:${end}:${stage}`, meta: {stage, due_at: end, amount_paise: amount, upi_id: cfg.upi_id, upi_name: cfg.upi_name}, created_by: shopId ? "auto:panel" : "auto:cron"}, [sh.id], {push, origin});
    if (!r.duplicate) created.push({shop_id: sh.id, stage, notice_id: r.id});
    // v10.6: the developer hears it too (feed + push), once per stage per period
    await devEvent(env, raw, null, stage === "exp"
      ? {kind: "expired", label: sh.name, shop_id: sh.id, dedupe: `dev-due:${sh.id}:${end}:exp`, url: "/dev#shops", title: `⛔ ${sh.name} auto-paused — ${what[1]} ended`, body: `Bill ₹${rs(amount)} · the shop restarts as soon as payment comes in`}
      : {kind: "expiring", label: sh.name, shop_id: sh.id, dedupe: `dev-due:${sh.id}:${end}:${stage}`, url: "/dev#shops", title: `⏰ ${sh.name}: ${what[1]} ends ${stage === "d0" ? "today" : "in " + sub.days_left + " days"}`, body: `Ends: ${istDT(end)} · ₹${rs(amount)}`}, origin);
  }
  return {checked: shops.length, created};
}
const noticeView = n => { let meta = {}; try { meta = JSON.parse(n.meta || "{}"); } catch {}
  return {id: n.id, type: n.type, icon: NOTICE_ICON[n.type] || "🔔", title: n.title, body: n.body, action: n.action || null, fix_by: n.fix_by, pinned: !!n.pinned, resolved_at: n.resolved_at, created_at: n.created_at, meta,
    ...("read_at" in n ? {read_at: n.read_at, read: n.read_at != null} : {}), ...("invoice_status" in n ? {invoice_status: n.invoice_status || null} : {})}; };
async function shopNotices(raw, sid){
  const rows = (await raw.prepare(`SELECT n.*, r.read_at, i.status AS invoice_status FROM notice_recipients r JOIN notices n ON n.id=r.notice_id LEFT JOIN invoices i ON i.id=n.invoice_id AND i.shop_id=r.shop_id WHERE r.shop_id=? ORDER BY (n.pinned=1 AND n.resolved_at IS NULL) DESC, n.created_at DESC, n.id DESC LIMIT 100`).bind(sid).all()).results;
  const items = rows.map(noticeView);
  // v10.7: 📦 low-stock alerts of this shop, in the same panel (type "stock", one-tap +10 / +20)
  const sa = (await raw.prepare(`SELECT a.*, v.stock AS now_stock, v.low_stock AS now_low FROM stock_alerts a LEFT JOIN variants v ON v.id=a.variant_id AND v.shop_id=a.shop_id WHERE a.shop_id=? ORDER BY a.id DESC LIMIT 40`).bind(sid).all()).results;
  for (const a of sa) items.push({id: STOCK_NID + a.id, type: "stock", icon: "📦", title: `कम स्टॉक: ${a.name} ${a.label}`, body: a.stock <= 0 ? `ख़त्म हो गया — 0 बचा (लिमिट ${a.low_stock})` : `सिर्फ़ ${a.stock} बचे (लिमिट ${a.low_stock})`,
    action: "restock", fix_by: null, pinned: false, resolved_at: a.cleared_at, created_at: a.created_at, read_at: a.read_at, read: a.read_at != null,
    meta: {alert_id: a.id, variant_id: a.variant_id, product_id: a.product_id, name: a.name, label: a.label, stock: a.stock, low_stock: a.low_stock, now_stock: a.now_stock, now_low: a.now_low, cleared_at: a.cleared_at}});
  // v10.8: 🔁 the customer's answer to a substitute suggestion
  const sb = (await raw.prepare(`SELECT s.*, o.code FROM order_subs s JOIN orders o ON o.id=s.order_id AND o.shop_id=s.shop_id WHERE s.shop_id=? AND s.status IN ('accepted','declined') ORDER BY s.answered_at DESC LIMIT 30`).bind(sid).all()).results;
  for (const s of sb) items.push({id: SUB_NID + s.id, type: "order", icon: s.status === "accepted" ? "✅" : "❎", title: `${s.code}: ग्राहक ने ${s.status === "accepted" ? "बदलाव माना" : "बदलाव नहीं माना"}`,
    body: `${s.from_name} ${s.from_label} → ${s.to_name} ${s.to_label}${s.status === "declined" ? " · सामान ऑर्डर से हटा" : ""}`, action: "order", fix_by: null, pinned: false, resolved_at: null, created_at: s.answered_at, read_at: s.read_at, read: s.read_at != null,
    meta: {order_id: s.order_id, code: s.code, sub_id: s.id, answer: s.status}});
  items.sort((x, y) => ((y.pinned && !y.resolved_at) - (x.pinned && !x.resolved_at)) || (y.created_at - x.created_at) || (y.id - x.id));
  return {items: items.slice(0, 120), unread: items.filter(n => !n.read).length, banner: items.filter(n => n.type === "issue" && !n.resolved_at).slice(0, 3)};
}

async function shopSubView(raw, sid, svc){
  const sh = await raw.prepare(`SELECT * FROM shops WHERE id=?`).bind(sid).first(); const cfg = await subConfig(raw); const monthly = shopMonthly(sh || {}, cfg);
  const inv = await openInvoice(raw, sid);
  const payments = (await raw.prepare(`SELECT id, invoice_id, utr, amount_paise, status, reason, provisional_until, submitted_at, decided_at FROM sub_payments WHERE shop_id=? ORDER BY id DESC LIMIT 10`).bind(sid).all()).results;
  const invoices = (await raw.prepare(`SELECT * FROM invoices WHERE shop_id=? ORDER BY id DESC LIMIT 24`).bind(sid).all()).results.map(invView);
  return {sub: svc.sub, status: svc.status, paused_reason: svc.paused_reason, plan: {monthly_paise: monthly, months: cfg.months, amount_paise: monthly*cfg.months, custom_price: Number.isInteger(sh?.price_paise)},
    pay_to: {upi_id: cfg.upi_id, upi_name: cfg.upi_name}, invoice: invView(inv), payments, invoices};
}


// v10.8: every page says which deploy it came from; pwa.js compares it with /health to show "🆕 Naya update aaya — Refresh"
const verMeta = html => html.replace("</head>", `<meta name="ak-ver" content="${APP_VERSION}">\n</head>`);
// ---------- v10.8: 🧾 ORDER TOOLS — packing checklist, Ready, edit unavailable items (qty ↓ / remove), substitute suggestions the
// customer answers on the tracking page, bill data, date filter, dashboard counts (IST), one search box. Every query is shop-scoped. ----------
const EDITABLE = new Set(["pending","accepted","preparing","ready"]); // before out_for_delivery
const SUB_NID = 2000000000; // substitute answers are listed in the 🔔 panel with id = SUB_NID + order_subs.id
const istDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null; const t = Date.parse(s + "T00:00:00Z"); return Number.isFinite(t) ? t - IST : null; };
// Discount after an edit: the same offer the customer got, re-checked on the new subtotal; never more than it was. Delivery never goes up.
async function editDiscount(db, o, subtotal){
  const was = o.discount_paise || 0; if (!was) return 0;
  const of = o.discount_offer_id ? await db.prepare(`SELECT * FROM offers WHERE id=? AND shop_id=?`).bind(o.discount_offer_id, db.sid).first() : null;
  let d = was;
  if (of) { const q = cartQuote({free_delivery_above_paise: 0, delivery_charge_paise: 0}, subtotal, [of]); d = q.discount_offer ? q.discount : 0; }
  return Math.max(0, Math.min(d, was, subtotal));
}
async function editableOrder(db, id){
  const o = await db.prepare(`SELECT * FROM orders WHERE id=? AND shop_id=?`).bind(id, db.sid).first();
  if (!o) fail(404, "not_found", "Order not found");
  if (!EDITABLE.has(o.status)) fail(409, "not_editable", "रास्ते में निकलने के बाद ऑर्डर बदल नहीं सकते · The order can't be changed after it is out for delivery", {status: o.status});
  const items = (await db.prepare(`SELECT * FROM order_items WHERE order_id=? ORDER BY id`).bind(o.id).all()).results;
  return {o, items};
}
// One guarded batch: the order row moves first (only if nobody changed it since we read it), every other statement runs only if it did.
async function orderEdit(db, o, {subtotal, actor, why, kind, note, extra}){
  const discount = await editDiscount(db, o, subtotal); const total = subtotal - discount + o.delivery_paise;
  const nonce = randHex(12); const t = Math.max(now(), o.updated_at + 1);
  const ok = sql => `${sql} AND EXISTS (SELECT 1 FROM orders WHERE id=${Number(o.id)} AND restock_nonce='${nonce}')`;
  const stmts = [ctxSet(db, actor, why), db.prepare(`UPDATE orders SET subtotal_paise=?, discount_paise=?, total_paise=?, restock_nonce=?, updated_at=? WHERE id=? AND shop_id=? AND updated_at=? AND status=?`).bind(subtotal, discount, total, nonce, t, o.id, db.sid, o.updated_at, o.status)];
  for (const [sql, args] of extra) stmts.push(db.prepare(ok(sql)).bind(...args));
  stmts.push(db.prepare(ok(`INSERT INTO order_events (order_id,from_status,to_status,note,actor,at,kind) SELECT ?,?,?,?,?,?,? WHERE 1`)).bind(o.id, o.status, o.status, note.slice(0, 300), actor, t, kind));
  stmts.push(ctxClear(db));
  let res;
  try { res = await db.batch(stmts); }
  catch (e) { const m = String(e?.message || e); if (/CHECK/i.test(m)) fail(409, "stock", "इतना स्टॉक नहीं है · Not enough stock for the new item"); if (/UNIQUE/i.test(m)) fail(409, "stale", "This order was just updated. Refresh."); throw e; }
  if (!res[1]?.meta?.changes) fail(409, "stale", "This order was just updated. Refresh.");
  return loadOrder(db, "id=?", o.id);
}
const itemName = i => `${i.product_name}${i.variant_label ? " " + i.variant_label : ""}`;
// ✏️ lower an item's qty or ➖ remove it: stock comes back, totals are recalculated, the customer sees what changed and why.
async function editOrderItem(db, id, b, actor){
  const {o, items} = await editableOrder(db, id);
  const it = items.find(i => i.id === Number(b.item_id)); if (!it) fail(404, "not_found", "Item not found in this order");
  const nq = b.action === "remove" ? 0 : intIn(b.qty, 0, it.qty, "Quantity");
  if (nq === it.qty) return {order: await loadOrder(db, "id=?", o.id), unchanged: true};
  if (nq === 0 && items.length === 1) fail(409, "order_empty", "ऑर्डर खाली नहीं हो सकता — पूरा ऑर्डर अस्वीकार/रद्द करें · An order can't be empty — reject it instead", {suggest: o.status === "pending" ? "rejected" : "cancelled"});
  const reason = str(b.reason, 120).replace(/[<>]/g, "") || "सामान उपलब्ध नहीं · Not available";
  const back = it.qty - nq; const subtotal = items.reduce((a, i) => a + i.line_total_paise, 0) - it.line_total_paise + nq * it.unit_price_paise;
  const extra = [];
  if (it.variant_id) extra.push([`UPDATE variants SET stock = stock + ? WHERE id=? AND shop_id=?`, [back, it.variant_id, db.sid]]);
  extra.push(nq === 0 ? [`DELETE FROM order_items WHERE id=? AND order_id=?`, [it.id, o.id]] : [`UPDATE order_items SET qty=?, line_total_paise=? WHERE id=? AND order_id=?`, [nq, nq * it.unit_price_paise, it.id, o.id]]);
  extra.push([`UPDATE order_subs SET status='withdrawn', answered_at=? WHERE order_id=? AND item_id=? AND status='pending' AND shop_id=?`, [now(), o.id, it.id, db.sid]]);
  const note = nq === 0 ? `➖ ${itemName(it)} हटाया (${it.qty}) — ${reason}` : `✏️ ${itemName(it)}: ${it.qty} → ${nq} — ${reason}`;
  return {order: await orderEdit(db, o, {subtotal, actor, why: `order ${o.code}: ${itemName(it)} ${it.qty}→${nq} — stock returned`, kind: "edit", note, extra}), returned: it.variant_id ? back : 0};
}
// 🔁 shopkeeper suggests an in-stock item of the SAME shop instead of an unavailable one; the customer accepts or declines.
async function suggestSub(db, id, b, actor){
  const {o, items} = await editableOrder(db, id);
  const it = items.find(i => i.id === Number(b.item_id)); if (!it) fail(404, "not_found", "Item not found in this order");
  const vid = intIn(b.variant_id, 1, 1e9, "variant_id"); if (vid === it.variant_id) fail(400, "invalid", "Pick a different item");
  const v = await db.prepare(`SELECT v.*, p.name_hi, p.name_en, p.icon, p.category_id, p.active AS p_active FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.shop_id=? AND p.shop_id=?`).bind(vid, db.sid, db.sid).first();
  if (!v) fail(404, "not_found", "Item not found");
  const qty = b.qty == null ? it.qty : intIn(b.qty, 1, 50, "Quantity");
  if (!v.active || !v.p_active) fail(409, "unavailable", "यह सामान दुकान में बंद है · This item is switched off");
  if (v.stock < qty) fail(409, "stock", `स्टॉक सिर्फ़ ${v.stock} · Only ${v.stock} in stock`, {available: v.stock});
  const price = offerPricer(await liveOffers(db)).price(v, {id: v.product_id, category_id: v.category_id}).price;
  const same = await db.prepare(`SELECT * FROM order_subs WHERE order_id=? AND item_id=? AND status='pending' AND shop_id=?`).bind(o.id, it.id, db.sid).first();
  if (same && same.to_variant_id === vid && same.qty === qty) return {order: await loadOrder(db, "id=?", o.id), sub: subView(same), duplicate: true};
  const t = now();
  const st = [];
  if (same) st.push(db.prepare(`UPDATE order_subs SET status='withdrawn', answered_at=? WHERE id=? AND status='pending'`).bind(t, same.id));
  st.push(db.prepare(`INSERT INTO order_subs (shop_id,order_id,item_id,from_variant_id,from_name,from_label,from_icon,from_unit_paise,to_variant_id,to_name,to_name_en,to_label,to_icon,to_unit_paise,to_mrp_paise,qty,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`)
    .bind(db.sid, o.id, it.id, it.variant_id, it.product_name, it.variant_label, it.icon, it.unit_price_paise, v.id, v.name_hi, v.name_en || "", v.label, v.icon || "", price, v.mrp_paise, qty, t));
  st.push(db.prepare(`INSERT INTO order_events (order_id,from_status,to_status,note,actor,at,kind) VALUES (?,?,?,?,?,?,'sub')`).bind(o.id, o.status, o.status, `🔁 सुझाव: ${itemName(it)} → ${v.name_hi} ${v.label} (×${qty})`, actor, t));
  try { await db.batch(st); } catch (e) { if (/UNIQUE/i.test(String(e?.message || e))) fail(409, "stale", "A suggestion was just made for this item. Refresh."); throw e; }
  const full = await loadOrder(db, "id=?", o.id);
  return {order: full, sub: subView(full.subs.filter(s => s.item_id === it.id && s.status === "pending").pop())};
}
// Customer answers (private order token): Accept swaps the line (stock reserved for the new item, the old one returned, totals
// recalculated); Decline removes the line. Answering twice the same way is a no-op; the order must not be out for delivery yet.
async function answerSub(db, orderId, b){
  const sid = intIn(b.sub_id, 1, 1e9, "sub_id"); const ans = b.answer === "accept" ? "accepted" : b.answer === "decline" ? "declined" : fail(400, "invalid", "answer must be accept or decline");
  const s = await db.prepare(`SELECT * FROM order_subs WHERE id=? AND order_id=? AND shop_id=?`).bind(sid, orderId, db.sid).first();
  if (!s) fail(404, "not_found", "Suggestion not found");
  if (s.status === ans) return {already: true, order: await loadOrder(db, "id=?", orderId), sub: s};
  if (s.status !== "pending") fail(409, "answered", s.status === "withdrawn" ? "दुकान ने यह सुझाव वापस ले लिया · The shop withdrew this suggestion" : "इसका जवाब पहले ही दे दिया · Already answered", {status: s.status});
  const {o, items} = await editableOrder(db, orderId);
  const it = items.find(i => i.id === s.item_id);
  const t = now(); const mark = [`UPDATE order_subs SET status=?, answered_at=? WHERE id=? AND status='pending'`, [ans, t, s.id]];
  const actor = "customer";
  if (!it) { await db.prepare(mark[0]).bind(...mark[1]).run(); return {order: await loadOrder(db, "id=?", orderId), sub: {...s, status: ans}}; }
  const sumOthers = items.reduce((a, i) => a + i.line_total_paise, 0) - it.line_total_paise;
  if (ans === "accepted") {
    const v = await db.prepare(`SELECT v.id, v.active, p.active AS p_active FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.shop_id=? AND p.shop_id=?`).bind(s.to_variant_id, db.sid, db.sid).first();
    if (!v || !v.active || !v.p_active) fail(409, "unavailable", "यह सामान अब उपलब्ध नहीं · This item is no longer available — please decline");
    const extra = [mark];
    if (it.variant_id) extra.push([`UPDATE variants SET stock = stock + ? WHERE id=? AND shop_id=?`, [it.qty, it.variant_id, db.sid]]);
    extra.push([`UPDATE variants SET stock = stock - ? WHERE id=? AND shop_id=?`, [s.qty, s.to_variant_id, db.sid]]); // CHECK(stock>=0) aborts everything on oversell
    extra.push([`UPDATE order_items SET variant_id=?, product_name=?, product_name_en=?, variant_label=?, icon=?, unit_price_paise=?, mrp_paise=?, qty=?, line_total_paise=?, base_price_paise=?, offer_id=NULL, offer_title='' WHERE id=? AND order_id=?`,
      [s.to_variant_id, s.to_name, s.to_name_en, s.to_label, s.to_icon, s.to_unit_paise, s.to_mrp_paise, s.qty, s.qty * s.to_unit_paise, s.to_unit_paise, it.id, o.id]]);
    const order = await orderEdit(db, o, {subtotal: sumOthers + s.qty * s.to_unit_paise, actor, why: `order ${o.code}: substitute accepted — stock swapped`, kind: "sub", note: `✅ ग्राहक ने बदलाव माना: ${itemName(it)} → ${s.to_name} ${s.to_label} (×${s.qty})`, extra});
    return {order, sub: {...s, status: ans}};
  }
  if (items.length === 1) { // last line: keep it (an order can't go empty) — the shop decides (reject/cancel)
    await db.batch([db.prepare(mark[0]).bind(...mark[1]), db.prepare(`INSERT INTO order_events (order_id,from_status,to_status,note,actor,at,kind) VALUES (?,?,?,?,?,?,'sub')`).bind(o.id, o.status, o.status, `❎ ग्राहक ने बदलाव नहीं माना: ${itemName(it)} — दुकान फ़ैसला करेगी`, actor, t)]);
    return {order: await loadOrder(db, "id=?", orderId), sub: {...s, status: ans}, kept_last: true};
  }
  const extra = [mark];
  if (it.variant_id) extra.push([`UPDATE variants SET stock = stock + ? WHERE id=? AND shop_id=?`, [it.qty, it.variant_id, db.sid]]);
  extra.push([`DELETE FROM order_items WHERE id=? AND order_id=?`, [it.id, o.id]]);
  const order = await orderEdit(db, o, {subtotal: sumOthers, actor, why: `order ${o.code}: substitute declined — item removed, stock returned`, kind: "sub", note: `❎ ग्राहक ने बदलाव नहीं माना — ${itemName(it)} हटाया`, extra});
  return {order, sub: {...s, status: ans}};
}
async function notifySubAnswer(env, db, order, s, origin){
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(db.sid).all()).results;
  const ok = s.status === "accepted";
  return pushTo(env, db, subs, "sub:" + s.status, {role: "admin", title: `${ok ? "✅" : "❎"} ${order.code}: ग्राहक ने ${ok ? "बदलाव माना" : "बदलाव नहीं माना"}`, body: `${s.from_name} ${s.from_label} → ${s.to_name} ${s.to_label}`.slice(0, 160), url: `/admin#order=${order.id}`, tag: "sub-" + s.id}, order.id, origin);
}
async function notifySubSuggested(env, db, order, s, origin){
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='customer' AND order_id=? AND shop_id=?`).bind(order.id, db.sid).all()).results;
  if (!subs.length) return [];
  const slug = db.sid === 1 ? "" : (await db.prepare(`SELECT slug FROM shops WHERE id=?`).bind(db.sid).first())?.slug || "";
  return pushTo(env, db, subs, "sub:suggested", {role: "customer", title: "🔁 दुकान ने बदलने का सुझाव दिया", body: `${s.from.name} → ${s.to.name} ${s.to.label}. हाँ / ना बताएँ`.slice(0, 160), url: (slug ? `/track?s=${encodeURIComponent(slug)}` : "/track") + `#open=${order.code}`, tag: "order-" + order.code}, order.id, origin);
}
async function setPacked(db, id, b){
  const o = await db.prepare(`SELECT id, status FROM orders WHERE id=? AND shop_id=?`).bind(id, db.sid).first(); if (!o) fail(404, "not_found", "Order not found");
  const ids = new Set((await db.prepare(`SELECT id FROM order_items WHERE order_id=?`).bind(o.id).all()).results.map(r => r.id));
  const packed = [...new Set((Array.isArray(b.packed) ? b.packed : []).map(Number))].filter(x => ids.has(x)).sort((a, c) => a - c);
  await db.prepare(`UPDATE orders SET packed=? WHERE id=? AND shop_id=?`).bind(JSON.stringify(packed), o.id, db.sid).run();
  return {packed, total: ids.size};
}
// v10.9: "📲 Mere WhatsApp pe bhejo" — free: a wa.me link to the shop's OWN registered mobile with the bill as plain text (no paid API).
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function istStamp(t){ const d = new Date(t + IST); let h = d.getUTCHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h}:${String(d.getUTCMinutes()).padStart(2,"0")} ${ap}`; }
const rsBill = p => "₹" + (p/100).toLocaleString("en-IN", {minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2});
function billWaText(o){
  return [`🧾 Order ${o.code}`, `📅 ${istStamp(o.created_at)}`, `👤 ${o.customer_name} · ${o.phone}`, "",
    ...o.items.map(i => `• ${i.name}${i.label ? " " + i.label : ""} × ${i.qty} = ${rsBill(i.line_paise)}`), "",
    ...(o.discount_paise ? [`छूट: − ${rsBill(o.discount_paise)}`] : []), ...(o.delivery_paise ? [`डिलीवरी: ${rsBill(o.delivery_paise)}`] : []),
    `💰 Total: ${rsBill(o.total_paise)}`].join("\n");
}
function waSelfUrl(mobile, text){ const m = normPhone(mobile); return m ? `https://wa.me/91${m}?text=${encodeURIComponent(text)}` : null; }
async function billData(db, id){
  const o = await loadOrder(db, "id=?", id); if (!o) fail(404, "not_found", "Order not found");
  const s = await getSettings(db); const sh = await db.prepare(`SELECT name, slug, mobile FROM shops WHERE id=?`).bind(db.sid).first();
  const items = o.items.map(i => ({name: i.product_name, label: i.variant_label, qty: i.qty, line_paise: i.line_total_paise}));
  const waText = billWaText({code: o.code, created_at: o.created_at, customer_name: o.customer_name, phone: o.phone, items, discount_paise: o.discount_paise || 0, delivery_paise: o.delivery_paise, total_paise: o.total_paise});
  return {wa_self: {mobile: normPhone(sh?.mobile) || null, url: waSelfUrl(sh?.mobile, waText), text: waText},
    shop: {name: s.store_name_hi || sh?.name || "", name_en: s.store_name_en || "", phone: s.phone || "", address: s.address || ""},
    order: {id: o.id, code: o.code, status: o.status, created_at: o.created_at, customer_name: o.customer_name, phone: o.phone, address: [o.address, o.locality, o.pincode].filter(Boolean).join(", "),
      items: o.items.map(i => ({name: i.product_name, name_en: i.product_name_en, label: i.variant_label, qty: i.qty, unit_paise: i.unit_price_paise, line_paise: i.line_total_paise})),
      subtotal_paise: o.subtotal_paise, discount_paise: o.discount_paise || 0, discount_title: o.discount_title || "", delivery_paise: o.delivery_paise, total_paise: o.total_paise, payment_method: o.payment_method, payment_status: o.payment_status}};
}
async function dashCounts(db, at = now()){
  const day = istDayStart(at);
  const r = await db.prepare(`SELECT
      SUM(CASE WHEN status IN ('pending','accepted','preparing','ready','out_for_delivery') THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status='delivered' AND updated_at >= ? THEN 1 ELSE 0 END) AS delivered_today,
      SUM(CASE WHEN status IN ('cancelled','rejected') AND updated_at >= ? THEN 1 ELSE 0 END) AS closed_today,
      COALESCE(SUM(CASE WHEN status='delivered' AND updated_at >= ? THEN total_paise END), 0) AS delivered_value_today,
      COALESCE(SUM(CASE WHEN created_at >= ? AND status NOT IN ('cancelled','rejected') THEN total_paise END), 0) AS order_value_today
    FROM orders WHERE shop_id=?`).bind(day, day, day, day, db.sid).first();
  const st = await db.prepare(`SELECT SUM(CASE WHEN v.stock <= 0 THEN 1 ELSE 0 END) AS out_n, SUM(CASE WHEN v.stock > 0 AND v.stock <= v.low_stock THEN 1 ELSE 0 END) AS low_n FROM variants v JOIN products p ON p.id=v.product_id WHERE v.shop_id=? AND p.shop_id=? AND p.active=1 AND v.active=1`).bind(db.sid, db.sid).first();
  return {day_start: day, active: r.active || 0, delivered_today: r.delivered_today || 0, closed_today: r.closed_today || 0, delivered_value_today: r.delivered_value_today || 0, order_value_today: r.order_value_today || 0, out_count: st.out_n || 0, low_only_count: st.low_n || 0};
}
async function globalSearch(db, q){
  q = String(q || "").trim().slice(0, 60); if (q.length < 2) return {q, products: [], orders: []};
  const like = `%${q.replace(/[%_]/g, "")}%`; const digits = q.replace(/\D/g, "");
  const products = (await db.prepare(`SELECT p.id, p.name_hi, p.name_en, p.icon, p.active, (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id AND v.shop_id=?) AS sizes, (SELECT COALESCE(SUM(stock),0) FROM variants v WHERE v.product_id=p.id AND v.shop_id=?) AS stock FROM products p WHERE p.shop_id=? AND (p.name_hi LIKE ? OR p.name_en LIKE ? OR p.brand LIKE ?) ORDER BY p.active DESC, p.name_hi LIMIT 15`).bind(db.sid, db.sid, db.sid, like, like, like).all()).results;
  const orders = (await db.prepare(`SELECT id, code, status, customer_name, phone, total_paise, created_at FROM orders WHERE shop_id=? AND (code LIKE ? OR customer_name LIKE ?${digits.length >= 3 ? " OR phone LIKE ?" : ""}) ORDER BY id DESC LIMIT 15`).bind(db.sid, like, like, ...(digits.length >= 3 ? [`%${digits}%`] : [])).all()).results;
  return {q, products, orders};
}

// ---------- v10.7: 📦 STOCK — catalog bulk add, list/CSV/Excel/PDF import (parsed in the browser, saved only after the preview
// is confirmed), stock-in register, one-tap restock, and low-stock alerts (🔔 panel + Web Push, once per crossing). ----------
const STOCK_NID = 1000000000; // stock alerts are listed in the 🔔 panel with id = STOCK_NID + alert id (notice ids never get near it)
const LOW_DEFAULT = 5;
const UNIT_MAP = [[/^(kg|kgs|kilo|kilogram|किलो|कि\.?ग्रा\.?)$/,"kg"],[/^(g|gm|gms|gram|grams|gr|ग्राम|ग्रा\.?)$/,"g"],[/^(l|ltr|ltrs|litre|liter|litres|liters|लीटर|ली\.?)$/,"l"],
  [/^(ml|mls|मिली|मि\.?ली\.?)$/,"ml"],[/^(pc|pcs|piece|pieces|nos|no|पीस|नग)$/,"pc"],[/^(pkt|pack|packet|packets|पैकेट|पैक)$/,"pkt"],[/^(dozen|dz|दर्जन)$/,"dozen"]];
const normName = s => String(s || "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
function normLabel(s){
  const t = String(s || "").normalize("NFC").toLowerCase().replace(/[०-९]/g, d => "०१२३४५६७८९".indexOf(d)).replace(/\s+/g, " ").trim();
  return t.replace(/(\d+(?:\.\d+)?)\s*([^\d\s]+)/g, (m0, n, u) => { const hit = UNIT_MAP.find(([re]) => re.test(u)); return Number(n) + (hit ? hit[1] : u); }).replace(/\s+/g, "");
}
const itemKey = (name, label) => normName(name) + "|" + normLabel(label);
async function lowDefault(db){ const r = await db.prepare(`SELECT value FROM shop_settings WHERE shop_id=? AND key='low_stock_default'`).bind(db.sid).first(); const n = r ? Number(r.value) : LOW_DEFAULT; return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : LOW_DEFAULT; }
// Claim an idempotency key inside the same transaction as the write: a repeated key aborts the whole batch (PRIMARY KEY), so a
// double tap / double submit can never apply twice. Returns the earlier result when the key was already used.
const claimStmt = (db, key, kind) => db.prepare(`INSERT INTO bulk_ops (shop_id,idem,kind,created_at) VALUES (?,?,?,?)`).bind(db.sid, key, kind, now());
async function priorOp(db, key){ const r = await db.prepare(`SELECT result FROM bulk_ops WHERE shop_id=? AND idem=?`).bind(db.sid, key).first(); if (!r) return null; let x = {}; try { x = JSON.parse(r.result || "{}"); } catch {} return {...x, duplicate: true}; }
const saveOp = (db, key, result) => db.prepare(`UPDATE bulk_ops SET result=? WHERE shop_id=? AND idem=?`).bind(JSON.stringify(result).slice(0, 20000), db.sid, key).run();
const idemKey = v => { const k = str(v, 80, {required: true, field: "idempotency_key"}); if (!/^[\w:.\-]{6,80}$/.test(k)) fail(400, "invalid", "Bad idempotency key"); return k; };

async function stockList(db){
  const rows = (await db.prepare(`SELECT v.id AS vid, v.product_id AS pid, v.label, v.stock, v.low_stock, v.price_paise, v.mrp_paise, v.active AS v_active, p.active AS p_active, p.name_hi, p.name_en, p.icon, p.category_id, c.name_hi AS cat_hi, c.name_en AS cat_en, c.icon AS cat_icon
    FROM variants v JOIN products p ON p.id=v.product_id AND p.shop_id=v.shop_id LEFT JOIN categories c ON c.id=p.category_id AND c.shop_id=p.shop_id WHERE v.shop_id=? ORDER BY (v.stock <= v.low_stock) DESC, v.stock ASC, p.name_hi, v.sort, v.id`).bind(db.sid).all()).results;
  const items = rows.map(r => ({vid: r.vid, pid: r.pid, name_hi: r.name_hi, name_en: r.name_en, icon: r.icon, label: r.label, stock: r.stock, low_stock: r.low_stock, price_paise: r.price_paise, mrp_paise: r.mrp_paise,
    show: !!(r.p_active && r.v_active), category_id: r.category_id, cat_hi: r.cat_hi || "", cat_en: r.cat_en || "", cat_icon: r.cat_icon || "",
    state: r.stock <= 0 ? "out" : r.stock <= r.low_stock ? "low" : "ok"}));
  const vis = items.filter(x => x.show);
  return {items, default_low: await lowDefault(db), counts: {all: items.length, low: items.filter(x => x.state === "low").length, out: items.filter(x => x.state === "out").length, low_visible: vis.filter(x => x.state !== "ok").length}};
}
// After any stock change: re-arm alerts for items back above their limit; alert ONCE for the given items that are now at/below it.
async function stockCheck(env, raw, sid, vids, origin){
  const t = now();
  await raw.batch([raw.prepare(`UPDATE stock_alerts SET cleared_at=? WHERE shop_id=? AND cleared_at IS NULL AND variant_id IN (SELECT id FROM variants WHERE shop_id=? AND stock > low_stock)`).bind(t, sid, sid),
    raw.prepare(`UPDATE variants SET low_alerted=0 WHERE shop_id=? AND low_alerted=1 AND stock > low_stock`).bind(sid)]);
  const ids = [...new Set((vids || []).map(Number).filter(x => Number.isInteger(x) && x > 0))].slice(0, 500);
  if (!ids.length) return [];
  const hit = (await raw.prepare(`UPDATE variants SET low_alerted=1 WHERE shop_id=? AND low_alerted=0 AND active=1 AND stock <= low_stock AND id IN (SELECT value FROM json_each(?)) AND product_id IN (SELECT id FROM products WHERE shop_id=? AND active=1) RETURNING id, product_id, label, stock, low_stock`).bind(sid, JSON.stringify(ids), sid).all()).results;
  if (!hit.length) return [];
  const names = Object.fromEntries((await raw.prepare(`SELECT id, name_hi, name_en, icon FROM products WHERE shop_id=? AND id IN (SELECT value FROM json_each(?))`).bind(sid, JSON.stringify(hit.map(h => h.product_id))).all()).results.map(p => [p.id, p]));
  const rows = hit.map(h => ({v: h.id, p: h.product_id, n: (names[h.product_id] || {}).name_hi || "", l: h.label, s: h.stock, k: h.low_stock}));
  const made = (await raw.prepare(`INSERT INTO stock_alerts (shop_id,variant_id,product_id,name,label,stock,low_stock,created_at) SELECT ?, json_extract(value,'$.v'), json_extract(value,'$.p'), json_extract(value,'$.n'), json_extract(value,'$.l'), json_extract(value,'$.s'), json_extract(value,'$.k'), ? FROM json_each(?) RETURNING id, variant_id, name, label, stock, low_stock`).bind(sid, t, JSON.stringify(rows)).all()).results;
  try {
    const sdb = scoped(raw, sid);
    const subs = (await raw.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(sid).all()).results;
    let payload;
    if (made.length === 1) { const a = made[0]; const left = a.stock <= 0 ? "ख़त्म हो गया (0 बचा)" : `सिर्फ़ ${a.stock} बचे`;
      payload = {role: "admin", title: `⚠️ कम स्टॉक: ${a.name} ${a.label}`.slice(0, 120), body: `${left} · लिमिट ${a.low_stock}. एक टैप में +10 / +20 जोड़ें`, url: `/admin#stock=${a.variant_id}`, tag: "stock-" + a.variant_id,
        actions: [{action: "a10", title: "+10 जोड़ें", url: `/admin#restock=${a.id}:10`}, {action: "a20", title: "+20 जोड़ें", url: `/admin#restock=${a.id}:20`}]}; }
    else payload = {role: "admin", title: `⚠️ ${made.length} सामान का स्टॉक कम`, body: made.slice(0, 4).map(a => `${a.name} ${a.label}: ${a.stock}`).join(" · ").slice(0, 160), url: "/admin#stock=low", tag: "stock-many"};
    await pushTo(env, sdb, subs, "stock:low", payload, null, origin);
  } catch (e) { console.error("stock push", e); }
  return made;
}
// Stock in (and one-tap restock, and "set exact"): one UPDATE + one register insert, exactly once per idempotency key.
async function stockIn(env, raw, db, b, {kind = "in", actor = "admin", origin = "", key} = {}){
  const list = (Array.isArray(b.items) ? b.items : []).slice(0, 300);
  if (!list.length) fail(400, "invalid", "Choose at least one item");
  key = key || idemKey(b.idempotency_key);
  const prev = await priorOp(db, key); if (prev) return prev;
  const vids = list.map(x => intIn(x && x.variant_id, 1, 1e9, "variant_id"));
  if (new Set(vids).size !== vids.length) fail(400, "invalid", "Same item twice");
  const cur = Object.fromEntries((await db.prepare(`SELECT id, stock FROM variants WHERE shop_id=? AND id IN (SELECT value FROM json_each(?))`).bind(db.sid, JSON.stringify(vids)).all()).results.map(r => [r.id, r.stock]));
  if (Object.keys(cur).length !== vids.length) fail(404, "not_found", "Item not found");
  const rows = list.map((x, i) => ({id: vids[i], q: intIn(x && x.qty, 1, 100000, "Quantity"), k: kind}));
  const note = str(b.note, 140);
  const t = now();
  const J = JSON.stringify(rows);
  try {
    await db.batch([claimStmt(db, key, "stock_" + kind), ctxSet(db, actor, kind === "restock" ? "stock restock (1 tap)" : "stock in" + (note ? ": " + note : "")),
      db.prepare(`UPDATE variants SET stock = stock + (SELECT json_extract(j.value,'$.q') FROM json_each(?) j WHERE json_extract(j.value,'$.id')=variants.id) WHERE shop_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(J, db.sid, J),
      db.prepare(`INSERT INTO stock_log (shop_id,variant_id,product_id,qty,before_qty,after_qty,kind,note,actor,op,created_at) SELECT ?, v.id, v.product_id, json_extract(j.value,'$.q'), v.stock - json_extract(j.value,'$.q'), v.stock, json_extract(j.value,'$.k'), ?, ?, ?, ? FROM json_each(?) j JOIN variants v ON v.id=json_extract(j.value,'$.id') AND v.shop_id=?`).bind(db.sid, note, actor, key, t, J, db.sid),
      ctxClear(db)]);
  } catch (e) {
    if (/bulk_ops/i.test(String(e?.message || e))) { const p2 = await priorOp(db, key); if (p2) return p2; }
    if (/CHECK/i.test(String(e?.message || e))) fail(409, "stock_negative", "Stock can't go below 0");
    throw e;
  }
  const after = (await db.prepare(`SELECT id, stock, low_stock FROM variants WHERE shop_id=? AND id IN (SELECT value FROM json_each(?))`).bind(db.sid, JSON.stringify(vids)).all()).results;
  const result = {ok: true, items: after.map(r => ({variant_id: r.id, before: cur[r.id], stock: r.stock, low_stock: r.low_stock}))};
  await saveOp(db, key, result);
  await stockCheck(env, raw, db.sid, vids, origin);
  return {...result, duplicate: false};
}
// Bulk add (ready-list catalog and confirmed import preview). New items: grouped by name into one product with its sizes; a size already
// in the shop is SKIPPED (never duplicated); a known name with a new size becomes a new size of that product. "updates" add stock and/or
// change the price of existing items (the import's "update instead of new" choice). Exactly once per idempotency key.
async function bulkAdd(env, raw, db, b, actor, origin){
  const key = idemKey(b.idempotency_key);
  const prev = await priorOp(db, key); if (prev) return prev;
  const items = Array.isArray(b.items) ? b.items : [], updates = Array.isArray(b.updates) ? b.updates : [];
  if (items.length + updates.length === 0) fail(400, "invalid", "Nothing to add");
  if (items.length > 300 || updates.length > 300) fail(400, "invalid", "Max 300 rows at a time");
  const defLow = await lowDefault(db);
  const errors = [];
  const clean = items.map((x, i) => { try {
      x = x || {};
      const name_hi = str(x.name_hi, 80) || str(x.name_en, 80); const name_en = str(x.name_en, 80);
      if (!name_hi) fail(400, "invalid", "Name missing");
      const label = str(x.label, 40) || "1 पीस";
      const price = toPaise(x.price, "Price"); if (!price || price <= 0) fail(400, "invalid", "Price missing");
      let mrp = x.mrp == null || x.mrp === "" ? null : toPaise(x.mrp, "MRP"); if (mrp != null && mrp < price) fail(400, "invalid", "MRP is less than price");
      const stock = x.stock == null || x.stock === "" ? 0 : intIn(x.stock, 0, 100000, "Stock");
      const low = x.low_stock == null || x.low_stock === "" ? defLow : intIn(x.low_stock, 0, 10000, "Low-stock limit");
      return {i, name_hi, name_en, label, price, mrp, stock, low, show: x.show === undefined ? 1 : (bool(x.show) ? 1 : 0), icon: str(x.icon, 8) || "🛍️",
        cat_hi: str(x.category_hi, 40), cat_en: str(x.category_en, 40), cat_icon: str(x.category_icon, 8) || str(x.icon, 8) || "🛍️"};
    } catch (e) { errors.push({row: i + 1, name: String((x && (x.name_hi || x.name_en)) || "").slice(0, 60), error: e.message}); return null; } });
  if (errors.length) fail(400, "invalid_rows", `${errors.length} row(s) need fixing`, {rows: errors.slice(0, 50)});
  // existing items of THIS shop
  const ex = (await db.prepare(`SELECT v.id, v.label, v.price_paise, v.mrp_paise, v.stock, p.id AS pid, p.name_hi, p.name_en FROM variants v JOIN products p ON p.id=v.product_id AND p.shop_id=v.shop_id WHERE v.shop_id=?`).bind(db.sid).all()).results;
  const exKeys = new Set(), exProd = new Map();
  for (const r of ex) { for (const nm of [r.name_hi, r.name_en]) if (nm) { exKeys.add(itemKey(nm, r.label)); if (!exProd.has(normName(nm))) exProd.set(normName(nm), r.pid); } }
  const skipped = [], seen = new Set(), add = [];
  for (const c of clean) { const k1 = itemKey(c.name_hi, c.label), k2 = c.name_en ? itemKey(c.name_en, c.label) : k1;
    if (exKeys.has(k1) || exKeys.has(k2)) { skipped.push({name: c.name_hi, label: c.label, reason: "already_added"}); continue; }
    if (seen.has(k1) || seen.has(k2)) { skipped.push({name: c.name_hi, label: c.label, reason: "repeated"}); continue; }
    seen.add(k1); seen.add(k2); add.push(c); }
  // updates (existing items: + stock, new price)
  const exById = new Map(ex.map(r => [r.id, r]));
  const upd = updates.map((u, i) => { u = u || {}; const id = intIn(u.variant_id, 1, 1e9, "variant_id"); const r = exById.get(id); if (!r) fail(404, "not_found", "Item not found");
    const a = u.add_stock == null || u.add_stock === "" ? 0 : intIn(u.add_stock, 0, 100000, "Stock");
    const pr = u.price == null || u.price === "" ? null : toPaise(u.price, "Price");
    if (pr != null && pr <= 0) fail(400, "invalid", "Price must be more than 0");
    if (pr != null && r.mrp_paise != null && pr > r.mrp_paise) fail(400, "invalid_rows", `${r.name_hi} ${r.label}: price is more than MRP`, {rows: [{row: i + 1, name: r.name_hi, error: "price > MRP"}]});
    return {id, a, p: pr}; }).filter(u => u.a > 0 || u.p != null);
  if (new Set(upd.map(u => u.id)).size !== upd.length) fail(400, "invalid", "Same item twice");
  // categories: reuse by Hindi or English name, create the missing ones
  const cats = (await db.prepare(`SELECT id, name_hi, name_en FROM categories WHERE shop_id=?`).bind(db.sid).all()).results;
  const catOf = new Map(); for (const c of cats) for (const nm of [c.name_hi, c.name_en]) if (nm) catOf.set(normName(nm), c.id);
  const needCats = []; const needSeen = new Set();
  for (const c of add) { const nm = c.cat_hi || c.cat_en; if (!nm) continue; const k = normName(c.cat_hi), k2 = normName(c.cat_en);
    if ((k && catOf.has(k)) || (k2 && catOf.has(k2)) || needSeen.has(k || k2)) continue; needSeen.add(k || k2); needCats.push({h: c.cat_hi || c.cat_en, e: c.cat_en, i: c.cat_icon}); }
  const t = now();
  // group new items into products (same name → one product, its sizes as variants); a known name gets the new size added
  const groups = new Map();
  for (const c of add) { const g = normName(c.name_hi); if (!groups.has(g)) groups.set(g, {pid: exProd.get(g) || (c.name_en && exProd.get(normName(c.name_en))) || null, first: c, rows: []}); groups.get(g).rows.push(c); }
  const newProds = [...groups.values()].filter(g => !g.pid).map(g => g.first);
    const exCat = c => (normName(c.cat_hi) && catOf.get(normName(c.cat_hi))) || (normName(c.cat_en) && catOf.get(normName(c.cat_en))) || null;
  const P = JSON.stringify(newProds.map(c => ({h: c.name_hi, e: c.name_en, i: c.icon, a: c.show, cid: exCat(c), c: c.cat_hi || c.cat_en || null})));
  const V = JSON.stringify([...groups.values()].flatMap(g => g.rows.map((c, j) => ({pid: g.pid, h: g.first.name_hi, l: c.label, p: c.price, m: c.mrp, s: c.stock, k: c.low, o: j}))));
  const U = JSON.stringify(upd);
  const st = [claimStmt(db, key, "bulk"), ctxSet(db, actor, b.source === "import" ? "list import" : "ready list: add all")];
  if (needCats.length) st.push(db.prepare(`INSERT INTO categories (shop_id,name_hi,name_en,icon,sort,active,is_demo) SELECT ?, json_extract(value,'$.h'), COALESCE(json_extract(value,'$.e'),''), json_extract(value,'$.i'), 100 + key, 1, 0 FROM json_each(?)`).bind(db.sid, JSON.stringify(needCats)));
  // category resolved by name inside SQL (the ones just created included)
  const catMax = cats.reduce((a, c) => Math.max(a, c.id), 0);
  const catSQL = `COALESCE(json_extract(j.value,'$.cid'), (SELECT id FROM categories c WHERE c.shop_id=? AND c.id > ${Number(catMax)} AND c.name_hi=json_extract(j.value,'$.c') ORDER BY c.id LIMIT 1))`;
  if (newProds.length) st.push(db.prepare(`INSERT INTO products (shop_id,category_id,name_hi,name_en,brand,description,icon,featured,active,is_demo,created_at,updated_at) SELECT ?, ${catSQL}, json_extract(j.value,'$.h'), COALESCE(json_extract(j.value,'$.e'),''), '', '', json_extract(j.value,'$.i'), 0, json_extract(j.value,'$.a'), 0, ?, ? FROM json_each(?) j`).bind(db.sid, db.sid, t, t, P));
  const vmax = (await db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM variants`).first()).m;
  if (add.length) st.push(db.prepare(`INSERT INTO variants (shop_id,product_id,label,price_paise,mrp_paise,stock,low_stock,active,sort) SELECT ?, COALESCE(json_extract(j.value,'$.pid'), (SELECT MAX(id) FROM products WHERE shop_id=? AND name_hi=json_extract(j.value,'$.h'))), json_extract(j.value,'$.l'), json_extract(j.value,'$.p'), json_extract(j.value,'$.m'), json_extract(j.value,'$.s'), json_extract(j.value,'$.k'), 1, json_extract(j.value,'$.o') FROM json_each(?) j`).bind(db.sid, db.sid, V));
  if (add.length) st.push(db.prepare(`INSERT INTO stock_log (shop_id,variant_id,product_id,qty,before_qty,after_qty,kind,note,actor,op,created_at) SELECT shop_id, id, product_id, stock, 0, stock, 'new', ?, ?, ?, ? FROM variants WHERE shop_id=? AND id > ? AND stock > 0`).bind(b.source === "import" ? "list import" : "ready list", actor, key, t, db.sid, vmax));
  if (upd.length) {
    st.push(db.prepare(`INSERT INTO stock_log (shop_id,variant_id,product_id,qty,before_qty,after_qty,kind,note,actor,op,created_at) SELECT ?, v.id, v.product_id, json_extract(j.value,'$.a'), v.stock, v.stock + json_extract(j.value,'$.a'), 'in', ?, ?, ?, ? FROM json_each(?) j JOIN variants v ON v.id=json_extract(j.value,'$.id') AND v.shop_id=? WHERE json_extract(j.value,'$.a') > 0`).bind(db.sid, "list import", actor, key, t, U, db.sid));
    st.push(db.prepare(`UPDATE variants SET stock = stock + COALESCE((SELECT json_extract(j.value,'$.a') FROM json_each(?) j WHERE json_extract(j.value,'$.id')=variants.id),0), price_paise = COALESCE((SELECT json_extract(j.value,'$.p') FROM json_each(?) j WHERE json_extract(j.value,'$.id')=variants.id), price_paise) WHERE shop_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(U, U, db.sid, U));
  }
  st.push(ctxClear(db));
  try { await db.batch(st); }
  catch (e) { if (/bulk_ops/i.test(String(e?.message || e))) { const p2 = await priorOp(db, key); if (p2) return p2; } if (/CHECK/i.test(String(e?.message || e))) fail(400, "invalid", "A price/MRP/stock value is not allowed"); throw e; }
  const result = {ok: true, added: add.length, updated: upd.length, skipped, categories_created: needCats.length, products_created: newProds.length};
  await saveOp(db, key, result);
  if (upd.length) await stockCheck(env, raw, db.sid, upd.map(u => u.id), origin);
  return {...result, duplicate: false};
}
async function stockApi(req, env, url, ctx, raw, db, admin, p, m){
  const actor = actorOf(admin), origin = url.origin;
  if (p === "/api/admin/stock" && m === "GET") return json({ok: true, ...(await stockList(db))});
  if (p === "/api/admin/stock/log" && m === "GET") {
    const vid = Number(url.searchParams.get("vid")) || 0;
    const rows = (await db.prepare(`SELECT l.id, l.variant_id, l.qty, l.before_qty, l.after_qty, l.kind, l.note, l.actor, l.created_at, p.name_hi, p.name_en, p.icon, v.label FROM stock_log l LEFT JOIN variants v ON v.id=l.variant_id AND v.shop_id=l.shop_id LEFT JOIN products p ON p.id=l.product_id AND p.shop_id=l.shop_id WHERE l.shop_id=? ${vid ? "AND l.variant_id=?" : ""} ORDER BY l.id DESC LIMIT 60`).bind(...(vid ? [db.sid, vid] : [db.sid])).all()).results;
    return json({ok: true, log: rows});
  }
  if (p === "/api/admin/stock/in" && m === "POST") return json(await stockIn(env, raw, db, await body(req), {kind: "in", actor, origin}));
  if (p === "/api/admin/stock/restock" && m === "POST") {
    const b = await body(req); const qty = intIn(b.qty, 1, 100000, "Quantity"); let vid, key;
    if (b.alert_id != null) { const aid = intIn(b.alert_id, 1, 1e9, "alert_id");
      const a = await db.prepare(`SELECT id, variant_id FROM stock_alerts WHERE id=? AND shop_id=?`).bind(aid, db.sid).first(); if (!a) fail(404, "not_found", "Alert not found");
      vid = a.variant_id; key = `alert:${aid}:${qty}`;
      await db.prepare(`UPDATE stock_alerts SET read_at=COALESCE(read_at,?) WHERE id=? AND shop_id=?`).bind(now(), aid, db.sid).run();
    } else { vid = intIn(b.variant_id, 1, 1e9, "variant_id"); key = idemKey(b.idempotency_key); }
    const r = await stockIn(env, raw, db, {items: [{variant_id: vid, qty}], note: str(b.note, 140) || ""}, {kind: "restock", actor, origin, key});
    return json(r);
  }
  if (p === "/api/admin/stock/limit" && m === "POST") {
    const b = await body(req);
    if (b.default_low != null) { const n = intIn(b.default_low, 0, 10000, "Low-stock limit");
      const st = [db.prepare(`INSERT OR REPLACE INTO shop_settings (shop_id,key,value) VALUES (?,?,?)`).bind(db.sid, "low_stock_default", String(n))];
      if (b.apply_all === true) st.push(db.prepare(`UPDATE variants SET low_stock=? WHERE shop_id=?`).bind(n, db.sid));
      await db.batch(st);
      if (b.apply_all === true) { const all = (await db.prepare(`SELECT id FROM variants WHERE shop_id=?`).bind(db.sid).all()).results.map(r => r.id); await stockCheck(env, raw, db.sid, all, origin); }
      return json({ok: true, default_low: n});
    }
    const vid = intIn(b.variant_id, 1, 1e9, "variant_id"), n = intIn(b.low_stock, 0, 10000, "Low-stock limit");
    const r = await db.prepare(`UPDATE variants SET low_stock=? WHERE id=? AND shop_id=?`).bind(n, vid, db.sid).run(); if (!r.meta.changes) fail(404, "not_found", "Item not found");
    const alerts = await stockCheck(env, raw, db.sid, [vid], origin);
    return json({ok: true, variant_id: vid, low_stock: n, alerted: alerts.length});
  }
  if (p === "/api/admin/stock/show" && m === "POST") {
    const b = await body(req); const pid = intIn(b.product_id, 1, 1e9, "product_id"); const on = bool(b.show) ? 1 : 0;
    const r = await db.batch([ctxSet(db, actor, on ? "show in shop" : "hide from shop"), db.prepare(`UPDATE products SET active=?, updated_at=? WHERE id=? AND shop_id=?`).bind(on, now(), pid, db.sid), ctxClear(db)]);
    if (!r[1].meta.changes) fail(404, "not_found", "Item not found");
    if (on) { const vids = (await db.prepare(`SELECT id FROM variants WHERE product_id=? AND shop_id=?`).bind(pid, db.sid).all()).results.map(x => x.id); await stockCheck(env, raw, db.sid, vids, origin); }
    return json({ok: true, product_id: pid, show: !!on});
  }
  if (p === "/api/admin/stock/bulk" && m === "POST") { const r = await bulkAdd(env, raw, db, await body(req), actor, origin); return json(r, r.duplicate ? 200 : 201); }
  fail(404, "not_found", "Not found");
}
async function adminApi(req, env, url, ctx, raw, admin, p){
  const m = req.method; let mm;
  if (admin.shop_status === "rejected" && !admin.dev) fail(403,"shop_rejected","This shop account was not approved — please contact the developer.");
  if (admin.dev && p === "/api/admin/password") fail(403,"dev_mode","Developer mode: use Dev → Shops → reset password instead.");
  const db = scoped(raw, admin.shop_id); // from here on every query is this shop only
  const byOrder = o => scoped(raw, o.shop_id);
  // Paused service: the shopkeeper panel is read-only (exports still work — they are GETs). Logout/password stay allowed. The developer can still edit.
  const svc = await service(db);
  // v8: subscription expired → only the recharge screen works (plus logout/password/alerts). All data is kept.
  if (svc.paused_reason === "expired" && !SUB_OPEN_PATHS.has(p))
    fail(402,"subscription_expired","सब्सक्रिप्शन खत्म हो गया — दुकान रुकी है। पैनल चलाने के लिए सब्सक्रिप्शन रिचार्ज करें। · Subscription expired: recharge to continue.");
  if (p === "/api/admin/subscription" && m === "GET") return json({ok:true, ...(await shopSubView(raw, admin.shop_id, svc))});
  // ----- v10.4: 🔔 notification panel (this shop's rows only) -----
  if (p === "/api/admin/notifications" && m === "GET") {
    if (!admin.dev) { try { await runReminders(env, raw, {shopId: admin.shop_id, push: false}); } catch (e) { console.error("lazy reminders", e); } }
    return json({ok:true, ...(await shopNotices(raw, admin.shop_id))});
  }
  if (p === "/api/admin/notifications/read" && m === "POST") {
    const b = await body(req);
    if (!admin.dev) {
      if (b.all === true) await raw.batch([raw.prepare(`UPDATE notice_recipients SET read_at=? WHERE shop_id=? AND read_at IS NULL`).bind(now(), admin.shop_id), raw.prepare(`UPDATE stock_alerts SET read_at=? WHERE shop_id=? AND read_at IS NULL`).bind(now(), admin.shop_id), raw.prepare(`UPDATE order_subs SET read_at=? WHERE shop_id=? AND read_at IS NULL AND status IN ('accepted','declined')`).bind(now(), admin.shop_id)]);
      else { const all = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(x => Number.isInteger(x) && x > 0).slice(0, 200);
        const ids = all.filter(x => x < STOCK_NID), sids = all.filter(x => x > STOCK_NID && x < SUB_NID).map(x => x - STOCK_NID), bids = all.filter(x => x > SUB_NID).map(x => x - SUB_NID);
        if (bids.length) await raw.prepare(`UPDATE order_subs SET read_at=? WHERE shop_id=? AND read_at IS NULL AND id IN (SELECT value FROM json_each(?))`).bind(now(), admin.shop_id, JSON.stringify(bids)).run();
        if (ids.length) await raw.prepare(`UPDATE notice_recipients SET read_at=? WHERE shop_id=? AND read_at IS NULL AND notice_id IN (SELECT value FROM json_each(?))`).bind(now(), admin.shop_id, JSON.stringify(ids)).run();
        if (sids.length) await raw.prepare(`UPDATE stock_alerts SET read_at=? WHERE shop_id=? AND read_at IS NULL AND id IN (SELECT value FROM json_each(?))`).bind(now(), admin.shop_id, JSON.stringify(sids)).run(); }
    }
    const u = await raw.prepare(`SELECT (SELECT COUNT(*) FROM notice_recipients WHERE shop_id=? AND read_at IS NULL) + (SELECT COUNT(*) FROM (SELECT read_at FROM stock_alerts WHERE shop_id=? ORDER BY id DESC LIMIT 40) WHERE read_at IS NULL) + (SELECT COUNT(*) FROM (SELECT read_at FROM order_subs WHERE shop_id=? AND status IN ('accepted','declined') ORDER BY answered_at DESC LIMIT 30) WHERE read_at IS NULL) AS n`).bind(admin.shop_id, admin.shop_id, admin.shop_id).first();
    return json({ok:true, unread: u.n});
  }
  if (p === "/api/admin/subscription/invoice" && m === "POST") {
    const {inv} = await ensureInvoice(raw, admin.shop_id, actorOf(admin));
    return json({ok:true, ...(await shopSubView(raw, admin.shop_id, await service(db))), invoice: invView(inv)});
  }
  if (p === "/api/admin/subscription/pay" && m === "POST") {
    const b = await body(req); const t = now();
    if (!(await rateCheck(db, "subpay:" + admin.shop_id, 10, DAY))) fail(429,"rate_limited","Too many attempts today");
    const inv = await raw.prepare(`SELECT * FROM invoices WHERE id=? AND shop_id=?`).bind(intIn(b.invoice_id, 1, 1e12, "invoice"), admin.shop_id).first();
    if (!inv) fail(404,"not_found","Bill not found");
    if (inv.status === "pending_verify") fail(409,"already_submitted","इस बिल का पेमेंट पहले ही भेजा जा चुका है — जाँच हो रही है। · Already submitted, being verified.");
    if (inv.status !== "unpaid") fail(409,"invalid","This bill is not open");
    const utr = String(b.utr ?? "").replace(/[\s-]/g, "");
    if (!/^\d{12}$/.test(utr)) fail(400,"invalid_utr","UTR / Transaction ID 12 अंकों का होना चाहिए · UTR must be 12 digits");
    if (await raw.prepare(`SELECT id FROM sub_payments WHERE utr=?`).bind(utr).first()) fail(409,"duplicate_utr","यह UTR पहले ही इस्तेमाल हो चुका है · This UTR was already used");
    let shot = null;
    if (b.screenshot) { const mt = String(b.screenshot).match(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/); if (!mt) fail(400,"invalid","Screenshot must be a JPG/PNG/WebP image"); if (b.screenshot.length > 600000) fail(413,"too_large","Screenshot too big"); shot = b.screenshot; }
    // Provisional 48 h access — unless a payment of this shop was rejected in the last 7 days (stops fake-UTR loops).
    const recentReject = await raw.prepare(`SELECT id FROM sub_payments WHERE shop_id=? AND status='rejected' AND decided_at >= ?`).bind(admin.shop_id, t - 7*DAY).first();
    const prov = recentReject ? 0 : t + PROVISIONAL_HOURS*3600e3;
    try {
      await raw.batch([
        raw.prepare(`INSERT INTO sub_payments (shop_id,invoice_id,utr,amount_paise,screenshot,status,provisional_until,submitted_at) VALUES (?,?,?,?,?,'pending',?,?)`).bind(admin.shop_id, inv.id, utr, inv.amount_paise, shot, prov, t),
        raw.prepare(`UPDATE invoices SET status='pending_verify' WHERE id=?`).bind(inv.id),
        raw.prepare(`UPDATE shops SET provisional_until=MAX(provisional_until, ?), updated_at=? WHERE id=?`).bind(prov, t, admin.shop_id),
        subLog(raw, admin.shop_id, actorOf(admin), "utr_submitted", `${inv.number} · UTR ${utr} · ₹${rs(inv.amount_paise)}` + (prov ? " · 48h provisional access" : " · no provisional access (recent rejection)"))
      ]);
    } catch (e) { if (/UNIQUE/i.test(String(e?.message || e))) fail(409,"duplicate_utr","यह UTR पहले ही इस्तेमाल हो चुका है · This UTR was already used"); throw e; }
    { const shn = (await raw.prepare(`SELECT name FROM shops WHERE id=?`).bind(admin.shop_id).first())?.name || "Dukaan";
      await devEvent(env, raw, ctx, {kind: "utr", label: shn, shop_id: admin.shop_id, dedupe: "utr:" + utr, url: "/dev#payments", title: `💰 Payment received: ${shn} — ₹${rs(inv.amount_paise)}, please verify`, body: `Bill ${inv.number} · UTR received · Dev → Payments → ✅ Verify / ❌ Reject`}, url.origin); }
    const after = await service(db);
    return json({ok:true, provisional: !!prov, ...(await shopSubView(raw, admin.shop_id, after))});
  }
  if (svc.status === "paused" && !admin.dev && m !== "GET" && !["/api/admin/logout","/api/admin/password","/api/admin/push/unsubscribe"].includes(p))
    fail(423,"service_paused","सेवा रुकी हुई है — पैनल अभी सिर्फ़ देखने के लिए है। · Service paused: the panel is read-only. Please contact your developer.");
  if (p === "/api/admin/stock" || p.startsWith("/api/admin/stock/")) return stockApi(req, env, url, ctx, raw, db, admin, p, m); // v10.7 📦
  if (p === "/api/admin/orders.csv" && m === "GET") return new Response(await exportOrdersCSV(db), {headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="kirana-orders.csv"`,"cache-control":"no-store"}});

  if (p === "/api/admin/logout" && m === "POST") { const tok = cookieOf(req); if (tok) await db.prepare(`DELETE FROM sessions WHERE token_hash=?`).bind(await sha256(tok)).run();
    if (!admin.dev) await logShopEvent(raw, admin.shop_id, "admin_logout", {dev: deviceOf(req), how: "button"}); // v10.9 📊
    return withCookies(json({ok:true}), clearAdminCookies()); }
  if (p === "/api/admin/password" && m === "POST") {
    const b = await body(req); const a = await db.prepare(`SELECT * FROM admins WHERE id=?`).bind(admin.id).first();
    if (!safeEq(await pbkdf2(String(b.current||""), a.salt), a.pass_hash)) fail(401,"bad_login","Current password is wrong");
    const salt = randHex(16); const tok = cookieOf(req);
    await db.batch([db.prepare(`UPDATE admins SET pass_hash=?, salt=?, must_change=0 WHERE id=?`).bind(await pbkdf2(checkPassword(b.password), salt), salt, a.id), db.prepare(`DELETE FROM sessions WHERE admin_id=? AND token_hash != ?`).bind(a.id, await sha256(tok))]);
    return json({ok:true});
  }
  if (p === "/api/admin/dashboard" && m === "GET") {
    const ist = new Date(now()+330*60000); ist.setUTCHours(0,0,0,0); const dayStart = ist.getTime() - 330*60000;
    const today = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status NOT IN ('rejected','cancelled') THEN total_paise END),0) AS value FROM orders WHERE shop_id=? AND created_at >= ?`).bind(db.sid, dayStart).first();
    const counts = (await db.prepare(`SELECT status, COUNT(*) AS n FROM orders WHERE shop_id=? GROUP BY status`).bind(db.sid).all()).results;
    const low = (await db.prepare(`SELECT v.id, v.label, v.stock, v.low_stock, p.name_hi, p.name_en, p.icon, p.id AS product_id FROM variants v JOIN products p ON p.id=v.product_id WHERE v.shop_id=? AND p.shop_id=? AND p.active=1 AND v.active=1 AND v.stock <= v.low_stock ORDER BY v.stock LIMIT 30`).bind(db.sid, db.sid).all()).results;
    const demo = (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE is_demo=1 AND shop_id=?`).bind(db.sid).first()).n;
    const lowCount = (await db.prepare(`SELECT COUNT(*) AS n FROM variants v JOIN products p ON p.id=v.product_id WHERE v.shop_id=? AND p.shop_id=? AND p.active=1 AND v.active=1 AND v.stock <= v.low_stock`).bind(db.sid, db.sid).first()).n;
    const maxId = (await db.prepare(`SELECT COALESCE(MAX(id),0) AS id FROM orders WHERE shop_id=?`).bind(db.sid).first()).id;
    const r30 = await reports(db, istDayStart(now()) - 29*DAY, istDayStart(now()) + DAY);
    const rating = await db.prepare(`SELECT COUNT(*) AS n, AVG(r.stars) AS avg FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0 AND o.shop_id=?`).bind(db.sid).first();
    await pruneAudit(db);
    return json({ok:true, today, counts, best_sellers: r30.best_sellers.slice(0, 5), delivered_30d: r30.delivered, rating: {count: rating.n, avg: rating.n ? Math.round(rating.avg*10)/10 : null}, low_stock: low, low_count: lowCount, dash: await dashCounts(db), demo_products: demo, latest_order_id: maxId, settings: await getSettings(db), shop_info: shopInfoAdmin(await db.prepare(`SELECT * FROM shops WHERE id=?`).bind(db.sid).first()), service: adminServiceView(svc), admin: adminView(admin, publicOrigin(env, url))});
  }
  if (p === "/api/admin/reports" && m === "GET") { const rg = reportRange(url.searchParams); return json({ok:true, range: rg.range, ...(await reports(db, rg.from, rg.to))}); }
  if (p === "/api/admin/reports.csv" && m === "GET") { const rg = reportRange(url.searchParams); return new Response(reportsCSV(await reports(db, rg.from, rg.to)), {headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="kirana-report-${rg.range}.csv"`,"cache-control":"no-store"}}); }
  if (p === "/api/admin/ratings" && m === "GET") {
    const rows = (await db.prepare(`SELECT r.id, r.stars, r.comment, r.created_at, o.code, o.id AS order_id, o.customer_name, o.total_paise, o.is_test FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.shop_id=? ORDER BY r.id DESC LIMIT 200`).bind(db.sid).all()).results;
    const agg = await db.prepare(`SELECT COUNT(*) AS n, AVG(r.stars) AS avg FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0 AND o.shop_id=?`).bind(db.sid).first();
    const s = await getSettings(db);
    return json({ok:true, ratings: rows, count: agg.n, avg: agg.n ? Math.round(agg.avg*10)/10 : null, show_reviews: !!s.show_reviews});
  }
  if (p === "/api/admin/audit" && m === "GET") {
    const pid = url.searchParams.get("product_id"); const field = url.searchParams.get("field") || ""; const before = Number(url.searchParams.get("before")) || 0;
    let sql = `SELECT a.*, p.name_hi, p.name_en, p.icon FROM audit_log a LEFT JOIN products p ON p.id=a.product_id AND p.shop_id=a.shop_id WHERE a.shop_id=?`; const args = [db.sid];
    if (pid) { sql += ` AND a.product_id=?`; args.push(intIn(pid, 1, 1e9, "product")); }
    if (field === "stock" || field === "price" || field === "status") { sql += field === "price" ? ` AND a.field IN ('price','mrp')` : ` AND a.field=?`; if (field !== "price") args.push(field); }
    if (field === "items") sql += ` AND a.entity='variant'`;
    if (before) { sql += ` AND a.id < ?`; args.push(before); }
    sql += ` ORDER BY a.id DESC LIMIT 100`;
    const rows = (await db.prepare(sql).bind(...args).all()).results;
    return json({ok:true, entries: rows, keep: {rows: AUDIT_KEEP_ROWS, days: AUDIT_KEEP_DAYS}});
  }
  if (p === "/api/admin/backup" && m === "GET") return backupResponse(await backup(db, actorOf(admin), db.sid));
  if (p === "/api/admin/orders" && m === "GET") {
    const status = url.searchParams.get("status"); const q = (url.searchParams.get("q")||"").trim();
    let sql = `SELECT * FROM orders WHERE shop_id=?`; const args = [db.sid];
    if (status && status !== "all") { if (status === "active") sql += ` AND status IN ('pending','accepted','preparing','ready','out_for_delivery')`; else if (status === "closed") sql += ` AND status IN ('cancelled','rejected')`; else { sql += ` AND status=?`; args.push(status); } }
    if (q) { sql += ` AND (code LIKE ? OR phone LIKE ? OR customer_name LIKE ?)`; args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    // v10.8: date filter (IST calendar days, by order date) and "finished today" (the dashboard chips)
    const df = istDate(url.searchParams.get("from")), dt = istDate(url.searchParams.get("to"));
    if (df != null) { sql += ` AND created_at >= ?`; args.push(df); }
    if (dt != null) { sql += ` AND created_at < ?`; args.push(dt + DAY); }
    if (url.searchParams.get("done") === "today") { sql += ` AND updated_at >= ?`; args.push(istDayStart(now())); }
    sql += ` ORDER BY id DESC LIMIT 100`;
    const orders = (await db.prepare(sql).bind(...args).all()).results;
    const ids = orders.map(o=>o.id); const items = ids.length ? (await db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(()=>"?").join(",")}) ORDER BY id`).bind(...ids).all()).results : [];
    const subs = ids.length ? (await db.prepare(`SELECT order_id, COUNT(*) AS n FROM push_subscriptions WHERE role='customer' AND order_id IN (${ids.map(()=>"?").join(",")}) GROUP BY order_id`).bind(...ids).all()).results : [];
    const att = ids.length ? (await db.prepare(`SELECT order_id, event, outcome, http_status, at FROM notification_attempts WHERE role='customer' AND order_id IN (${ids.map(()=>"?").join(",")}) ORDER BY id DESC`).bind(...ids).all()).results : [];
    const osubs = ids.length ? (await db.prepare(`SELECT * FROM order_subs WHERE shop_id=? AND status!='withdrawn' AND order_id IN (${ids.map(()=>"?").join(",")}) ORDER BY id`).bind(db.sid, ...ids).all()).results : [];
    const oev = ids.length ? (await db.prepare(`SELECT order_id, note, at, kind FROM order_events WHERE kind IN ('edit','sub') AND order_id IN (${ids.map(()=>"?").join(",")}) ORDER BY id`).bind(...ids).all()).results : [];
    for (const o of orders) { o.items = items.filter(i=>i.order_id===o.id); delete o.token_hash; delete o.restock_nonce; delete o.idem_key;
      try { o.packed = JSON.parse(o.packed || "[]"); } catch { o.packed = []; } o.subs = osubs.filter(s => s.order_id === o.id).map(subView); o.changes = oev.filter(e => e.order_id === o.id).map(e => ({kind: e.kind, note: e.note, at: e.at}));
      o.push = {customer_devices: subs.find(x=>x.order_id===o.id)?.n || 0, last: att.find(x=>x.order_id===o.id) || null}; }
    return json({ok:true, orders});
  }
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)$/)) && m === "GET") { const o = await loadOrder(db,"id=?",Number(mm[1])); if (!o) fail(404,"not_found","Order not found"); return json({ok:true, order:o}); }
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/status$/)) && m === "POST") {
    const b = await body(req);
    // v10.8: an optional idempotency key (the offline queue re-sends with the same key) — a replay returns the first result, never moves twice
    const key = b.idempotency_key ? idemKey(b.idempotency_key) : null;
    if (key) { const prev = await priorOp(db, key); if (prev) return json({ok:true, ...prev}); }
    let o;
    try { o = await transition(db, Number(mm[1]), String(b.status||""), b.from ? String(b.from) : null, str(b.reason, 200), actorOf(admin)); }
    catch (e) { if (key && e instanceof HttpError && e.code === "stale" && e.extra?.status === String(b.status||"")) { const cur = await loadOrder(db, "id=?", Number(mm[1])); return json({ok:true, order: cur, duplicate: true}); } throw e; }
    if (key) { try { await claimStmt(db, key, "status").run(); await saveOp(db, key, {order: {id: o.id, code: o.code, status: o.status}}); } catch {} }
    if (RELEASES_STOCK.has(String(b.status||""))) await stockCheck(env, raw, db.sid, [], url.origin); // v10.7: released stock re-arms alerts
    await later(ctx, () => notifyCustomer(env, db, o, url.origin));
    if (o.token_no != null) await later(ctx, () => notifyQueue(env, db, url.origin)); // v10.13: positions moved → "2 ahead" / "you're next" alerts
    return json({ok:true, order:o});
  }
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/queue$/)) && m === "POST") {
    const r = await queueOrder(db, Number(mm[1]));
    if (!r.already) { const o = r.order;
      await later(ctx, async () => { await notifyAccepted(env, db, o, url.origin); await notifyQueue(env, db, url.origin); }); }
    return json({ok: true, already: r.already, order: r.order});
  }
  // v10.13 (Krish 10:34 PM): ⏭ Skip / Not here — a queued customer who is not there; the line moves on, positions and ETAs recompute
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/skip$/)) && m === "POST") {
    const id = Number(mm[1]); const cur = await db.prepare(`SELECT id, status, token_no, skipped_at FROM orders WHERE id=? AND shop_id=?`).bind(id, db.sid).first();
    if (!cur) fail(404, "not_found", "Booking not found");
    if (cur.skipped_at) return json({ok: true, already: true, order: await loadOrder(db, "id=?", id)});
    if (cur.token_no == null) fail(409, "not_queued", "Only a booking in the queue can be skipped");
    if (cur.status !== "pending") fail(409, "stale", "This booking was already updated. Refresh.", {status: cur.status});
    await transition(db, id, "cancelled", "pending", SKIP_REASON, actorOf(admin));
    await db.prepare(`UPDATE orders SET skipped_at=? WHERE id=? AND shop_id=?`).bind(now(), id, db.sid).run();
    const o = await loadOrder(db, "id=?", id);
    await stockCheck(env, raw, db.sid, [], url.origin);
    await later(ctx, async () => { await notifyCustomer(env, db, o, url.origin); await notifyQueue(env, db, url.origin); });
    return json({ok: true, already: false, order: o});
  }
  // ----- v10.8: order tools -----
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/packed$/)) && m === "POST") return json({ok:true, ...(await setPacked(db, Number(mm[1]), await body(req)))});
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/items$/)) && m === "POST") {
    const r = await editOrderItem(db, Number(mm[1]), await body(req), actorOf(admin));
    if (!r.unchanged) await stockCheck(env, raw, db.sid, [], url.origin); // returned stock re-arms alerts
    return json({ok:true, ...r});
  }
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/substitute$/)) && m === "POST") {
    const r = await suggestSub(db, Number(mm[1]), await body(req), actorOf(admin));
    if (!r.duplicate && r.sub) await later(ctx, () => notifySubSuggested(env, db, r.order, r.sub, url.origin));
    return json({ok:true, ...r});
  }
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/bill$/)) && m === "GET") return json({ok:true, ...(await billData(db, Number(mm[1])))});
  if (p === "/api/admin/search" && m === "GET") return json({ok:true, ...(await globalSearch(db, url.searchParams.get("q")))});
  // ----- admin: order alerts (Web Push) -----
  if (p === "/api/admin/push" && m === "GET") {
    const devices = (await db.prepare(`SELECT id, user_agent, created_at, last_ok_at, fail_count, endpoint FROM push_subscriptions WHERE role='admin' AND shop_id=? ORDER BY id DESC`).bind(db.sid).all()).results.map(d => ({id:d.id, user_agent:d.user_agent, created_at:d.created_at, last_ok_at:d.last_ok_at, fail_count:d.fail_count, endpoint_host: new URL(d.endpoint).hostname, endpoint_tail: d.endpoint.slice(-12)}));
    const attempts = (await db.prepare(`SELECT a.role, a.order_id, o.code, a.event, a.push_host, a.http_status, a.outcome, a.detail, a.at FROM notification_attempts a LEFT JOIN orders o ON o.id=a.order_id WHERE a.shop_id=? ORDER BY a.id DESC LIMIT 30`).bind(db.sid).all()).results;
    return json({ok:true, public_key: (await getVapid(db)).pub, devices, attempts});
  }
  if (p === "/api/admin/push/subscribe" && m === "POST") {
    const b = await body(req); const sub = parseSubscription(b.subscription, env);
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(db.sid).first()).n;
    if (n >= 10) fail(409,"too_many","Too many alert devices. Remove one first.");
    await db.prepare(`INSERT INTO push_subscriptions (shop_id,role,admin_id,endpoint,p256dh,auth,user_agent,created_at) VALUES (?,'admin',?,?,?,?,?,?) ON CONFLICT(role, endpoint, COALESCE(order_id,0)) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, admin_id=excluded.admin_id, shop_id=excluded.shop_id, fail_count=0`)
      .bind(db.sid, admin.id, sub.endpoint, sub.p256dh, sub.auth, str(req.headers.get("user-agent"), 200).slice(0,200), now()).run();
    return json({ok:true, subscribed:true});
  }
  if (p === "/api/admin/push/unsubscribe" && m === "POST") {
    const b = await body(req);
    const r = b.id ? await db.prepare(`DELETE FROM push_subscriptions WHERE role='admin' AND id=? AND shop_id=?`).bind(intIn(b.id,1,1e9,"id"), db.sid).run() : await db.prepare(`DELETE FROM push_subscriptions WHERE role='admin' AND endpoint=? AND shop_id=?`).bind(str(b.endpoint, 1000), db.sid).run();
    return json({ok:true, removed: r.meta?.changes || 0});
  }
  if (p === "/api/admin/push/test" && m === "POST") {
    const b = await body(req);
    const subs = b.endpoint ? (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND endpoint=? AND shop_id=?`).bind(str(b.endpoint,1000), db.sid).all()).results : (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND shop_id=?`).bind(db.sid).all()).results;
    if (!subs.length) fail(404,"no_device","This device is not subscribed yet");
    const results = await pushTo(env, db, subs, "test", {role:"admin", title:"🔔 टेस्ट अलर्ट — Test alert", body:"ऑर्डर अलर्ट इस फ़ोन पर चालू हैं। Order alerts are on for this device.", url:"/admin", tag:"test"}, null, url.origin);
    return json({ok:true, results});
  }
  // ----- admin: offers -----
  if (p === "/api/admin/offers" && m === "GET") return json({ok:true, offers: await adminOffers(db), now: now()});
  if (p === "/api/admin/offers" && m === "POST") { const id = await saveOffer(db, null, await body(req)); return json({ok:true, id}, 201); }
  if ((mm = p.match(/^\/api\/admin\/offers\/(\d+)$/)) && m === "PUT") { const id = await saveOffer(db, Number(mm[1]), await body(req)); return json({ok:true, id}); }
  if ((mm = p.match(/^\/api\/admin\/offers\/(\d+)$/)) && m === "DELETE") { const r = await db.prepare(`DELETE FROM offers WHERE id=? AND shop_id=?`).bind(Number(mm[1]), db.sid).run(); if (!r.meta?.changes) fail(404,"not_found","Offer not found"); return json({ok:true}); }
  if ((mm = p.match(/^\/api\/admin\/offers\/(\d+)\/active$/)) && m === "POST") {
    const b = await body(req); const r = await db.prepare(`UPDATE offers SET active=?, updated_at=? WHERE id=? AND shop_id=?`).bind(bool(b.active)?1:0, now(), Number(mm[1]), db.sid).run();
    if (!r.meta?.changes) fail(404,"not_found","Offer not found"); return json({ok:true});
  }
  if (p === "/api/admin/catalog" && m === "GET") return json({ok:true, ...(await catalog(db, {admin:true}))});
  // v10.14: salon master catalogue (shop_type "salon" only) — the shopkeeper never adds services; he may set his own price or switch one off.
  if (p === "/api/admin/salon-services" && (m === "GET" || m === "PUT")) {
    const sh = await db.prepare(`SELECT shop_type FROM shops WHERE id=?`).bind(db.sid).first();
    if (!isSalonCat(sh?.shop_type)) fail(400, "not_salon", "Only salon shops have the service catalogue");
    if (m === "PUT") {
      const b = await body(req); const key = String(b.key || "");
      if (!SALON_BY_KEY.has(key)) fail(404, "not_found", "Service not found");
      const cur = (await salonPrefs(db)).get(key) || {price_paise: null, active: 1};
      const price = "price" in b ? (b.price === "" || b.price == null ? null : toPaise(b.price, "price")) : cur.price_paise;
      if (price != null && price > 10000000) fail(400, "invalid", "Price looks too high");
      const active = "on" in b ? (bool(b.on) ? 1 : 0) : (cur.active === 0 ? 0 : 1);
      await db.prepare(`INSERT INTO shop_service_prices (shop_id,item_key,price_paise,active,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(shop_id,item_key) DO UPDATE SET price_paise=excluded.price_paise, active=excluded.active, updated_at=excluded.updated_at`).bind(db.sid, key, price, active, now()).run();
    }
    return json({ok:true, ...(await salonCatalogAdmin(db))});
  }
  if (p === "/api/admin/products" && m === "POST") { const id = await saveProduct(db, null, await body(req), actorOf(admin), "item added"); return json({ok:true, id}, 201); }
  if ((mm = p.match(/^\/api\/admin\/products\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === "PUT") { await saveProduct(db, id, await body(req), actorOf(admin), "item edited");
      const vids = (await db.prepare(`SELECT id FROM variants WHERE product_id=? AND shop_id=?`).bind(id, db.sid).all()).results.map(x => x.id); await stockCheck(env, raw, db.sid, vids, url.origin); // v10.7 manual edit → low-stock check
      return json({ok:true, id}); }
    if (m === "PATCH") { const b = await body(req); const st = []; if ("active" in b) st.push(db.prepare(`UPDATE products SET active=?, updated_at=? WHERE id=? AND shop_id=?`).bind(bool(b.active)?1:0, now(), id, db.sid)); if ("featured" in b) st.push(db.prepare(`UPDATE products SET featured=? WHERE id=? AND shop_id=?`).bind(bool(b.featured)?1:0, id, db.sid)); if (st.length) await db.batch(st); return json({ok:true}); }
    if (m === "DELETE") { await db.prepare(`DELETE FROM products WHERE id=? AND shop_id=?`).bind(id, db.sid).run(); return json({ok:true}); }
  }
  if ((mm = p.match(/^\/api\/admin\/variants\/(\d+)\/stock$/)) && m === "POST") {
    const b = await body(req); const id = Number(mm[1]);
    const who = actorOf(admin);
    if (b.set != null) await db.batch([ctxSet(db, who, "manual stock edit"), db.prepare(`UPDATE variants SET stock=? WHERE id=? AND shop_id=?`).bind(intIn(b.set,0,100000,"stock"), id, db.sid), ctxClear(db)]);
    else { const d = intIn(b.delta, -100000, 100000, "delta"); try { await db.batch([ctxSet(db, who, "manual stock edit"), db.prepare(`UPDATE variants SET stock = stock + ? WHERE id=? AND shop_id=?`).bind(d, id, db.sid), ctxClear(db)]); } catch { fail(409,"invalid","Stock cannot go below 0"); } }
    const v = await db.prepare(`SELECT id, stock FROM variants WHERE id=? AND shop_id=?`).bind(id, db.sid).first(); if (!v) fail(404,"not_found","Not found");
    return json({ok:true, variant:v});
  }

  if (p === "/api/admin/categories" && m === "POST") {
    const b = await body(req); const mx = (await db.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS s FROM categories WHERE shop_id=?`).bind(db.sid).first()).s;
    const r = await db.prepare(`INSERT INTO categories (shop_id,name_hi,name_en,icon,sort,active) VALUES (?,?,?,?,?,1) RETURNING id`).bind(db.sid, str(b.name_hi,60,{required:true,field:"Hindi name"}), str(b.name_en,60), str(b.icon,16)||"🛍️", mx).first();
    return json({ok:true, id:r.id}, 201);
  }
  if ((mm = p.match(/^\/api\/admin\/categories\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === "PUT") { const b = await body(req); await db.prepare(`UPDATE categories SET name_hi=?, name_en=?, icon=?, active=?, is_demo=0 WHERE id=? AND shop_id=?`).bind(str(b.name_hi,60,{required:true,field:"Hindi name"}), str(b.name_en,60), str(b.icon,16)||"🛍️", b.active===undefined?1:(bool(b.active)?1:0), id, db.sid).run(); return json({ok:true}); }
    if (m === "DELETE") { const n = (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE category_id=? AND shop_id=?`).bind(id, db.sid).first()).n; if (n) fail(409,"in_use",`${n} items are in this category. Move or delete them first, or hide the category.`); await db.prepare(`DELETE FROM categories WHERE id=? AND shop_id=?`).bind(id, db.sid).run(); return json({ok:true}); }
  }
  if (p === "/api/admin/categories/order" && m === "POST") { const b = await body(req); const ids = (Array.isArray(b.ids)?b.ids:[]).map(x=>intIn(x,1,1e9,"id")); if (ids.length) await db.batch(ids.map((id,i)=>db.prepare(`UPDATE categories SET sort=? WHERE id=? AND shop_id=?`).bind(i,id,db.sid))); return json({ok:true}); }
  if (p === "/api/admin/settings" && m === "PUT") {
    const b = await body(req); const st = []; const set = (k,v) => st.push(db.prepare(`INSERT OR REPLACE INTO shop_settings (shop_id,key,value) VALUES (?,?,?)`).bind(db.sid, k, JSON.stringify(v)));
    if ("owner_name" in b) { const v = str(b.owner_name, 60, {required:true, field:"Your name"}); st.push(db.prepare(`UPDATE shops SET owner_name=?, updated_at=? WHERE id=?`).bind(v, now(), db.sid)); }
    // v10.8.1: shop address (≤200) lives on the shop row too (shown on the customer page); owner photo = an image of THIS shop, ≤30 KB.
    if ("address" in b) st.push(db.prepare(`UPDATE shops SET address=?, updated_at=? WHERE id=?`).bind(str(b.address, 200, {field:"Address"}), now(), db.sid));
    if ("owner_photo_id" in b) { const v = String(b.owner_photo_id || ""); const cur = await db.prepare(`SELECT owner_photo_id FROM shops WHERE id=?`).bind(db.sid).first();
      if (v) { if (!/^[a-f0-9]{16,40}$/.test(v)) fail(400,"invalid","bad image");
        const im = await db.prepare(`SELECT size FROM images WHERE id=? AND shop_id=?`).bind(v, db.sid).first(); if (!im) fail(404,"not_found","Photo not found");
        if (im.size > OWNER_PHOTO_MAX) fail(413,"too_large","फ़ोटो बहुत बड़ी है (30 KB तक) · Photo too big (max 30 KB)"); }
      if ((cur?.owner_photo_id || "") !== v) { st.push(db.prepare(`UPDATE shops SET owner_photo_id=?, updated_at=? WHERE id=?`).bind(v || null, now(), db.sid));
        if (cur?.owner_photo_id) st.push(db.prepare(`DELETE FROM images WHERE id=? AND shop_id=?`).bind(cur.owner_photo_id, db.sid)); } }
    if ("store_name_hi" in b || "store_name_en" in b) { const nm = str(b.store_name_en, 80) || str(b.store_name_hi, 80); if (nm) st.push(db.prepare(`UPDATE shops SET name=?, updated_at=? WHERE id=?`).bind(nm, now(), db.sid)); }
    for (const k of ["store_name_hi","store_name_en","tagline_hi","tagline_en","address","delivery_time_hi","delivery_time_en","announcement_hi","announcement_en","delivery_localities"]) if (k in b) set(k, str(b[k], k==="delivery_localities"?1000:200));
    if ("store_name_hi" in b && !String(b.store_name_hi).trim()) fail(400,"invalid","Store name required");
    if ("phone" in b) { const v = String(b.phone||"").trim(); if (v && !normPhone(v)) fail(400,"invalid_phone","Store phone must be a valid 10-digit mobile"); set("phone", v ? normPhone(v) : ""); }
    if ("whatsapp" in b) { const v = String(b.whatsapp||"").trim(); if (v && !normPhone(v)) fail(400,"invalid_phone","WhatsApp must be a valid 10-digit mobile"); set("whatsapp", v ? normPhone(v) : ""); }
    for (const k of ["open_time","close_time"]) if (k in b) { const v = String(b[k]); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(400,"invalid","Time like 08:00"); set(k, v); }
    if ("delivery_pincodes" in b) { const pins = listOf(b.delivery_pincodes); if (pins.some(x=>!/^\d{6}$/.test(x))) fail(400,"invalid","PIN codes must be 6 digits, comma separated"); set("delivery_pincodes", pins.join(", ")); }
    for (const k of ["delivery_charge","free_delivery_above","min_order"]) if (k in b) set(k+"_paise", b[k]===""||b[k]==null ? 0 : toPaise(b[k], k.replace(/_/g," ")));
    for (const k of ["force_closed","pay_cod","pay_upi_on_delivery","show_reviews","auto_accept"]) if (k in b) set(k, bool(b[k]));
    if ("logo_image_id" in b) { const v = String(b.logo_image_id || ""); if (v && !/^[a-f0-9]{16,40}$/.test(v)) fail(400,"invalid","bad image"); set("logo_image_id", v); }
    if ("upi_id" in b) { const v = str(b.upi_id, 80); if (v && !/^[\w.\-]{2,}@[\w]{2,}$/.test(v)) fail(400,"invalid","UPI ID looks wrong (like name@bank)"); set("upi_id", v); }
    if (st.length) await db.batch(st);
    const s = await getSettings(db); if (!s.pay_cod && !s.pay_upi_on_delivery) { await db.prepare(`INSERT OR REPLACE INTO shop_settings (shop_id,key,value) VALUES (?,'pay_cod','true')`).bind(db.sid).run(); }
    const own = await db.prepare(`SELECT * FROM shops WHERE id=?`).bind(db.sid).first();
    return json({ok:true, settings: await getSettings(db), owner_name: own?.owner_name || "", shop_info: shopInfoAdmin(own)});
  }
  // v6: the shopkeeper switches the shop ONLINE / OFFLINE (only after the developer approved it).
  if (p === "/api/admin/online" && m === "POST") {
    const b = await body(req); const on = bool(b.online);
    if (on && !canOrder(svc.status)) fail(409,"not_approved", svc.status === "pending" ? "दुकान अभी मंज़ूरी के इंतज़ार में है — मंज़ूरी के बाद ऑनलाइन कर पाएँगे · Waiting for approval" : "दुकान अभी ऑनलाइन नहीं हो सकती · The shop can't go online right now");
    const cur = await db.prepare(`SELECT online FROM shops WHERE id=?`).bind(db.sid).first();
    if (!!cur?.online !== on) { await db.prepare(`UPDATE shops SET online=?, updated_at=? WHERE id=?`).bind(on ? 1 : 0, now(), db.sid).run(); await logService(db, svc.status, svc.status, actorOf(admin), on ? "दुकान ऑनलाइन · shop online" : "दुकान ऑफलाइन · shop offline"); }
    return json({ok:true, online: on});
  }
  // v10.12: 📍 the shopkeeper saves the shop's location once (browser geolocation on their phone, after a confirm), or clears it.
  // Only this shop's row. Used for "Near me" on /shops; the coordinates themselves are never shown to customers.
  if (p === "/api/admin/location" && m === "POST") {
    const b = await body(req);
    if (b.clear === true) { await db.prepare(`UPDATE shops SET lat=NULL, lng=NULL, updated_at=? WHERE id=?`).bind(now(), db.sid).run();
      await logService(db, svc.status, svc.status, actorOf(admin), "दुकान की लोकेशन हटाई · shop location cleared"); return json({ok: true, location: null}); }
    if (b.confirm !== true) fail(400, "confirm_required", "पक्का करें · Please confirm");
    const la = Number(b.lat), lo = Number(b.lng);
    if (!validLatLng(la, lo)) fail(400, "invalid_location", "लोकेशन सही नहीं है · Location looks wrong");
    const acc = Number(b.accuracy); const loc = {lat: Math.round(la * 1e5) / 1e5, lng: Math.round(lo * 1e5) / 1e5};
    await db.prepare(`UPDATE shops SET lat=?, lng=?, updated_at=? WHERE id=?`).bind(loc.lat, loc.lng, now(), db.sid).run();
    await logService(db, svc.status, svc.status, actorOf(admin), "दुकान की लोकेशन सेव · shop location saved" + (Number.isFinite(acc) && acc > 0 ? ` (±${Math.round(acc)} m)` : ""));
    return json({ok: true, location: loc});
  }
  // v10.11: the shopkeeper changes the shop TYPE (Settings → confirm step). Only this shop's row; items/orders untouched.
  if (p === "/api/admin/shop-type" && m === "POST") {
    const b = await body(req); const k = readShopType(b.shop_type);
    if (b.confirm !== true) fail(400,"confirm_required","पक्का करें · Please confirm the change");
    const cur = await db.prepare(`SELECT shop_type FROM shops WHERE id=?`).bind(db.sid).first();
    const from = shopTypeKey(cur?.shop_type);
    if (from !== k) {
      const st = [db.prepare(`UPDATE shops SET shop_type=?, updated_at=? WHERE id=?`).bind(k, now(), db.sid)];
      // switching to restaurant with no categories yet → the food starter categories (never touches existing ones)
      if ((await db.prepare(`SELECT COUNT(*) AS n FROM categories WHERE shop_id=?`).bind(db.sid).first()).n === 0) st.push(...starterCatStmts(db, db.sid, k));
      await db.batch(st);
      await logService(db, svc.status, svc.status, actorOf(admin), `दुकान का प्रकार · shop type: ${from} → ${k}`);
    }
    return json({ok:true, type: k, type_info: shopTypeView(k), changed: from !== k});
  }
  // v6: home-screen app (name ≤12, icons generated in the browser, theme colour). Blocked when the developer locked it.
  if (p === "/api/admin/app" && m === "PUT") {
    const b = await body(req); const sh = await db.prepare(`SELECT * FROM shops WHERE id=?`).bind(db.sid).first();
    if (sh.app_lock) fail(423,"app_locked","डेवलपर ने लोगो/नाम लॉक किया है · The developer has locked the logo and name");
    const name = "name" in b ? cleanAppName(b.name) : sh.app_name; const theme = "theme" in b ? cleanTheme(b.theme) : sh.app_theme;
    const icons = "icons" in b ? JSON.stringify(await cleanIcons(db, b.icons, db.sid)) : sh.app_icons;
    await db.prepare(`UPDATE shops SET app_name=?, app_theme=?, app_icons=?, updated_at=? WHERE id=?`).bind(name, theme, icons, now(), db.sid).run();
    return json({ok:true, app: shopAppView({...sh, app_name: name, app_theme: theme, app_icons: icons})});
  }
  if (p === "/api/admin/image" && m === "POST") {
    const b = await body(req);
    const mt = String(b.data_url||"").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!mt) fail(400,"invalid","Upload a JPG, PNG or WebP photo");
    const size = Math.floor(mt[2].length*3/4); if (size > 450000) fail(413,"too_large","Photo too big (max ~450 KB after compression)");
    const id = randHex(10);
    const used = (await db.prepare(`SELECT COALESCE(SUM(size),0) AS s FROM images WHERE shop_id=?`).bind(db.sid).first()).s;
    if (used + size > 60e6) fail(413,"too_large","Photo storage for this shop is full (60 MB). Delete unused items first.");
    await db.prepare(`INSERT INTO images (shop_id,id,mime,data,size,created_at) VALUES (?,?,?,?,?,?)`).bind(db.sid, id, mt[1], mt[2], size, now()).run();
    return json({ok:true, image_id:id, url:`/api/img/${id}`});
  }
  if (p === "/api/admin/csv" && m === "GET") return new Response(await exportCSV(db), {headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="kirana-items.csv"`,"cache-control":"no-store"}});
  if (p === "/api/admin/csv" && m === "POST") { const b = await body(req); return json(await importCSV(db, b.csv, bool(b.dry_run))); }
  fail(404,"not_found","Not found");
}

// =====================================================================================
// v3: service status (subscription), error log, metrics, health, developer panel
// =====================================================================================
const SVC_RANK = {active:0, grace:1, paused:2};
// (DAY is declared with the v4 report helpers)
// "Paid until 2026-11-24" means through the end of that day in India (23:59:59.999 IST).
function endOfDayIST(ymd){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd||""); if (!m) return null; const t = Date.UTC(+m[1], +m[2]-1, +m[3], 23, 59, 59, 999) - 330*60000; return Number.isFinite(t) ? t : null; }
function istYMD(t){ const d = new Date(t + 330*60000); return d.toISOString().slice(0,10); }
// v5: service status is PER SHOP (shops.status: pending | active | paused | rejected = the developer's manual switch). dev_contact stays global.
// v8: on top of that a SUBSCRIPTION state is computed on every request from trial_end / paid_until / provisional_until:
//   TRIAL → ACTIVE (paid until X) → DUE (last 3 days) → EXPIRED (auto-paused), plus PAYMENT_PENDING_VERIFY (48 h provisional access after a UTR).
// An approved ("active") shop whose subscription is EXPIRED behaves exactly like a paused shop (storefront closed, orders refused).
const SHOP_STATUSES = ["pending","active","grace","paused","rejected"];
const canOrder = st => st === "active" || st === "grace";
const SUB_DUE_DAYS = 3, PROVISIONAL_HOURS = 48;
const intOr = (v, d, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : d; };
function subState(sh, at = now()){
  const paid = Number(sh.paid_until) || 0, trial = Number(sh.trial_end) || 0, prov = Number(sh.provisional_until) || 0;
  const end = Math.max(paid, trial); let state;
  if (end > at) state = end - at <= SUB_DUE_DAYS*DAY ? "DUE" : (paid > at ? "ACTIVE" : "TRIAL");
  else if (prov > at) state = "PAYMENT_PENDING_VERIFY";
  else state = "EXPIRED";
  return {state, trial_end: trial || null, paid_until: paid || null, ends_at: end || null, in_trial: paid <= at && trial > at, provisional_until: prov > at ? prov : null,
    days_left: end > at ? Math.ceil((end - at) / DAY) : 0, can_operate: state !== "EXPIRED"};
}
async function subConfig(db){
  const rows = (await db.prepare(`SELECT k, v FROM service_state WHERE k IN ('sub_price_paise','sub_months','trial_days','upi_id','upi_name')`).all()).results;
  const g = Object.fromEntries(rows.map(r => [r.k, r.v]));
  const months = intOr(g.sub_months, 1, 1, 12);
  return {price_paise: intOr(g.sub_price_paise, 19900, 0, 1e8), months: [1,3,6,12].includes(months) ? months : 1, trial_days: intOr(g.trial_days, 10, 0, 365), upi_id: g.upi_id || "", upi_name: g.upi_name || ""};
}
const shopMonthly = (sh, cfg) => Number.isInteger(sh.price_paise) && sh.price_paise >= 0 ? sh.price_paise : cfg.price_paise;
async function readService(db){
  const sh = await db.prepare(`SELECT status, paid_until, grace_days, trial_end, provisional_until FROM shops WHERE id=?`).bind(db.sid).first();
  const dc = await db.prepare(`SELECT v FROM service_state WHERE k='dev_contact'`).first();
  if (!sh) return {status:"rejected", paid_until:null, grace_days:7, dev_contact: dc?.v || "", sub: subState({})};
  const paid_until = sh.paid_until ? Number(sh.paid_until) : null;
  return {status: SHOP_STATUSES.includes(sh.status) ? (sh.status === "grace" ? "active" : sh.status) : "pending", paid_until: Number.isFinite(paid_until) ? paid_until : null, grace_days: Number.isInteger(sh.grace_days) ? sh.grace_days : 7, dev_contact: dc?.v || "", _row: sh};
}
// Change the status only if it is still `from` (no lost updates), and log the change in the same transaction.
async function setStatus(db, from, to, actor, note){
  const res = await db.batch([
    db.prepare(`UPDATE shops SET status=?, updated_at=?, approved_at=CASE WHEN ?='active' AND approved_at IS NULL THEN ? ELSE approved_at END WHERE id=? AND status=?`).bind(to, now(), to, now(), db.sid, from),
    db.prepare(`INSERT INTO service_log (shop_id,at,from_status,to_status,actor,note) SELECT ?,?,?,?,?,? WHERE changes() = 1`).bind(db.sid, now(), from, to, actor, String(note||"").slice(0,300))
  ]);
  return (res?.[0]?.meta?.changes || 0) > 0;
}
const logService = (db, from, to, actor, note) => db.prepare(`INSERT INTO service_log (shop_id,at,from_status,to_status,actor,note) VALUES (?,?,?,?,?,?)`).bind(db.sid, now(), from, to, actor, String(note||"").slice(0,300)).run();
const subLog = (db, sid, actor, action, detail) => db.prepare(`INSERT INTO sub_log (shop_id,at,actor,action,detail) VALUES (?,?,?,?,?)`).bind(sid, now(), actor, action, String(detail||"").slice(0,300));
// Current service state = the developer's manual status + the computed subscription state (pure function of the clock; nothing is written).
async function service(db, at = now()){
  const s = await readService(db); const row = s._row || {}; delete s._row;
  s.sub = subState(row, at); s.manual_status = s.status; s.paused_reason = s.status === "paused" ? "manual" : null;
  if (s.status === "active" && !s.sub.can_operate) { s.status = "paused"; s.paused_reason = "expired"; }
  s.pauses_at = s.status === "active" ? (s.sub.state === "PAYMENT_PENDING_VERIFY" ? s.sub.provisional_until : s.sub.ends_at) : null;
  return s;
}
function adminView(a, origin = ""){ return {username: a.username, dev_mode: a.dev ? {dev: a.dev} : null, must_change: a.dev ? false : !!a.must_change, owner_name: a.owner_name || "", shop: {id: a.shop_id, name: a.shop_name, slug: a.shop_slug, status: a.shop_status, online: !!a.shop_online, type: shopTypeKey(a.shop_type), type_info: shopTypeView(a.shop_type), location: a.shop_lat != null && a.shop_lng != null ? {lat: Number(a.shop_lat), lng: Number(a.shop_lng)} : null, link: `/s/${a.shop_slug}`, customer_url: `${origin}/s/${a.shop_slug}`, app: shopAppView({slug: a.shop_slug, name: a.shop_name, app_name: a.app_name, app_icons: a.app_icons, app_theme: a.app_theme, app_lock: a.app_lock})}}; }
function adminServiceView(s){
  return {status: s.status, paused_reason: s.paused_reason, paid_until: s.paid_until, pauses_at: s.pauses_at, dev_contact: s.dev_contact, sub: s.sub};
}

// ---------- error log (no customer data) ----------
let LOG_DB = null; // the D1 binding (same object for every request in this isolate)
function normRoute(path){
  return String(path||"").replace(/AK-[A-Z0-9]{6}/g, ":code").replace(/\/[a-f0-9]{16,}(?=\/|$)/g, "/:hex").replace(/\/\d+(?=\/|$)/g, "/:id").slice(0, 120);
}
function scrub(msg){
  return String(msg||"")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{5,}\d/g, "[num]")
    .replace(/[a-f0-9]{24,}/gi, "[hex]")
    .replace(/\s+/g, " ").trim().slice(0, 300);
}
async function logError(db, {method="", route="", status=null, kind="exception", message=""}){
  db = db || LOG_DB; if (!db) return;
  try {
    await db.batch([
      db.prepare(`INSERT INTO error_log (at,method,route,status,kind,message) VALUES (?,?,?,?,?,?)`).bind(now(), String(method).slice(0,8), normRoute(route), status, kind, scrub(message)),
      db.prepare(`DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - 500`)
    ]);
  } catch (e) { console.error("error_log write failed", e); }
}
const errText = e => (e && (e.name ? e.name + ": " : "") + (e.message || String(e))) || "unknown";

// ---------- request metrics (hourly buckets, aggregates only) ----------
const hourOf = t => Math.floor(t / 3600000);
async function bump(db, keys){
  if (!db || !keys.length) return;
  const h = hourOf(now());
  const st = keys.map(k => db.prepare(`INSERT INTO metrics (hour,k,n) VALUES (?,?,1) ON CONFLICT(hour,k) DO UPDATE SET n=n+1`).bind(h, k));
  if (Math.random() < 0.02) st.push(
    db.prepare(`DELETE FROM metrics WHERE hour < ?`).bind(h - 24*8),
    db.prepare(`DELETE FROM rate_events WHERE at < ?`).bind(now() - DAY),
    db.prepare(`DELETE FROM dev_sessions WHERE expires_at < ?`).bind(now()));
  try { await db.batch(st); } catch (e) { console.error("metrics", e); }
}
function trackKind(path){
  if (path === "/health" || path === "/api/health") return null;
  if (path === "/api/dev/pulse") return null; // v10.6: the live poll is not counted (keeps D1 writes tiny)
  if (path.startsWith("/api/dev/")) return "dev";
  if (path.startsWith("/api/")) return "api";
  if (PAGE_PATHS.has(path) || /^\/s\/[a-z0-9-]+/.test(path)) return "page";
  return null;
}

// ---------- health (public, for an uptime monitor; no secrets) ----------
async function health(env){
  const t0 = Date.now(); let db = "ok";
  try { const r = await env.DB.prepare(`SELECT 1 AS one`).first(); if (!r || r.one !== 1) db = "error"; } catch { db = "error"; }
  const ok = db === "ok";
  return json({ok, db, db_ms: Date.now() - t0, version: APP_VERSION, build: buildTime(), time: new Date().toISOString()}, ok ? 200 : 503, {"access-control-allow-origin":"*"});
}

// ---------- the page customers see while the service is paused ----------
const H = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function offlinePage(st){
  const a = st._app || {}; const tel = st.phone ? `<a class="b call" href="tel:+91${H(st.phone)}">📞 ${H(st.phone.replace(/(\d{5})(\d{5})/, "$1 $2"))}</a>` : "";
  const wa = st.whatsapp ? `<a class="b wa" href="https://wa.me/91${H(st.whatsapp)}">WhatsApp</a>` : "";
  const logo = `<img class="lg" src="${H((a.icon_urls && (a.icon_urls.i192 || a.icon_urls.i512)) || (a.slug ? "/s/" + a.slug + "/icon.svg" : "/icon.svg?v=" + STATIC_V))}" alt="">`;
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${H(st._name || st.store_name_hi)} · अभी बंद है</title><meta name="theme-color" content="${H(a.color || "#1f6b3a")}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#fbf7ee;color:#1d2b22;font:16px/1.5 system-ui,sans-serif;text-align:center}main{max-width:380px}.lg{width:84px;height:84px;border-radius:22px;margin:0 auto 14px;display:grid;place-items:center;object-fit:cover}.ini{color:#fff;font-weight:800;font-size:2rem}h1{font-size:1.3rem;margin:.2rem 0 .3rem}.st{display:inline-block;background:#fee2e2;color:#991b1b;font-weight:700;border-radius:999px;padding:.35rem 1rem;margin:.4rem 0 1rem;font-size:1.1rem}.m{font-size:1.05rem;margin:.3rem 0}.e{color:#55635a;font-size:.92rem}.bs{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px}.b{display:inline-block;padding:.75rem 1.2rem;border-radius:12px;color:#fff;text-decoration:none;font-weight:700}.call{background:#1f6b3a}.wa{background:#128c4a}</style></head>
<body><main>${logo}<h1>${H(st._name || st.store_name_hi)}</h1><div class="st">🔒 अभी बंद है</div>
<p class="m">दुकान अभी ऑनलाइन ऑर्डर नहीं ले रही। थोड़ी देर बाद फिर खोलें।</p><p class="e">This shop is not taking online orders right now — please check again later.</p>
<div class="bs">${tel}${wa}</div></main></body></html>`;
}
function missingPage(){
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>दुकान नहीं मिली</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#fbf7ee;color:#1d2b22;font:16px/1.5 system-ui,sans-serif;text-align:center}</style></head>
<body><main><h1>दुकान नहीं मिली</h1><p>यह लिंक किसी दुकान का नहीं है। कृपया दुकान से सही लिंक / QR लें।<br>Shop not found — please ask the shop for the right link.</p></main></body></html>`;
}
function pausedPage(st, kind = "paused"){
  if (kind === "offline") return offlinePage(st);
  const tel = st.phone ? `<a class="b call" href="tel:+91${H(st.phone)}">📞 ${H(st.phone.replace(/(\d{5})(\d{5})/, "$1 $2"))}</a>` : "";
  const wa = st.whatsapp ? `<a class="b wa" href="https://wa.me/91${H(st.whatsapp)}">WhatsApp</a>` : "";
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${H(st.store_name_hi)} · ${H(st.store_name_en)}</title><meta name="theme-color" content="#1f6b3a"><link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#fbf7ee;color:#1d2b22;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari",sans-serif}
.c{max-width:420px;width:100%;background:#fff;border-radius:22px;padding:28px 24px;box-shadow:0 10px 30px rgba(31,107,58,.12);text-align:center;border:1px solid #eadfc8}
.logo{width:64px;height:64px;margin:0 auto 10px;display:block}h1{font-size:1.25rem;margin:.2rem 0 1rem;color:#1f6b3a}
.m{font-size:1.15rem;font-weight:700;margin:.4rem 0}.e{color:#55635a;margin:.2rem 0 1.2rem}.a{color:#55635a;font-size:.92rem;margin:0 0 1.2rem}
.bs{display:flex;flex-direction:column;gap:10px}.b{display:block;padding:14px;border-radius:14px;font-weight:700;text-decoration:none;font-size:1.05rem}
.call{background:#1f6b3a;color:#fff}.wa{background:#e8f6ec;color:#14532d;border:1px solid #bfe3c9}
</style></head><body><main class="c"><img class="logo" src="/icon.svg" alt="">
<h1>${H(st.store_name_hi)}<br><small style="font-weight:500;color:#55635a">${H(st.store_name_en)}</small></h1>
${kind === "pending" ? `<p class="m">यह दुकान जल्द ही ऑनलाइन शुरू होगी।</p>
<p class="e">This shop will start taking online orders soon — please contact the shop.</p>` : `<p class="m">🔒 दुकान अभी बंद है</p>
<p class="a">ऑनलाइन ऑर्डर अभी नहीं लिए जा रहे — कृपया थोड़ी देर बाद देखें या दुकान से संपर्क करें।</p>
<p class="e">This shop is closed right now — please check again later.</p>`}
${st.address ? `<p class="a">📍 ${H(st.address)}</p>` : ""}<div class="bs">${tel}${wa}</div></main></body></html>`;
}

// ---------- developer auth ----------
// v10.5: developer cookie only travels to /api/dev (see the shopkeeper cookie above for why it is __Secure- now).
const DEV_COOKIE = "__Secure-ks_dev", DEV_COOKIE_PATH = "/api/dev", LEGACY_DEV_COOKIE = "__Host-ks_dev";
function devCookieOf(req){ return cookieVal(req, DEV_COOKIE) || cookieVal(req, LEGACY_DEV_COOKIE); }
const clearDevCookies = () => [`${DEV_COOKIE}=; Path=${DEV_COOKIE_PATH}; Secure; HttpOnly; SameSite=Strict; Max-Age=0`, `${LEGACY_DEV_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`];
async function currentDev(db, req){
  const tok = devCookieOf(req); if (!tok) return null;
  const row = await db.prepare(`SELECT d.id, d.username, s.expires_at FROM dev_sessions s JOIN dev_accounts d ON d.id=s.dev_id WHERE s.token_hash=?`).bind(await sha256(tok)).first();
  return row && row.expires_at >= now() ? row : null;
}
async function newDevSession(db, devId){
  const tok = randHex(32);
  await db.prepare(`INSERT INTO dev_sessions (token_hash,dev_id,expires_at,created_at) VALUES (?,?,?,?)`).bind(await sha256(tok), devId, now()+DEV_SESSION_HOURS*3600000, now()).run();
  return `${DEV_COOKIE}=${tok}; Path=${DEV_COOKIE_PATH}; Secure; HttpOnly; SameSite=Strict; Max-Age=${DEV_SESSION_HOURS*3600}`;
}
async function devRecoveryOk(key){ return typeof key==="string" && key.length >= 12 && safeEq(await sha256("kirana-dev-recover:"+key), DEV_RECOVERY_SHA256); }

async function tableCount(db, t){ try { return (await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n; } catch { return null; } }
const DEV_TABLES = ["shops","shop_settings","orders","order_items","order_events","products","variants","categories","offers","offer_items","images","push_subscriptions","notification_attempts","admins","sessions","rate_events","error_log","metrics","service_log","dev_sessions","audit_log","order_ratings"];

async function devHealth(db, url, req){
  const t = now();
  const t0 = Date.now(); let dbOk = true; let sizeBytes = null;
  try { const r = await db.prepare(`SELECT 1 AS one`).run(); sizeBytes = r?.meta?.size_after ?? null; } catch { dbOk = false; }
  const dbMs = Date.now() - t0;
  if (sizeBytes == null) { try { const pc = await db.prepare(`PRAGMA page_count`).first(); const ps = await db.prepare(`PRAGMA page_size`).first(); sizeBytes = Object.values(pc)[0] * Object.values(ps)[0]; } catch {} }
  const staleMin = Math.max(1, Math.min(1440, Number(url.searchParams.get("stale")) || 15));
  const ist = new Date(t+330*60000); ist.setUTCHours(0,0,0,0); const dayStart = ist.getTime() - 330*60000;
  const ord = await db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ?),0) AS today, COALESCE(SUM(created_at >= ?),0) AS d7, MAX(created_at) AS last_at FROM orders`).bind(dayStart, t - 7*DAY).first();
  const byStatus = Object.fromEntries((await db.prepare(`SELECT status, COUNT(*) AS n FROM orders GROUP BY status`).all()).results.map(r => [r.status, r.n]));
  const value7 = (await db.prepare(`SELECT COALESCE(SUM(total_paise),0) AS v FROM orders WHERE created_at >= ? AND status NOT IN ('rejected','cancelled')`).bind(t - 7*DAY).first()).v;
  const stale = (await db.prepare(`SELECT code, created_at, total_paise FROM orders WHERE status='pending' AND created_at < ? ORDER BY created_at LIMIT 20`).bind(t - staleMin*60000).all()).results
    .map(o => ({code:o.code, minutes: Math.floor((t - o.created_at)/60000), total_paise:o.total_paise}));
  const staleCount = (await db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status='pending' AND created_at < ?`).bind(t - staleMin*60000).first()).n;
  const prod = await db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(active),0) AS active, COALESCE(SUM(is_demo),0) AS demo,
      COALESCE(SUM(active=1 AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active=1 AND v.stock>0)),0) AS out_of_stock FROM products p`).first();
  const vars = await db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(stock=0),0) AS out_of_stock, COALESCE(SUM(stock>0 AND stock<=low_stock),0) AS low FROM variants WHERE active=1`).first();
  const push = (await db.prepare(`SELECT role, outcome, COUNT(*) AS n FROM notification_attempts WHERE at >= ? GROUP BY role, outcome`).bind(t - DAY).all()).results;
  const pushSum = {sent:0, failed:0, expired:0, no_subscription:0, by_role:{}};
  for (const r of push) {
    const k = r.outcome === "accepted" ? "sent" : r.outcome === "expired" ? "expired" : r.outcome === "no_subscription" ? "no_subscription" : "failed";
    pushSum[k] += r.n; ((pushSum.by_role[r.role] ||= {sent:0, failed:0, expired:0, no_subscription:0}))[k] += r.n;
  }
  const adminDev = await db.prepare(`SELECT COUNT(*) AS n, MAX(last_ok_at) AS last_ok FROM push_subscriptions WHERE role='admin'`).first();
  const lastAdminPush = await db.prepare(`SELECT outcome, http_status, at FROM notification_attempts WHERE role='admin' ORDER BY id DESC LIMIT 1`).first();
  const custSubs = (await db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE role='customer'`).first()).n;
  const err24 = (await db.prepare(`SELECT COUNT(*) AS n FROM error_log WHERE at >= ?`).bind(t - DAY).first()).n;
  const errors = (await db.prepare(`SELECT id, at, method, route, status, kind, message FROM error_log ORDER BY id DESC LIMIT 30`).all()).results;
  const h = hourOf(t);
  const mrows = (await db.prepare(`SELECT hour, k, n FROM metrics WHERE hour > ?`).bind(h - 24).all()).results;
  const hours = []; for (let i = 23; i >= 0; i--) hours.push({hour: h - i, api:0, page:0, dev:0, rate_limited:0, e5xx:0, blocked:0});
  const tot = {api:0, page:0, dev:0, rate_limited:0, e5xx:0, blocked:0};
  for (const r of mrows) { const b = hours.find(x => x.hour === r.hour); const key = r.k === "rl" ? "rate_limited" : r.k === "e5" ? "e5xx" : r.k; if (b && key in b) { b[key] += r.n; tot[key] += r.n; } }
  const counts = {}; for (const tb of DEV_TABLES) counts[tb] = await tableCount(db, tb);
  const settings = await getSettings(scoped(db, 1));
  const shopsBy = Object.fromEntries((await db.prepare(`SELECT status, COUNT(*) AS n FROM shops GROUP BY status`).all()).results.map(r => [r.status, r.n]));
  const first = await db.prepare(`SELECT v FROM service_state WHERE k=?`).bind("first_seen:" + APP_VERSION + "@" + BUILD_TIME).first();
  return {
    now: t, server: {ok: dbOk, db_ms: dbMs, colo: req.cf?.colo || null, version: APP_VERSION, build_time: buildTime(), first_served_at: first ? Number(first.v) : null},
    store: {name: settings.store_name_en || settings.store_name_hi, open: storeStatus(settings), demo_mode: !!settings.demo_mode, phone_set: !!settings.phone, whatsapp_set: !!settings.whatsapp},
    orders: {today: ord.today, last_7_days: ord.d7, total: ord.total, last_order_at: ord.last_at, value_7_days_paise: value7, by_status: byStatus, stale_minutes: staleMin, stale_pending_count: staleCount, stale_pending: stale},
    products: {total: prod.total, active: prod.active, demo: prod.demo, out_of_stock: prod.out_of_stock, variants: vars.total, variants_out_of_stock: vars.out_of_stock, variants_low: vars.low},
    push: {last_24h: pushSum, shop_alert_devices: adminDev.n, shop_alerts_enabled: adminDev.n > 0, shop_last_delivered_to_push_service_at: adminDev.last_ok, shop_last_attempt: lastAdminPush || null, customer_subscriptions: custSubs},
    errors: {last_24h: err24, stored: counts.error_log, recent: errors},
    traffic: {last_24h: tot, hours},
    db: {size_bytes: sizeBytes, rows: counts},
    shops: shopsBy,
    backup: await (async () => { const a = await db.prepare(`SELECT v FROM service_state WHERE k='last_backup_at'`).first(); const b = await db.prepare(`SELECT v FROM service_state WHERE k='last_backup_by'`).first(); return {last_at: a ? Number(a.v) : null, last_by: b ? b.v.split(":")[0] : null}; })()
  };
}


// ===== v9: Cloudflare usage (free-plan limits) =====
const CF_API = "https://api.cloudflare.com/client/v4";
const CF_DEFAULT_D1_ID = "0fd7e022-f6f3-4697-8b34-eb81d2552888";
const CF_FREE = {requests: 100000, rows_read: 5000000, rows_written: 100000, storage_bytes: 5 * 1e9};
const CF_CACHE_MS = 5 * 60000;
const utcDay = (t = now()) => new Date(t).toISOString().slice(0, 10);
const maskToken = tk => tk ? "•".repeat(8) + String(tk).slice(-4) : "";
async function cfConf(raw, env){
  const tok = (await raw.prepare(`SELECT v FROM server_secrets WHERE k='cf_token'`).first())?.v || "";
  const rows = (await raw.prepare(`SELECT k, v FROM service_state WHERE k IN ('cf_account_id','cf_db_id','cf_token_set_at')`).all()).results;
  const g = Object.fromEntries(rows.map(r => [r.k, r.v]));
  return {token: tok, account_id: g.cf_account_id || "", database_id: g.cf_db_id || env.D1_DATABASE_ID || CF_DEFAULT_D1_ID, token_set_at: Number(g.cf_token_set_at) || null};
}
async function cfCall(env, token, path, init = {}){
  const f = env.CF_FETCH || fetch;
  let r; try { r = await f(CF_API + path, {...init, headers: {"authorization": "Bearer " + token, "content-type": "application/json", ...(init.headers || {})}}); }
  catch (e) { throw Object.assign(new Error("Could not connect to Cloudflare"), {cf: true}); }
  let j = null; try { j = await r.json(); } catch {}
  return {status: r.status, j};
}
const cfErr = j => (j?.errors || []).map(e => e.message || String(e.code)).join("; ") || "unknown error";
async function cfDetectAccount(env, token){
  const {status, j} = await cfCall(env, token, "/accounts?per_page=5");
  if (status === 401 || status === 403 || j?.success === false) fail(400, "cf_token", "The token is not working (Cloudflare: " + cfErr(j) + ")");
  const list = j?.result || [];
  if (list.length !== 1) return {id: "", count: list.length};
  return {id: list[0].id, name: list[0].name, count: 1};
}
const CF_QUERY = `query($a:String!,$d:Date!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
 w:workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$s,datetime_lt:$e}){sum{requests errors} dimensions{scriptName}}
 d:d1AnalyticsAdaptiveGroups(limit:1000,filter:{date:$d}){sum{rowsRead rowsWritten} dimensions{databaseId}}
 st:d1StorageAdaptiveGroups(limit:1000,filter:{date:$d}){max{databaseSizeBytes} dimensions{databaseId}}}}}`;
// Pure: GraphQL response → today's usage vs the free plan. Account-wide, because the free limits are account-wide.
function cfUsageFrom(gql, {database_id, local_db_bytes = null, at = now()}){
  if (gql?.errors?.length) throw Object.assign(new Error(gql.errors.map(e => e.message).join("; ")), {cf: true});
  const acc = gql?.data?.viewer?.accounts?.[0]; if (!acc) throw Object.assign(new Error("No account data found (check the account ID / token permissions)"), {cf: true});
  const scripts = {}; let requests = 0, errors = 0;
  for (const r of acc.w || []) { const n = Number(r.sum?.requests) || 0; requests += n; errors += Number(r.sum?.errors) || 0; const k = r.dimensions?.scriptName || "?"; scripts[k] = (scripts[k] || 0) + n; }
  let rows_read = 0, rows_written = 0; for (const r of acc.d || []) { rows_read += Number(r.sum?.rowsRead) || 0; rows_written += Number(r.sum?.rowsWritten) || 0; }
  const sizes = {}; for (const r of acc.st || []) { const k = r.dimensions?.databaseId || "?"; sizes[k] = Math.max(sizes[k] || 0, Number(r.max?.databaseSizeBytes) || 0); }
  if (local_db_bytes != null && database_id) sizes[database_id] = Math.max(sizes[database_id] || 0, local_db_bytes);
  const storage = Object.values(sizes).reduce((a, b) => a + b, 0);
  const bar = (used, limit) => { const pct = limit ? Math.round(used / limit * 1000) / 10 : 0; return {used, limit, pct, level: pct >= 80 ? "red" : pct >= 60 ? "yellow" : "green"}; };
  const metrics = {requests: bar(requests, CF_FREE.requests), rows_read: bar(rows_read, CF_FREE.rows_read), rows_written: bar(rows_written, CF_FREE.rows_written), storage: bar(storage, CF_FREE.storage_bytes)};
  const d = new Date(at); const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return {day_utc: utcDay(at), metrics, worker_errors: errors, scripts: Object.entries(scripts).map(([name, n]) => ({name: name === "__unknown__" ? "other / new worker" : name, requests: n})).sort((a, b) => b.requests - a.requests),
    this_db_bytes: sizes[database_id] ?? local_db_bytes, any_red: Object.values(metrics).some(m => m.level === "red"), resets_at: reset, fetched_at: at};
}
async function localDbBytes(raw){ try { const r = await raw.prepare(`SELECT 1 AS one`).run(); return r?.meta?.size_after ?? null; } catch { return null; } }
async function cfUsage(env, raw, {force = false} = {}){
  const c = await cfConf(raw, env); const at = now(); const local = await localDbBytes(raw);
  const base = {configured: !!c.token, token_masked: maskToken(c.token), token_set_at: c.token_set_at, account_id: c.account_id, database_id: c.database_id, limits: CF_FREE, local_db_bytes: local, now: at};
  if (!c.token) return base;
  if (!c.account_id) return {...base, error: "Account ID not found. Enter the Account ID below."};
  const cached = (await raw.prepare(`SELECT v FROM service_state WHERE k='cf_usage_cache'`).first())?.v;
  if (cached) { try { const x = JSON.parse(cached); if (x.key === c.account_id + "|" + c.token_set_at && at - x.at < (force ? 60000 : CF_CACHE_MS)) return {...base, usage: x.usage, cached: true}; } catch {} }
  const day = utcDay(at);
  const {status, j} = await cfCall(env, c.token, "/graphql", {method: "POST", body: JSON.stringify({query: CF_QUERY, variables: {a: c.account_id, d: day, s: day + "T00:00:00Z", e: new Date(at + 60000).toISOString().slice(0, 19) + "Z"}})});
  if (status >= 400 && !j?.data) return {...base, error: "Cloudflare ne mana kiya (" + status + "): " + cfErr(j) + ". Check that the token has the 'Account Analytics: Read' permission."};
  let usage; try { usage = cfUsageFrom(j, {database_id: c.database_id, local_db_bytes: local, at}); } catch (e) { return {...base, error: e.message}; }
  await raw.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('cf_usage_cache',?)`).bind(JSON.stringify({at, key: c.account_id + "|" + c.token_set_at, usage})).run();
  return {...base, usage, cached: false};
}
async function cachedUsage(raw){ try { const x = JSON.parse((await raw.prepare(`SELECT v FROM service_state WHERE k='cf_usage_cache'`).first())?.v || "null"); return x ? {...x.usage, age_min: Math.round((now() - x.at) / 60000)} : null; } catch { return null; } }

// ---------- v10.9: 📊 Dukaan wise (developer only) ----------
// Orders + Kamai come from the orders table (so old data shows too; test orders excluded; Kamai = DELIVERED orders' total).
// Shopkeeper login/logout and customer visits come from shop_events (recorded from v10.9 on). Days are IST days.
function dukaanRange(sp, at = now()){
  const r = sp.get("range") || "7d"; const today = istDayStart(at);
  if (r === "today") return {range: r, from: today, to: today + DAY};
  if (r === "30d") return {range: r, from: today - 29*DAY, to: today + DAY};
  if (r === "all") return {range: r, from: 0, to: today + DAY};
  return {range: "7d", from: today - 6*DAY, to: today + DAY};
}
const custKey = name => { const n = String(name || "").trim().replace(/\s+/g, " ").toLowerCase(); return n ? "n:" + n : null; };
async function dukaanCustomers(raw, from, to, shopId = null){
  const w = shopId != null ? " AND shop_id=?" : ""; const a = shopId != null ? [from, to, shopId] : [from, to];
  const visits = (await raw.prepare(`SELECT shop_id, json_extract(meta,'$.d') AS did, MAX(json_extract(meta,'$.n')) AS name, COUNT(*) AS n, MAX(ts) AS last FROM shop_events WHERE kind='cust_visit' AND ts>=? AND ts<?${w} GROUP BY shop_id, did`).bind(...a).all()).results;
  const orders = (await raw.prepare(`SELECT shop_id, MAX(customer_name) AS name, COUNT(*) AS n, MAX(created_at) AS last FROM orders WHERE is_test=0 AND created_at>=? AND created_at<?${w} GROUP BY shop_id, LOWER(TRIM(customer_name))`).bind(...a).all()).results;
  const by = new Map(); const get = sid => { if (!by.has(sid)) by.set(sid, new Map()); return by.get(sid); };
  for (const v of visits) { const k = custKey(v.name) || "d:" + v.did; const m = get(v.shop_id); const c = m.get(k) || {name: v.name ? String(v.name).trim() : null, orders: 0, visits: 0, last_visit: null, last_order: null};
    c.visits += v.n; c.last_visit = Math.max(c.last_visit || 0, v.last); m.set(k, c); }
  for (const o of orders) { const k = custKey(o.name); if (!k) continue; const m = get(o.shop_id); const c = m.get(k) || {name: String(o.name).trim(), orders: 0, visits: 0, last_visit: null, last_order: null};
    c.orders += o.n; c.last_order = Math.max(c.last_order || 0, o.last); m.set(k, c); }
  return by;
}
async function dukaanReport(raw, from, to){
  const shops = (await raw.prepare(`SELECT id, name, slug, owner_name, status FROM shops ORDER BY id`).all()).results;
  const ord = new Map((await raw.prepare(`SELECT shop_id, COUNT(*) AS n, COALESCE(SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END),0) AS delivered, COALESCE(SUM(CASE WHEN status='delivered' THEN total_paise ELSE 0 END),0) AS kamai FROM orders WHERE is_test=0 AND created_at>=? AND created_at<? GROUP BY shop_id`).bind(from, to).all()).results.map(r => [r.shop_id, r]));
  const ev = new Map((await raw.prepare(`SELECT shop_id, COALESCE(SUM(CASE WHEN kind='admin_login' THEN 1 ELSE 0 END),0) AS logins, COALESCE(SUM(CASE WHEN kind='admin_logout' THEN 1 ELSE 0 END),0) AS logouts, COALESCE(SUM(CASE WHEN kind='cust_visit' THEN 1 ELSE 0 END),0) AS visits FROM shop_events WHERE ts>=? AND ts<? GROUP BY shop_id`).bind(from, to).all()).results.map(r => [r.shop_id, r]));
  const lastLogin = new Map((await raw.prepare(`SELECT shop_id, MAX(ts) AS t FROM shop_events WHERE kind='admin_login' GROUP BY shop_id`).all()).results.map(r => [r.shop_id, r.t]));
  const cust = await dukaanCustomers(raw, from, to);
  const rows = shops.map(s => { const o = ord.get(s.id) || {}, e = ev.get(s.id) || {};
    return {id: s.id, name: s.name, slug: s.slug, owner_name: s.owner_name, status: s.status,
      orders: o.n || 0, delivered: o.delivered || 0, kamai_paise: o.kamai || 0,
      logins: e.logins || 0, logouts: e.logouts || 0, last_login: lastLogin.get(s.id) || null,
      customers: cust.get(s.id)?.size || 0, visits: e.visits || 0}; });
  rows.sort((a, b) => b.orders - a.orders || b.kamai_paise - a.kamai_paise || b.visits - a.visits || a.id - b.id);
  const tot = k => rows.reduce((x, r) => x + r[k], 0);
  return {shops: rows, totals: {orders: tot("orders"), kamai_paise: tot("kamai_paise"), logins: tot("logins"), logouts: tot("logouts"), customers: tot("customers"), visits: tot("visits")},
    tracking_since: TRACKING_SINCE, note: "Login/visit counts start 25 Oct. Earnings = total of delivered orders. Test orders are not counted."};
}
const TRACKING_SINCE = "2026-10-25";
async function dukaanDetail(raw, sid, from, to){
  const sh = await raw.prepare(`SELECT id, name, slug, owner_name, status FROM shops WHERE id=?`).bind(sid).first(); if (!sh) fail(404, "not_found", "Shop not found");
  const m = (await dukaanCustomers(raw, from, to, sid)).get(sid) || new Map();
  const named = [], anon = {devices: 0, visits: 0, last_visit: null};
  for (const c of m.values()) { if (c.name) named.push({name: c.name, orders: c.orders, visits: c.visits, last_visit: c.last_visit, last_order: c.last_order, last_seen: Math.max(c.last_visit || 0, c.last_order || 0) || null});
    else { anon.devices++; anon.visits += c.visits; anon.last_visit = Math.max(anon.last_visit || 0, c.last_visit || 0) || null; } }
  named.sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0) || b.orders - a.orders);
  const logins = (await raw.prepare(`SELECT kind, ts, meta FROM shop_events WHERE shop_id=? AND kind IN ('admin_login','admin_logout') AND ts>=? AND ts<? ORDER BY ts DESC, id DESC LIMIT 30`).bind(sid, from, to).all()).results
    .map(r => { let x = {}; try { x = JSON.parse(r.meta || "{}"); } catch {} return {kind: r.kind === "admin_login" ? "login" : "logout", ts: r.ts, device: x.dev || null, how: x.how || null}; });
  return {shop: sh, customers: named.slice(0, 100), customers_total: named.length, anonymous: anon, logins};
}
async function devApi(req, env, url, ctx){
  const raw = env.DB; let db = scoped(raw, 0); const p = url.pathname, m = req.method; let mm; const ip = req.headers.get("cf-connecting-ip") || "local";
  if (m !== "GET" && req.headers.get("x-requested-with") !== "kirana-dev") fail(403,"csrf","Missing header");
  if (p === "/api/dev/state" && m === "GET") { const d = await currentDev(db, req); return json({ok:true, dev: d ? {username: d.username} : null}); }
  if (p === "/api/dev/login" && m === "POST") {
    const b = await body(req); const username = String(b.username||"").trim().toLowerCase();
    if (!(await rateCheck(db, "devlogin:"+ip, 5, 15*60000)) || !(await rateCheck(db, "devlogin-user:"+username, 5, 15*60000))) fail(429,"rate_limited","Too many wrong attempts. Try again in 15 minutes.");
    const d = await db.prepare(`SELECT * FROM dev_accounts WHERE username=?`).bind(username).first();
    const hash = await pbkdf2(String(b.password||""), d?.salt || "00".repeat(16));
    if (!d || !safeEq(hash, d.pass_hash)) { await rateHit(db, "devlogin:"+ip); await rateHit(db, "devlogin-user:"+username); fail(401,"bad_login","Wrong username or password"); }
    return json({ok:true}, 200, {"set-cookie": await newDevSession(db, d.id)});
  }
  if (p === "/api/dev/recover" && m === "POST") {
    const b = await body(req);
    if (!(await rateCheck(db, "devrecover:"+ip, 5, 15*60000))) fail(429,"rate_limited","Too many attempts. Try again in 15 minutes.");
    if (!(await devRecoveryOk(b.recovery_key))) { await rateHit(db, "devrecover:"+ip); fail(403,"bad_key","Recovery key is not correct"); }
    const d = await db.prepare(`SELECT id FROM dev_accounts ORDER BY id LIMIT 1`).first(); if (!d) fail(404,"not_found","No developer account");
    const salt = randHex(16);
    await db.batch([db.prepare(`UPDATE dev_accounts SET pass_hash=?, salt=? WHERE id=?`).bind(await pbkdf2(checkPassword12(b.password), salt), salt, d.id), db.prepare(`DELETE FROM dev_sessions WHERE dev_id=?`).bind(d.id), db.prepare(`DELETE FROM rate_events WHERE k LIKE 'devlogin-user:%'`)]);
    return json({ok:true});
  }
  const dev = await currentDev(db, req);
  if (!dev) { if (await currentAdmin(db, req)) fail(403,"dev_only","Developer login required — a shopkeeper login cannot open this."); fail(401,"login_required","Please log in"); }
  if (p === "/api/dev/logout" && m === "POST") { const tok = devCookieOf(req); if (tok) await db.prepare(`DELETE FROM dev_sessions WHERE token_hash=?`).bind(await sha256(tok)).run(); return withCookies(json({ok:true}), clearDevCookies()); }
  if (p === "/api/dev/password" && m === "POST") {
    const b = await body(req); const d = await db.prepare(`SELECT * FROM dev_accounts WHERE id=?`).bind(dev.id).first();
    if (!safeEq(await pbkdf2(String(b.current||""), d.salt), d.pass_hash)) fail(401,"bad_login","Current password is wrong");
    const salt = randHex(16);
    await db.batch([db.prepare(`UPDATE dev_accounts SET pass_hash=?, salt=? WHERE id=?`).bind(await pbkdf2(checkPassword12(b.password), salt), salt, d.id), db.prepare(`DELETE FROM dev_sessions WHERE dev_id=? AND token_hash != ?`).bind(d.id, await sha256(devCookieOf(req)))]);
    return json({ok:true});
  }
  // ----- v10.6: LIVE panel. One tiny poll (~every 15 s, only while /dev is open + visible): counts + a change stamp + new feed events. -----
  if (p === "/api/dev/pulse" && m === "GET") {
    const t = now(); const d = new Date(t + IST); const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST;
    const hasSince = url.searchParams.has("since"), since = Math.max(0, Math.min(1e12, Math.floor(Number(url.searchParams.get("since")) || 0))); // since=0 → every event so far (max 5)
    const r = await db.prepare(`SELECT (SELECT COUNT(*) FROM shops) AS shops, (SELECT COUNT(*) FROM shops WHERE status='pending') AS waiting, (SELECT COALESCE(MAX(updated_at),0) FROM shops) AS shops_at,
      (SELECT COUNT(*) FROM sub_payments WHERE status='pending') AS pay, (SELECT COALESCE(MAX(id),0) FROM sub_payments) AS pay_id,
      (SELECT COUNT(*) FROM orders WHERE created_at >= ?) AS orders_today, (SELECT COUNT(*) FROM error_log) AS errors, (SELECT COALESCE(MAX(id),0) FROM error_log) AS err_id,
      (SELECT COUNT(*) FROM notice_recipients WHERE read_at IS NOT NULL) AS reads, (SELECT COUNT(*) FROM dev_events WHERE read_at IS NULL) AS unread, (SELECT COALESCE(MAX(id),0) FROM dev_events) AS ev_id`).bind(day0).first();
    const fresh = hasSince && r.ev_id > since ? (await db.prepare(`SELECT id, kind, label, title, url, created_at FROM dev_events WHERE id > ? ORDER BY id DESC LIMIT 5`).bind(since).all()).results : [];
    const sig = [r.shops, r.waiting, r.shops_at, r.pay, r.pay_id, r.orders_today, r.errors, r.err_id, r.reads, r.ev_id].join(".");
    return json({ok:true, t, sig, shops: {total: r.shops, waiting: r.waiting}, pay_verify: r.pay, orders_today: r.orders_today, errors: r.errors, notice_reads: r.reads,
      events: {unread: r.unread, last_id: r.ev_id}, new: fresh.map(e => ({id: e.id, kind: e.kind, label: e.label, title: e.title, url: e.url, at: e.created_at}))}, 200, {"cache-control": "no-store"});
  }
  if (p === "/api/dev/events" && m === "GET") {
    const lim = Math.max(1, Math.min(50, Math.floor(Number(url.searchParams.get("limit")) || 20)));
    const ev = (await db.prepare(`SELECT id, kind, label, title, body, url, shop_id, created_at, read_at FROM dev_events ORDER BY id DESC LIMIT ?`).bind(lim).all()).results;
    const unread = (await db.prepare(`SELECT COUNT(*) AS n FROM dev_events WHERE read_at IS NULL`).first()).n;
    return json({ok:true, events: ev.map(e => ({...e, icon: DEV_EV_ICON[e.kind] || "🔔", read: e.read_at != null})), unread});
  }
  if (p === "/api/dev/events/read" && m === "POST") {
    const b = await body(req); const t = now();
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 100) : [];
    const r = b.all ? await db.prepare(`UPDATE dev_events SET read_at=? WHERE read_at IS NULL`).bind(t).run()
      : ids.length ? await db.prepare(`UPDATE dev_events SET read_at=? WHERE read_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`).bind(t, ...ids).run() : {meta: {changes: 0}};
    return json({ok:true, marked: r.meta?.changes || 0});
  }
  // ----- v10.6: developer Web Push (free, same VAPID keys). Each dev device (phone, laptop…) subscribes through the Dev app's own worker (scope /dev). -----
  if (p === "/api/dev/push" && m === "GET") {
    const devices = (await db.prepare(`SELECT id, endpoint, user_agent, created_at, last_ok_at, fail_count FROM dev_push_subs WHERE dev_id=? ORDER BY id DESC`).bind(dev.id).all()).results;
    const attempts = (await db.prepare(`SELECT event, push_host, http_status, outcome, at FROM notification_attempts WHERE role='dev' ORDER BY id DESC LIMIT 10`).all()).results;
    return json({ok:true, public_key: (await getVapid(raw)).pub, devices, attempts});
  }
  if (p === "/api/dev/push/subscribe" && m === "POST") {
    const b = await body(req); const sub = parseSubscription(b.subscription, env);
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM dev_push_subs WHERE dev_id=? AND endpoint != ?`).bind(dev.id, sub.endpoint).first()).n;
    if (n >= 10) fail(409,"too_many","Too many alert devices. Remove one first.");
    await db.prepare(`INSERT INTO dev_push_subs (dev_id,endpoint,p256dh,auth,user_agent,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET dev_id=excluded.dev_id, p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent, fail_count=0`)
      .bind(dev.id, sub.endpoint, sub.p256dh, sub.auth, String(req.headers.get("user-agent") || "").slice(0, 200), now()).run();
    if (b.replaces && typeof b.replaces === "string" && b.replaces !== sub.endpoint) await db.prepare(`DELETE FROM dev_push_subs WHERE dev_id=? AND endpoint=?`).bind(dev.id, b.replaces.slice(0, 1000)).run();
    const devices = (await db.prepare(`SELECT COUNT(*) AS n FROM dev_push_subs WHERE dev_id=?`).bind(dev.id).first()).n;
    return json({ok:true, subscribed:true, devices});
  }
  if (p === "/api/dev/push/unsubscribe" && m === "POST") {
    const b = await body(req);
    const r = b.id ? await db.prepare(`DELETE FROM dev_push_subs WHERE id=? AND dev_id=?`).bind(intIn(b.id, 1, 1e9, "id"), dev.id).run()
      : await db.prepare(`DELETE FROM dev_push_subs WHERE endpoint=? AND dev_id=?`).bind(str(b.endpoint, 1000, {required: true, field: "endpoint"}), dev.id).run();
    return json({ok:true, removed: r.meta?.changes || 0});
  }
  if (p === "/api/dev/push/test" && m === "POST") {
    const b = await body(req);
    const subs = b.endpoint ? (await db.prepare(`SELECT * FROM dev_push_subs WHERE endpoint=? AND dev_id=?`).bind(str(b.endpoint, 1000), dev.id).all()).results : (await db.prepare(`SELECT * FROM dev_push_subs WHERE dev_id=?`).bind(dev.id).all()).results;
    if (!subs.length) fail(404,"no_device","This device is not subscribed yet");
    const results = await pushTo(env, scoped(raw, 0), subs, "dev:test", {role: "dev", title: "🔔 Dev alert test", body: "Alerts are on for this device ✅ New shops, payments and plans ending will all show up here.", url: "/dev", tag: "dev-test"}, null, url.origin, "dev_push_subs");
    return json({ok:true, results: results.map(x => ({status: x.status, outcome: x.outcome}))});
  }
  if (p === "/api/dev/health" && m === "GET") return json({ok:true, dev:{username: dev.username}, service: await service(scoped(raw, 1)), ...(await devHealth(db, url, req))});
  // ----- v10.9: 📊 Dukaan wise -----
  if (p === "/api/dev/dukaan" && m === "GET") { const r = dukaanRange(url.searchParams); return json({ok:true, ...r, ...(await dukaanReport(raw, r.from, r.to))}); }
  if ((mm = p.match(/^\/api\/dev\/dukaan\/(\d+)$/)) && m === "GET") { const r = dukaanRange(url.searchParams); return json({ok:true, ...r, ...(await dukaanDetail(raw, Number(mm[1]), r.from, r.to))}); }
  // ----- v5: all shops -----
  if (p === "/api/dev/shops" && m === "GET") {
    const t = now(); const cfg = await subConfig(raw);
    // Subscription control panel: who the shop is + its subscription. No items, orders or customers of a shop are shown here.
    const shopsRaw = (await db.prepare(`SELECT s.id, s.slug, s.name, s.owner_name, s.mobile, s.status, s.paid_until, s.trial_end, s.provisional_until, s.price_paise, s.online, s.created_at, s.approved_at, s.app_name, s.app_icons, s.app_theme, s.app_lock, s.shop_type, s.lat, s.lng, s.dir_hidden,
      (SELECT a.username FROM admins a WHERE a.shop_id=s.id ORDER BY a.id LIMIT 1) AS login,
      (SELECT COUNT(*) FROM sub_payments p WHERE p.shop_id=s.id AND p.status='pending') AS payments_pending,
      (SELECT i.number FROM invoices i WHERE i.shop_id=s.id AND i.status IN ('unpaid','pending_verify') ORDER BY i.id DESC LIMIT 1) AS open_invoice
      FROM shops s ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.id`).all()).results;
    // v10.12: today's orders (IST day, test orders excluded), open-now from each shop's hours, and directory listing per shop
    const dayStart = istDayStart(t), todayN = {}, hrs = {};
    for (const r of (await db.prepare(`SELECT shop_id, COUNT(*) AS n FROM orders WHERE created_at>=? AND is_test=0 GROUP BY shop_id`).bind(dayStart).all()).results) todayN[r.shop_id] = r.n;
    for (const r of (await db.prepare(`SELECT shop_id, key, value FROM shop_settings WHERE key IN ('force_closed','open_time','close_time')`).all()).results) { try { (hrs[r.shop_id] = hrs[r.shop_id] || {})[r.key] = JSON.parse(r.value); } catch {} }
    const shops = shopsRaw
      .map(s => { const sub = subState(s, t); const st = s.status === "grace" ? "active" : s.status;
        const hoursOpen = storeStatus({...DEFAULT_SETTINGS, ...(hrs[s.id] || {})}, t).open;
        const listed = (s.status === "active" || s.status === "grace") && !!s.online && !s.dir_hidden && !isTestShop(s.name) && sub.can_operate;
        return {id: s.id, slug: s.slug, name: s.name, owner_name: s.owner_name, mobile: s.mobile, status: st, effective_status: st === "active" && !sub.can_operate ? "paused" : st, sub, monthly_paise: shopMonthly(s, cfg), custom_price: Number.isInteger(s.price_paise),
          online: !!s.online, created_at: s.created_at, approved_at: s.approved_at, login: s.login, payments_pending: s.payments_pending, open_invoice: s.open_invoice, type: shopTypeKey(s.shop_type), type_info: shopTypeView(s.shop_type), link: `/s/${s.slug}`, customer_url: `${publicOrigin(env, url)}/s/${s.slug}`, app: shopAppView(s),
          location: s.lat != null && s.lng != null ? {lat: Number(s.lat), lng: Number(s.lng)} : null, dir_hidden: !!s.dir_hidden, listed, is_test: isTestShop(s.name), open_now: !!s.online && hoursOpen, hours_open: hoursOpen, orders_today: todayN[s.id] || 0}; });
    const auto = (await db.prepare(`SELECT v FROM service_state WHERE k='auto_approve'`).first())?.v === "1";
    return json({ok:true, shops, auto_approve: auto, plan: cfg, now: t, shop_types: Object.keys(SHOP_TYPES).map(shopTypeView)});
  }
  if (p === "/api/dev/settings" && m === "POST") {
    const b = await body(req);
    if ("auto_approve" in b) await db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('auto_approve',?)`).bind(bool(b.auto_approve) ? "1" : "0").run();
    return json({ok:true, auto_approve: (await db.prepare(`SELECT v FROM service_state WHERE k='auto_approve'`).first())?.v === "1"});
  }
  // ----- v6: home-screen app per shop (override + lock), platform brand, image upload, delete shop -----
  if (p === "/api/dev/image" && m === "POST") {
    const b = await body(req); const sid = b.shop_id === 0 || b.shop_id === "brand" ? PLATFORM_IMG_SHOP : intIn(b.shop_id, 1, 1e9, "shop");
    if (sid > 0 && !(await db.prepare(`SELECT id FROM shops WHERE id=?`).bind(sid).first())) fail(404,"not_found","Shop not found");
    const mt = String(b.data_url||"").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!mt) fail(400,"invalid","Upload a JPG, PNG or WebP image");
    const size = Math.floor(mt[2].length*3/4); if (size > 450000) fail(413,"too_large","Image too big");
    const id = randHex(10); await db.prepare(`INSERT INTO images (shop_id,id,mime,data,size,created_at) VALUES (?,?,?,?,?,?)`).bind(sid, id, mt[1], mt[2], size, now()).run();
    return json({ok:true, image_id:id, url:`/api/img/${id}`});
  }
  if (p === "/api/dev/shops/app" && m === "POST") {
    const b = await body(req); const sid = intIn(b.shop_id, 1, 1e9, "shop");
    const sh = await db.prepare(`SELECT * FROM shops WHERE id=?`).bind(sid).first(); if (!sh) fail(404,"not_found","Shop not found");
    const name = "name" in b ? cleanAppName(b.name) : sh.app_name; const theme = "theme" in b ? cleanTheme(b.theme) : sh.app_theme;
    const icons = "icons" in b ? JSON.stringify(await cleanIcons(db, b.icons, sid)) : sh.app_icons; const lock = "lock" in b ? (bool(b.lock) ? 1 : 0) : sh.app_lock;
    await db.prepare(`UPDATE shops SET app_name=?, app_theme=?, app_icons=?, app_lock=?, updated_at=? WHERE id=?`).bind(name, theme, icons, lock, now(), sid).run();
    if (lock !== sh.app_lock || "name" in b || "icons" in b) await logService(scoped(raw, sid), sh.status, sh.status, "dev:" + dev.username, `home-screen app ${"icons" in b || "name" in b ? "set" : ""}${lock !== sh.app_lock ? (lock ? " + locked" : " + unlocked") : ""}`.trim());
    return json({ok:true, app: shopAppView({...sh, app_name: name, app_theme: theme, app_icons: icons, app_lock: lock})});
  }
  if (p === "/api/dev/brand" && m === "GET") return json({ok:true, brand: await brand(raw)});
  if (p === "/api/dev/brand" && m === "POST") {
    const b = await body(req); const st = [];
    if ("name" in b) { const n = String(b.name || "").replace(/\s+/g, " ").trim(); if (!n || graphemes(n).length > 30) fail(400,"invalid","Platform name: 1–30 characters"); st.push(db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('brand_name',?)`).bind(n)); }
    if ("icons" in b) st.push(db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('brand_icons',?)`).bind(JSON.stringify(await cleanIcons(db, b.icons, PLATFORM_IMG_SHOP))));
    if (st.length) await db.batch(st);
    return json({ok:true, brand: await brand(raw)});
  }
  // v10.12: per-shop switches from /dev — open/closed (the shop's ONLINE flag), shown in the customer directory or hidden, clear the
  // shop location. One shop per call, only that shop's row; every change is written to sub_log with the developer's name.
  if (p === "/api/dev/shops/flags" && m === "POST") {
    const b = await body(req); const sid = intIn(b.shop_id, 1, 1e9, "shop");
    const sh = await db.prepare(`SELECT id, name, slug, status, online, dir_hidden, lat, lng FROM shops WHERE id=?`).bind(sid).first(); if (!sh) fail(404, "not_found", "Shop not found");
    const sets = [], vals = [], notes = [];
    if ("online" in b) { const on = bool(b.online); if (on && !canOrder(sh.status === "grace" ? "grace" : sh.status)) fail(409, "not_approved", "This shop is not approved or is paused, so it can't open");
      if (!!sh.online !== on) { sets.push("online=?"); vals.push(on ? 1 : 0); notes.push(on ? "opened (online)" : "closed (offline)"); } }
    if ("dir_hidden" in b) { const hd = bool(b.dir_hidden); if (!!sh.dir_hidden !== hd) { sets.push("dir_hidden=?"); vals.push(hd ? 1 : 0); notes.push(hd ? "hidden from the customer directory" : "shown in the customer directory"); } }
    if (b.clear_location === true && sh.lat != null) { sets.push("lat=NULL", "lng=NULL"); notes.push("location cleared"); }
    if (!sets.length) return json({ok: true, changed: false});
    await db.batch([
      db.prepare(`UPDATE shops SET ${sets.join(", ")}, updated_at=? WHERE id=?`).bind(...vals, now(), sid),
      db.prepare(`INSERT INTO sub_log (shop_id,at,actor,action,detail) VALUES (?,?,?,'dev_flags',?)`).bind(sid, now(), "dev:" + dev.username, `${sh.name}: ${notes.join(", ")}`)
    ]);
    return json({ok: true, changed: true, notes});
  }
  // Delete a shop and ALL its data (typed slug must match). Shop #1 is protected.
  if (p === "/api/dev/shops/delete" && m === "POST") {
    const b = await body(req); const sid = intIn(b.shop_id, 1, 1e9, "shop");
    const sh = await db.prepare(`SELECT * FROM shops WHERE id=?`).bind(sid).first(); if (!sh) fail(404,"not_found","This shop was not found. It may already be deleted. Refresh the page.");
    if (!deleteConfirmOk(b.confirm, sh)) fail(400,"confirm",`The name did not match. Type the shop name “${sh.name}” or the link name “${sh.slug}”.`);
    const ord = `(SELECT id FROM orders WHERE shop_id=?)`;
    await db.batch([
      db.prepare(`DELETE FROM order_ratings WHERE order_id IN ${ord}`).bind(sid), db.prepare(`DELETE FROM order_events WHERE order_id IN ${ord}`).bind(sid),
      db.prepare(`DELETE FROM order_items WHERE order_id IN ${ord}`).bind(sid), db.prepare(`DELETE FROM push_subscriptions WHERE shop_id=?`).bind(sid),
      db.prepare(`DELETE FROM notification_attempts WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM orders WHERE shop_id=?`).bind(sid),
      db.prepare(`DELETE FROM offer_items WHERE offer_id IN (SELECT id FROM offers WHERE shop_id=?)`).bind(sid), db.prepare(`DELETE FROM offers WHERE shop_id=?`).bind(sid),
      db.prepare(`DELETE FROM variants WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM products WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM categories WHERE shop_id=?`).bind(sid),
      db.prepare(`DELETE FROM images WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE shop_id=?)`).bind(sid),
      db.prepare(`DELETE FROM admins WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM shop_settings WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM shop_service_prices WHERE shop_id=?`).bind(sid),
      db.prepare(`DELETE FROM audit_log WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM service_log WHERE shop_id=?`).bind(sid),
      db.prepare(`DELETE FROM sub_payments WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM invoices WHERE shop_id=?`).bind(sid),
      db.prepare(`DELETE FROM notice_recipients WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM dev_events WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM stock_log WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM stock_alerts WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM bulk_ops WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM order_subs WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM shop_events WHERE shop_id=?`).bind(sid), db.prepare(`DELETE FROM notices WHERE NOT EXISTS (SELECT 1 FROM notice_recipients r WHERE r.notice_id=notices.id)`),
      db.prepare(`INSERT INTO sub_log (shop_id,at,actor,action,detail) VALUES (0,?,?,'shop_deleted',?)`).bind(now(), "dev:" + dev.username, `${sh.name} (/s/${sh.slug}) deleted with all its data`),
      db.prepare(`INSERT OR IGNORE INTO service_state (k,v) VALUES ('platform_ready','1')`),
      db.prepare(`DELETE FROM shops WHERE id=?`).bind(sid)
    ]);
    return json({ok:true, deleted: sh.slug});
  }
  const shopParam = m === "GET" ? url.searchParams.get("shop_id") : null;
  if (p === "/api/dev/service" && m === "GET") {
    db = scoped(raw, shopParam ? intIn(shopParam, 1, 1e9, "shop") : 1);
    if (!(await db.prepare(`SELECT id FROM shops WHERE id=?`).bind(db.sid).first())) fail(404,"not_found","Shop not found");
    const svc = await service(db);
    const log = (await db.prepare(`SELECT id, at, from_status, to_status, actor, note FROM service_log WHERE shop_id=? ORDER BY id DESC LIMIT 50`).bind(db.sid).all()).results;
    return json({ok:true, shop_id: db.sid, service: svc, log, now: now()});
  }
  if (p === "/api/dev/service" && m === "POST") {
    const b = await body(req); const actor = "dev:" + dev.username; const note = str(b.note, 200);
    if (b.action === "settings" && (b.shop_id == null || b.shop_id === "") && "dev_contact" in b) { // platform-wide: the developer's phone (works even when shop #1 is gone)
      const v = String(b.dev_contact||"").trim(); if (v && !normPhone(v)) fail(400,"invalid_phone","Developer contact must be a valid 10-digit mobile");
      await db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('dev_contact',?)`).bind(v ? normPhone(v) : "").run(); return json({ok:true, dev_contact: v ? normPhone(v) : ""});
    }
    db = scoped(raw, b.shop_id != null && b.shop_id !== "" ? intIn(b.shop_id, 1, 1e9, "shop") : 1);
    if (!(await db.prepare(`SELECT id FROM shops WHERE id=?`).bind(db.sid).first())) fail(404,"not_found","Shop not found");
    const cur = await service(db); const st = [];
    const put = (k, v) => st.push(db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES (?,?)`).bind(k, String(v)));
    let target = null; let extra = "";
    if (b.action === "approve") { if (cur.status !== "pending" && cur.status !== "rejected") fail(409,"invalid","Only a pending or rejected shop can be approved"); target = "active"; }
    else if (b.action === "reject") { if (cur.status !== "pending") fail(409,"invalid","Only a pending shop can be rejected — pause an approved shop instead"); target = "rejected"; }
    else if (b.action === "resume") target = "active";
    else if (b.action === "pause") target = "paused";
    else if (b.action !== "settings") fail(400,"invalid","Unknown action");
    if ("dev_contact" in b) { const v = String(b.dev_contact||"").trim(); if (v && !normPhone(v)) fail(400,"invalid_phone","Developer contact must be a valid 10-digit mobile"); put("dev_contact", v ? normPhone(v) : ""); }
    if (st.length) await db.batch(st);
    if (target && target !== cur.manual_status) await setStatus(db, cur.manual_status, target, actor, (note || b.action) + extra);
    else if (extra) await logService(db, cur.manual_status, cur.manual_status, actor, ((note || "settings") + extra).trim());
    if (target === "rejected") await db.prepare(`DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE shop_id=?)`).bind(db.sid).run();
    const after = await service(db);
    const log = (await db.prepare(`SELECT id, at, from_status, to_status, actor, note FROM service_log WHERE shop_id=? ORDER BY id DESC LIMIT 50`).bind(db.sid).all()).results;
    return json({ok:true, shop_id: db.sid, service: after, log, now: now()});
  }

  // ===== v7: super-admin control room =====
  const devShop = async id => { const sh = await db.prepare(`SELECT * FROM shops WHERE id=?`).bind(id).first(); if (!sh) fail(404,"not_found","Shop not found"); return sh; };
  const devAudit = (sid, field, label, before, after, reason) => db.prepare(`INSERT INTO audit_log (shop_id,at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (?,?,'shop',?,NULL,?,?,?,?,?,?)`)
    .bind(sid, now(), sid, label || "", field, before == null ? null : String(before), after == null ? null : String(after), "dev:" + dev.username, reason || "");
  const ssGet = async k => (await db.prepare(`SELECT v FROM service_state WHERE k=?`).bind(k).first())?.v;
  // ----- v9: Cloudflare usage (dev only; a shopkeeper session already got 403 above) -----
  if (p === "/api/dev/cloudflare" && m === "GET") return json({ok:true, ...(await cfUsage(env, raw, {force: url.searchParams.get("refresh") === "1"}))});
  if (p === "/api/dev/cloudflare" && m === "POST") {
    const b = await body(req); const t = now(); const st = []; const actor = "dev:" + dev.username;
    const put = (k, v) => st.push(raw.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES (?,?)`).bind(k, v));
    if (b.clear) { st.push(raw.prepare(`DELETE FROM server_secrets WHERE k='cf_token'`), raw.prepare(`DELETE FROM service_state WHERE k IN ('cf_token_set_at','cf_usage_cache','cf_account_id')`)); }
    else {
      if ("database_id" in b) { const v = String(b.database_id || "").trim(); if (v && !/^[0-9a-f-]{32,36}$/i.test(v)) fail(400,"invalid","The D1 database ID looks wrong"); put("cf_db_id", v); }
      let acct = "account_id" in b ? String(b.account_id || "").trim() : null; if (acct && !/^[0-9a-f]{32}$/i.test(acct)) fail(400,"invalid","An Account ID is 32 characters (0-9, a-f)");
      if (b.token != null && String(b.token).trim()) {
        const tok = String(b.token).trim(); if (!/^[A-Za-z0-9_.\-]{30,300}$/.test(tok)) fail(400,"invalid","The token looks wrong. Copy and paste the whole token.");
        const det = await cfDetectAccount(env, tok);
        if (!acct) { acct = det.id || (await cfConf(raw, env)).account_id; if (!acct) fail(400,"cf_account", det.count > 1 ? "The token has more than one account. Enter the Account ID too." : "Could not find the Account ID automatically. Enter it too (it is in the Cloudflare dashboard URL).");}
        st.push(raw.prepare(`INSERT OR REPLACE INTO server_secrets (k,v,created_at) VALUES ('cf_token',?,?)`).bind(tok, t)); put("cf_token_set_at", String(t));
        st.push(raw.prepare(`DELETE FROM service_state WHERE k='cf_usage_cache'`));
      }
      if (acct != null) { put("cf_account_id", acct); st.push(raw.prepare(`DELETE FROM service_state WHERE k='cf_usage_cache'`)); }
    }
    if (st.length) { st.push(raw.prepare(`INSERT INTO service_log (shop_id,at,from_status,to_status,actor,note) VALUES (0,?,NULL,'platform',?,?)`).bind(t, actor, b.clear ? "cloudflare token removed" : "cloudflare settings: " + Object.keys(b).filter(k => k !== "token").concat(b.token ? ["token (masked)"] : []).join(", "))); await raw.batch(st); }
    return json({ok:true, ...(await cfUsage(env, raw))});
  }
  if (p === "/api/dev/overview" && m === "GET") {
    const t = now(); const cfg = await subConfig(raw);
    const st = {}; for (const r of (await db.prepare(`SELECT status, COUNT(*) AS n FROM shops GROUP BY status`).all()).results) st[r.status === "grace" ? "active" : r.status] = (st[r.status === "grace" ? "active" : r.status] || 0) + r.n;
    const rows = (await db.prepare(`SELECT id, status, paid_until, trial_end, provisional_until, price_paise FROM shops WHERE status IN ('active','grace','paused')`).all()).results;
    const subs = {TRIAL:0, ACTIVE:0, DUE:0, EXPIRED:0, PAYMENT_PENDING_VERIFY:0};
    const d = new Date(t + IST); const mStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST, mEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - IST;
    let expected = 0;
    for (const r of rows) { const sub = subState(r, t); subs[sub.state]++;
      // expected this month: every approved, not manually paused shop whose access ends before the month is over (or already ended), one billing period each
      if (r.status !== "paused" && (sub.ends_at || 0) < mEnd) expected += shopMonthly(r, cfg) * cfg.months; }
    const recv = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_paise),0) AS v FROM sub_payments WHERE status='verified' AND decided_at >= ? AND decided_at < ?`).bind(mStart, mEnd).first();
    const toVerify = (await db.prepare(`SELECT COUNT(*) AS n FROM sub_payments WHERE status='pending'`).first()).n;
    const online = (await db.prepare(`SELECT COUNT(*) AS n FROM shops WHERE online=1 AND status IN ('active','grace')`).first()).n;
    return json({ok:true, shops: {total: Object.values(st).reduce((a,b)=>a+b,0), pending: st.pending||0, active: st.active||0, paused: st.paused||0, rejected: st.rejected||0, online},
      subs, payments_to_verify: toVerify, revenue: {expected_month_paise: expected, received_month_paise: recv.v, received_month_count: recv.n, month: istYMD(t).slice(0,7)}, plan: cfg, now: t});
  }
  if (p === "/api/dev/audit" && m === "GET") {
    // Subscription + shop-status events only (no item/order/stock history of any shop).
    const q = url.searchParams; const sid = q.get("shop") ? intIn(q.get("shop"), 0, 1e9, "shop") : null;
    const lim = Math.min(Math.max(parseInt(q.get("limit")||"200",10)||200, 1), 1000);
    const args = sid != null ? [sid, sid, sid] : [];
    const rows = (await db.prepare(`SELECT x.*, s.name AS shop_name FROM (
        SELECT 'service' AS src, l.id, l.shop_id, l.at, l.to_status AS action, l.from_status AS before, l.to_status AS after, l.actor, l.note AS detail FROM service_log l ${sid != null ? "WHERE l.shop_id=?" : ""}
        UNION ALL SELECT 'sub', g.id, g.shop_id, g.at, g.action, NULL, NULL, g.actor, g.detail FROM sub_log g ${sid != null ? "WHERE g.shop_id=?" : ""}
        UNION ALL SELECT 'shop', a.id, a.shop_id, a.at, a.field, a.before, a.after, a.actor, a.reason FROM audit_log a WHERE a.entity='shop' AND a.field NOT IN ('login_as') ${sid != null ? "AND a.shop_id=?" : ""}
      ) x LEFT JOIN shops s ON s.id=x.shop_id ORDER BY x.at DESC, x.id DESC LIMIT ${lim}`).bind(...args).all()).results;
    return json({ok:true, audit: rows});
  }
  // v10.1: landing title/text now live in the Landing editor's JSON (Dev → 🏠 Landing); these two keys are kept for old callers.
  const platformView = async () => { const lc = await landingLoad(db); return {signup_open: (await ssGet("signup_open")) !== "0", auto_approve: (await ssGet("auto_approve")) === "1", landing_title: lc.text.title.hi || "", landing_text: lc.text.lead.hi || "", ...(await subConfig(raw))}; };
  if (p === "/api/dev/landing" && m === "GET") { const cfg = await landingLoad(db); const sc = await subConfig(raw);
    const limits = {cards: LANDING_MAX_CARDS, card_title: LCARD_T, card_text: LCARD_D, icon: LICON, text: Object.fromEntries(Object.entries(LANDING_TEXT).map(([k, v]) => [k, v[2]]))};
    return json({ok: true, landing: cfg, defaults: landingDefaults(), limits, plan: {trial_days: sc.trial_days, price: "₹" + rs(sc.price_paise)}}); }
  if (p === "/api/dev/landing" && m === "POST") { const b = await body(req); const v = await landingSave(db, b.landing, "dev:" + dev.username); return json({ok: true, landing: v, defaults: landingDefaults()}); }
  if (p === "/api/dev/platform" && m === "GET") return json({ok:true, platform: await platformView(), dev_contact: (await db.prepare(`SELECT v FROM service_state WHERE k='dev_contact'`).first())?.v || ""}); // v10.3: the Platform form reads the phone from here (GET /api/dev/service 404s once shop #1 is gone)
  if (p === "/api/dev/platform" && m === "POST") {
    const b = await body(req); const st = []; const put = (k, v) => st.push(db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES (?,?)`).bind(k, v));
    if ("signup_open" in b) put("signup_open", bool(b.signup_open) ? "1" : "0");
    if ("auto_approve" in b) put("auto_approve", bool(b.auto_approve) ? "1" : "0");
    if ("landing_title" in b || "landing_text" in b) { // v10.1: old fields map into the Landing editor (both languages), one place only
      const lc = await landingLoad(db);
      if ("landing_title" in b) { const t = str(b.landing_title, 100).replace(/[<>]/g, ""); lc.text.title = {hi: t, en: t}; }
      if ("landing_text" in b) { const t = str(b.landing_text, 400).replace(/[<>]/g, ""); lc.text.lead = {hi: t, en: t}; }
      await landingSave(db, lc, "dev:" + dev.username); }
    if ("price" in b) { const pp = toPaise(b.price, "Monthly price"); if (pp < 100 || pp > 1e7) fail(400,"invalid","Monthly price: ₹1 – ₹1,00,000"); put("sub_price_paise", String(pp)); }
    if ("months" in b) { const mo = Number(b.months); if (![1,3,6,12].includes(mo)) fail(400,"invalid","Billing period must be 1, 3, 6 or 12 months"); put("sub_months", String(mo)); }
    if ("trial_days" in b) put("trial_days", String(intIn(b.trial_days, 0, 365, "Trial days")));
    if ("upi_id" in b) { const u = String(b.upi_id || "").trim(); if (u && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/.test(u)) fail(400,"invalid","UPI ID looks wrong (example: krish@okaxis)"); put("upi_id", u); }
    if ("upi_name" in b) put("upi_name", str(b.upi_name, 50).replace(/[<>&]/g, ""));
    if (st.length) { st.push(db.prepare(`INSERT INTO service_log (shop_id,at,from_status,to_status,actor,note) VALUES (0,?,NULL,'platform',?,?)`).bind(now(), "dev:" + dev.username, "platform settings: " + Object.keys(b).join(", "))); await db.batch(st); }
    return json({ok:true, platform: await platformView()});
  }
  if ((mm = p.match(/^\/api\/dev\/shops\/(\d+)$/)) && m === "GET") {
    const sh = await devShop(Number(mm[1]));
    const owner = await db.prepare(`SELECT id, username, mobile, must_change, created_at, (recovery_hash IS NOT NULL) AS has_recovery FROM admins WHERE shop_id=? ORDER BY id LIMIT 1`).bind(sh.id).first();
    const svc = await service(scoped(raw, sh.id)); const view = await shopSubView(raw, sh.id, svc);
    const log = (await db.prepare(`SELECT * FROM (SELECT 'sub' AS src, id, at, actor, action, detail FROM sub_log WHERE shop_id=? UNION ALL SELECT 'service', id, at, actor, to_status, COALESCE(from_status,'') || ' → ' || to_status || CASE WHEN note != '' THEN ' · ' || note ELSE '' END FROM service_log WHERE shop_id=?) ORDER BY at DESC, id DESC LIMIT 100`).bind(sh.id, sh.id).all()).results;
    const shop = {id: sh.id, slug: sh.slug, name: sh.name, owner_name: sh.owner_name, mobile: sh.mobile, status: sh.status === "grace" ? "active" : sh.status, online: !!sh.online, created_at: sh.created_at, approved_at: sh.approved_at, price_paise: sh.price_paise, link: `/s/${sh.slug}`, customer_url: `${publicOrigin(env, url)}/s/${sh.slug}`, app: shopAppView(sh)};
    return json({ok:true, shop, owner, service: svc, ...view, log, wa_url: view.invoice ? billWhatsApp(sh, view.invoice, publicOrigin(env, url)) : null, now: now()});
  }
  // ----- v8: subscription controls -----
  if ((mm = p.match(/^\/api\/dev\/shops\/(\d+)\/subscription$/)) && m === "POST") {
    const sh = await devShop(Number(mm[1])); const b = await body(req); const t = now(); const actor = "dev:" + dev.username; const st = [];
    const cur = subState(sh, t);
    if (b.action === "extend") {
      const mo = intIn(b.months, 1, 24, "Months"); const base = Math.max(t, cur.paid_until || 0, cur.trial_end || 0); const until = addMonths(base, mo);
      st.push(db.prepare(`UPDATE shops SET paid_until=?, updated_at=? WHERE id=?`).bind(String(until), t, sh.id), subLog(db, sh.id, actor, "extended", `+${mo} month${mo > 1 ? "s" : ""} (manual) → paid until ${hiDate(until)}`));
    } else if (b.action === "price") {
      const pp = b.price === "" || b.price == null ? null : toPaise(b.price, "Monthly price"); if (pp != null && (pp < 100 || pp > 1e7)) fail(400,"invalid","Monthly price: ₹1 – ₹1,00,000");
      st.push(db.prepare(`UPDATE shops SET price_paise=?, updated_at=? WHERE id=?`).bind(pp, t, sh.id), subLog(db, sh.id, actor, "price", pp == null ? "price → platform default" : `price → ₹${rs(pp)}/month (this shop only)`));
    } else if (b.action === "expire_now") {
      st.push(db.prepare(`UPDATE shops SET trial_end=MIN(COALESCE(trial_end,0), ?), paid_until=CASE WHEN paid_until != '' AND CAST(paid_until AS INTEGER) > ? THEN ? ELSE paid_until END, provisional_until=0, updated_at=? WHERE id=?`).bind(t - 1000, t, String(t - 1000), t, sh.id),
        subLog(db, sh.id, actor, "expired_now", "trial / plan ended now by developer (shop auto-pauses)"));
    } else if (b.action === "trial_end") {
      const te = endOfDayIST(String(b.date || "")); if (!te) fail(400,"invalid","Date like 2026-11-30");
      st.push(db.prepare(`UPDATE shops SET trial_end=?, updated_at=? WHERE id=?`).bind(te, t, sh.id), subLog(db, sh.id, actor, "trial_end", `trial ends ${hiDate(te)}`));
    } else fail(400,"invalid","Unknown action");
    await db.batch(st);
    const svc = await service(scoped(raw, sh.id));
    return json({ok:true, service: svc, sub: svc.sub});
  }
  // ----- v10.4: 📢 Notify — notices to one / selected / ALL shops; read counts; resolve issue; delete -----
  if (p === "/api/dev/notices" && m === "GET") {
    const rows = (await db.prepare(`SELECT n.*, COUNT(r.shop_id) AS recipients, COALESCE(SUM(r.read_at IS NOT NULL),0) AS reads, GROUP_CONCAT(s.name, ', ') AS shop_names FROM notices n LEFT JOIN notice_recipients r ON r.notice_id=n.id LEFT JOIN shops s ON s.id=r.shop_id GROUP BY n.id ORDER BY n.created_at DESC, n.id DESC LIMIT 100`).all()).results;
    const shops = (await db.prepare(`SELECT id, name, slug, status FROM shops WHERE status != 'rejected' ORDER BY id`).all()).results;
    return json({ok:true, notices: rows.map(n => ({...noticeView(n), target: n.target, created_by: n.created_by, recipients: n.recipients, reads: n.reads, shop_names: String(n.shop_names || "").slice(0, 300)})), shops,
      reminders: {cron: "daily 09:00 IST", last_run: Number(await ssGet("reminders_last_run")) || null, last_created: Number(await ssGet("reminders_last_created")) || 0}});
  }
  if (p === "/api/dev/notices" && m === "POST") {
    const b = await body(req); const type = String(b.type || "");
    if (!NOTICE_TYPES.includes(type)) fail(400,"invalid","Type: bill, due, update, feature, issue or message");
    const title = str(b.title, 120, {required: true, field: "Title"}).replace(/[<>]/g, ""); const text = str(b.body, 1500).replace(/[<>]/g, "");
    const fix_by = type === "issue" ? parseFixBy(b.fix_by) : null;
    let ids, target;
    if (b.target === "all") { target = "all"; ids = (await db.prepare(`SELECT id FROM shops WHERE status != 'rejected'`).all()).results.map(r => r.id); }
    else { target = "shops"; const want = (Array.isArray(b.shop_ids) ? b.shop_ids : []).map(Number).filter(x => Number.isInteger(x) && x > 0);
      if (!want.length) fail(400,"invalid","Choose at least one shop (or ALL shops)");
      ids = (await db.prepare(`SELECT id FROM shops WHERE status != 'rejected' AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(want)).all()).results.map(r => r.id);
      if (ids.length !== new Set(want).size) fail(404,"not_found","One of the chosen shops was not found"); }
    if (!ids.length) fail(409,"invalid","No shops to send to yet");
    const action = (type === "bill" || type === "due") ? "recharge" : "";
    const r = await createNotice(env, raw, {type, title, body: text, action, fix_by, pinned: bool(b.pinned) || (type === "issue" && b.pinned !== false), target, created_by: "dev:" + dev.username}, ids, {origin: publicOrigin(env, url)});
    await db.prepare(`INSERT INTO service_log (shop_id,at,from_status,to_status,actor,note) VALUES (0,?,NULL,'notice',?,?)`).bind(now(), "dev:" + dev.username, `${NOTICE_ICON[type]} ${type} → ${target === "all" ? "ALL" : ids.length} shop(s): ${title}`.slice(0, 300)).run();
    return json({ok:true, ...r});
  }
  if ((mm = p.match(/^\/api\/dev\/notices\/(\d+)\/resolve$/)) && m === "POST") {
    const n = await db.prepare(`SELECT * FROM notices WHERE id=?`).bind(Number(mm[1])).first(); if (!n) fail(404,"not_found","Notice not found");
    const t = n.resolved_at ? n.resolved_at : now();
    await db.prepare(`UPDATE notices SET resolved_at=?, pinned=0 WHERE id=?`).bind(t, n.id).run();
    return json({ok:true, id: n.id, resolved_at: t});
  }
  if ((mm = p.match(/^\/api\/dev\/notices\/(\d+)$/)) && m === "DELETE") {
    const id = Number(mm[1]); const n = await db.prepare(`SELECT id FROM notices WHERE id=?`).bind(id).first(); if (!n) fail(404,"not_found","Notice not found");
    await db.batch([db.prepare(`DELETE FROM notice_recipients WHERE notice_id=?`).bind(id), db.prepare(`DELETE FROM notices WHERE id=?`).bind(id)]);
    return json({ok:true, deleted: id});
  }
  if (p === "/api/dev/notices/reminders" && m === "POST") {
    const r = await runReminders(env, raw, {push: true, origin: publicOrigin(env, url)});
    await db.batch([db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('reminders_last_run',?)`).bind(String(now())), db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('reminders_last_created',?)`).bind(String(r.created.length))]);
    return json({ok:true, ...r});
  }
  if ((mm = p.match(/^\/api\/dev\/shops\/(\d+)\/bill$/)) && m === "POST") {
    const sh = await devShop(Number(mm[1])); if (sh.status === "pending" || sh.status === "rejected") fail(409,"invalid","Approve the shop first");
    return json({ok:true, ...(await sendBill(env, raw, sh.id, "dev:" + dev.username, publicOrigin(env, url)))});
  }
  if (p === "/api/dev/bills/send-due" && m === "POST") {
    const t = now(); const out = [];
    for (const sh of (await db.prepare(`SELECT * FROM shops WHERE status IN ('active','grace') ORDER BY id`).all()).results) {
      const sub = subState(sh, t); if (sub.state !== "DUE" && sub.state !== "EXPIRED") continue;
      try { out.push(await sendBill(env, raw, sh.id, "dev:" + dev.username, publicOrigin(env, url))); } catch (e) { out.push({shop_id: sh.id, shop_name: sh.name, error: e.message || String(e)}); }
    }
    return json({ok:true, sent: out.filter(x => !x.error).length, bills: out});
  }
  if (p === "/api/dev/payments" && m === "GET") {
    const all = url.searchParams.get("status") === "all";
    const rows = (await db.prepare(`SELECT p.id, p.shop_id, p.invoice_id, p.utr, p.amount_paise, p.status, p.reason, p.provisional_until, p.submitted_at, p.decided_at, p.decided_by, (p.screenshot IS NOT NULL) AS has_screenshot,
      i.number AS invoice_number, i.months, s.name AS shop_name, s.owner_name, s.mobile, s.slug FROM sub_payments p LEFT JOIN invoices i ON i.id=p.invoice_id LEFT JOIN shops s ON s.id=p.shop_id
      ${all ? "" : "WHERE p.status='pending'"} ORDER BY p.id DESC LIMIT 200`).all()).results;
    return json({ok:true, payments: rows.map(r => ({...r, has_screenshot: !!r.has_screenshot})), now: now()});
  }
  if ((mm = p.match(/^\/api\/dev\/payments\/(\d+)\/screenshot$/)) && m === "GET") {
    const r = await db.prepare(`SELECT screenshot FROM sub_payments WHERE id=?`).bind(Number(mm[1])).first(); const mt = r?.screenshot && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(r.screenshot);
    if (!mt) fail(404,"not_found","No screenshot");
    return new Response(Uint8Array.from(atob(mt[2]), c => c.charCodeAt(0)), {headers: {"content-type": mt[1], "cache-control": "private, no-store"}});
  }
  if ((mm = p.match(/^\/api\/dev\/payments\/(\d+)\/(verify|reject)$/)) && m === "POST") {
    const b = await body(req); const t = now(); const actor = "dev:" + dev.username;
    const pay = await db.prepare(`SELECT * FROM sub_payments WHERE id=?`).bind(Number(mm[1])).first(); if (!pay) fail(404,"not_found","Payment not found");
    if (pay.status !== "pending") fail(409,"invalid","This payment was already " + pay.status);
    const inv = await db.prepare(`SELECT * FROM invoices WHERE id=?`).bind(pay.invoice_id).first(); const sh = await devShop(pay.shop_id);
    const origin = publicOrigin(env, url);
    if (mm[2] === "verify") {
      const cur = subState(sh, t); const months = inv?.months || 1; const base = Math.max(t, cur.paid_until || 0, cur.trial_end || 0); const until = addMonths(base, months);
      await db.batch([
        db.prepare(`UPDATE sub_payments SET status='verified', decided_at=?, decided_by=? WHERE id=? AND status='pending'`).bind(t, actor, pay.id),
        db.prepare(`UPDATE invoices SET status='paid', paid_at=? WHERE id=?`).bind(t, pay.invoice_id),
        db.prepare(`UPDATE shops SET paid_until=?, provisional_until=0, updated_at=? WHERE id=?`).bind(String(until), t, sh.id),
        subLog(db, sh.id, actor, "payment_verified", `${inv?.number || ""} · UTR ${pay.utr} · ₹${rs(pay.amount_paise)} → paid until ${hiDate(until)}`)
      ]);
      await pushShopkeeper(env, raw, sh.id, "sub_paid", "✅ सब्सक्रिप्शन चालू", `पेमेंट मिल गया। ${hiDate(until)} तक दुकान चालू रहेगी।`, origin);
    } else {
      const reason = str(b.reason, 200) || "पेमेंट नहीं मिला";
      await db.batch([
        db.prepare(`UPDATE sub_payments SET status='rejected', reason=?, decided_at=?, decided_by=? WHERE id=? AND status='pending'`).bind(reason, t, actor, pay.id),
        db.prepare(`UPDATE invoices SET status='unpaid' WHERE id=? AND status='pending_verify'`).bind(pay.invoice_id),
        db.prepare(`UPDATE shops SET provisional_until=0, updated_at=? WHERE id=?`).bind(t, sh.id),
        subLog(db, sh.id, actor, "payment_rejected", `${inv?.number || ""} · UTR ${pay.utr} · ${reason}`)
      ]);
      await pushShopkeeper(env, raw, sh.id, "sub_rejected", "❌ पेमेंट नहीं मिला", `${reason} — कृपया सही UTR के साथ दोबारा पे करें।`, origin);
    }
    const svc = await service(scoped(raw, sh.id));
    return json({ok:true, payment: await db.prepare(`SELECT id, status, reason, decided_at FROM sub_payments WHERE id=?`).bind(pay.id).first(), service: svc, sub: svc.sub});
  }
  if ((mm = p.match(/^\/api\/dev\/shops\/(\d+)\/reset-password$/)) && m === "POST") {
    const sh = await devShop(Number(mm[1])); const owner = await db.prepare(`SELECT id, username FROM admins WHERE shop_id=? ORDER BY id LIMIT 1`).bind(sh.id).first(); if (!owner) fail(409,"no_owner","This shop has no shopkeeper login");
    const pw = "Dk-" + randCode(4) + "-" + randCode(4); const salt = randHex(16);
    await db.batch([db.prepare(`UPDATE admins SET pass_hash=?, salt=?, must_change=1 WHERE id=?`).bind(await pbkdf2(pw, salt), salt, owner.id), db.prepare(`DELETE FROM sessions WHERE admin_id=?`).bind(owner.id),
      db.prepare(`DELETE FROM rate_events WHERE k=? OR k=?`).bind("login-user:" + owner.username, "login-user:" + (sh.mobile||"-")), devAudit(sh.id, "password_reset", sh.name, null, null, "password reset by developer")]);
    return json({ok:true, login: owner.username, password: pw, note: "Shown once. The shopkeeper must change it after logging in."});
  }
  if ((mm = p.match(/^\/api\/dev\/shops\/(\d+)\/reset-recovery$/)) && m === "POST") {
    const sh = await devShop(Number(mm[1])); const owner = await db.prepare(`SELECT id FROM admins WHERE shop_id=? ORDER BY id LIMIT 1`).bind(sh.id).first(); if (!owner) fail(409,"no_owner","This shop has no shopkeeper login");
    const key = randCode(4) + "-" + randCode(4) + "-" + randCode(4);
    await db.batch([db.prepare(`UPDATE admins SET recovery_hash=? WHERE id=?`).bind(await sha256("kirana-recover:" + key), owner.id), devAudit(sh.id, "recovery_reset", sh.name, null, null, "recovery key reset by developer")]);
    return json({ok:true, recovery_key: key, note: "Shown once."});
  }
  if ((mm = p.match(/^\/api\/dev\/shops\/(\d+)\/identity$/)) && m === "POST") {
    const sh = await devShop(Number(mm[1])); const b = await body(req); const st = [];
    const name = "name" in b ? str(b.name, 80, {required:true, field:"Shop name"}) : sh.name;
    let slug = sh.slug;
    if ("slug" in b && String(b.slug).trim() !== sh.slug) {
      slug = String(b.slug||"").trim().toLowerCase();
      if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug)) fail(400,"invalid_slug","Link name: 3–32 letters a–z, numbers and dashes");
      if (RESERVED_SLUGS.has(slug)) fail(400,"invalid_slug","That link name is reserved");
      if (await db.prepare(`SELECT 1 AS x FROM shops WHERE slug=? AND id!=?`).bind(slug, sh.id).first()) fail(409,"slug_taken","Another shop already uses that link name");
      st.push(devAudit(sh.id, "slug", name, sh.slug, slug, "link changed by developer — old link/QR stop working"));
    }
    if (name !== sh.name) {
      st.push(devAudit(sh.id, "name", name, sh.name, name, "shop name changed by developer"));
      st.push(db.prepare(`INSERT OR REPLACE INTO shop_settings (shop_id,key,value) VALUES (?,?,?)`).bind(sh.id, "store_name_hi", JSON.stringify(name)));
      if (/^[\x20-\x7e]+$/.test(name)) st.push(db.prepare(`INSERT OR REPLACE INTO shop_settings (shop_id,key,value) VALUES (?,?,?)`).bind(sh.id, "store_name_en", JSON.stringify(name)));
    }
    if (st.length) { st.unshift(db.prepare(`UPDATE shops SET name=?, slug=?, updated_at=? WHERE id=?`).bind(name, slug, now(), sh.id)); await db.batch(st); }
    return json({ok:true, shop: {id: sh.id, name, slug, link: `/s/${slug}`, customer_url: `${publicOrigin(env, url)}/s/${slug}`}, slug_changed: slug !== sh.slug});
  }
  if (p === "/api/dev/backup" && m === "GET") return backupResponse(await backup(db, "dev:"+dev.username));
  if (p === "/api/dev/errors" && m === "GET") {
    const errors = (await db.prepare(`SELECT id, at, method, route, status, kind, message FROM error_log ORDER BY id DESC LIMIT 500`).all()).results;
    return json({ok:true, errors});
  }
  if (p === "/api/dev/errors/clear" && m === "POST") { await db.prepare(`DELETE FROM error_log`).run(); return json({ok:true}); }
  // Deliberately throws, to check that the error log captures uncaught exceptions end to end.
  if (p === "/api/dev/test-error" && m === "POST") throw new Error("Forced test error from the developer panel");
  fail(404,"not_found","Not found");
}
function checkPassword12(p){ if (typeof p!=="string" || p.length < 12 || p.length > 128) fail(400,"weak_password","Developer password must be 12–128 characters"); return p; }

// Orders CSV for the shop's own records (admin only — this is the shop's data, so it includes customer details).
async function exportOrdersCSV(db){
  const orders = (await db.prepare(`SELECT * FROM orders WHERE shop_id=? ORDER BY id`).bind(db.sid).all()).results;
  const items = (await db.prepare(`SELECT oi.order_id, oi.product_name, oi.variant_label, oi.qty, oi.unit_price_paise FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.shop_id=? ORDER BY oi.id`).bind(db.sid).all()).results;
  const byO = {}; for (const i of items) (byO[i.order_id] ||= []).push(`${i.product_name} ${i.variant_label} x${i.qty} @${(i.unit_price_paise/100).toFixed(2)}`);
  const cols = ["order_code","created_at_ist","status","customer_name","phone","address","locality","pincode","landmark","instructions","payment_method","payment_status","items","subtotal","delivery","total","reason"];
  const ist = t => new Date(t + 330*60000).toISOString().slice(0,16).replace("T"," ");
  const out = [cols.join(",")];
  for (const o of orders) out.push([o.code, ist(o.created_at), o.status, o.customer_name, o.phone, o.address, o.locality, o.pincode, o.landmark, o.instructions, o.payment_method, o.payment_status, (byO[o.id]||[]).join("; "), (o.subtotal_paise/100).toFixed(2), (o.delivery_paise/100).toFixed(2), (o.total_paise/100).toFixed(2), o.reason].map(csvCell).join(","));
  return "\ufeff" + out.join("\n");
}

const SEC_HEADERS = {
  "x-content-type-options":"nosniff", "referrer-policy":"no-referrer", "x-frame-options":"DENY",
  "permissions-policy":"camera=(), microphone=(), geolocation=(self)",
  "content-security-policy":"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};


// v10: 3D intro splash for the platform pages (/, /admin, /dev). Markup only; animation is site/splash.css, control is site/splash.js.
function splashHtml(b){
  const up = b.icon_urls.s256 || b.icon_urls.i192 || b.icon_urls.i512; // v10.10.1: smallest first — the splash logo shows ~120px wide
  const face = up ? `<img class="f" src="${H(up)}" alt="">` : `<span class="f">${BRAND_MARK_SVG}</span>`;
  const back = up ? `<img class="b" src="${H(up)}" alt="">` : `<span class="b">${BRAND_MARK_SVG}</span>`;
  const edges = up ? ["#9a3412","#a63a10","#b2410f","#bf480e","#cb500d","#d6580c","#e0600c","#e8680d","#ef7212"] : ["#0b2e18","#0e3720","#114025","#13482a","#16512f","#185a34","#1a6237","#1c6939","#1f6b3a"];
  const layers = edges.map((c, k) => `<i style="--z:${-8 + k*2};--edge:${c}"></i>`).join("");
  const name = String(b.name || "Apna Dhanda").slice(0, 24); let n = 0;
  const word = [...name].map(ch => ch === " " ? `<span class="sp"> </span>` : `<span style="--i:${n++}">${H(ch)}</span>`).join("");
  const hi = /^apna\s*dhanda$/i.test(name.trim()) ? "अपना धंधा" : "";
  return `<div id="adSplash" class="ad-sp" aria-hidden="true"><div class="ad-sp-floor"></div><div class="ad-sp-glow"></div>`
    + `<div class="ad-sp-stage"><div class="ad-sp-logo">${layers}${back}${face}<s></s></div><div class="ad-sp-shadow"></div>`
    + `<div class="ad-sp-word">${word}</div>${hi ? `<div class="ad-sp-hi">${hi}</div>` : ""}<div class="ad-sp-tag">अपनी दुकान · अपनी लिंक · अपना QR</div></div>`
    + `<div class="ad-sp-skip">छूकर आगे बढ़ें · Tap to skip</div></div>`;
}

// ---------- v10.1: Landing page editor (Dev → 🏠 Landing). Everything visible on "/" in Hindi + English, one JSON in service_state 'landing_json'. ----------
// Empty field = built-in default below. Plan numbers come from platform settings via {trial_days} / {price} (never stored here). Rendered with H() everywhere.
const LT_HI = "अपनी दुकान, अब ऑनलाइन 🏪", LTX_HI = "किराना और छोटी दुकानों के लिए ऑनलाइन दुकान। ग्राहक आपकी लिंक से सामान चुनें, ऑर्डर सीधे आपके फ़ोन पर आए।";
const LANDING_TEXT = { // key: [hi, en, max length]
  bar_name: ["", "", 40], bar_sub: ["अपना धंधा", "अपना धंधा", 40],
  kicker: ["किराना और छोटी दुकानों के लिए", "For kirana & small shops", 80],
  title: [LT_HI, "Your shop, now online 🏪", 100],
  lead: [LTX_HI, "An online shop for kirana and small stores. Customers pick items from your link and the order comes straight to your phone.", 400],
  trial_badge: ["{trial_days} दिन फ्री ट्रायल", "{trial_days} days free trial", 60],
  trial_then: ["फिर {price}/महीना", "then {price}/month", 60],
  closed: ["नई दुकान का रजिस्ट्रेशन अभी बंद है", "New shop sign-ups are closed right now", 100],
  phone_title: ["आपकी दुकान", "Your Shop", 30],
  phone_items: ["🍚 चावल\n🥛 दूध\n🍪 बिस्कुट\n🧼 साबुन", "🍚 Rice\n🥛 Milk\n🍪 Biscuits\n🧼 Soap", 200],
  phone_add: ["+ जोड़ें", "+ Add", 16], phone_btn: ["🛒 ऑर्डर भेजें", "🛒 Send order", 30], phone_bell: ["नया ऑर्डर!", "New order!", 30],
  steps_h: ["कैसे काम करता है", "How it works", 60],
  s1_t: ["रजिस्टर करें", "Register", 60], s1_d: ["आपका नाम, दुकान का नाम, मोबाइल नंबर और पासवर्ड।", "Your name, shop name, mobile number and a password.", 200],
  s2_t: ["अपनी दुकान की लिंक और QR पाएं", "Get your shop link and QR", 60], s2_d: ["अपनी पक्की लिंक और दुकान पर लगाने के लिए QR पोस्टर।", "Your own fixed link and a QR poster to put up in the shop.", 200],
  s2_pending: ["मंज़ूरी के बाद दुकान ग्राहकों के लिए खुलेगी।", "Your shop opens for customers after approval.", 200],
  s3_t: ["ग्राहक ऑर्डर करें", "Customers order", 60], s3_d: ["ग्राहक QR स्कैन करें या लिंक खोलें, सामान चुनें, ऑर्डर आपके फ़ोन पर आए।", "Customers scan or open the link, pick items, and the order rings on your phone.", 200],
  feat_h: ["क्या मिलेगा", "What you get", 60],
  plan_label: ["सीधा प्लान", "Simple plan", 40], plan_days: ["दिन फ्री", "days free", 30],
  plan_then: ["फिर {price} / महीना", "then {price} / month", 60],
  plan_note: ["ट्रायल खत्म होने पर अपने दुकान पैनल से UPI से पेमेंट करें।", "Pay by UPI from your shop panel when the trial ends.", 200],
  cta_reg: ["दुकान रजिस्टर करें", "Register your shop", 40], cta_login: ["दुकानदार लॉगिन", "Shopkeeper login", 40],
  footer: ["{brand} · अपनी दुकान ऑनलाइन", "{brand} · Your shop, online", 120],
};
const LANDING_ICONS = {s1: "📝", s2: "🔗", s3: "🛒", reg: "📝", login: "🔑", trial: "🎁"};
const LANDING_SHOW = {scene: true, trial: true, steps: true, features: true, plan: true, end_cta: true};
const LANDING_THEME = {primary: "#1f6b3a", accent: "#f97316"};
const LANDING_CARDS = [
  {id: "orders", icon: "🛒", t_hi: "ऑनलाइन ऑर्डर", t_en: "Online orders", d_hi: "ग्राहक घर बैठे ऑर्डर करें", d_en: "Customers order from home"},
  {id: "link", icon: "🔗", t_hi: "अपनी लिंक + QR", t_en: "Own link + QR", d_hi: "WhatsApp पर भेजें, पोस्टर छापें", d_en: "Share on WhatsApp, print the poster"},
  {id: "app", icon: "📱", t_hi: "होम-स्क्रीन ऐप", t_en: "Home-screen app", d_hi: "आपके अपने लोगो के साथ", d_en: "With your own logo"},
  {id: "stickers", icon: "✨", t_hi: "स्टिकर", t_en: "Stickers", d_hi: "बिना फ़ोटो जल्दी सामान जोड़ें", d_en: "Add items fast, no photo needed"},
  {id: "alerts", icon: "🔔", t_hi: "ऑर्डर अलर्ट", t_en: "Order alerts", d_hi: "हर नए ऑर्डर पर घंटी", d_en: "A ring for every new order"},
  {id: "switch", icon: "🟢", t_hi: "ऑनलाइन / ऑफलाइन", t_en: "Online / offline switch", d_hi: "एक टैप में दुकान खोलें या बंद करें", d_en: "Open or close the shop in one tap"},
];
const LANDING_MAX_CARDS = 12, LCARD_T = 40, LCARD_D = 120, LICON = 16;
const lclean = (v, max, field) => str(v, max, {field}).replace(/[<>]/g, "");
const licon = (v, field) => { const s = String(v ?? "").replace(/[<>&"'`\\\u0000-\u001f\u007f]/g, "").trim(); if (s.length > LICON) fail(400, "invalid", `${field}: icon too long (one emoji)`); return s; };
function landingDefaults(){
  const text = {}; for (const [k, [hi, en]] of Object.entries(LANDING_TEXT)) text[k] = {hi, en};
  return {text, icons: {...LANDING_ICONS}, show: {...LANDING_SHOW}, theme: {...LANDING_THEME}, cards: LANDING_CARDS.map(c => ({...c, show: true}))};
}
function landingEmpty(){ // what "nothing customised" is stored as: empty strings = defaults
  const text = {}; for (const k of Object.keys(LANDING_TEXT)) text[k] = {hi: "", en: ""};
  const icons = {}; for (const k of Object.keys(LANDING_ICONS)) icons[k] = "";
  return {v: 1, text, icons, show: {...LANDING_SHOW}, theme: {primary: "", accent: ""}, cards: LANDING_CARDS.map(c => ({id: c.id, icon: "", t_hi: "", t_en: "", d_hi: "", d_en: "", show: true})), rev: 0};
}
// Server-side validation: unknown keys dropped, lengths enforced, angle brackets stripped, colours checked, max 12 cards.
function landingValidate(b){
  if (!b || typeof b !== "object" || Array.isArray(b)) fail(400, "invalid", "Landing config must be an object");
  const out = landingEmpty(); const tx = b.text && typeof b.text === "object" ? b.text : {};
  for (const [k, [, , max]] of Object.entries(LANDING_TEXT)) { const v = tx[k] || {}; out.text[k] = {hi: lclean(v.hi, max, k + " (हिं)"), en: lclean(v.en, max, k + " (EN)")}; }
  const ic = b.icons && typeof b.icons === "object" ? b.icons : {}; for (const k of Object.keys(LANDING_ICONS)) out.icons[k] = licon(ic[k], k);
  const sh = b.show && typeof b.show === "object" ? b.show : {}; for (const k of Object.keys(LANDING_SHOW)) out.show[k] = k in sh ? !!sh[k] && sh[k] !== "0" && sh[k] !== "false" : true;
  const th = b.theme && typeof b.theme === "object" ? b.theme : {};
  for (const k of ["primary", "accent"]) { const c = String(th[k] ?? "").trim().toLowerCase(); if (c && !/^#[0-9a-f]{6}$/.test(c)) fail(400, "invalid", `Colour ${k} must look like #1f6b3a`); out.theme[k] = c; }
  if (b.cards !== undefined && !Array.isArray(b.cards)) fail(400, "invalid", "cards must be a list");
  const cards = Array.isArray(b.cards) ? b.cards : out.cards;
  if (cards.length > LANDING_MAX_CARDS) fail(400, "invalid", `At most ${LANDING_MAX_CARDS} feature cards`);
  const seen = new Set(); out.cards = cards.map((c, i) => { c = c && typeof c === "object" ? c : {};
    let id = String(c.id ?? "").toLowerCase(); if (!/^[a-z0-9_-]{1,24}$/.test(id) || seen.has(id)) { id = "c" + i + Math.random().toString(36).slice(2, 7); } seen.add(id);
    const f = `Card ${i + 1}`;
    return {id, icon: licon(c.icon, f), t_hi: lclean(c.t_hi, LCARD_T, f + " title (हिं)"), t_en: lclean(c.t_en, LCARD_T, f + " title (EN)"), d_hi: lclean(c.d_hi, LCARD_D, f + " text (हिं)"), d_en: lclean(c.d_en, LCARD_D, f + " text (EN)"), show: c.show === undefined ? true : !!c.show && c.show !== "0" && c.show !== "false"}; });
  return out;
}
// Stored config (validated again on read) + the old Platform title/text fields folded in when the editor never set the hero title/text.
async function landingLoad(db){
  const kv = Object.fromEntries((await db.prepare(`SELECT k, v FROM service_state WHERE k IN ('landing_json','landing_title','landing_text')`).all()).results.map(r => [r.k, r.v]));
  let cfg = landingEmpty(); if (kv.landing_json) { try { cfg = {...landingValidate(JSON.parse(kv.landing_json)), rev: JSON.parse(kv.landing_json).rev || 0}; } catch (e) { console.error("landing_json", e); cfg = landingEmpty(); } }
  if (kv.landing_title && !cfg.text.title.hi && !cfg.text.title.en) cfg.text.title = {hi: kv.landing_title, en: kv.landing_title};
  if (kv.landing_text && !cfg.text.lead.hi && !cfg.text.lead.en) cfg.text.lead = {hi: kv.landing_text, en: kv.landing_text};
  return cfg;
}
async function landingSave(db, cfg, actor){
  const v = landingValidate(cfg); v.rev = now();
  const s = JSON.stringify(v); if (s.length > 32000) fail(400, "invalid", "Landing config too big");
  await db.batch([db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('landing_json',?)`).bind(s),
    db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('landing_title','')`), db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('landing_text','')`),
    db.prepare(`INSERT INTO service_log (shop_id,at,from_status,to_status,actor,note) VALUES (0,?,NULL,'platform',?,?)`).bind(now(), actor, "landing page edited")]);
  return v;
}
// The effective page: every empty field falls back to the built-in default (card fields: the default card's text, else the other language).
function landingEffective(cfg){
  const d = landingDefaults(), e = {text: {}, icons: {}, show: {...cfg.show}, theme: {}, cards: []};
  for (const k of Object.keys(LANDING_TEXT)) { const v = cfg.text[k] || {}; e.text[k] = {hi: v.hi || d.text[k].hi, en: v.en || d.text[k].en}; }
  for (const k of Object.keys(LANDING_ICONS)) e.icons[k] = cfg.icons[k] || d.icons[k];
  for (const k of ["primary", "accent"]) e.theme[k] = cfg.theme[k] || d.theme[k];
  for (const c of cfg.cards) { const dc = LANDING_CARDS.find(x => x.id === c.id) || {};
    const t_hi = c.t_hi || dc.t_hi || c.t_en, t_en = c.t_en || dc.t_en || t_hi, d_hi = c.d_hi || dc.d_hi || c.d_en || "", d_en = c.d_en || dc.d_en || d_hi;
    if (!t_hi && !t_en) continue; e.cards.push({id: c.id, icon: c.icon || dc.icon || "⭐", t_hi, t_en, d_hi, d_en, show: c.show !== false}); }
  return e;
}
const hexMix = (hex, to, f) => { const a = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), b = [1, 3, 5].map(i => parseInt(to.slice(i, i + 2), 16)); return "#" + a.map((x, i) => Math.round(x + (b[i] - x) * f).toString(16).padStart(2, "0")).join(""); };
// v10.12.5: "/" is a short glass flow (Krish 9:20 PM): intro animation (first visit) → choice → info for that choice → /admin or /shops.
// Same page, no reload: #shopkeeper / #customer show the info views. No shop names, slugs or ids anywhere on it.
function renderLanding(cfg, ctx){
  const e = landingEffective(cfg), fill = s => String(s).replaceAll("{trial_days}", String(ctx.trial_days)).replaceAll("{price}", ctx.price).replaceAll("{brand}", ctx.brand);
  const hi = k => H(fill(e.text[k].hi)), en = k => H(fill(e.text[k].en)), T = (tag, k, cls = "") => `<${tag}${cls ? ` class="${cls}"` : ""} data-en="${en(k)}">${hi(k)}</${tag}>`;
  const L = (tag, en_, hi_, cls = "", extra = "") => `<${tag}${cls ? ` class="${cls}"` : ""}${extra} data-en="${H(en_)}" data-hi="${H(hi_)}">${H(en_)}</${tag}>`;
  const row = (ic, en_, hi_, cls) => `<li class="lf-row ${cls}"><span class="lf-ic" aria-hidden="true">${ic}</span>${L("span", en_, hi_)}</li>`;
  const barName = e.text.bar_name.hi ? hi("bar_name") : H(ctx.brand), barNameEn = e.text.bar_name.en ? en("bar_name") : (e.text.bar_name.hi ? hi("bar_name") : H(ctx.brand));
  const back = `<button class="lf-back" type="button" data-go="choice"><span aria-hidden="true">←</span>${L("span", "Back", "वापस")}</button>`;
  const bubbles = ["🛒", "🏪", "🥛", "🍚", "💇", "🔧", "🧺"].map((x, i) => `<i class="lf-bub b${i + 1}">${x}</i>`).join("");
  return `<div class="lf-bg" aria-hidden="true"></div>
<div class="lf-intro" id="lfIntro" aria-hidden="true">
  <div class="lf-bubs">${bubbles}</div>
  <div class="lf-icard"><span class="lf-ilogo">${ctx.mark}</span><b class="lf-iname">${H(ctx.brand)}</b>${L("small", "Your shop, now online", "आपकी दुकान, अब ऑनलाइन", "lf-itag")}<i class="lf-sheen"></i></div>
  <button class="lf-skip" id="lfSkip" type="button">${L("span", "Skip", "स्किप")} ›</button>
</div>
<div class="lf-trans" id="lfTrans" aria-hidden="true">
  <div class="lf-tcard"><span class="lf-ticon t-shop">🏪</span><span class="lf-ticon t-cust">🛍️</span>${L("b", "For shopkeepers", "दुकानदारों के लिए", "lf-tl t-shop")}${L("b", "For customers", "ग्राहकों के लिए", "lf-tl t-cust")}<i class="lf-sheen"></i></div>
</div>
<header class="bar lf-bar">
  <a class="brand" href="/">${ctx.mark}<span><b data-en="${barNameEn}">${barName}</b><small data-en="${en("bar_sub")}">${hi("bar_sub")}</small></span></a>
  <button class="lang" id="langBtn" type="button" aria-label="Switch language">EN</button>
</header>
<main class="lf-stage" id="lfStage">
  <section class="lf-view on" id="vChoice" data-view="choice" aria-labelledby="lfH">
    <div class="lf-card lf-choice">
      <span class="lf-logo">${ctx.mark}</span>
      ${T("p", "kicker", "kicker")}
      <h1 id="lfH" data-en="${en("title")}">${hi("title")}</h1>
      ${L("p", "Shops near you, and your own shop online.", "पास की दुकानें, और आपकी अपनी दुकान ऑनलाइन।", "lf-tag")}
      <div class="pills" role="group" aria-labelledby="lfH">
        <a class="pl f" href="/shops" id="pickCust" data-go="customer"><span aria-hidden="true">🛍️</span>${L("b", "I'm a customer", "मैं ग्राहक हूँ")}</a>
        <a class="pl o" href="/admin" id="pickShop" data-go="shopkeeper"><span aria-hidden="true">🏪</span>${L("b", "I'm a shopkeeper", "मैं दुकानदार हूँ")}</a>
      </div>
    </div>
  </section>

  <section class="lf-view" id="vShop" data-view="shopkeeper" aria-labelledby="lfShopH" hidden>
    <div class="lf-card">
      ${back}
      ${L("h2", "Run your shop the easy way", "अपनी दुकान, आसान तरीके से", "", ' id="lfShopH"')}
      ${T("p", "lead", "lf-lead")}
      <div class="lf-blk prob">
        ${L("p", "The problem", "परेशानी", "lf-lbl")}
        <ul>
          ${row("📒", "Everything in a paper register", "सब कुछ कागज़ के रजिस्टर में", "bad")}
          ${row("🧮", "Mistakes in the hisaab", "हिसाब में गलतियाँ", "bad")}
          ${row("📞", "Phone & WhatsApp orders get missed", "फ़ोन और WhatsApp ऑर्डर छूट जाते हैं", "bad")}
          ${row("🌐", "No online presence", "ऑनलाइन कोई पहचान नहीं", "bad")}
        </ul>
      </div>
      <div class="lf-blk sol">
        ${L("p", "The solution", "समाधान", "lf-lbl")}
        <ul>
          ${row("🔗", "Your own online shop link + QR", "आपकी अपनी ऑनलाइन दुकान की लिंक + QR", "good")}
          ${row("📥", "All orders in one place", "सारे ऑर्डर एक ही जगह", "good")}
          ${row("📦", "Stock and low-stock alerts", "स्टॉक और कम स्टॉक की सूचना", "good")}
          ${row("📊", "Daily reports", "रोज़ की रिपोर्ट", "good")}
        </ul>
      </div>
      <p class="lf-free"><span aria-hidden="true">🎁</span>${L("b", "Free to start", "शुरुआत फ्री")}${e.show.trial ? ` · ${T("span", "trial_badge")}, ${T("span", "trial_then")}` : ""}</p>
      <div class="lf-go${ctx.signup_open ? "" : " closed"}">
        <a class="pl f lf-cta" href="/admin#signup" id="ctaShop">${L("b", "Start your shop →", "अपनी दुकान शुरू करें →")}</a>
        ${T("p", "closed", "shut")}
        <a class="lf-small" href="/admin" id="login">${L("span", "Already registered? Log in", "पहले से रजिस्टर हैं? लॉगिन करें")}</a>
      </div>
    </div>
  </section>

  <section class="lf-view" id="vCust" data-view="customer" aria-labelledby="lfCustH" hidden>
    <div class="lf-card">
      ${back}
      ${L("h2", "Order from shops near you", "पास की दुकानों से ऑर्डर करें", "", ' id="lfCustH"')}
      <ol class="lf-steps">
        <li class="lf-row"><span class="lf-n">1</span><span class="lf-ic" aria-hidden="true">🏪</span><span>${L("b", "Choose a shop", "दुकान चुनें")}${L("small", "Grocery, restaurant, salon and more", "किराना, रेस्टोरेंट, सैलून और भी")}</span></li>
        <li class="lf-row"><span class="lf-n">2</span><span class="lf-ic" aria-hidden="true">🛒</span><span>${L("b", "Place your order", "ऑर्डर करें")}${L("small", "Pick items and send the order", "सामान चुनें और ऑर्डर भेजें")}</span></li>
        <li class="lf-row"><span class="lf-n">3</span><span class="lf-ic" aria-hidden="true">🛵</span><span>${L("b", "Pickup or delivery", "पिकअप या डिलीवरी")}${L("small", "Collect it, or get it home", "खुद ले जाएँ या घर मँगवाएँ")}</span></li>
      </ol>
      <div class="lf-go"><a class="pl f lf-cta" href="/shops" id="ctaCust">${L("b", "Browse shops →", "दुकानें देखें →")}</a></div>
    </div>
  </section>
</main>`;
}
function landingThemeCss(cfg){
  const e = landingEffective(cfg); if (e.theme.primary === LANDING_THEME.primary && e.theme.accent === LANDING_THEME.accent) return "";
  const g = e.theme.primary, o = e.theme.accent;
  return `<style id="landingTheme">:root{--g:${g};--g-d:${hexMix(g, "#000000", .5)};--g-l:${hexMix(g, "#ffffff", .88)};--o:${o};--o-d:${hexMix(o, "#000000", .25)};--o-l:${hexMix(o, "#ffffff", .9)};--g-hi:${hexMix(g, "#ffffff", .2)};--o-hi:${hexMix(o, "#ffffff", .15)};--o-soft:${hexMix(o, "#ffffff", .6)}}</style>`;
}

const PAGES = {"/":"/landing.html", "/shops":"/shops.html", "/admin":"/admin.html", "/admin/":"/admin.html", "/track":"/track.html", "/info":"/info.html", "/dev":"/dev.html", "/dev/":"/dev.html"};
const PAGE_PATHS = new Set(Object.keys(PAGES));
const CUSTOMER_PAGES = new Set(["/track", "/info"]);

async function handle(req, env, url, ctx){
  if (url.pathname === "/health" || url.pathname === "/api/health") return health(env);
  if (url.pathname.startsWith("/api/")) {
    try { return await api(req, env, url, ctx); }
    catch (e) {
      if (e instanceof HttpError) {
        if (e.status >= 500) await logError(env.DB, {method:req.method, route:url.pathname, status:e.status, kind:"5xx", message:`${e.code}: ${e.message}`});
        return json({ok:false, code:e.code, error:e.message, ...(e.extra||{})}, e.status);
      }
      console.error(e);
      await logError(env.DB, {method:req.method, route:url.pathname, status:500, kind:"exception", message:errText(e)});
      return json({ok:false, code:"server_error", error:"Something went wrong on the server. Please try again."}, 500);
    }
  }
  if (/^\/(_worker|tab-site)/.test(url.pathname)) return new Response("Not found", {status:404});
  const mf = url.pathname.match(/^\/s\/([a-z0-9-]{2,40})\/manifest\.webmanifest$/);
  if (mf) {
    await migrate(env.DB); const sh = await shopBySlug(env.DB, mf[1]); if (!sh) return new Response("Not found", {status:404});
    if (sh.status === "rejected") return new Response("Not found", {status:404});
    return new Response(JSON.stringify(shopManifest(sh, await brand(env.DB))), {headers: {...SEC_HEADERS, "content-type":"application/manifest+json", "cache-control":"no-cache"}});
  }
  // v6: initials tile = fallback home-screen icon until a logo/icon is set
  const ic = url.pathname.match(/^\/s\/([a-z0-9-]{2,40})\/icon\.svg$/);
  if (ic) { await migrate(env.DB); const sh = await shopBySlug(env.DB, ic[1]); if (!sh) return new Response("Not found", {status:404});
    const a = shopAppView(sh); const b = await brand(env.DB); const to = a.icon_urls.i192 || b.icon_urls.i192;
    if (to) return new Response(null, {status: 302, headers: {...SEC_HEADERS, location: to, "cache-control": "no-cache"}});
    return new Response(PLATFORM_MARK_SVG, {headers: {...SEC_HEADERS, "content-type":"image/svg+xml", "cache-control":"no-cache"}}); }
  if (url.pathname === "/brand.svg") { return new Response(PLATFORM_MARK_SVG, {headers: {...SEC_HEADERS, "content-type":"image/svg+xml", "cache-control":"public, max-age=600"}}); }
  const bm = {"/manifest.webmanifest":"landing", "/admin.webmanifest":"admin", "/dev.webmanifest":"dev"}[url.pathname];
  if (bm) { await migrate(env.DB); return new Response(JSON.stringify(brandManifest(await brand(env.DB), bm)), {headers: {...SEC_HEADERS, "content-type":"application/manifest+json", "cache-control":"no-cache"}}); }
  // v5 storefronts: /s/<slug> (shop home) and /s/<slug>/info. "/" is shop #1 (old QR codes); /track and /info take ?s=<slug>.
  // v10.12: two clear entry links — customers /shops (alias /customer), shopkeepers /admin (alias /shopkeeper)
  const alias = {"/shopkeeper": "/admin", "/shopkeeper/": "/admin", "/customer": "/shops", "/customer/": "/shops", "/shops/": "/shops"}[url.pathname];
  if (alias) return new Response(null, {status: 302, headers: {...SEC_HEADERS, location: alias + url.search, "cache-control": "no-cache"}});
  // v10.12.3: one category's list — /shops/grocery, /shops/salon, … (/shops/kirana → /shops/grocery; unknown → the category screen)
  let listCat = null;
  const cm = url.pathname.match(/^\/shops\/([a-z]{2,20})(\/?)$/);
  if (cm) { const c = dirCat(cm[1]);
    if (!c) return new Response(null, {status: 302, headers: {...SEC_HEADERS, location: "/shops", "cache-control": "no-cache"}});
    if (c.key !== cm[1] || cm[2]) return new Response(null, {status: 302, headers: {...SEC_HEADERS, location: "/shops/" + c.key + url.search, "cache-control": "no-cache"}});
    listCat = c; }
  let page = listCat ? "/shops-list.html" : PAGES[url.pathname], shopSlug = null, isCustomer = CUSTOMER_PAGES.has(url.pathname);
  const sm = url.pathname.match(/^\/s\/([a-z0-9-]{2,40})(\/|\/info)?$/);
  if (sm) { shopSlug = sm[1]; page = sm[2] === "/info" ? "/info.html" : "/index.html"; isCustomer = true; }
  else if (url.pathname === "/track" || url.pathname === "/info") shopSlug = url.searchParams.get("s") || null;
  // Paused / not-yet-approved shop: customers get a polite page with that shop's phone. Admin and /dev still open.
  let pageShop = null;
  if (isCustomer) {
    let block = null, st = null;
    try {
      await migrate(env.DB);
      const sh = pageShop = await shopBySlug(env.DB, shopSlug);
      if (!sh || sh.status === "rejected") block = "missing";
      else { const sdb = scoped(env.DB, sh.id); const sv = (await service(sdb)).status; if (sv === "paused") block = "paused"; else if (sv === "pending") block = "pending"; else if (!sh.online && sm) block = "offline"; if (block) st = {...(await getSettings(sdb)), _app: shopAppView(sh), _name: sh.name}; }
    } catch (e) { console.error("service check", e); }
    // v10.14: a salon's /s/<slug> is its own booking page (salon.html), not the shop page.
    if (!block && sm && page === "/index.html" && pageShop && isSalonCat(pageShop.shop_type)) page = "/salon.html";
    if (block) {
      const h = new Headers(SEC_HEADERS); h.set("content-type","text/html; charset=utf-8"); h.set("cache-control","no-store");
      if (block === "paused") h.set("retry-after","3600");
      if (block === "offline") { h.set("cache-control","no-cache"); }
      return new Response(block === "missing" ? missingPage() : pausedPage(st, block), {status: block === "missing" ? 404 : 503, headers:h});
    }
  }
  // Pages go through the Worker (html_handling "none") so they carry the security headers below.
  const res = page ? await env.ASSETS.fetch(new Request(url.origin + page, req)) : await env.ASSETS.fetch(req);
  const h = new Headers(res.headers); for (const [k,v] of Object.entries(SEC_HEADERS)) h.set(k,v);
  if (/\.(css|js)$/.test(url.pathname)) h.set("cache-control","public, max-age=300");
  // v10.10: AI product icons — 287 small WebPs, versioned by ?v=, cached for a year (site/_headers sets the same on the asset server)
  if (/^\/icons\/[a-z0-9-]+\.webp$/.test(url.pathname) && res.status === 200) { h.set("cache-control","public, max-age=31536000, immutable"); h.set("content-type","image/webp"); }
  if (/^\/(dev|devmode|admin)\.(css|js)$/.test(url.pathname)) h.set("cache-control","no-cache"); // v9.1: panel code always revalidates so phones get fixes at once
  if (url.pathname === "/sw.js") { h.set("cache-control","no-cache"); h.set("service-worker-allowed","/"); h.set("content-type","text/javascript; charset=utf-8"); }
  if (/\.webmanifest$/.test(url.pathname)) { h.set("content-type","application/manifest+json"); h.set("cache-control","public, max-age=3600"); }
  if (page) { h.set("content-type","text/html; charset=utf-8"); h.set("cache-control","no-cache"); }
  // v5: tell the page which shop it belongs to (and give an installed app its own start page).
  if (pageShop && page && res.status === 200) {
    const sl = H(pageShop.slug);
    let html = (await res.text()).replace('<meta name="ak-shop" content="">', `<meta name="ak-shop" content="${sl}" data-id="${Number(pageShop.id)}" data-name="${H(pageShop.name)}" data-type="${H(shopTypeKey(pageShop.shop_type))}">`);
    const ap = shopAppView(pageShop); let pb = {icon_urls: {}}; try { pb = await brand(env.DB); } catch {}
    html = html.replace('href="/manifest.webmanifest"', `href="/s/${sl}/manifest.webmanifest?v=${STATIC_V}"`)
      .replace('<link rel="apple-touch-icon" href="/apple-touch-icon.png">', `<link rel="apple-touch-icon" href="${H(ap.icon_urls.a180 || ap.icon_urls.i192 || pb.icon_urls.a180 || pb.icon_urls.i192 || "/app-shop-180.png?v=" + STATIC_V)}">`)
      .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, `<meta name="apple-mobile-web-app-title" content="${H(ap.home_name)}">`)
      .replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${H(ap.color)}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${H(pageShop.name)}</title>`)
      .replace('<link rel="icon" href="/icon.svg" type="image/svg+xml">', () => { const fi = ap.icon_urls.i192 ? (ap.icon_urls.s256 ? [ap.icon_urls.s256, "webp"] : [ap.icon_urls.i192, "png"]) : pb.icon_urls.s256 ? [pb.icon_urls.s256, "webp"] : pb.icon_urls.i192 ? [pb.icon_urls.i192, "png"] : null; // v10.10.1: small WebP tab icon (the 192 PNG was 60 KB on every first visit)
        return fi ? `<link rel="icon" href="${H(fi[0])}" type="image/${fi[1]}">` : `<link rel="icon" href="/icon.svg?v=${STATIC_V}" type="image/svg+xml">`; });
    if (page === "/info.html") html = html.replaceAll('href="/"', `href="/s/${sl}"`);
    h.delete("content-length");
    return new Response(verMeta(html), {status: 200, headers: h});
  }
  if (url.pathname.startsWith("/dev")) h.set("x-robots-tag","noindex, nofollow");
  // v6: platform brand (name + logo set in /dev) on the landing page, shopkeeper panel and dev panel
  if (page && res.status === 200 && ["/landing.html","/admin.html","/dev.html","/shops.html","/shops-list.html"].includes(page)) {
    let b = {name: "Apna Dhanda", icon_urls: {}}; try { await migrate(env.DB); b = await brand(env.DB); } catch (e) { console.error("brand", e); }
    const logo = b.icon_urls.i192 || b.icon_urls.i512 || "/icon.svg";
    // v7: the default Apna Dhanda mark is an inline SVG storefront; an uploaded brand logo (dev → Brand) replaces it
    const mark = (b.icon_urls.i192 || b.icon_urls.i512) ? `<img class="bm" src="${H(b.icon_urls.s256 || logo)}" alt="" width="64" height="64">` : BRAND_MARK_SVG;
    let lt = "", ltx = "", so = true, auto = false, cfg = {price_paise: 19900, trial_days: 10};
    let lc = landingEmpty(), dir = null;
    let cats = null; // v10.12.3: the first screen gets categories only (active / coming soon) — no shop names, slugs or ids
    if (page === "/shops.html") { try { cats = await publicCategories(env.DB); } catch (e) { console.error("shops", e); cats = DIR_CATS.map(c => ({key: c.key, active: false})); } }
    if (page === "/shops-list.html") { try { dir = await publicShopList(env.DB, null, listCat.type); } catch (e) { console.error("shops", e); dir = []; } }
    if (page === "/landing.html") { try { const kv = Object.fromEntries((await env.DB.prepare(`SELECT k, v FROM service_state WHERE k IN ('signup_open','auto_approve')`).all()).results.map(r => [r.k, r.v])); so = kv.signup_open !== "0"; auto = kv.auto_approve === "1"; cfg = await subConfig(env.DB); lc = await landingLoad(env.DB); } catch (e) { console.error("landing", e); } }
    const html = (await res.text()).replaceAll("{{BRAND}}", H(b.name)).replaceAll("{{BRAND_LOGO}}", H(logo)).replaceAll("{{BRAND_MARK}}", mark)
      .replaceAll("{{PRICE}}", H("₹" + rs(cfg.price_paise))).replaceAll("{{TRIAL_DAYS}}", H(String(cfg.trial_days)))
      .replaceAll("{{APPROVAL_CLASS}}", auto ? " auto" : "")
      .replace("{{SPLASH}}", splashHtml(b))
      .replaceAll("{{SIGNUP_CLASS}}", so ? "" : " closed")
      .replace('<link rel="apple-touch-icon" href="/apple-touch-icon.png">', () => `<link rel="apple-touch-icon" href="${H(page === "/admin.html" ? "/app-admin-180.png?v=" + STATIC_V : page === "/dev.html" ? "/app-dev-180.png?v=" + STATIC_V : (b.icon_urls.a180 || "/apple-touch-icon.png?v=" + STATIC_V))}">`)
      // v10.5: iPhone home-screen names for the two panel apps
      .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, m0 => page === "/admin.html" ? `<meta name="apple-mobile-web-app-title" content="${APP_ROLES.admin.short}">` : page === "/dev.html" ? `<meta name="apple-mobile-web-app-title" content="${APP_ROLES.dev.short}">` : m0)
      .replace('<link rel="icon" href="/icon.svg" type="image/svg+xml">', () => b.icon_urls.s256 ? `<link rel="icon" href="${H(b.icon_urls.s256)}" type="image/webp">` : b.icon_urls.i192 ? `<link rel="icon" href="${H(b.icon_urls.i192)}" type="image/png">` : `<link rel="icon" href="/icon.svg?v=${STATIC_V}" type="image/svg+xml">`)
      .replace(/href="\/(admin|dev)\.webmanifest"/, (m0, k) => `href="/${k}.webmanifest?v=${STATIC_V}"`)
      // v10.1: landing content goes in last, so nothing typed in the editor is ever read as a template token
      .replace("</head>", () => (page === "/landing.html" ? landingThemeCss(lc) : "") + "</head>")
      .replace('<meta name="theme-color" content="#1f6b3a">', () => `<meta name="theme-color" content="${page === "/landing.html" ? "#fde2ef" : page === "/dev.html" ? APP_ROLES.dev.theme : "#1f6b3a"}">`)
      .replace("{{CATEGORY_TILES}}", () => cats ? renderCategoryTiles(cats) : "")
      .replaceAll("{{CAT_KEY}}", () => listCat ? listCat.key : "").replaceAll("{{CAT_ICON}}", () => listCat ? listCat.icon : "")
      .replaceAll("{{CAT_EN}}", () => listCat ? listCat.en : "").replaceAll("{{CAT_HI}}", () => listCat ? listCat.hi : "").replaceAll("{{CAT_STYLE}}", () => listCat ? listCat.style : "")
      .replace("{{SHOP_COUNT}}", () => dir ? String(dir.length) : "0")
      .replace("{{SHOP_CARDS}}", () => dir ? renderShopCards(dir) : "")
      .replace("{{LANDING}}", () => page === "/landing.html" ? renderLanding(lc, {brand: b.name, mark, price: "₹" + rs(cfg.price_paise), trial_days: cfg.trial_days, signup_open: so, auto}) : "");
    h.delete("content-length"); return new Response(verMeta(html), {status: 200, headers: h});
  }
  if (page && res.status === 200) { h.delete("content-length"); return new Response(verMeta(await res.text()), {status: 200, headers: h}); }
  return new Response(res.body, {status:res.status, headers:h});
}

// v10.5: swap an old Path=/ session cookie (before v10.5) for the new path-scoped one, keeping the same session — no re-login.
function migrateCookies(req, url, res){
  const pairs = [[url.pathname.startsWith("/api/admin/"), COOKIE, LEGACY_COOKIE, COOKIE_PATH, SESSION_DAYS*86400], [url.pathname.startsWith("/api/dev/"), DEV_COOKIE, LEGACY_DEV_COOKIE, DEV_COOKIE_PATH, DEV_SESSION_HOURS*3600]];
  let out = res;
  for (const [hit, name, legacy, path, maxAge] of pairs) {
    if (!hit) continue;
    const old = cookieVal(req, legacy); if (!old) continue;
    if (out === res) { out = new Response(res.body, res); }
    const already = (out.headers.get("set-cookie") || "").includes(name + "=");
    if (!already && !cookieVal(req, name) && res.status < 400) out.headers.append("set-cookie", `${name}=${old}; Path=${path}; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
    if (!(out.headers.get("set-cookie") || "").includes(legacy + "=")) out.headers.append("set-cookie", `${legacy}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
  }
  return out;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    LOG_DB = env.DB;
    if (!RUNTIME_BUILD) { const ts = env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.timestamp; if (ts) RUNTIME_BUILD = String(ts); }
    let res, logged = false;
    try { res = await handle(req, env, url, ctx); }
    catch (e) {
      console.error(e); logged = true;
      await logError(env.DB, {method:req.method, route:url.pathname, status:500, kind:"exception", message:errText(e)});
      res = new Response("Something went wrong. Please try again.", {status:500, headers:{"content-type":"text/plain; charset=utf-8", ...SEC_HEADERS}});
    }
    // Hourly aggregate counters only (no IPs, no paths with ids, no customer data).
    const kind = trackKind(url.pathname);
    if (kind) {
      const pausedPageShown = (CUSTOMER_PAGES.has(url.pathname) || url.pathname.startsWith("/s/")) && (res.status === 503 || res.status === 404);
      const keys = [kind]; if (res.status === 429) keys.push("rl"); if (res.status >= 500 && !pausedPageShown) keys.push("e5");
      if (kind === "page" && res.status >= 500 && !pausedPageShown && !logged) await logError(env.DB, {method:req.method, route:url.pathname, status:res.status, kind:"5xx", message:"page answered " + res.status});
      const p = bump(env.DB, keys);
      if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
    }
    return migrateCookies(req, url, res);
  },
  // v10.4: Cloudflare Cron Trigger (free) — daily ⏰ due reminders into each shop's notification panel (+ Web Push).
  async scheduled(event, env, ctx) {
    LOG_DB = env.DB;
    const job = (async () => {
      try {
        await migrate(env.DB);
        const r = await runReminders(env, env.DB, {push: true, origin: String(env.PUBLIC_ORIGIN || "")});
        await env.DB.batch([env.DB.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('reminders_last_run',?)`).bind(String(now())), env.DB.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('reminders_last_created',?)`).bind(String(r.created.length)),
          env.DB.prepare(`DELETE FROM dev_events WHERE created_at < ?`).bind(now() - 120*DAY)]);
      } catch (e) { console.error("cron reminders", e); await logError(env.DB, {method: "CRON", route: "scheduled:reminders", status: 500, kind: "exception", message: errText(e)}); }
    })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  }
};
