// Frozen copy of the v4 (single-shop) worker, used only by test/multishop.test.mjs to prove the v5 migration.
// Apna Kirana — backend: Cloudflare Worker + D1 (SQLite). Money = integer paise.
// Store details (name, phone, WhatsApp, hours, delivery) are edited from /admin → Settings.
// Nothing secret lives in the browser. The only server constant is the SHA-256 of the
// one-time setup/recovery key held by the operator (the key itself is never in code).
const SETUP_KEY_SHA256 = "e723cf497d2341e59c6876848d0b3b0168f61c061b33f7d4662b7a2d38c2ec0e";
const SESSION_DAYS = 7;
// ---- v3: developer (owner) panel ----
// The developer account is separate from the shopkeeper's: its own table, cookie, CSRF header and rate limits.
// Only a PBKDF2 hash of the password and a SHA-256 of the recovery key live here; the secrets are with the developer.
const DEV_SEED = {username:"krish-dev", salt:"4f0858d20e50caaf1a87ded7886756d5", hash:"83525f89108662e65a633080eece6074893ed09b4f7c9db64da5d53a31abe96a"};
const DEV_RECOVERY_SHA256 = "c57925e24b8f070edffec24c4efb0b00ea427e9c1581dac9ad60cb18e2d17ffe";
const DEV_SESSION_HOURS = 72;
const APP_VERSION = "4.0.0";
const BUILD_TIME = "2026-10-24T18:30Z";
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
  demo_mode: true, logo_image_id: "", show_reviews: false
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

