// v10.7 tests: 📦 Stock — ready-list bulk add, list import (text / CSV / xlsx / text-PDF parse → preview → confirm), stock-in register,
// low-stock alerts (once per crossing, re-armed by a restock), one-tap restock, shop isolation, money in paise. (helpers copied from the v10.6 tests)
// (helpers copied from the v10.4 tests)
// v8 subscription tests (trial → active → due → expired, bills, UPI/UTR payments, verify/reject, 48h lapse). Helpers copied from the v7 tests.
// v6 "Apna Dhanda" tests (landing, online switch, per-shop app manifest, lock, brand, delete, stickers). Helpers copied from the v5 multi-shop tests: self-signup + approval, per-shop isolation (orders, products, settings, reports, backup, push,
// token routes), per-shop pause, storefront routing, and the migration of an existing single-shop (v4) database into shop #1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createHash, pbkdf2Sync, createECDH } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEST_KEY = "test-setup-key-123456";
const DEV_USER = "krish-dev", DEV_PASS = "dev-test-password-xyz";
const sha = s => createHash("sha256").update(s).digest("hex");
async function loadWorker(file = join(here, "..", "site", "_worker.mjs")){
  const salt = "ab".repeat(16); const hash = pbkdf2Sync(DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
  const src = readFileSync(file, "utf8")
    .replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${sha("kirana-setup:" + TEST_KEY)}"`)
    .replace(/const DEV_SEED = \{[^}]*\};/, `const DEV_SEED = {username:"${DEV_USER}", salt:"${salt}", hash:"${hash}"};`);
  const dir = mkdtempSync(join(tmpdir(), "kirana-mt-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, src); return (await import(f)).default;
}
function makeEnv(DB){
  const sent = [];
  return { sent, e: { DB, ASSETS: { fetch: async r => { const pth = join(here, "..", "site", new URL(r.url).pathname); if (/\.(html|webmanifest|js)$/.test(pth) && existsSync(pth)) return new Response(readFileSync(pth, "utf8"), {headers:{"content-type": pth.endsWith(".html") ? "text/html" : "text/plain"}}); return new Response(`<html><head><meta charset="utf-8">\n<meta name="ak-shop" content=""><link rel="manifest" href="/manifest.webmanifest"></head><body>asset ${new URL(r.url).pathname}</body></html>`, {headers:{"content-type":"text/html"}}); } },
    PUSH_FETCH: async (endpoint, init) => { sent.push({endpoint}); return new Response("", {status: 201}); }, PUSH_EXTRA_HOSTS: "push.test" } };
}
async function world(DB = makeD1(), worker = null){
  worker = worker || await loadWorker(); const env = makeEnv(DB);
  const jar = (dflt = {}) => { let cookie = "";
    const call = async (method, path, body, headers = {}) => {
      headers = {...dflt, ...headers};
      const h = { "cf-connecting-ip": headers.ip || "1.1.1.1" };
      if (headers.shop) h["x-shop"] = headers.shop;
      if (body !== undefined) h["content-type"] = "application/json";
      if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
      if (method !== "GET" && path.startsWith("/api/dev/")) h["x-requested-with"] = "kirana-dev";
      if (headers.token) h["x-order-token"] = headers.token;
      if (cookie) h.cookie = cookie;
      const r = await worker.fetch(new Request("https://k.test" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env.e);
      const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0].replace(/=$/, "");
      const ct = r.headers.get("content-type") || "";
      return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text(), headers: r.headers };
    };
    return { call }; };
  return { DB, jar, env, worker, sql: (q, ...a) => DB._sql.prepare(q).all(...a), one: (q, ...a) => DB._sql.prepare(q).get(...a) };
}
const idem = () => "k" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const cust = { name: "Ramesh", phone: "98765 43210", address: "House 12, Gali 3", locality: "Shanti Nagar", pincode: "452001" };
async function order(c, shop, variant, extra = {}){
  return c.call("POST", "/api/orders", { ...cust, items: [{ variant_id: variant.id, qty: 1 }], payment_method: "cod", idempotency_key: idem(), ...extra }, { shop });
}
// shop #1 (bhaiya, via the setup key) + shop B (self sign-up, approved by the developer) with one item.
async function twoShops(){
  const w = await world();
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  await A.call("PUT", "/api/admin/settings", { open_time: "00:00", close_time: "00:00", phone: "9876500011" });
  const dev = w.jar(); assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  const B = w.jar();
  const s = await B.call("POST", "/api/admin/signup", { owner_name: "Suresh Sharma", shop_name: "TEST – Sharma Kirana", mobile: "9123456780", password: "bshoppass1" });
  assert.equal(s.status, 201, JSON.stringify(s.body)); assert.equal(s.body.shop.status, "pending"); assert.match(s.body.recovery_key, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const bid = s.body.shop.id, slug = s.body.shop.slug;
  assert.equal((await dev.call("POST", "/api/dev/service", { shop_id: bid, action: "approve" })).status, 200);
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 200);
  const cats = [{ id: (await B.call("POST", "/api/admin/categories", { name_hi: "मसाले", icon: "🌶️" })).body.id }];
  const p = await B.call("POST", "/api/admin/products", { name_hi: "बी का आटा", name_en: "B Atta", category_id: cats[0].id, variants: [{ label: "1 kg", price: "50", stock: 10 }] });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const C = w.jar();
  const bStore = (await C.call("GET", "/api/store", undefined, { shop: slug })).body;
  const aStore = (await C.call("GET", "/api/store")).body;
  return { ...w, A, B, C, dev, bid, slug, recovery: s.body.recovery_key, bProduct: p.body.id, bVar: bStore.products[0].variants[0], aVar: aStore.products[0].variants[0] };
}


const J = b => typeof b === "string" ? JSON.parse(b) : b;
const rdSite = f => readFileSync(join(here, "..", "site", f), "utf8");
const pushSub = id => { const e = createECDH("prime256v1"); e.generateKeys(); return { endpoint: `https://push.test/dev/${id}`, keys: { p256dh: e.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url") } }; };


const S = rel => readFileSync(join(here, "..", "site", rel), "utf8");
async function loadImport(){ const g = globalThis; if (!g.AKImport) { await import(join(here, "..", "site", "kirana-catalog.js")); await import(join(here, "..", "site", "stock-import.js")); await import(join(here, "..", "site", "pdf-text.js")); } return g.AKImport; }
const cat = async () => { await loadImport(); return globalThis.AKCatalog; };
const stockOf = (t, vid) => t.one("SELECT stock FROM variants WHERE id=?", vid).stock;
const items3 = [
  { name_hi: "टाटा नमक", name_en: "Tata Salt", label: "1 kg", price: "28", stock: 12, category_hi: "नमक, चीनी, गुड़", category_en: "Salt, Sugar & Jaggery", icon: "🧂" },
  { name_hi: "पारले-जी बिस्कुट", name_en: "Parle-G Biscuit", label: "₹10", price: "10", mrp: "10", stock: 50, category_hi: "बिस्कुट और नमकीन", category_en: "Biscuits & Snacks", icon: "🍪" },
  { name_hi: "पारले-जी बिस्कुट", name_en: "Parle-G Biscuit", label: "₹5", price: "5", category_hi: "बिस्कुट और नमकीन", category_en: "Biscuits & Snacks" },
];

test("v10.7: ready list has ~300+ real items in categories, Hindi + English, NO prices; every page asset is self-hosted", async () => {
  const C = await cat();
  assert.ok(C.items.length >= 300 && C.items.length <= 450, "items: " + C.items.length);
  assert.ok(C.cats.length >= 10);
  const keys = new Set(C.cats.map(c => c.k));
  for (const it of C.items) { assert.equal(it.length, 4, JSON.stringify(it)); assert.ok(keys.has(it[0])); assert.ok(it[1] && it[2] && it[3]); assert.match(it[2], /[\u0900-\u097F]/, "Hindi name: " + it[1]); }
  assert.ok(!/price|"₹\d+\.\d|paise/i.test(JSON.stringify(C.items).replace(/"₹\d+( sachet)?"/g, "")), "no prices in the list (₹ pack sizes like ₹10 are sizes)");
  for (const c of ["atta", "oil", "masale", "salt", "snacks", "bev", "dairy", "personal", "cleaning"]) assert.ok(keys.has(c), c);
  const html = S("admin.html"); assert.ok(!/https?:\/\/(?!apnadhanda)/.test(html.replace(/<meta[^>]*>/g, "")), "no CDN in admin.html");
  for (const f of ["kirana-catalog.js", "stock-import.js", "pdf-text.js"]) assert.ok(!/https?:\/\//.test(S(f)), f + " has no external URL");
});

test("v10.7: catalog bulk add — adds all, auto-creates categories, skips items already in the shop, never double-adds on a double submit; money in paise", async () => {
  const t = await twoShops(); const { B } = t;
  const k = idem();
  const r1 = await B.call("POST", "/api/admin/stock/bulk", { idempotency_key: k, items: items3 });
  assert.equal(r1.status, 201, JSON.stringify(r1.body)); assert.equal(r1.body.added, 3); assert.equal(r1.body.categories_created, 2); assert.equal(r1.body.products_created, 2);
  // the SAME submit again (double tap / retry) → nothing new
  const r2 = await B.call("POST", "/api/admin/stock/bulk", { idempotency_key: k, items: items3 });
  assert.equal(r2.status, 200); assert.equal(r2.body.duplicate, true); assert.equal(r2.body.added, 3);
  // a NEW submit of the same items → all skipped as already added
  const r3 = await B.call("POST", "/api/admin/stock/bulk", { idempotency_key: idem(), items: [...items3, { name_en: "Tata Salt", label: "1kg", price: 30 }] });
  assert.equal(r3.status, 201); assert.equal(r3.body.added, 0); assert.equal(r3.body.skipped.length, 4); assert.ok(r3.body.skipped.every(s => s.reason === "already_added"), JSON.stringify(r3.body.skipped));
  const rows = t.sql("SELECT p.name_hi, p.name_en, p.active, v.label, v.price_paise, v.mrp_paise, v.stock, v.low_stock, c.name_hi AS cat FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE v.shop_id=? AND p.name_en IN ('Tata Salt','Parle-G Biscuit') ORDER BY v.id", t.bid);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.price_paise), [2800, 1000, 500], "paise"); assert.equal(rows[1].mrp_paise, 1000);
  assert.deepEqual(rows.map(r => r.stock), [12, 50, 0]); assert.ok(rows.every(r => r.low_stock === 5), "shop default limit 5");
  assert.equal(rows[0].cat, "नमक, चीनी, गुड़");
  assert.equal(t.one("SELECT COUNT(DISTINCT product_id) AS n FROM variants WHERE shop_id=? AND product_id IN (SELECT id FROM products WHERE name_en='Parle-G Biscuit')", t.bid).n, 1, "two sizes of one item → one product with 2 sizes");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM stock_log WHERE shop_id=? AND kind='new'", t.bid).n, 2, "opening stock is in the stock register");
  // they show in B's storefront, not in shop #1's
  const sb = (await t.C.call("GET", "/api/store", undefined, { shop: t.slug })).body; assert.ok(sb.products.some(p => p.name_en === "Tata Salt"));
  const sa = (await t.C.call("GET", "/api/store")).body; assert.ok(!sa.products.some(p => p.name_en === "Tata Salt"));
  // a row without a price is refused (nothing saved), MRP below price refused
  const bad = await B.call("POST", "/api/admin/stock/bulk", { idempotency_key: idem(), items: [{ name_en: "Sugar", label: "1 kg", price: "" }, { name_en: "Rice", label: "1 kg", price: 60, mrp: 50 }] });
  assert.equal(bad.status, 400); assert.equal(bad.body.rows.length, 2); assert.equal(t.one("SELECT COUNT(*) AS n FROM products WHERE shop_id=? AND name_en IN ('Sugar','Rice')", t.bid).n, 0);
  // concurrent double submit with one key → exactly one apply
  const k2 = idem(); const two = [{ name_en: "Rin Bar", name_hi: "रिन बार", label: "250 g", price: 20, stock: 3 }];
  const [a, b] = await Promise.all([B.call("POST", "/api/admin/stock/bulk", { idempotency_key: k2, items: two }), B.call("POST", "/api/admin/stock/bulk", { idempotency_key: k2, items: two })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]); assert.equal(t.one("SELECT COUNT(*) AS n FROM products WHERE name_en='Rin Bar'").n, 1);
  // header rules
  assert.equal((await t.C.call("POST", "/api/admin/stock/bulk", { idempotency_key: idem(), items: items3 })).status, 401);
});

test("v10.7: import parser — pasted text lines (English + Hindi), CSV, xlsx and a text PDF → preview rows; bad rows flagged", async () => {
  const I = await loadImport();
  const L = s => I.parseLine(s);
  let r = L("Chawal 1kg 60"); assert.equal(r.name, "Chawal"); assert.equal(r.size, "1kg"); assert.equal(r.price, 60); assert.equal(r.stock, null); assert.ok(r.ok); assert.equal(r.cat, "atta");
  r = L("Dal 1kg - 120 - 20 pcs"); assert.equal(r.name, "Dal"); assert.equal(r.size, "1kg"); assert.equal(r.price, 120); assert.equal(r.stock, 20);
  r = L("Parle-G ₹10 x50"); assert.equal(r.name, "Parle-G"); assert.equal(r.price, 10); assert.equal(r.stock, 50); assert.equal(r.cat, "snacks");
  r = L("चावल 1 किलो ₹60 स्टॉक 25"); assert.equal(r.name, "चावल"); assert.equal(r.size, "1 किलो"); assert.equal(r.price, 60); assert.equal(r.stock, 25); assert.equal(r.name_hi, "चावल");
  r = L("तूर दाल २ किलो २४०"); assert.equal(r.size, "2 किलो"); assert.equal(r.price, 240);
  r = L("Eggs 6 pcs 42"); assert.equal(r.size, "6 pcs"); assert.equal(r.price, 42);
  r = L("Tata Salt, 1kg, 28, 15"); assert.equal(r.name, "Tata Salt"); assert.equal(r.price, 28); assert.equal(r.stock, 15); assert.equal(r.name_hi, "टाटा नमक", "Hindi name filled from the ready list");
  r = L("5 Star ₹10"); assert.equal(r.name, "5 Star"); assert.equal(r.price, 10);
  r = L("Surf Excel 1kg MRP 140 rate 130 qty 6"); assert.equal(r.price, 130); assert.equal(r.mrp, 140); assert.equal(r.stock, 6); assert.equal(r.cat, "cleaning");
  r = L("Haldi powder 200g"); assert.equal(r.ok, false); assert.equal(r.why, "price", "no price → flagged");
  assert.equal(L("   "), null); assert.equal(L("Name, Size, Price"), null);
  const many = I.parseText("1. Chawal 1kg 60\n• Dal 1kg - 120 - 20 pcs\n\nParle-G ₹10 x50\nkuch bhi"); assert.equal(many.length, 4); assert.equal(many.filter(x => x.ok).length, 3);
  // CSV (with a header, Hindi, ₹, quotes)
  const csv = 'Item,Size,Price,MRP,Stock\n"Aashirvaad Atta",5 kg,₹245,260,8\nमूंग दाल,500 g,75,,12\nBroken row,,,,\n';
  const cr = I.fromTable(I.parseCSV(csv)); assert.equal(cr.length, 3);
  assert.deepEqual([cr[0].name, cr[0].size, cr[0].price, cr[0].mrp, cr[0].stock], ["Aashirvaad Atta", "5 kg", 245, 260, 8]);
  assert.equal(cr[1].name_hi, "मूंग दाल"); assert.equal(cr[1].price, 75); assert.equal(cr[2].ok, false);
  // the app's own exported CSV format re-imports too
  const own = I.fromTable(I.parseCSV("category_hi,category_en,name_hi,name_en,brand,pack_size,sku,price,mrp,stock,low_stock,featured,active\nमसाले,Spices,हल्दी,Haldi,,200 g,,40.00,,10,3,0,1"));
  assert.equal(own[0].name_hi, "हल्दी"); assert.equal(own[0].size, "200 g"); assert.equal(own[0].price, 40); assert.equal(own[0].stock, 10);
  // xlsx (real Excel file made by a spreadsheet library, shared strings + numbers)
  const xb = readFileSync(join(here, "fixtures", "stock-list.xlsx")); const xr = (await I.parseFile("stock-list.xlsx", xb.buffer.slice(xb.byteOffset, xb.byteOffset + xb.byteLength))).rows;
  assert.equal(xr.length, 4, JSON.stringify(xr)); assert.deepEqual([xr[0].name, xr[0].size, xr[0].price, xr[0].stock], ["Fortune Soyabean Oil", "1 L", 155, 10]);
  assert.equal(xr[1].name_hi, "चीनी"); assert.equal(xr[1].price, 44.5); assert.equal(xr[3].ok, false, "row without price flagged");
  // text PDF (made by Chrome "Save as PDF") → lines → rows
  const pb = readFileSync(join(here, "fixtures", "stock-list.pdf")); const pr = await I.parseFile("stock-list.pdf", pb.buffer.slice(pb.byteOffset, pb.byteOffset + pb.byteLength));
  assert.ok(!pr.error, pr.error); const okNames = pr.rows.filter(x => x.ok).map(x => x.name);
  for (const n of ["Basmati Rice", "Tata Salt", "Maggi Noodles"]) assert.ok(okNames.includes(n), n + " in " + JSON.stringify(pr.rows.map(x => x.raw)));
  assert.equal(pr.rows.find(x => x.name === "Tata Salt").price, 28);
  // a scanned/photo PDF (no text inside) → honest error
  const scan = readFileSync(join(here, "fixtures", "scanned.pdf")); const sr = await I.parseFile("scan.pdf", scan.buffer.slice(scan.byteOffset, scan.byteOffset + scan.byteLength));
  assert.equal(sr.error, "scanned");
  assert.equal((await I.parseFile("x.xls", new ArrayBuffer(4))).error, "old_xls");
});

test("v10.7: import confirm — new rows added, duplicates detected, 'update instead' adds stock / changes price of the existing item; nothing without confirm", async () => {
  const t = await twoShops(); const { B } = t;
  const I = await loadImport();
  const rows = I.parseText("Basmati Rice 1kg 110 x 20\nबी का आटा 1 kg 55 x 5\nTata Salt 1kg 28");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM products WHERE shop_id=?", t.bid).n, 1, "parsing saves nothing");
  // client-side duplicate check against the shop's own catalog (same key rule as the server)
  const catB = (await B.call("GET", "/api/admin/catalog")).body; const existing = catB.products.flatMap(p => p.variants.map(v => ({ key: I.nn(p.name_hi) + "|" + v.label.replace(/\s+/g, "").toLowerCase(), vid: v.id })));
  const dup = rows.find(r => existing.some(e => e.key === I.nn(r.name_hi) + "|" + r.size.replace(/\s+/g, "").toLowerCase())); assert.ok(dup, "बी का आटा 1 kg is detected as already in the shop");
  const vid = t.bVar.id; const before = stockOf(t, vid);
  const send = { idempotency_key: idem(), source: "import", items: rows.filter(r => r !== dup).map(r => ({ name_hi: r.name_hi, name_en: r.name_en, label: r.size, price: r.price, stock: r.stock })), updates: [{ variant_id: vid, add_stock: dup.stock, price: dup.price }] };
  const r = await B.call("POST", "/api/admin/stock/bulk", send); assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.added, 2); assert.equal(r.body.updated, 1);
  assert.equal(stockOf(t, vid), before + 5); assert.equal(t.one("SELECT price_paise FROM variants WHERE id=?", vid).price_paise, 5500, "price updated, in paise");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM products WHERE shop_id=? AND name_hi='बी का आटा'", t.bid).n, 1, "no duplicate item created");
  assert.equal(t.one("SELECT qty FROM stock_log WHERE variant_id=? AND kind='in'", vid).qty, 5);
  // the server ALSO refuses to create a duplicate if the client sends it as new
  const r2 = await B.call("POST", "/api/admin/stock/bulk", { idempotency_key: idem(), items: [{ name_hi: "बी का आटा", label: "1kg", price: 50 }] });
  assert.equal(r2.body.added, 0); assert.equal(r2.body.skipped[0].reason, "already_added");
  // updating another shop's item is refused
  const r3 = await B.call("POST", "/api/admin/stock/bulk", { idempotency_key: idem(), updates: [{ variant_id: t.aVar.id, add_stock: 5 }] });
  assert.equal(r3.status, 404); 
});

test("v10.7: stock in — +qty for one or many items, a register entry with date/qty/note, exactly once per key; items can be filled while hidden", async () => {
  const t = await twoShops(); const { B } = t;
  await B.call("POST", "/api/admin/stock/bulk", { idempotency_key: idem(), items: [{ name_en: "Sugar", name_hi: "चीनी", label: "1 kg", price: 44, stock: 0, show: false }] });
  const sugar = t.one("SELECT v.id, p.id AS pid, p.active FROM variants v JOIN products p ON p.id=v.product_id WHERE p.name_en='Sugar' AND v.shop_id=?", t.bid);
  assert.equal(sugar.active, 0, "hidden from the shop (Dukaan me dikhao = off)");
  const st0 = (await B.call("GET", "/api/admin/stock")).body; assert.equal(st0.items.find(x => x.vid === sugar.id).show, false); assert.equal(st0.default_low, 5);
  assert.ok(!(await t.C.call("GET", "/api/store", undefined, { shop: t.slug })).body.products.some(p => p.name_en === "Sugar"), "customers don't see it");
  const k = idem(); const body = { idempotency_key: k, note: "Mandi se maal aaya", items: [{ variant_id: sugar.id, qty: 25 }, { variant_id: t.bVar.id, qty: 10 }] };
  const r = await B.call("POST", "/api/admin/stock/in", body); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(stockOf(t, sugar.id), 25); assert.equal(stockOf(t, t.bVar.id), 20);
  const again = await B.call("POST", "/api/admin/stock/in", body); assert.equal(again.body.duplicate, true); assert.equal(stockOf(t, sugar.id), 25, "double submit → once");
  const log = (await B.call("GET", "/api/admin/stock/log")).body.log; const e = log.find(x => x.variant_id === sugar.id && x.kind === "in");
  assert.equal(e.qty, 25); assert.equal(e.before_qty, 0); assert.equal(e.after_qty, 25); assert.equal(e.note, "Mandi se maal aaya"); assert.ok(e.created_at > Date.now() - 60000);
  // show it in the shop now
  assert.equal((await B.call("POST", "/api/admin/stock/show", { product_id: sugar.pid, show: true })).status, 200);
  assert.ok((await t.C.call("GET", "/api/store", undefined, { shop: t.slug })).body.products.some(p => p.name_en === "Sugar"));
  // validation: qty 0 / negative refused; per-item limit + shop default
  assert.equal((await B.call("POST", "/api/admin/stock/in", { idempotency_key: idem(), items: [{ variant_id: sugar.id, qty: 0 }] })).status, 400);
  assert.equal((await B.call("POST", "/api/admin/stock/limit", { variant_id: sugar.id, low_stock: 8 })).body.low_stock, 8);
  assert.equal((await B.call("POST", "/api/admin/stock/limit", { default_low: 7 })).body.default_low, 7);
  assert.equal((await B.call("GET", "/api/admin/stock")).body.default_low, 7);
});

test("v10.7: low-stock alert fires ONCE when an order crosses the limit (🔔 panel + push with +10/+20), re-arms after a restock above the limit", async () => {
  const t = await twoShops(); const { B, C, env } = t;
  // B's item: stock 10, limit 3 (old default) → set limit 5
  const vid = t.bVar.id; await B.call("POST", "/api/admin/stock/limit", { variant_id: vid, low_stock: 5 });
  // a shopkeeper device subscribed for alerts
  assert.equal((await B.call("POST", "/api/admin/push/subscribe", { subscription: pushSub("b-phone") })).status, 200);
  const pushes0 = env.sent.length;
  const ord = q => C.call("POST", "/api/orders", { ...cust, items: [{ variant_id: vid, qty: q }], payment_method: "cod", idempotency_key: idem() }, { shop: t.slug });
  assert.equal((await ord(4)).status, 201); // 10 → 6 : above the limit, no alert
  assert.equal(t.one("SELECT COUNT(*) AS n FROM stock_alerts WHERE shop_id=?", t.bid).n, 0);
  assert.equal((await ord(2)).status, 201); // 6 → 4 : crossed (≤5) → ONE alert
  assert.equal(t.one("SELECT COUNT(*) AS n FROM stock_alerts WHERE shop_id=?", t.bid).n, 1);
  const stockPushes = () => t.one("SELECT COUNT(*) AS n FROM notification_attempts WHERE event='stock:low' AND shop_id=?", t.bid).n;
  assert.equal(stockPushes(), 1, "one web push to the shop's device"); assert.ok(env.sent.length > pushes0);
  const att = t.one("SELECT event, outcome FROM notification_attempts WHERE event='stock:low' ORDER BY id DESC LIMIT 1"); assert.equal(att.outcome, "accepted");
  assert.equal((await ord(1)).status, 201); // 4 → 3 : still low → NO second alert
  assert.equal(t.one("SELECT COUNT(*) AS n FROM stock_alerts WHERE shop_id=?", t.bid).n, 1, "no spam");
  assert.equal(stockPushes(), 1);
  // the alert in the 🔔 panel: type stock, what's left, unread
  const n = (await B.call("GET", "/api/admin/notifications")).body; const a = n.items.find(x => x.type === "stock");
  assert.ok(a, JSON.stringify(n.items.map(x => x.type))); assert.equal(a.meta.variant_id, vid); assert.equal(a.meta.stock, 4); assert.equal(a.read, false); assert.ok(n.unread >= 1); assert.match(a.body, /4/);
  // shop #1 sees nothing of it
  assert.ok(!(await t.A.call("GET", "/api/admin/notifications")).body.items.some(x => x.type === "stock"));
  // mark read works for stock alerts
  const u = await B.call("POST", "/api/admin/notifications/read", { ids: [a.id] }); assert.equal(u.body.unread, n.unread - 1);
  // restock above the limit → re-armed, alert marked fixed
  await B.call("POST", "/api/admin/stock/in", { idempotency_key: idem(), items: [{ variant_id: vid, qty: 10 }] }); // 3 → 13
  assert.equal(t.one("SELECT low_alerted FROM variants WHERE id=?", vid).low_alerted, 0);
  assert.ok(t.one("SELECT cleared_at FROM stock_alerts WHERE shop_id=?", t.bid).cleared_at > 0);
  assert.equal((await ord(9)).status, 201); // 13 → 4 → alert again (new crossing)
  assert.equal(t.one("SELECT COUNT(*) AS n FROM stock_alerts WHERE shop_id=?", t.bid).n, 2);
  // a manual edit (product form) that sets stock low also alerts once
  const p = (await B.call("GET", "/api/admin/catalog")).body.products.find(x => x.id === t.bProduct);
  await B.call("POST", "/api/admin/stock/in", { idempotency_key: idem(), items: [{ variant_id: vid, qty: 20 }] }); // 4 → 24, re-armed
  await B.call("PUT", "/api/admin/products/" + t.bProduct, { ...p, variants: p.variants.map(v => ({ ...v, price: v.price_paise / 100, stock: 2, low_stock: 5 })) });
  assert.equal(stockOf(t, vid), 2); assert.equal(t.one("SELECT COUNT(*) AS n FROM stock_alerts WHERE shop_id=?", t.bid).n, 3);
  // cancelling an order puts stock back and re-arms when above the limit
  const o = await ord(1); const oid = t.one("SELECT id FROM orders WHERE code=?", o.body.order.code).id; // 2 → 1
  await B.call("POST", `/api/admin/orders/${oid}/status`, { status: "rejected", from: "pending", reason: "test" });
  assert.equal(stockOf(t, vid), 2);
});

test("v10.7: one-tap restock from the alert (+10 / +20) — exactly once per alert+qty, deep link in the push, shop-scoped", async () => {
  const t = await twoShops(); const { B, C } = t; const vid = t.bVar.id;
  await B.call("POST", "/api/admin/stock/limit", { variant_id: vid, low_stock: 5 });
  await C.call("POST", "/api/orders", { ...cust, items: [{ variant_id: vid, qty: 7 }], payment_method: "cod", idempotency_key: idem() }, { shop: t.slug }); // 10 → 3
  const al = t.one("SELECT id FROM stock_alerts WHERE shop_id=? AND variant_id=?", t.bid, vid); assert.ok(al);
  const r = await B.call("POST", "/api/admin/stock/restock", { alert_id: al.id, qty: 10 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.items[0].before, 3); assert.equal(r.body.items[0].stock, 13); assert.equal(stockOf(t, vid), 13);
  const r2 = await B.call("POST", "/api/admin/stock/restock", { alert_id: al.id, qty: 10 }); assert.equal(r2.body.duplicate, true); assert.equal(stockOf(t, vid), 13, "the same tap twice adds once");
  assert.equal(t.one("SELECT read_at IS NOT NULL AS r FROM stock_alerts WHERE id=?", al.id).r, 1);
  assert.equal(t.one("SELECT kind FROM stock_log WHERE variant_id=? ORDER BY id DESC LIMIT 1", vid).kind, "restock");
  // by variant (Stock tab +10 / +20 buttons) needs an idempotency key
  assert.equal((await B.call("POST", "/api/admin/stock/restock", { variant_id: vid, qty: 20 })).status, 400);
  const k = idem(); await B.call("POST", "/api/admin/stock/restock", { variant_id: vid, qty: 20, idempotency_key: k }); await B.call("POST", "/api/admin/stock/restock", { variant_id: vid, qty: 20, idempotency_key: k });
  assert.equal(stockOf(t, vid), 33);
  // shop #1 can't restock B's alert or B's item
  assert.equal((await t.A.call("POST", "/api/admin/stock/restock", { alert_id: al.id, qty: 10 })).status, 404);
  assert.equal((await t.A.call("POST", "/api/admin/stock/restock", { variant_id: vid, qty: 10, idempotency_key: idem() })).status, 404);
  assert.equal(stockOf(t, vid), 33);
  // the service worker opens the action's deep link
  const sw = S("sw.js"); assert.match(sw, /e\.action && dd\.acts && dd\.acts\[e\.action\]/); assert.match(sw, /actions:/);
  const adm = S("admin.js"); assert.match(adm, /#restock=/); assert.match(adm, /\/api\/admin\/stock\/restock/);
});

test("v10.7: shop isolation — a shop can't see, add to, hide, re-limit or log another shop's items or stock", async () => {
  const t = await twoShops(); const { A, B } = t; const bv = t.bVar.id, av = t.aVar.id;
  const sb = (await B.call("GET", "/api/admin/stock")).body; assert.ok(sb.items.every(x => x.vid !== av)); assert.ok(sb.items.some(x => x.vid === bv));
  const sa = (await A.call("GET", "/api/admin/stock")).body; assert.ok(sa.items.every(x => x.vid !== bv));
  const before = stockOf(t, av);
  assert.equal((await B.call("POST", "/api/admin/stock/in", { idempotency_key: idem(), items: [{ variant_id: av, qty: 5 }] })).status, 404);
  assert.equal((await B.call("POST", "/api/admin/stock/in", { idempotency_key: idem(), items: [{ variant_id: bv, qty: 5 }, { variant_id: av, qty: 5 }] })).status, 404, "mixed list refused as a whole");
  assert.equal(stockOf(t, av), before); assert.equal(stockOf(t, bv), 10);
  assert.equal((await B.call("POST", "/api/admin/stock/limit", { variant_id: av, low_stock: 50 })).status, 404);
  assert.equal((await B.call("POST", "/api/admin/stock/show", { product_id: t.aVar.product_id || t.one("SELECT product_id FROM variants WHERE id=?", av).product_id, show: false })).status, 404);
  assert.equal(t.one("SELECT active FROM products WHERE id=(SELECT product_id FROM variants WHERE id=?)", av).active, 1);
  await A.call("POST", "/api/admin/stock/in", { idempotency_key: idem(), note: "A only", items: [{ variant_id: av, qty: 1 }] });
  assert.ok(!(await B.call("GET", "/api/admin/stock/log")).body.log.some(x => x.note === "A only"));
  assert.equal((await B.call("GET", "/api/admin/stock/log?vid=" + av)).body.log.length, 0);
  // the same idempotency key in two shops does not collide
  const k = idem(); await A.call("POST", "/api/admin/stock/in", { idempotency_key: k, items: [{ variant_id: av, qty: 1 }] });
  const rb = await B.call("POST", "/api/admin/stock/in", { idempotency_key: k, items: [{ variant_id: bv, qty: 1 }] }); assert.equal(rb.body.duplicate, false); assert.equal(stockOf(t, bv), 11);
  // the developer deleting shop B removes its stock register, alerts and bulk keys
  const typed = t.one("SELECT slug FROM shops WHERE id=?", t.bid).slug;
  const del = await t.dev.call("POST", "/api/dev/shops/delete", { shop_id: t.bid, confirm: typed });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  for (const tb of ["stock_log", "stock_alerts", "bulk_ops"]) assert.equal(t.one(`SELECT COUNT(*) AS n FROM ${tb} WHERE shop_id=?`, t.bid).n, 0, tb);
});

test("v10.7: dashboard ⚠️ X items kam count; Stock tab in /admin; additive migration", async () => {
  const t = await twoShops(); const { B } = t;
  await B.call("POST", "/api/admin/stock/limit", { variant_id: t.bVar.id, low_stock: 10 });
  const d = (await B.call("GET", "/api/admin/dashboard")).body; assert.equal(d.low_count, 1);
  assert.equal((await t.A.call("GET", "/api/admin/dashboard")).body.low_count >= 0, true);
  const html = S("admin.html"); assert.match(html, /data-tab="stock"/); assert.match(S("admin.js"), /stockView/);
  const w = S("_worker.mjs"); const mig = w.slice(w.indexOf("// v10.7: 📦 STOCK"), w.indexOf("];", w.indexOf("// v10.7: 📦 STOCK")));
  assert.ok(!/DROP|DELETE|UPDATE |RENAME/i.test(mig), "migration is additive only");
  assert.ok(t.one("SELECT MAX(v) AS v FROM schema_version").v >= 11); // v10.8 adds one more
});