const STATUSES = ["pending","accepted","preparing","out_for_delivery","delivered","rejected","cancelled"];
const TRANSITIONS = {
  pending: ["accepted","rejected","cancelled"],
  accepted: ["preparing","out_for_delivery","cancelled"],
  preparing: ["out_for_delivery","cancelled"],
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
const fail = (status, code, msg, extra) => { throw new HttpError(status, code, msg, extra); };
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
CREATE TRIGGER IF NOT EXISTS audit_o_status AFTER UPDATE OF status ON orders WHEN OLD.status IS NOT NEW.status BEGIN INSERT INTO audit_log (at,entity,entity_id,product_id,label,field,before,after,actor,reason) VALUES (CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'order',NEW.id,NULL,NEW.code,'status',OLD.status,NEW.status,COALESCE((SELECT actor FROM audit_ctx WHERE id=1),'system'),COALESCE((SELECT reason FROM audit_ctx WHERE id=1),'')); END`
];

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
  if (!seeded) await seedDemo(db, true);
  const os = await db.prepare(`SELECT value FROM settings WHERE key='offers_seeded'`).first();
  if (!os) {
    // One clearly-labelled demo offer, switched OFF. Shown to customers only if bhaiya turns it on.
    const eggs = await db.prepare(`SELECT id FROM products WHERE is_demo=1 AND name_en='Eggs' LIMIT 1`).first(); const t = now();
    const st = [db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('offers_seeded',?)`).bind(String(t))];
    if (eggs) {
      st.push(db.prepare(`INSERT INTO offers (title_hi,title_en,desc_hi,desc_en,kind,percent_off,color,active,is_demo,created_at,updated_at) VALUES (?,?,?,?,'percent',10,'#c2410c',0,1,?,?)`)
        .bind("डेमो ऑफर: अंडों पर 10% छूट","Demo offer: 10% off eggs","यह नमूना ऑफर है — दुकानदार इसे चालू/बंद या बदल सकते हैं","Sample offer — the shopkeeper can switch it on/off or edit it", t, t));
      st.push(db.prepare(`INSERT INTO offer_items (offer_id,product_id) VALUES ((SELECT MAX(id) FROM offers WHERE is_demo=1),?)`).bind(eggs.id));
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
async function seedDemo(db, withSettings){
  const t = now(); const st = [];
  if (withSettings) {
    for (const [k,v] of Object.entries(DEFAULT_SETTINGS)) st.push(db.prepare(`INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`).bind(k, JSON.stringify(v)));
    st.push(db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded',?)`).bind(String(t)));
  }
  DEMO_CATS.forEach((c,i) => st.push(db.prepare(`INSERT INTO categories (name_hi,name_en,icon,sort,active,is_demo) VALUES (?,?,?,?,1,1)`).bind(c[0],c[1],c[2],i)));
  await db.batch(st);
  const cats = (await db.prepare(`SELECT id FROM categories WHERE is_demo=1 ORDER BY sort, id`).all()).results;
  const st2 = [];
  DEMO_PRODUCTS.forEach((p,i) => {
    st2.push(db.prepare(`INSERT INTO products (category_id,name_hi,name_en,icon,featured,active,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)`).bind(cats[p[0]].id, p[1], p[2], p[3], [0,7,23,26,15,29].includes(i)?1:0, t, t+i));
    p[4].forEach((v,j) => st2.push(db.prepare(`INSERT INTO variants (product_id,label,price_paise,stock,low_stock,active,sort) VALUES ((SELECT id FROM products WHERE is_demo=1 AND name_en=? ORDER BY id DESC LIMIT 1),?,?,?,3,1,?)`).bind(p[2], v[0], v[1]*100, v[2], j)));
  });
  await db.batch(st2);
}

async function getSettings(db){
  const rows = (await db.prepare(`SELECT key,value FROM settings`).all()).results;
  const s = {...DEFAULT_SETTINGS};
  for (const r of rows) { if (r.key in DEFAULT_SETTINGS) { try { s[r.key] = JSON.parse(r.value); } catch {} } }
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
async function pruneAudit(db){ await db.prepare(`DELETE FROM audit_log WHERE at < ? OR id <= (SELECT MAX(id) FROM audit_log) - ?`).bind(now() - AUDIT_KEEP_DAYS*864e5, AUDIT_KEEP_ROWS).run(); }
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

// ---------- auth ----------
const COOKIE = "__Host-ks_admin";
function cookieOf(req){ const m = (req.headers.get("cookie")||"").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`)); return m ? m[1] : null; }
async function currentAdmin(db, req){
  const tok = cookieOf(req); if (!tok) return null;
  const row = await db.prepare(`SELECT a.id, a.username, a.must_change, s.expires_at FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=?`).bind(await sha256(tok)).first();
  if (!row || row.expires_at < now()) return null;
  return row;
}
async function newSession(db, adminId){
  const tok = randHex(32);
  await db.prepare(`INSERT INTO sessions (token_hash,admin_id,expires_at,created_at) VALUES (?,?,?,?)`).bind(await sha256(tok), adminId, now()+SESSION_DAYS*864e5, now()).run();
  return `${COOKIE}=${tok}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS*86400}`;
}
function checkPassword(p){ if (typeof p!=="string" || p.length < 8 || p.length > 128) fail(400,"weak_password","Password must be 8–128 characters"); return p; }
async function setupKeyOk(key){ return typeof key==="string" && key.length >= 8 && safeEq(await sha256("kirana-setup:"+key), SETUP_KEY_SHA256); }

// ---------- serialisation ----------
async function catalog(db, {admin=false}={}){
  const cats = (await db.prepare(`SELECT * FROM categories ${admin?"":"WHERE active=1"} ORDER BY sort, id`).all()).results;
  const prods = (await db.prepare(`SELECT * FROM products ${admin?"":"WHERE active=1"} ORDER BY featured DESC, updated_at DESC, id DESC`).all()).results;
  const vars = (await db.prepare(`SELECT * FROM variants ${admin?"":"WHERE active=1"} ORDER BY sort, id`).all()).results;
  const byP = {}; const lo = admin ? null : await liveOffers(db); const pr = admin ? null : offerPricer(lo);
  const prodById = new Map(prods.map(p => [p.id, p]));
  for (const v of vars) {
    if (admin) { (byP[v.product_id] ||= []).push(v); continue; }
    const pp = prodById.get(v.product_id); const ep = pp ? pr.price(v, pp) : {price: v.price_paise, offer: null};
    (byP[v.product_id] ||= []).push({id:v.id, label:v.label, price_paise:ep.price, base_price_paise: ep.offer ? v.price_paise : null, offer_id: ep.offer ? ep.offer.id : null, mrp_paise:v.mrp_paise, in_stock: v.stock > 0, few_left: v.stock > 0 && v.stock <= v.low_stock, max_qty: Math.min(v.stock, 20)});
  }
  const activeCat = new Set(cats.map(c=>c.id));
  const pop = new Map();
  if (!admin) for (const r of (await db.prepare(`SELECT v.product_id AS pid, SUM(oi.qty) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN variants v ON v.id=oi.variant_id WHERE o.status NOT IN ('rejected','cancelled') AND o.is_test=0 AND o.created_at > ? GROUP BY v.product_id`).bind(now() - 60*864e5).all()).results) pop.set(r.pid, r.n);
  const products = prods.filter(p => admin || (byP[p.id]?.length && (p.category_id==null || activeCat.has(p.category_id)))).map(p => ({
    id:p.id, category_id:p.category_id, name_hi:p.name_hi, name_en:p.name_en, brand:p.brand, description:p.description, icon:p.icon,
    image: p.image_id ? `/api/img/${p.image_id}` : null, image_id: admin ? p.image_id : undefined, featured: !!p.featured, active: !!p.active, is_demo: !!p.is_demo, variants: byP[p.id] || [],
    offer_id: admin ? undefined : (pr.tag(p)?.id ?? null), pop: admin ? undefined : (pop.get(p.id) || 0) }));
  const out = {categories: cats.map(c => ({...c, active: !!c.active, is_demo: !!c.is_demo})), products};
  if (!admin) out.offers = lo.offers.map(o => publicOffer(o, lo.items));
  return out;
}
async function loadOrder(db, where, arg){
  const o = await db.prepare(`SELECT * FROM orders WHERE ${where}`).bind(arg).first();
  if (!o) return null;
  o.items = (await db.prepare(`SELECT * FROM order_items WHERE order_id=? ORDER BY id`).bind(o.id).all()).results;
  o.events = (await db.prepare(`SELECT from_status,to_status,note,actor,at FROM order_events WHERE order_id=? ORDER BY id`).bind(o.id).all()).results;
  delete o.token_hash; delete o.restock_nonce; delete o.idem_key;
  return o;
}
function customerView(o){
  return {code:o.code, status:o.status, reason:o.reason, created_at:o.created_at, updated_at:o.updated_at, customer_name:o.customer_name,
    phone_masked: "XXXXXX" + o.phone.slice(-4), locality:o.locality, pincode:o.pincode, payment_method:o.payment_method, payment_status:o.payment_status,
    subtotal_paise:o.subtotal_paise, delivery_paise:o.delivery_paise, total_paise:o.total_paise, discount_paise:o.discount_paise || 0, discount_title:o.discount_title || "", free_delivery_offer: !!o.free_delivery_offer_id,
    items:o.items.map(i=>({product_name:i.product_name, product_name_en:i.product_name_en, variant_label:i.variant_label, icon:i.icon, unit_price_paise:i.unit_price_paise, base_price_paise: i.offer_id ? i.base_price_paise : null, offer_title: i.offer_title || "", qty:i.qty, line_total_paise:i.line_total_paise})),
    events:o.events.map(e=>({to_status:e.to_status, note: e.to_status==="rejected"||e.to_status==="cancelled" ? e.note : "", at:e.at}))};
}

// ---------- offers (server is the only place an offer price is applied) ----------
async function liveOffers(db, at = now()){
  const offers = (await db.prepare(`SELECT * FROM offers WHERE active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?) ORDER BY sort, id DESC`).bind(at, at).all()).results;
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
  if (o.category_id && !(await db.prepare(`SELECT id FROM categories WHERE id=?`).bind(o.category_id).first())) fail(400,"invalid","Category not found");
  const pids = rule ? [] : [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(x => intIn(x, 1, 1e9, "product")))].slice(0, 200);
  if (pids.length) { const n = (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE id IN (${pids.map(()=>"?").join(",")})`).bind(...pids).first()).n; if (n !== pids.length) fail(400,"invalid","Some linked items no longer exist"); }
  const vprices = [];
  if (kind === "price") {
    for (const x of (Array.isArray(b.variant_prices) ? b.variant_prices : []).slice(0, 300)) {
      if (x == null || x.offer_price == null || x.offer_price === "") continue;
      const vid = intIn(x.variant_id, 1, 1e9, "variant"); const pp = toPaise(x.offer_price, "offer price");
      const v = await db.prepare(`SELECT v.id, v.product_id, v.price_paise, v.label, p.name_hi FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?`).bind(vid).first();
      if (!v) fail(400,"invalid","Item size not found");
      if (!(pp > 0 && pp < v.price_paise)) fail(400,"invalid",`Offer price for ${v.name_hi} (${v.label}) must be less than its normal price ₹${v.price_paise/100}`);
      vprices.push({v, pp});
    }
    if (!vprices.length) fail(400,"invalid","Add an offer price for at least one item");
  }
  if (kind === "percent" && !pids.length && !o.category_id) fail(400,"invalid","Pick the items or the category this % off applies to");
  const t = now(); const st = [];
  if (id) {
    const ex = await db.prepare(`SELECT id FROM offers WHERE id=?`).bind(id).first(); if (!ex) fail(404,"not_found","Offer not found");
    st.push(db.prepare(`UPDATE offers SET title_hi=?,title_en=?,desc_hi=?,desc_en=?,kind=?,percent_off=?,category_id=?,color=?,image_id=?,starts_at=?,ends_at=?,active=?,rule=?,min_cart_paise=?,amount_off_paise=?,is_demo=0,updated_at=? WHERE id=?`)
      .bind(o.title_hi,o.title_en,o.desc_hi,o.desc_en,o.kind,o.percent_off,o.category_id,o.color,o.image_id,o.starts_at,o.ends_at,o.active,o.rule,o.min_cart_paise,o.amount_off_paise,t,id));
    st.push(db.prepare(`DELETE FROM offer_items WHERE offer_id=?`).bind(id));
  } else {
    st.push(db.prepare(`INSERT INTO offers (title_hi,title_en,desc_hi,desc_en,kind,percent_off,category_id,color,image_id,starts_at,ends_at,active,rule,min_cart_paise,amount_off_paise,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`)
      .bind(o.title_hi,o.title_en,o.desc_hi,o.desc_en,o.kind,o.percent_off,o.category_id,o.color,o.image_id,o.starts_at,o.ends_at,o.active,o.rule,o.min_cart_paise,o.amount_off_paise,t,t));
  }
  const oid = id ? id : null; const ref = oid ? "?" : "(SELECT MAX(id) FROM offers)"; const refArgs = oid ? [oid] : [];
  const linked = new Set();
  for (const {v, pp} of vprices) { linked.add(v.product_id); st.push(db.prepare(`INSERT INTO offer_items (offer_id,product_id,variant_id,offer_price_paise) VALUES (${ref},?,?,?)`).bind(...refArgs, v.product_id, v.id, pp)); }
  for (const pid of pids) if (!linked.has(pid)) st.push(db.prepare(`INSERT INTO offer_items (offer_id,product_id) VALUES (${ref},?)`).bind(...refArgs, pid));
  await db.batch(st);
  return id || (await db.prepare(`SELECT MAX(id) AS id FROM offers`).first()).id;
}
async function adminOffers(db){
  const offers = (await db.prepare(`SELECT * FROM offers ORDER BY sort, id DESC`).all()).results;
  const items = (await db.prepare(`SELECT oi.*, p.name_hi, p.name_en, v.label, v.price_paise FROM offer_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN variants v ON v.id=oi.variant_id ORDER BY oi.id`).all()).results;
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
async function pushTo(env, db, subs, event, payload, orderId, subject){
  const role = payload.role || "customer";
  if (!subs.length) { await db.prepare(`INSERT INTO notification_attempts (role,order_id,event,outcome,detail,at) VALUES (?,?,?,'no_subscription','',?)`).bind(role, orderId, event, now()).run(); return []; }
  const vapid = await getVapid(db); const doFetch = env.PUSH_FETCH || fetch;
  const data = enc.encode(JSON.stringify({title: payload.title, body: payload.body, url: payload.url, tag: payload.tag, at: now()}));
  return Promise.all(subs.map(async sub => {
    let status = null, outcome, detail = "";
    try {
      const bodyBytes = await encryptPush(data, sub.p256dh, sub.auth);
      const r = await doFetch(sub.endpoint, {method:"POST", headers:{"TTL":"86400", "Urgency":"high", "Content-Encoding":"aes128gcm", "Content-Type":"application/octet-stream", "Authorization": await vapidHeader(vapid, sub.endpoint, subject)}, body: bodyBytes});
      status = r.status;
      outcome = r.status >= 200 && r.status < 300 ? "accepted" : (r.status === 404 || r.status === 410) ? "expired" : "rejected";
      if (outcome !== "accepted") detail = (await r.text().catch(()=>"")).slice(0, 200);
    } catch (e) { outcome = "error"; detail = String(e?.message || e).slice(0, 200); }
    const st = [db.prepare(`INSERT INTO notification_attempts (role,subscription_id,order_id,event,push_host,http_status,outcome,detail,at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(role, sub.id, orderId, event, new URL(sub.endpoint).hostname, status, outcome, detail, now())];
    if (outcome === "expired") st.push(db.prepare(`DELETE FROM push_subscriptions WHERE id=?`).bind(sub.id));
    else if (outcome === "accepted") st.push(db.prepare(`UPDATE push_subscriptions SET last_ok_at=?, fail_count=0 WHERE id=?`).bind(now(), sub.id));
    else st.push(db.prepare(`UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=?`).bind(sub.id));
    await db.batch(st);
    return {id: sub.id, status, outcome};
  }));
}
const CUST_MSG = {
  accepted: ["✅ ऑर्डर मंज़ूर हो गया", "दुकान ने आपका ऑर्डर {c} मान लिया है। Order accepted."],
  preparing: ["🧺 ऑर्डर तैयार हो रहा है", "आपका ऑर्डर {c} पैक हो रहा है। Being prepared."],
  out_for_delivery: ["🛵 ऑर्डर रास्ते में है", "आपका ऑर्डर {c} डिलीवरी के लिए निकल गया है। Out for delivery."],
  delivered: ["🏠 ऑर्डर पहुँच गया", "ऑर्डर {c} डिलीवर हो गया। धन्यवाद! Delivered."],
  rejected: ["❌ ऑर्डर नहीं लिया जा सका", "ऑर्डर {c}: {r}"],
  cancelled: ["⚠️ ऑर्डर रद्द हुआ", "ऑर्डर {c}: {r}"]
};
async function notifyCustomer(env, db, order, origin){
  const m = CUST_MSG[order.status]; if (!m) return [];
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='customer' AND order_id=?`).bind(order.id).all()).results;
  return pushTo(env, db, subs, "status:" + order.status, {role:"customer", title: m[0], body: m[1].replace("{c}", order.code).replace("{r}", order.reason || "—"), url: `/track#open=${order.code}`, tag: "order-" + order.code}, order.id, origin);
}
async function notifyAdmins(env, db, order, origin){
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin'`).all()).results;
  const n = order.items.reduce((a,i)=>a+i.qty, 0);
  return pushTo(env, db, subs, "new_order", {role:"admin", title: `नया ऑर्डर आया — ${order.code}, ₹${(order.total_paise/100).toLocaleString("en-IN")}`, body: `${order.customer_name} · ${n} सामान · ${order.locality || order.address}`.slice(0, 160), url: `/admin#order=${order.id}`, tag: "new-" + order.code}, order.id, origin);
}
async function notifyAdminsCancelled(env, db, order, origin){
  const subs = (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin'`).all()).results;
  return pushTo(env, db, subs, "customer_cancelled", {role:"admin", title: `ग्राहक ने ऑर्डर रद्द किया — ${order.code}`, body: `${order.customer_name} · ₹${(order.total_paise/100).toLocaleString("en-IN")} · स्टॉक वापस जुड़ गया`.slice(0, 160), url: `/admin#order=${order.id}`, tag: "cancel-" + order.code}, order.id, origin);
}
// ---------- v4: reorder at CURRENT prices (never the old snapshot) ----------
async function reorderItems(db, orderId){
  const its = (await db.prepare(`SELECT variant_id, product_name, product_name_en, variant_label, icon, unit_price_paise, qty FROM order_items WHERE order_id=? ORDER BY id`).bind(orderId).all()).results;
  const pricer = offerPricer(await liveOffers(db)); const out = [];
  for (const i of its) {
    const r = i.variant_id ? await db.prepare(`SELECT v.*, p.category_id, p.active AS p_active, c.active AS c_active FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE v.id=?`).bind(i.variant_id).first() : null;
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
  const agg = await db.prepare(`SELECT COUNT(*) AS n, AVG(r.stars) AS avg FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0`).first();
  const recent = (await db.prepare(`SELECT r.stars, r.comment, r.created_at, o.customer_name FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0 AND r.comment != '' ORDER BY r.id DESC LIMIT 6`).all()).results;
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
  const W = `o.is_test=0 AND o.created_at>=? AND o.created_at<?`;
  const counts = Object.fromEntries((await db.prepare(`SELECT status, COUNT(*) AS n FROM orders o WHERE ${W} GROUP BY status`).bind(from, to).all()).results.map(x => [x.status, x.n]));
  const dv = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS value, COALESCE(SUM(subtotal_paise),0) AS items, COALESCE(SUM(discount_paise),0) AS discount, COALESCE(SUM(delivery_paise),0) AS delivery FROM orders o WHERE ${W} AND status='delivered'`).bind(from, to).first();
  const pay = (await db.prepare(`SELECT payment_method AS method, COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS value FROM orders o WHERE ${W} AND status='delivered' GROUP BY payment_method`).bind(from, to).all()).results;
  const best = (await db.prepare(`SELECT COALESCE(v.product_id, 0) AS product_id, MAX(oi.product_name) AS name, MAX(oi.product_name_en) AS name_en, MAX(oi.icon) AS icon, SUM(oi.qty) AS qty, SUM(oi.line_total_paise) AS value FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN variants v ON v.id=oi.variant_id WHERE ${W} AND o.status='delivered' GROUP BY COALESCE(CAST(v.product_id AS TEXT), 'n:' || oi.product_name) ORDER BY qty DESC, value DESC LIMIT 10`).bind(from, to).all()).results;
  const slow = (await db.prepare(`SELECT p.id AS product_id, p.name_hi AS name, p.name_en, p.icon, COALESCE(s.qty,0) AS qty, (SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=p.id AND active=1) AS stock FROM products p LEFT JOIN (SELECT v.product_id, SUM(oi.qty) AS qty FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN variants v ON v.id=oi.variant_id WHERE ${W} AND o.status='delivered' GROUP BY v.product_id) s ON s.product_id=p.id WHERE p.active=1 ORDER BY qty ASC, stock DESC, p.name_hi LIMIT 10`).bind(from, to).all()).results;
  const dayRows = (await db.prepare(`SELECT CAST((o.created_at + ${IST}) / ${DAY} AS INTEGER) AS d, COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS value FROM orders o WHERE ${W} AND status='delivered' GROUP BY d`).bind(from, to).all()).results;
  const days = []; for (let t = from; t < to && days.length < 370; t += DAY) { const d = Math.floor((t + IST) / DAY); const r = dayRows.find(x => x.d === d); days.push({day: new Date(d * DAY).toISOString().slice(0,10), n: r ? r.n : 0, value: r ? r.value : 0}); }
  const tests = (await db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE o.is_test=1 AND o.created_at>=? AND o.created_at<?`).bind(from, to).first()).n;
  return {from, to, counts, delivered: {orders: dv.n, value_paise: dv.value, items_paise: dv.items, discount_paise: dv.discount, delivery_paise: dv.delivery, avg_order_paise: dv.n ? Math.round(dv.value / dv.n) : 0},
    cancelled: counts.cancelled || 0, rejected: counts.rejected || 0, open: (counts.pending||0)+(counts.accepted||0)+(counts.preparing||0)+(counts.out_for_delivery||0),
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
async function backup(db, actor){
  const tables = {};
  for (const t of BACKUP_TABLES) { try { tables[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).results; } catch { tables[t] = []; } }
  const at = now();
  await db.batch([db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('last_backup_at',?)`).bind(String(at)), db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('last_backup_by',?)`).bind(actor)]);
  return {format: "kirana-backup", format_version: 1, app_version: APP_VERSION, created_at: at, created_at_iso: new Date(at).toISOString(), created_by: actor,
    excluded_tables: BACKUP_EXCLUDED, note: "Restore steps: README → Backup & restore. Logins are not in the backup; use the recovery keys after a restore.", tables};
}
const backupResponse = data => new Response(JSON.stringify(data), {headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="kirana-backup-${new Date(data.created_at + IST).toISOString().slice(0,16).replace(/[:T]/g,"-")}.json"`,"cache-control":"no-store","x-content-type-options":"nosniff"}});
// In production the push runs after the response (ctx.waitUntil); in tests (no ctx) it is awaited.
async function later(ctx, fn){ const p = Promise.resolve().then(fn).catch(e => { console.error("push", e); return logError(null, {route:"background:push", kind:"background", message: errText(e)}); }); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p; }
async function orderByToken(db, code, token){
  if (!/^AK-[A-Z0-9]{6}$/.test(code || "") || !/^[a-f0-9]{48}$/.test(token || "")) return null;
  const o = await db.prepare(`SELECT id, token_hash FROM orders WHERE code=?`).bind(code).first();
  return o && safeEq(await sha256(token), o.token_hash) ? o : null;
}

// ---------- order creation ----------
async function createOrder(db, req, body){
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const idem = str(body.idempotency_key, 64, {required:true, field:"idempotency_key"});
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(idem)) fail(400,"invalid","bad idempotency_key");
  const existing = await db.prepare(`SELECT code FROM orders WHERE idem_key=?`).bind(idem).first();
  if (existing) return {duplicate:true, order: customerView(await loadOrder(db,"code=?",existing.code)), token:null};
  // Service paused by the developer (e.g. maintenance payment lapsed): no new orders, enforced here on the server.
  if ((await service(db)).status === "paused") { await bump(db, ["blocked"]); const ss = await getSettings(db); fail(423,"service_paused","Online ordering is temporarily unavailable — please contact the shop", {phone: ss.phone || ""}); }
  if (!(await rateCheck(db, "order:"+ip, 8, 10*60000))) fail(429,"rate_limited","Too many orders from this connection. Please wait a few minutes.");

  const s = await getSettings(db);
  const st = storeStatus(s); if (!st.open) fail(409,"store_closed","Store is closed right now", {reason: st.reason});
  const name = str(body.name, 60, {required:true, field:"name"});
  const phone = normPhone(body.phone); if (!phone) fail(400,"invalid_phone","Enter a valid 10-digit mobile number");
  const address = str(body.address, 300, {required:true, field:"address"});
  const locality = str(body.locality, 80); const pincode = str(body.pincode, 6); const landmark = str(body.landmark, 120); const instructions = str(body.instructions, 300);
  if (pincode && !/^\d{6}$/.test(pincode)) fail(400,"invalid","PIN code must be 6 digits");
  const pins = listOf(s.delivery_pincodes), locs = listOf(s.delivery_localities);
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
  const rows = (await db.prepare(`SELECT v.*, p.name_hi, p.name_en, p.icon, p.category_id, p.active AS p_active, c.active AS c_active FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE v.id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all()).results;
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
  const delivery = cq.delivery, discount = cq.discount;
  const total = subtotal - discount + delivery;
  const isTest = /^TEST\b/.test(name) ? 1 : 0; // test orders ("TEST – …") are kept out of reports
  const token = randHex(24); const code = "AK-" + randCode(6); const t = now();

  const stmts = [ctxSet(db, "customer", `order ${code} placed — stock reserved`)];
  for (const {r, qty} of items) stmts.push(db.prepare(`UPDATE variants SET stock = stock - ? WHERE id=?`).bind(qty, r.id)); // CHECK(stock>=0) aborts the whole batch on oversell
  stmts.push(db.prepare(`INSERT INTO orders (code,token_hash,idem_key,status,customer_name,phone,address,locality,pincode,landmark,instructions,payment_method,subtotal_paise,delivery_paise,total_paise,discount_paise,discount_title,discount_offer_id,free_delivery_offer_id,is_test,created_at,updated_at) VALUES (?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(code, await sha256(token), idem, name, phone, address, locality, pincode, landmark, instructions, pm, subtotal, delivery, total, discount, cq.discount_offer ? cq.discount_offer.title_hi : "", cq.discount_offer ? cq.discount_offer.id : null, cq.free_offer ? cq.free_offer.id : null, isTest, t, t));
  for (const {r, qty, ep} of items) stmts.push(db.prepare(`INSERT INTO order_items (order_id,variant_id,product_name,product_name_en,variant_label,icon,unit_price_paise,mrp_paise,qty,line_total_paise,base_price_paise,offer_id,offer_title) VALUES ((SELECT id FROM orders WHERE code=?),?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(code, r.id, r.name_hi, r.name_en, r.label, r.icon, ep.price, r.mrp_paise, qty, ep.price*qty, r.price_paise, ep.offer ? ep.offer.id : null, ep.offer ? ep.offer.title_hi : ""));
  stmts.push(db.prepare(`INSERT INTO order_events (order_id,from_status,to_status,note,actor,at) VALUES ((SELECT id FROM orders WHERE code=?),NULL,'pending','','customer',?)`).bind(code, t));
  stmts.push(ctxClear(db));
  try { await db.batch(stmts); }
  catch (e) {
    const m = String(e?.message || e);
    if (/UNIQUE/i.test(m) && /idem_key/i.test(m)) { const ex = await db.prepare(`SELECT code FROM orders WHERE idem_key=?`).bind(idem).first(); if (ex) return {duplicate:true, order: customerView(await loadOrder(db,"code=?",ex.code)), token:null}; }
    if (/CHECK/i.test(m)) fail(409,"cart_changed","Some items just went out of stock. Please review your cart.", {problems:[{problem:"stock"}]});
    throw e;
  }
  await rateHit(db, "order:"+ip);
  const full = await loadOrder(db,"code=?",code);
  return {duplicate:false, order: customerView(full), token, _full: full};
}

// ---------- order status ----------
async function transition(db, id, to, expectedFrom, reason, actor){
  if (!STATUSES.includes(to)) fail(400,"invalid","Unknown status");
  const o = await db.prepare(`SELECT id,status,code FROM orders WHERE id=?`).bind(id).first();
  if (!o) fail(404,"not_found","Order not found");
  const from = expectedFrom || o.status;
  if (from !== o.status) fail(409,"stale","This order was already updated. Refresh.", {status:o.status});
  if (!TRANSITIONS[from].includes(to)) fail(409,"bad_transition",`Cannot move from ${from} to ${to}`);
  if ((to === "rejected" || to === "cancelled") && !reason) fail(400,"reason_required","Please give a reason");
  const nonce = randHex(12); const t = now();
  const stmts = [ctxSet(db, actor, RELEASES_STOCK.has(to) ? `order ${o.code} ${to} — stock released` : `order ${o.code}`), db.prepare(`UPDATE orders SET status=?, reason=CASE WHEN ? != '' THEN ? ELSE reason END, restock_nonce=?, updated_at=?, payment_status=CASE WHEN ?='delivered' THEN 'collected_on_delivery' ELSE payment_status END WHERE id=? AND status=?`).bind(to, reason, reason, nonce, t, to, id, from)];
  if (RELEASES_STOCK.has(to)) stmts.push(db.prepare(`UPDATE variants SET stock = stock + (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id=? AND variant_id=variants.id) WHERE id IN (SELECT variant_id FROM order_items WHERE order_id=?) AND EXISTS (SELECT 1 FROM orders WHERE id=? AND restock_nonce=?)`).bind(id, id, id, nonce));
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
  if (p.category_id) { const c = await db.prepare(`SELECT id FROM categories WHERE id=?`).bind(p.category_id).first(); if (!c) fail(400,"invalid","Category not found"); }
  if (!id) {
    const r = await db.prepare(`INSERT INTO products (category_id,name_hi,name_en,brand,description,icon,image_id,featured,active,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?) RETURNING id`)
      .bind(p.category_id,p.name_hi,p.name_en,p.brand,p.description,p.icon,p.image_id,p.featured,p.active,t,t).first();
    id = r.id;
  } else {
    const ex = await db.prepare(`SELECT id FROM products WHERE id=?`).bind(id).first(); if (!ex) fail(404,"not_found","Product not found");
  }
  const existing = (await db.prepare(`SELECT id FROM variants WHERE product_id=?`).bind(id).all()).results.map(r=>r.id);
  const keep = new Set(p.variants.filter(v=>v.id && existing.includes(v.id)).map(v=>v.id));
  const st = [ctxSet(db, actor, reason), db.prepare(`UPDATE products SET category_id=?,name_hi=?,name_en=?,brand=?,description=?,icon=?,image_id=?,featured=?,active=?,is_demo=0,updated_at=? WHERE id=?`).bind(p.category_id,p.name_hi,p.name_en,p.brand,p.description,p.icon,p.image_id,p.featured,p.active,t,id)];
  for (const vid of existing) if (!keep.has(vid)) st.push(db.prepare(`DELETE FROM variants WHERE id=?`).bind(vid));
  for (const v of p.variants) {
    if (v.id && keep.has(v.id)) st.push(db.prepare(`UPDATE variants SET label=?,sku=?,price_paise=?,mrp_paise=?,stock=?,low_stock=?,active=?,sort=? WHERE id=? AND product_id=?`).bind(v.label,v.sku,v.price_paise,v.mrp_paise,v.stock,v.low_stock,v.active,v.sort,v.id,id));
    else st.push(db.prepare(`INSERT INTO variants (product_id,label,sku,price_paise,mrp_paise,stock,low_stock,active,sort) VALUES (?,?,?,?,?,?,?,?,?)`).bind(id,v.label,v.sku,v.price_paise,v.mrp_paise,v.stock,v.low_stock,v.active,v.sort));
  }
  st.push(ctxClear(db));
  try { await db.batch(st); } catch (e) { if (/UNIQUE/i.test(String(e.message))) fail(409,"duplicate_sku","That SKU is already used by another item"); throw e; }
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
  const rows = (await db.prepare(`SELECT c.name_hi AS category_hi, c.name_en AS category_en, p.name_hi, p.name_en, p.brand, v.label AS pack_size, v.sku, v.price_paise, v.mrp_paise, v.stock, v.low_stock, p.featured, (p.active AND v.active) AS active FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.sort, p.id, v.sort`).all()).results;
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
  const cats = (await db.prepare(`SELECT id,name_hi,name_en FROM categories`).all()).results;
  let created = 0, updated = 0;
  for (const g of groups.values()) {
    let cat = cats.find(c => (g.cat_hi && c.name_hi===g.cat_hi) || (g.cat_en && c.name_en.toLowerCase()===g.cat_en.toLowerCase()));
    if (!cat && (g.cat_hi || g.cat_en)) { const r = await db.prepare(`INSERT INTO categories (name_hi,name_en,icon,sort) VALUES (?,?,?,?) RETURNING id,name_hi,name_en`).bind(g.cat_hi||g.cat_en, g.cat_en, "🛍️", cats.length).first(); cats.push(r); cat = r; }
    const ex = await db.prepare(`SELECT id FROM products WHERE name_hi=? AND brand=? ORDER BY id LIMIT 1`).bind(g.name_hi, g.brand).first();
    const exVars = ex ? (await db.prepare(`SELECT * FROM variants WHERE product_id=?`).bind(ex.id).all()).results : [];
    const variants = g.variants.map(v => { const m = exVars.find(x => (v.sku && x.sku===v.sku) || x.label===v.label); return {...v, id: m?.id}; });
    for (const x of exVars) if (!variants.some(v=>v.id===x.id)) variants.push({id:x.id, label:x.label, sku:x.sku, price:(x.price_paise/100).toFixed(2), mrp:x.mrp_paise==null?null:(x.mrp_paise/100).toFixed(2), stock:x.stock, low_stock:x.low_stock, active:x.active});
    const prev = ex ? await db.prepare(`SELECT * FROM products WHERE id=?`).bind(ex.id).first() : null;
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

async function api(req, env, url, ctx){
  const db = env.DB; await migrate(db);
  const p = url.pathname, m = req.method;
  let mm;
  // CSRF: state-changing admin calls must be same-origin JSON with our header
  if (m !== "GET" && p.startsWith("/api/admin/") && req.headers.get("x-requested-with") !== "kirana") fail(403,"csrf","Missing header");

  // ----- public -----
  if (p === "/api/store" && m === "GET") { const s = await getSettings(db); return json({ok:true, settings: publicSettings(s), service_paused: (await service(db)).status === "paused", reviews: s.show_reviews ? await publicReviews(db) : null, ...(await catalog(db))}); }
  if ((mm = p.match(/^\/api\/img\/([a-f0-9]{16,40})$/)) && m === "GET") {
    const r = await db.prepare(`SELECT mime,data FROM images WHERE id=?`).bind(mm[1]).first();
    if (!r) return new Response("Not found", {status:404});
    const bin = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    return new Response(bin, {headers:{"content-type":r.mime, "cache-control":"public, max-age=31536000, immutable", "x-content-type-options":"nosniff"}});
  }
  if (p === "/api/orders" && m === "POST") {
    const r = await createOrder(db, req, await body(req)); const full = r._full; delete r._full;
    if (full) await later(ctx, () => notifyAdmins(env, db, full, url.origin));
    return json({ok:true, ...r}, r.duplicate ? 200 : 201);
  }
  // My Orders: the browser sends the (code, private token) pairs it saved; only matching orders come back.
  if (p === "/api/orders/mine" && m === "POST") {
    const b = await body(req); const list = (Array.isArray(b.orders) ? b.orders : []).slice(0, 30);
    const out = [];
    for (const x of list) {
      const o = await orderByToken(db, String(x?.code||""), String(x?.token||""));
      if (!o) { out.push({code: String(x?.code||"").slice(0,12), missing:true}); continue; }
      const full = await loadOrder(db, "id=?", o.id); const cv = customerView(full);
      const subs = (await db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE role='customer' AND order_id=?`).bind(o.id).first()).n;
      out.push({code: cv.code, status: cv.status, reason: cv.reason, created_at: cv.created_at, updated_at: cv.updated_at, total_paise: cv.total_paise,
        item_count: cv.items.reduce((a,i)=>a+i.qty,0), vids: full.items.map(i => i.variant_id).filter(Boolean), preview: cv.items.slice(0,3).map(i => ({icon:i.icon, name:i.product_name, name_en:i.product_name_en})), push_on: subs > 0});
    }
    return json({ok:true, orders: out});
  }
  if (p === "/api/push/key" && m === "GET") return json({ok:true, public_key: (await getVapid(db)).pub});
  if (p === "/api/push/order" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip") || "local";
    if (!(await rateCheck(db, "push:"+ip, 30, 10*60000))) fail(429,"rate_limited","Too many requests");
    const o = await orderByToken(db, String(b.code||""), String(b.token||"")); if (!o) fail(404,"not_found","Order not found");
    const sub = parseSubscription(b.subscription, env);
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE role='customer' AND order_id=? AND endpoint != ?`).bind(o.id, sub.endpoint).first()).n;
    if (n >= 5) fail(409,"too_many","Too many devices for this order");
    await db.prepare(`INSERT INTO push_subscriptions (role,order_id,endpoint,p256dh,auth,user_agent,created_at) VALUES ('customer',?,?,?,?,?,?) ON CONFLICT(role, endpoint, COALESCE(order_id,0)) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, fail_count=0`)
      .bind(o.id, sub.endpoint, sub.p256dh, sub.auth, str(req.headers.get("user-agent"), 200).slice(0,200), now()).run();
    await rateHit(db, "push:"+ip);
    return json({ok:true, subscribed:true});
  }
  if (p === "/api/push/order/remove" && m === "POST") {
    const b = await body(req); const o = await orderByToken(db, String(b.code||""), String(b.token||"")); if (!o) fail(404,"not_found","Order not found");
    const r = await db.prepare(`DELETE FROM push_subscriptions WHERE role='customer' AND order_id=? AND endpoint=?`).bind(o.id, str(b.endpoint, 1000)).run();
    return json({ok:true, removed: r.meta?.changes || 0});
  }
  if ((mm = p.match(/^\/api\/orders\/(AK-[A-Z0-9]{6})$/)) && m === "GET") {
    const tok = req.headers.get("x-order-token") || "";
    const o = await db.prepare(`SELECT token_hash FROM orders WHERE code=?`).bind(mm[1]).first();
    if (!o || !/^[a-f0-9]{48}$/.test(tok) || !safeEq(await sha256(tok), o.token_hash)) fail(404,"not_found","Order not found");
    const full = await loadOrder(db,"code=?",mm[1]); const s = await getSettings(db);
    const rt = await db.prepare(`SELECT stars, comment, created_at FROM order_ratings WHERE order_id=?`).bind(full.id).first();
    return json({ok:true, order: {...customerView(full), can_cancel: full.status === "pending", rating: rt || null}, shop: {name_hi: s.store_name_hi, name_en: s.store_name_en, phone: s.phone || "", whatsapp: s.whatsapp || s.phone || ""}});
  }
  // ----- v4: reorder (current prices), customer cancellation (pending only), rating (after delivery) — all need the order's private token -----
  if (p === "/api/orders/reorder" && m === "POST") {
    const b = await body(req); const o = await orderByToken(db, String(b.code||""), String(b.token||"")); if (!o) fail(404,"not_found","Order not found");
    return json({ok:true, items: await reorderItems(db, o.id)});
  }
  if ((mm = p.match(/^\/api\/orders\/(AK-[A-Z0-9]{6})\/(cancel|rating)$/)) && m === "POST") {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (!(await rateCheck(db, "cust:"+ip, 20, 10*60000))) fail(429,"rate_limited","Too many requests. Please wait a few minutes.");
    await rateHit(db, "cust:"+ip);
    const o = await orderByToken(db, mm[1], req.headers.get("x-order-token") || ""); if (!o) fail(404,"not_found","Order not found");
    const b = await body(req);
    if (mm[2] === "cancel") {
      const cur = await db.prepare(`SELECT status FROM orders WHERE id=?`).bind(o.id).first();
      if (cur.status === "cancelled") return json({ok:true, already:true, order: customerView(await loadOrder(db,"id=?",o.id))});
      if (cur.status !== "pending") fail(409,"not_cancellable","The shop has already accepted this order. Please call the shop to cancel.", {status: cur.status});
      let full;
      try { full = await transition(db, o.id, "cancelled", "pending", "ग्राहक ने रद्द किया · Cancelled by customer" + (b.reason ? ": " + str(b.reason, 120).replace(/[<>]/g,"") : ""), "customer"); }
      catch (e) { if (e instanceof HttpError && e.code === "stale") { const now2 = await db.prepare(`SELECT status FROM orders WHERE id=?`).bind(o.id).first(); if (now2.status === "cancelled") return json({ok:true, already:true, order: customerView(await loadOrder(db,"id=?",o.id))}); fail(409,"not_cancellable","The shop has already accepted this order. Please call the shop to cancel.", {status: now2.status}); } throw e; }
      await later(ctx, () => notifyAdminsCancelled(env, db, full, url.origin));
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
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM admins`).first()).n;
    const a = await currentAdmin(db, req);
    return json({ok:true, needs_setup: n === 0, admin: a ? {username:a.username, must_change: !!a.must_change} : null, service: a ? adminServiceView(await service(db)) : null});
  }
  if (p === "/api/admin/setup" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip")||"local";
    if (!(await rateCheck(db, "setup:"+ip, 5, 15*60000))) fail(429,"rate_limited","Too many attempts. Try again in 15 minutes.");
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM admins`).first()).n;
    if (n > 0) fail(409,"already_setup","Admin already exists. Log in instead.");
    if (!(await setupKeyOk(b.setup_key))) { await rateHit(db,"setup:"+ip); fail(403,"bad_setup_key","Setup key is not correct"); }
    const username = str(b.username, 40, {required:true, field:"username"}).toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400,"invalid","Username: 3–40 letters/numbers");
    const pw = checkPassword(b.password); const salt = randHex(16);
    const r = await db.prepare(`INSERT INTO admins (username,pass_hash,salt,must_change,created_at) VALUES (?,?,?,?,?) RETURNING id`).bind(username, await pbkdf2(pw, salt), salt, bool(b.must_change)?1:0, now()).first();
    return json({ok:true}, 200, {"set-cookie": await newSession(db, r.id)});
  }
  if (p === "/api/admin/login" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip")||"local";
    const username = String(b.username||"").trim().toLowerCase();
    if (!(await rateCheck(db, "login:"+ip, 8, 15*60000)) || !(await rateCheck(db, "login-user:"+username, 8, 15*60000))) fail(429,"rate_limited","Too many wrong attempts. Try again in 15 minutes.");
    const a = await db.prepare(`SELECT * FROM admins WHERE username=?`).bind(username).first();
    const hash = await pbkdf2(String(b.password||""), a?.salt || "00".repeat(16));
    if (!a || !safeEq(hash, a.pass_hash)) { await rateHit(db,"login:"+ip); await rateHit(db,"login-user:"+username); fail(401,"bad_login","Wrong username or password"); }
    await db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now()).run();
    return json({ok:true, must_change: !!a.must_change}, 200, {"set-cookie": await newSession(db, a.id)});
  }
  if (p === "/api/admin/recover" && m === "POST") {
    const b = await body(req); const ip = req.headers.get("cf-connecting-ip")||"local";
    if (!(await rateCheck(db, "setup:"+ip, 5, 15*60000))) fail(429,"rate_limited","Too many attempts. Try again in 15 minutes.");
    if (!(await setupKeyOk(b.setup_key))) { await rateHit(db,"setup:"+ip); fail(403,"bad_setup_key","Recovery key is not correct"); }
    const username = String(b.username||"").trim().toLowerCase();
    const a = await db.prepare(`SELECT id FROM admins WHERE username=?`).bind(username).first(); if (!a) fail(404,"not_found","No such admin");
    const salt = randHex(16);
    await db.batch([db.prepare(`UPDATE admins SET pass_hash=?, salt=?, must_change=0 WHERE id=?`).bind(await pbkdf2(checkPassword(b.password), salt), salt, a.id), db.prepare(`DELETE FROM sessions WHERE admin_id=?`).bind(a.id)]);
    return json({ok:true});
  }

  const admin = await currentAdmin(db, req);
  if (p.startsWith("/api/admin/") && !admin) fail(401,"login_required","Please log in");
  if (!p.startsWith("/api/admin/")) fail(404,"not_found","Not found");
  // Paused service: the shopkeeper panel is read-only (exports still work — they are GETs). Logout/password stay allowed.
  const svc = await service(db);
  if (svc.status === "paused" && m !== "GET" && !["/api/admin/logout","/api/admin/password","/api/admin/push/unsubscribe"].includes(p))
    fail(423,"service_paused","सेवा रुकी हुई है — पैनल अभी सिर्फ़ देखने के लिए है। Service paused: the panel is read-only. Please contact your developer.");
  if (p === "/api/admin/orders.csv" && m === "GET") return new Response(await exportOrdersCSV(db), {headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="kirana-orders.csv"`,"cache-control":"no-store"}});

  if (p === "/api/admin/logout" && m === "POST") { const tok = cookieOf(req); if (tok) await db.prepare(`DELETE FROM sessions WHERE token_hash=?`).bind(await sha256(tok)).run(); return json({ok:true}, 200, {"set-cookie": `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`}); }
  if (p === "/api/admin/password" && m === "POST") {
    const b = await body(req); const a = await db.prepare(`SELECT * FROM admins WHERE id=?`).bind(admin.id).first();
    if (!safeEq(await pbkdf2(String(b.current||""), a.salt), a.pass_hash)) fail(401,"bad_login","Current password is wrong");
    const salt = randHex(16); const tok = cookieOf(req);
    await db.batch([db.prepare(`UPDATE admins SET pass_hash=?, salt=?, must_change=0 WHERE id=?`).bind(await pbkdf2(checkPassword(b.password), salt), salt, a.id), db.prepare(`DELETE FROM sessions WHERE admin_id=? AND token_hash != ?`).bind(a.id, await sha256(tok))]);
    return json({ok:true});
  }
  if (p === "/api/admin/dashboard" && m === "GET") {
    const ist = new Date(now()+330*60000); ist.setUTCHours(0,0,0,0); const dayStart = ist.getTime() - 330*60000;
    const today = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status NOT IN ('rejected','cancelled') THEN total_paise END),0) AS value FROM orders WHERE created_at >= ?`).bind(dayStart).first();
    const counts = (await db.prepare(`SELECT status, COUNT(*) AS n FROM orders GROUP BY status`).all()).results;
    const low = (await db.prepare(`SELECT v.id, v.label, v.stock, v.low_stock, p.name_hi, p.name_en, p.icon, p.id AS product_id FROM variants v JOIN products p ON p.id=v.product_id WHERE p.active=1 AND v.active=1 AND v.stock <= v.low_stock ORDER BY v.stock LIMIT 30`).all()).results;
    const demo = (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE is_demo=1`).first()).n;
    const maxId = (await db.prepare(`SELECT COALESCE(MAX(id),0) AS id FROM orders`).first()).id;
    const r30 = await reports(db, istDayStart(now()) - 29*DAY, istDayStart(now()) + DAY);
    const rating = await db.prepare(`SELECT COUNT(*) AS n, AVG(r.stars) AS avg FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0`).first();
    await pruneAudit(db);
    return json({ok:true, today, counts, best_sellers: r30.best_sellers.slice(0, 5), delivered_30d: r30.delivered, rating: {count: rating.n, avg: rating.n ? Math.round(rating.avg*10)/10 : null}, low_stock: low, demo_products: demo, latest_order_id: maxId, settings: await getSettings(db), service: adminServiceView(svc), admin:{username:admin.username, must_change:!!admin.must_change}});
  }
  if (p === "/api/admin/reports" && m === "GET") { const rg = reportRange(url.searchParams); return json({ok:true, range: rg.range, ...(await reports(db, rg.from, rg.to))}); }
  if (p === "/api/admin/reports.csv" && m === "GET") { const rg = reportRange(url.searchParams); return new Response(reportsCSV(await reports(db, rg.from, rg.to)), {headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="kirana-report-${rg.range}.csv"`,"cache-control":"no-store"}}); }
  if (p === "/api/admin/ratings" && m === "GET") {
    const rows = (await db.prepare(`SELECT r.id, r.stars, r.comment, r.created_at, o.code, o.id AS order_id, o.customer_name, o.total_paise, o.is_test FROM order_ratings r JOIN orders o ON o.id=r.order_id ORDER BY r.id DESC LIMIT 200`).all()).results;
    const agg = await db.prepare(`SELECT COUNT(*) AS n, AVG(r.stars) AS avg FROM order_ratings r JOIN orders o ON o.id=r.order_id WHERE o.is_test=0`).first();
    const s = await getSettings(db);
    return json({ok:true, ratings: rows, count: agg.n, avg: agg.n ? Math.round(agg.avg*10)/10 : null, show_reviews: !!s.show_reviews});
  }
  if (p === "/api/admin/audit" && m === "GET") {
    const pid = url.searchParams.get("product_id"); const field = url.searchParams.get("field") || ""; const before = Number(url.searchParams.get("before")) || 0;
    let sql = `SELECT a.*, p.name_hi, p.name_en, p.icon FROM audit_log a LEFT JOIN products p ON p.id=a.product_id WHERE 1=1`; const args = [];
    if (pid) { sql += ` AND a.product_id=?`; args.push(intIn(pid, 1, 1e9, "product")); }
    if (field === "stock" || field === "price" || field === "status") { sql += field === "price" ? ` AND a.field IN ('price','mrp')` : ` AND a.field=?`; if (field !== "price") args.push(field); }
    if (field === "items") sql += ` AND a.entity='variant'`;
    if (before) { sql += ` AND a.id < ?`; args.push(before); }
    sql += ` ORDER BY a.id DESC LIMIT 100`;
    const rows = (await db.prepare(sql).bind(...args).all()).results;
    return json({ok:true, entries: rows, keep: {rows: AUDIT_KEEP_ROWS, days: AUDIT_KEEP_DAYS}});
  }
  if (p === "/api/admin/backup" && m === "GET") return backupResponse(await backup(db, "admin:"+admin.username));
  if (p === "/api/admin/orders" && m === "GET") {
    const status = url.searchParams.get("status"); const q = (url.searchParams.get("q")||"").trim();
    let sql = `SELECT * FROM orders WHERE 1=1`; const args = [];
    if (status && status !== "all") { if (status === "active") sql += ` AND status IN ('pending','accepted','preparing','out_for_delivery')`; else { sql += ` AND status=?`; args.push(status); } }
    if (q) { sql += ` AND (code LIKE ? OR phone LIKE ? OR customer_name LIKE ?)`; args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    sql += ` ORDER BY id DESC LIMIT 100`;
    const orders = (await db.prepare(sql).bind(...args).all()).results;
    const ids = orders.map(o=>o.id); const items = ids.length ? (await db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(()=>"?").join(",")}) ORDER BY id`).bind(...ids).all()).results : [];
    const subs = ids.length ? (await db.prepare(`SELECT order_id, COUNT(*) AS n FROM push_subscriptions WHERE role='customer' AND order_id IN (${ids.map(()=>"?").join(",")}) GROUP BY order_id`).bind(...ids).all()).results : [];
    const att = ids.length ? (await db.prepare(`SELECT order_id, event, outcome, http_status, at FROM notification_attempts WHERE role='customer' AND order_id IN (${ids.map(()=>"?").join(",")}) ORDER BY id DESC`).bind(...ids).all()).results : [];
    for (const o of orders) { o.items = items.filter(i=>i.order_id===o.id); delete o.token_hash; delete o.restock_nonce; delete o.idem_key;
      o.push = {customer_devices: subs.find(x=>x.order_id===o.id)?.n || 0, last: att.find(x=>x.order_id===o.id) || null}; }
    return json({ok:true, orders});
  }
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)$/)) && m === "GET") { const o = await loadOrder(db,"id=?",Number(mm[1])); if (!o) fail(404,"not_found","Order not found"); return json({ok:true, order:o}); }
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)\/status$/)) && m === "POST") {
    const b = await body(req);
    const o = await transition(db, Number(mm[1]), String(b.status||""), b.from ? String(b.from) : null, str(b.reason, 200), "admin:"+admin.username);
    await later(ctx, () => notifyCustomer(env, db, o, url.origin));
    return json({ok:true, order:o});
  }
  // ----- admin: order alerts (Web Push) -----
  if (p === "/api/admin/push" && m === "GET") {
    const devices = (await db.prepare(`SELECT id, user_agent, created_at, last_ok_at, fail_count, endpoint FROM push_subscriptions WHERE role='admin' ORDER BY id DESC`).all()).results.map(d => ({id:d.id, user_agent:d.user_agent, created_at:d.created_at, last_ok_at:d.last_ok_at, fail_count:d.fail_count, endpoint_host: new URL(d.endpoint).hostname, endpoint_tail: d.endpoint.slice(-12)}));
    const attempts = (await db.prepare(`SELECT a.role, a.order_id, o.code, a.event, a.push_host, a.http_status, a.outcome, a.detail, a.at FROM notification_attempts a LEFT JOIN orders o ON o.id=a.order_id ORDER BY a.id DESC LIMIT 30`).all()).results;
    return json({ok:true, public_key: (await getVapid(db)).pub, devices, attempts});
  }
  if (p === "/api/admin/push/subscribe" && m === "POST") {
    const b = await body(req); const sub = parseSubscription(b.subscription, env);
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE role='admin'`).first()).n;
    if (n >= 10) fail(409,"too_many","Too many alert devices. Remove one first.");
    await db.prepare(`INSERT INTO push_subscriptions (role,admin_id,endpoint,p256dh,auth,user_agent,created_at) VALUES ('admin',?,?,?,?,?,?) ON CONFLICT(role, endpoint, COALESCE(order_id,0)) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, admin_id=excluded.admin_id, fail_count=0`)
      .bind(admin.id, sub.endpoint, sub.p256dh, sub.auth, str(req.headers.get("user-agent"), 200).slice(0,200), now()).run();
    return json({ok:true, subscribed:true});
  }
  if (p === "/api/admin/push/unsubscribe" && m === "POST") {
    const b = await body(req);
    const r = b.id ? await db.prepare(`DELETE FROM push_subscriptions WHERE role='admin' AND id=?`).bind(intIn(b.id,1,1e9,"id")).run() : await db.prepare(`DELETE FROM push_subscriptions WHERE role='admin' AND endpoint=?`).bind(str(b.endpoint, 1000)).run();
    return json({ok:true, removed: r.meta?.changes || 0});
  }
  if (p === "/api/admin/push/test" && m === "POST") {
    const b = await body(req);
    const subs = b.endpoint ? (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin' AND endpoint=?`).bind(str(b.endpoint,1000)).all()).results : (await db.prepare(`SELECT * FROM push_subscriptions WHERE role='admin'`).all()).results;
    if (!subs.length) fail(404,"no_device","This device is not subscribed yet");
    const results = await pushTo(env, db, subs, "test", {role:"admin", title:"🔔 टेस्ट अलर्ट — Test alert", body:"ऑर्डर अलर्ट इस फ़ोन पर चालू हैं। Order alerts are on for this device.", url:"/admin", tag:"test"}, null, url.origin);
    return json({ok:true, results});
  }
  // ----- admin: offers -----
  if (p === "/api/admin/offers" && m === "GET") return json({ok:true, offers: await adminOffers(db), now: now()});
  if (p === "/api/admin/offers" && m === "POST") { const id = await saveOffer(db, null, await body(req)); return json({ok:true, id}, 201); }
  if ((mm = p.match(/^\/api\/admin\/offers\/(\d+)$/)) && m === "PUT") { const id = await saveOffer(db, Number(mm[1]), await body(req)); return json({ok:true, id}); }
  if ((mm = p.match(/^\/api\/admin\/offers\/(\d+)$/)) && m === "DELETE") { const r = await db.prepare(`DELETE FROM offers WHERE id=?`).bind(Number(mm[1])).run(); if (!r.meta?.changes) fail(404,"not_found","Offer not found"); return json({ok:true}); }
  if ((mm = p.match(/^\/api\/admin\/offers\/(\d+)\/active$/)) && m === "POST") {
    const b = await body(req); const r = await db.prepare(`UPDATE offers SET active=?, updated_at=? WHERE id=?`).bind(bool(b.active)?1:0, now(), Number(mm[1])).run();
    if (!r.meta?.changes) fail(404,"not_found","Offer not found"); return json({ok:true});
  }
  if (p === "/api/admin/catalog" && m === "GET") return json({ok:true, ...(await catalog(db, {admin:true}))});
  if (p === "/api/admin/products" && m === "POST") { const id = await saveProduct(db, null, await body(req), "admin:"+admin.username, "item added"); return json({ok:true, id}, 201); }
  if ((mm = p.match(/^\/api\/admin\/products\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === "PUT") { await saveProduct(db, id, await body(req), "admin:"+admin.username, "item edited"); return json({ok:true, id}); }
    if (m === "PATCH") { const b = await body(req); const st = []; if ("active" in b) st.push(db.prepare(`UPDATE products SET active=?, updated_at=? WHERE id=?`).bind(bool(b.active)?1:0, now(), id)); if ("featured" in b) st.push(db.prepare(`UPDATE products SET featured=? WHERE id=?`).bind(bool(b.featured)?1:0, id)); if (st.length) await db.batch(st); return json({ok:true}); }
    if (m === "DELETE") { await db.prepare(`DELETE FROM products WHERE id=?`).bind(id).run(); return json({ok:true}); }
  }
  if ((mm = p.match(/^\/api\/admin\/variants\/(\d+)\/stock$/)) && m === "POST") {
    const b = await body(req); const id = Number(mm[1]);
    const who = "admin:"+admin.username;
    if (b.set != null) await db.batch([ctxSet(db, who, "manual stock edit"), db.prepare(`UPDATE variants SET stock=? WHERE id=?`).bind(intIn(b.set,0,100000,"stock"), id), ctxClear(db)]);
    else { const d = intIn(b.delta, -100000, 100000, "delta"); try { await db.batch([ctxSet(db, who, "manual stock edit"), db.prepare(`UPDATE variants SET stock = stock + ? WHERE id=?`).bind(d, id), ctxClear(db)]); } catch { fail(409,"invalid","Stock cannot go below 0"); } }
    const v = await db.prepare(`SELECT id, stock FROM variants WHERE id=?`).bind(id).first(); if (!v) fail(404,"not_found","Not found");
    return json({ok:true, variant:v});
  }
  if (p === "/api/admin/demo/remove" && m === "POST") {
    await db.batch([ctxSet(db, "admin:"+admin.username, "sample items removed"), db.prepare(`DELETE FROM offers WHERE is_demo=1`), db.prepare(`DELETE FROM products WHERE is_demo=1`), db.prepare(`DELETE FROM categories WHERE is_demo=1 AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL)`), db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('demo_mode','false')`), ctxClear(db)]);
    return json({ok:true});
  }
  if (p === "/api/admin/categories" && m === "POST") {
    const b = await body(req); const mx = (await db.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS s FROM categories`).first()).s;
    const r = await db.prepare(`INSERT INTO categories (name_hi,name_en,icon,sort,active) VALUES (?,?,?,?,1) RETURNING id`).bind(str(b.name_hi,60,{required:true,field:"Hindi name"}), str(b.name_en,60), str(b.icon,16)||"🛍️", mx).first();
    return json({ok:true, id:r.id}, 201);
  }
  if ((mm = p.match(/^\/api\/admin\/categories\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === "PUT") { const b = await body(req); await db.prepare(`UPDATE categories SET name_hi=?, name_en=?, icon=?, active=?, is_demo=0 WHERE id=?`).bind(str(b.name_hi,60,{required:true,field:"Hindi name"}), str(b.name_en,60), str(b.icon,16)||"🛍️", b.active===undefined?1:(bool(b.active)?1:0), id).run(); return json({ok:true}); }
    if (m === "DELETE") { const n = (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE category_id=?`).bind(id).first()).n; if (n) fail(409,"in_use",`${n} items are in this category. Move or delete them first, or hide the category.`); await db.prepare(`DELETE FROM categories WHERE id=?`).bind(id).run(); return json({ok:true}); }
  }
  if (p === "/api/admin/categories/order" && m === "POST") { const b = await body(req); const ids = (Array.isArray(b.ids)?b.ids:[]).map(x=>intIn(x,1,1e9,"id")); if (ids.length) await db.batch(ids.map((id,i)=>db.prepare(`UPDATE categories SET sort=? WHERE id=?`).bind(i,id))); return json({ok:true}); }
  if (p === "/api/admin/settings" && m === "PUT") {
    const b = await body(req); const st = []; const set = (k,v) => st.push(db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`).bind(k, JSON.stringify(v)));
    for (const k of ["store_name_hi","store_name_en","tagline_hi","tagline_en","address","delivery_time_hi","delivery_time_en","announcement_hi","announcement_en","delivery_localities"]) if (k in b) set(k, str(b[k], k==="delivery_localities"?1000:200));
    if ("store_name_hi" in b && !String(b.store_name_hi).trim()) fail(400,"invalid","Store name required");
    if ("phone" in b) { const v = String(b.phone||"").trim(); if (v && !normPhone(v)) fail(400,"invalid_phone","Store phone must be a valid 10-digit mobile"); set("phone", v ? normPhone(v) : ""); }
    if ("whatsapp" in b) { const v = String(b.whatsapp||"").trim(); if (v && !normPhone(v)) fail(400,"invalid_phone","WhatsApp must be a valid 10-digit mobile"); set("whatsapp", v ? normPhone(v) : ""); }
    for (const k of ["open_time","close_time"]) if (k in b) { const v = String(b[k]); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(400,"invalid","Time like 08:00"); set(k, v); }
    if ("delivery_pincodes" in b) { const pins = listOf(b.delivery_pincodes); if (pins.some(x=>!/^\d{6}$/.test(x))) fail(400,"invalid","PIN codes must be 6 digits, comma separated"); set("delivery_pincodes", pins.join(", ")); }
    for (const k of ["delivery_charge","free_delivery_above","min_order"]) if (k in b) set(k+"_paise", b[k]===""||b[k]==null ? 0 : toPaise(b[k], k.replace(/_/g," ")));
    for (const k of ["force_closed","pay_cod","pay_upi_on_delivery","demo_mode","show_reviews"]) if (k in b) set(k, bool(b[k]));
    if ("logo_image_id" in b) { const v = String(b.logo_image_id || ""); if (v && !/^[a-f0-9]{16,40}$/.test(v)) fail(400,"invalid","bad image"); set("logo_image_id", v); }
    if ("upi_id" in b) { const v = str(b.upi_id, 80); if (v && !/^[\w.\-]{2,}@[\w]{2,}$/.test(v)) fail(400,"invalid","UPI ID looks wrong (like name@bank)"); set("upi_id", v); }
    if (st.length) await db.batch(st);
    const s = await getSettings(db); if (!s.pay_cod && !s.pay_upi_on_delivery) { await db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('pay_cod','true')`).run(); }
    return json({ok:true, settings: await getSettings(db)});
  }
  if (p === "/api/admin/image" && m === "POST") {
    const b = await body(req);
    const mt = String(b.data_url||"").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!mt) fail(400,"invalid","Upload a JPG, PNG or WebP photo");
    const size = Math.floor(mt[2].length*3/4); if (size > 450000) fail(413,"too_large","Photo too big (max ~450 KB after compression)");
    const id = randHex(10);
    await db.prepare(`INSERT INTO images (id,mime,data,size,created_at) VALUES (?,?,?,?,?)`).bind(id, mt[1], mt[2], size, now()).run();
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
async function readService(db){
  const rows = (await db.prepare(`SELECT k,v FROM service_state WHERE k IN ('status','paid_until','grace_days','dev_contact')`).all()).results;
  const o = Object.fromEntries(rows.map(r => [r.k, r.v]));
  const status = SVC_RANK[o.status] != null ? o.status : "active";
  const paid_until = o.paid_until ? Number(o.paid_until) : null;
  const grace_days = Number.isInteger(Number(o.grace_days)) ? Number(o.grace_days) : 7;
  return {status, paid_until: Number.isFinite(paid_until) ? paid_until : null, grace_days, dev_contact: o.dev_contact || ""};
}
// Change the status only if it is still `from` (no lost updates), and log the change in the same transaction.
async function setStatus(db, from, to, actor, note){
  const res = await db.batch([
    db.prepare(`UPDATE service_state SET v=? WHERE k='status' AND v=?`).bind(to, from),
    db.prepare(`INSERT INTO service_log (at,from_status,to_status,actor,note) SELECT ?,?,?,?,? WHERE changes() = 1`).bind(now(), from, to, actor, String(note||"").slice(0,300))
  ]);
  return (res?.[0]?.meta?.changes || 0) > 0;
}
const logService = (db, from, to, actor, note) => db.prepare(`INSERT INTO service_log (at,from_status,to_status,actor,note) VALUES (?,?,?,?,?)`).bind(now(), from, to, actor, String(note||"").slice(0,300)).run();
// Current service state. When a "paid until" date has passed, the status moves on by itself:
// Active → Grace the day after, Grace → Paused after `grace_days`. Automatic moves only ever escalate.
async function service(db, at = now()){
  const s = await readService(db);
  if (s.paid_until && at > s.paid_until) {
    const target = at >= s.paid_until + s.grace_days*DAY ? "paused" : "grace";
    if (SVC_RANK[target] > SVC_RANK[s.status]) {
      const note = `auto: paid until ${istYMD(s.paid_until)} passed` + (target === "paused" ? ` + ${s.grace_days} day grace` : "");
      if (await setStatus(db, s.status, target, "auto", note)) s.status = target;
      else s.status = (await readService(db)).status;
    }
  }
  s.pauses_at = s.paid_until ? s.paid_until + s.grace_days*DAY : null;
  return s;
}
function adminServiceView(s){
  return {status: s.status, paid_until: s.paid_until, pauses_at: s.status === "grace" ? s.pauses_at : null, dev_contact: s.dev_contact};
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
  if (path.startsWith("/api/dev/")) return "dev";
  if (path.startsWith("/api/")) return "api";
  if (PAGE_PATHS.has(path)) return "page";
  return null;
}

// ---------- health (public, for an uptime monitor; no secrets) ----------
async function health(env){
  const t0 = Date.now(); let db = "ok";
  try { const r = await env.DB.prepare(`SELECT 1 AS one`).first(); if (!r || r.one !== 1) db = "error"; } catch { db = "error"; }
  const ok = db === "ok";
  return json({ok, db, db_ms: Date.now() - t0, version: APP_VERSION, build: BUILD_TIME, time: new Date().toISOString()}, ok ? 200 : 503, {"access-control-allow-origin":"*"});
}

// ---------- the page customers see while the service is paused ----------
const H = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function pausedPage(st){
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
<p class="m">ऑनलाइन ऑर्डर अभी कुछ समय के लिए बंद है — कृपया दुकान से संपर्क करें।</p>
<p class="e">Online ordering is temporarily unavailable — please contact the shop.</p>
${st.address ? `<p class="a">📍 ${H(st.address)}</p>` : ""}<div class="bs">${tel}${wa}</div></main></body></html>`;
}

// ---------- developer auth ----------
const DEV_COOKIE = "__Host-ks_dev";
function devCookieOf(req){ const m = (req.headers.get("cookie")||"").match(new RegExp(`(?:^|;\\s*)${DEV_COOKIE}=([a-f0-9]{64})`)); return m ? m[1] : null; }
async function currentDev(db, req){
  const tok = devCookieOf(req); if (!tok) return null;
  const row = await db.prepare(`SELECT d.id, d.username, s.expires_at FROM dev_sessions s JOIN dev_accounts d ON d.id=s.dev_id WHERE s.token_hash=?`).bind(await sha256(tok)).first();
  return row && row.expires_at >= now() ? row : null;
}
async function newDevSession(db, devId){
  const tok = randHex(32);
  await db.prepare(`INSERT INTO dev_sessions (token_hash,dev_id,expires_at,created_at) VALUES (?,?,?,?)`).bind(await sha256(tok), devId, now()+DEV_SESSION_HOURS*3600000, now()).run();
  return `${DEV_COOKIE}=${tok}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${DEV_SESSION_HOURS*3600}`;
}
async function devRecoveryOk(key){ return typeof key==="string" && key.length >= 12 && safeEq(await sha256("kirana-dev-recover:"+key), DEV_RECOVERY_SHA256); }

async function tableCount(db, t){ try { return (await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n; } catch { return null; } }
const DEV_TABLES = ["orders","order_items","order_events","products","variants","categories","offers","offer_items","images","push_subscriptions","notification_attempts","admins","sessions","rate_events","error_log","metrics","service_log","dev_sessions","audit_log","order_ratings"];

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
  const settings = await getSettings(db);
  const first = await db.prepare(`SELECT v FROM service_state WHERE k=?`).bind("first_seen:" + APP_VERSION + "@" + BUILD_TIME).first();
  return {
    now: t, server: {ok: dbOk, db_ms: dbMs, colo: req.cf?.colo || null, version: APP_VERSION, build_time: BUILD_TIME, first_served_at: first ? Number(first.v) : null},
    store: {name: settings.store_name_en || settings.store_name_hi, open: storeStatus(settings), demo_mode: !!settings.demo_mode, phone_set: !!settings.phone, whatsapp_set: !!settings.whatsapp},
    orders: {today: ord.today, last_7_days: ord.d7, total: ord.total, last_order_at: ord.last_at, value_7_days_paise: value7, by_status: byStatus, stale_minutes: staleMin, stale_pending_count: staleCount, stale_pending: stale},
    products: {total: prod.total, active: prod.active, demo: prod.demo, out_of_stock: prod.out_of_stock, variants: vars.total, variants_out_of_stock: vars.out_of_stock, variants_low: vars.low},
    push: {last_24h: pushSum, shop_alert_devices: adminDev.n, shop_alerts_enabled: adminDev.n > 0, shop_last_delivered_to_push_service_at: adminDev.last_ok, shop_last_attempt: lastAdminPush || null, customer_subscriptions: custSubs},
    errors: {last_24h: err24, stored: counts.error_log, recent: errors},
    traffic: {last_24h: tot, hours},
    db: {size_bytes: sizeBytes, rows: counts},
    backup: await (async () => { const a = await db.prepare(`SELECT v FROM service_state WHERE k='last_backup_at'`).first(); const b = await db.prepare(`SELECT v FROM service_state WHERE k='last_backup_by'`).first(); return {last_at: a ? Number(a.v) : null, last_by: b ? b.v.split(":")[0] : null}; })()
  };
}

async function devApi(req, env, url, ctx){
  const db = env.DB; const p = url.pathname, m = req.method; const ip = req.headers.get("cf-connecting-ip") || "local";
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
  if (!dev) fail(401,"login_required","Please log in");
  if (p === "/api/dev/logout" && m === "POST") { const tok = devCookieOf(req); if (tok) await db.prepare(`DELETE FROM dev_sessions WHERE token_hash=?`).bind(await sha256(tok)).run(); return json({ok:true}, 200, {"set-cookie": `${DEV_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`}); }
  if (p === "/api/dev/password" && m === "POST") {
    const b = await body(req); const d = await db.prepare(`SELECT * FROM dev_accounts WHERE id=?`).bind(dev.id).first();
    if (!safeEq(await pbkdf2(String(b.current||""), d.salt), d.pass_hash)) fail(401,"bad_login","Current password is wrong");
    const salt = randHex(16);
    await db.batch([db.prepare(`UPDATE dev_accounts SET pass_hash=?, salt=? WHERE id=?`).bind(await pbkdf2(checkPassword12(b.password), salt), salt, d.id), db.prepare(`DELETE FROM dev_sessions WHERE dev_id=? AND token_hash != ?`).bind(d.id, await sha256(devCookieOf(req)))]);
    return json({ok:true});
  }
  if (p === "/api/dev/health" && m === "GET") return json({ok:true, dev:{username: dev.username}, service: await service(db), ...(await devHealth(db, url, req))});
  if (p === "/api/dev/service" && m === "GET") {
    const svc = await service(db);
    const log = (await db.prepare(`SELECT id, at, from_status, to_status, actor, note FROM service_log ORDER BY id DESC LIMIT 50`).all()).results;
    return json({ok:true, service: svc, log, now: now()});
  }
  if (p === "/api/dev/service" && m === "POST") {
    const b = await body(req); const actor = "dev:" + dev.username; const note = str(b.note, 200);
    const cur = await service(db); const st = [];
    const put = (k, v) => st.push(db.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES (?,?)`).bind(k, String(v)));
    let target = null; let extra = "";
    if (b.action === "resume") {
      target = "active";
      // A passed "paid until" date would pause the site again at once — clear it (logged) unless a new date is given.
      if (cur.paid_until && cur.paid_until < now() && !b.paid_until) { put("paid_until", ""); extra = ` (expired paid-until ${istYMD(cur.paid_until)} cleared)`; }
    } else if (b.action === "grace") target = "grace";
    else if (b.action === "pause") target = "paused";
    else if (b.action === "paid_month") {
      const base = Math.max(now(), cur.paid_until || 0); const d = new Date(base + 330*60000); d.setUTCMonth(d.getUTCMonth() + 1);
      const until = endOfDayIST(d.toISOString().slice(0,10)); put("paid_until", until); target = "active"; extra = ` (paid until ${istYMD(until)})`;
    } else if (b.action !== "settings") fail(400,"invalid","Unknown action");
    if ("paid_until" in b && b.action !== "paid_month") {
      if (b.paid_until === "" || b.paid_until == null) { if (cur.paid_until) { put("paid_until", ""); extra += " (paid-until cleared)"; } }
      else { const t = endOfDayIST(String(b.paid_until)); if (!t) fail(400,"invalid","Paid-until must be a date like 2026-11-30"); put("paid_until", t); extra += ` (paid until ${istYMD(t)})`; }
    }
    if ("grace_days" in b) { const g = intIn(b.grace_days, 0, 90, "Grace days"); put("grace_days", g); if (g !== cur.grace_days) extra += ` (grace ${g} days)`; }
    if ("dev_contact" in b) { const v = String(b.dev_contact||"").trim(); if (v && !normPhone(v)) fail(400,"invalid_phone","Developer contact must be a valid 10-digit mobile"); put("dev_contact", v ? normPhone(v) : ""); }
    if (st.length) await db.batch(st);
    if (target && target !== cur.status) await setStatus(db, cur.status, target, actor, (note || b.action) + extra);
    else if (extra) await logService(db, cur.status, cur.status, actor, ((note || "settings") + extra).trim());
    const after = await service(db);
    const log = (await db.prepare(`SELECT id, at, from_status, to_status, actor, note FROM service_log ORDER BY id DESC LIMIT 50`).all()).results;
    return json({ok:true, service: after, log, now: now()});
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
  const orders = (await db.prepare(`SELECT * FROM orders ORDER BY id`).all()).results;
  const items = (await db.prepare(`SELECT order_id, product_name, variant_label, qty, unit_price_paise FROM order_items ORDER BY id`).all()).results;
  const byO = {}; for (const i of items) (byO[i.order_id] ||= []).push(`${i.product_name} ${i.variant_label} x${i.qty} @${(i.unit_price_paise/100).toFixed(2)}`);
  const cols = ["order_code","created_at_ist","status","customer_name","phone","address","locality","pincode","landmark","instructions","payment_method","payment_status","items","subtotal","delivery","total","reason"];
  const ist = t => new Date(t + 330*60000).toISOString().slice(0,16).replace("T"," ");
  const out = [cols.join(",")];
  for (const o of orders) out.push([o.code, ist(o.created_at), o.status, o.customer_name, o.phone, o.address, o.locality, o.pincode, o.landmark, o.instructions, o.payment_method, o.payment_status, (byO[o.id]||[]).join("; "), (o.subtotal_paise/100).toFixed(2), (o.delivery_paise/100).toFixed(2), (o.total_paise/100).toFixed(2), o.reason].map(csvCell).join(","));
  return "\ufeff" + out.join("\n");
}

const SEC_HEADERS = {
  "x-content-type-options":"nosniff", "referrer-policy":"no-referrer", "x-frame-options":"DENY",
  "permissions-policy":"camera=(), microphone=(), geolocation=()",
  "content-security-policy":"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};

const PAGES = {"/":"/index.html", "/admin":"/admin.html", "/admin/":"/admin.html", "/track":"/track.html", "/info":"/info.html", "/dev":"/dev.html", "/dev/":"/dev.html"};
const PAGE_PATHS = new Set(Object.keys(PAGES));
const CUSTOMER_PAGES = new Set(["/", "/track", "/info"]);

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
  // Paused service: customers get a polite "ordering unavailable" page with the shop's phone. Admin and /dev still open.
  if (CUSTOMER_PAGES.has(url.pathname)) {
    let paused = false, st = null;
    try { await migrate(env.DB); paused = (await service(env.DB)).status === "paused"; if (paused) st = await getSettings(env.DB); } catch (e) { console.error("service check", e); }
    if (paused) {
      const h = new Headers(SEC_HEADERS); h.set("content-type","text/html; charset=utf-8"); h.set("cache-control","no-store"); h.set("retry-after","3600");
      return new Response(pausedPage(st), {status:503, headers:h});
    }
  }
  // Pages go through the Worker (html_handling "none") so they carry the security headers below.
  const res = PAGES[url.pathname] ? await env.ASSETS.fetch(new Request(url.origin + PAGES[url.pathname], req)) : await env.ASSETS.fetch(req);
  const h = new Headers(res.headers); for (const [k,v] of Object.entries(SEC_HEADERS)) h.set(k,v);
  if (/\.(css|js)$/.test(url.pathname)) h.set("cache-control","public, max-age=300");
  if (url.pathname === "/sw.js") { h.set("cache-control","no-cache"); h.set("service-worker-allowed","/"); h.set("content-type","text/javascript; charset=utf-8"); }
  if (/\.webmanifest$/.test(url.pathname)) { h.set("content-type","application/manifest+json"); h.set("cache-control","public, max-age=3600"); }
  if (PAGES[url.pathname]) { h.set("content-type","text/html; charset=utf-8"); h.set("cache-control","no-cache"); }
  if (url.pathname.startsWith("/dev")) h.set("x-robots-tag","noindex, nofollow");
  return new Response(res.body, {status:res.status, headers:h});
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    LOG_DB = env.DB;
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
      const pausedPageShown = CUSTOMER_PAGES.has(url.pathname) && res.status === 503;
      const keys = [kind]; if (res.status === 429) keys.push("rl"); if (res.status >= 500 && !pausedPageShown) keys.push("e5");
      if (kind === "page" && res.status >= 500 && !pausedPageShown && !logged) await logError(env.DB, {method:req.method, route:url.pathname, status:res.status, kind:"5xx", message:"page answered " + res.status});
      const p = bump(env.DB, keys);
      if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
    }
    return res;
  }
};
