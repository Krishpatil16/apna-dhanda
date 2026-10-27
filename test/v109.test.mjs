// v10.9 tests: 📊 Dukaan wise (shop_events: shopkeeper login/logout + customer visits; dev report) and the free 🧾 bill → shopkeeper's own WhatsApp. Helpers copied from the v10.8.1 tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createHash, pbkdf2Sync, createECDH, createHmac, createDecipheriv, randomBytes } from "node:crypto";
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
    PUSH_FETCH: async (endpoint, init) => { sent.push({endpoint, body: Buffer.from(init.body)}); return new Response("", {status: 201}); }, PUSH_EXTRA_HOSTS: "push.test" } };
}
async function world(DB = makeD1(), worker = null){
  worker = worker || await loadWorker(); const env = makeEnv(DB);
  const jar = (dflt = {}) => { let cookie = "";
    const call = async (method, path, body, headers = {}) => {
      headers = {...dflt, ...headers};
      const h = { "cf-connecting-ip": headers.ip || "1.1.1.1" };
      if (headers.shop) h["x-shop"] = headers.shop; if (headers.ua) h["user-agent"] = headers.ua;
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
const S = rel => readFileSync(join(here, "..", "site", rel), "utf8");
const stockOf = (t, vid) => t.one("SELECT stock FROM variants WHERE id=?", vid).stock;
// shop B gets 3 items (atta 50, dal 120, chawal 60) and a customer order: 2× atta + 1× dal + 1× chawal
async function shopWithOrder(){
  const t = await twoShops(); const { B, C, slug } = t;
  const cat = (await B.call("GET", "/api/admin/catalog")).body.categories[0].id;
  for (const [hi, en, price, stock] of [["दाल", "Dal", "120", 10], ["चावल", "Chawal", "60", 10], ["बासमती", "Basmati", "90", 5]])
    assert.equal((await B.call("POST", "/api/admin/products", { name_hi: hi, name_en: en, category_id: cat, variants: [{ label: "1 kg", price, stock }] })).status, 201);
  const store = (await C.call("GET", "/api/store", undefined, { shop: slug })).body;
  const v = n => store.products.find(p => p.name_en === n).variants[0];
  const atta = v("B Atta"), dal = v("Dal"), chawal = v("Chawal"), basmati = v("Basmati");
  const r = await C.call("POST", "/api/orders", { ...cust, items: [{ variant_id: atta.id, qty: 2 }, { variant_id: dal.id, qty: 1 }, { variant_id: chawal.id, qty: 1 }], payment_method: "cod", idempotency_key: idem() }, { shop: slug });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const oid = t.one("SELECT id FROM orders WHERE code=?", r.body.order.code).id;
  const items = t.sql("SELECT * FROM order_items WHERE order_id=? ORDER BY id", oid);
  return { ...t, atta, dal, chawal, basmati, code: r.body.order.code, token: r.body.token, oid, items };
}
const st = (B, oid, status, from, extra = {}) => B.call("POST", `/api/admin/orders/${oid}/status`, { status, from, ...extra });



const MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const DESK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const ev = (t, sid, kind) => t.sql(`SELECT * FROM shop_events WHERE shop_id=? AND kind=? ORDER BY id`, sid, kind);
const DID = n => (n + "0123456789abcdef0123").slice(0, 24).replace(/[^a-z0-9]/gi, "x");
const visit = (c, slug, did, name, ip = "1.1.1.1") => c.call("POST", "/api/visit", { did, name }, { shop: slug, ip });
const b64u = b => Buffer.from(b).toString("base64url");
function fakeSubscription(id){ const ecdh = createECDH("prime256v1"); ecdh.generateKeys(); const auth = randomBytes(16);
  return { ecdh, auth, json: { endpoint: `https://push.test/send/${id}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } }; }
function decrypt(body, sub){ // RFC 8291 (same as push-offers.test.mjs)
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
  const prkKey = createHmac("sha256", sub.auth).update(sub.ecdh.computeSecret(asPub)).digest();
  const ikm = createHmac("sha256", prkKey).update(Buffer.concat([Buffer.from("WebPush: info\0"), sub.ecdh.getPublicKey(), asPub, Buffer.from([1])])).digest();
  const prk = createHmac("sha256", salt).update(ikm).digest();
  const cek = createHmac("sha256", prk).update(Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).digest().subarray(0, 16);
  const nonce = createHmac("sha256", prk).update(Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).digest().subarray(0, 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]); let end = plain.length - 1; while (end >= 0 && plain[end] === 0) end--;
  return JSON.parse(plain.subarray(0, end).toString("utf8"));
}

test("v10.9 📊 migration: additive — shop_events table + (shop_id, ts) index; schema v14; old tables untouched", async () => {
  const t = await twoShops();
  assert.equal(t.one("SELECT MAX(v) AS v FROM schema_version").v, 19);
  assert.deepEqual(t.sql("PRAGMA table_info(shop_events)").map(c => c.name), ["id", "shop_id", "kind", "ts", "meta"]);
  const idx = t.sql("PRAGMA index_list(shop_events)").map(i => i.name); assert.ok(idx.includes("shop_events_shop_ts"));
  assert.deepEqual(t.sql("PRAGMA index_info(shop_events_shop_ts)").map(c => c.name), ["shop_id", "ts"]);
  const W = S("_worker.mjs"); const mig = W.slice(W.indexOf("// v10.9: 📊 Dukaan wise — shopkeeper login"), W.indexOf("// v10.11:", W.indexOf("// v10.9: 📊 Dukaan wise — shopkeeper login")));
  assert.ok(mig.length > 0 && !/\b(DROP|DELETE|UPDATE|ALTER)\b/i.test(mig), "v10.9 migration is CREATE-only");
  assert.ok(t.sql("PRAGMA table_info(orders)").some(c => c.name === "packed")); // earlier columns still there
});

test("v10.9 📊 event logging: shopkeeper login (device from UA), logout button, and session expiry each become one shop_events row; no IP/phone in meta", async () => {
  const t = await twoShops(); const B2 = t.jar();
  assert.equal((await B2.call("POST", "/api/admin/login", { username: "9123456780", password: "bshoppass1" }, { ua: MOBILE_UA, ip: "9.9.9.9" })).status, 200);
  let L = ev(t, t.bid, "admin_login"); assert.equal(L.length, 1); assert.deepEqual(JSON.parse(L[0].meta), { dev: "mobile" });
  assert.equal((await B2.call("POST", "/api/admin/logout", {}, { ua: MOBILE_UA })).status, 200);
  let O = ev(t, t.bid, "admin_logout"); assert.equal(O.length, 1); assert.deepEqual(JSON.parse(O[0].meta), { dev: "mobile", how: "button" });
  // a wrong password is not a login
  assert.equal((await t.jar().call("POST", "/api/admin/login", { username: "9123456780", password: "wrongpass99" })).status, 401);
  assert.equal(ev(t, t.bid, "admin_login").length, 1);
  // desktop login, then the session runs out → counted once as logout (how: expired)
  const B3 = t.jar(); assert.equal((await B3.call("POST", "/api/admin/login", { username: "9123456780", password: "bshoppass1" }, { ua: DESK_UA })).status, 200);
  assert.equal(JSON.parse(ev(t, t.bid, "admin_login")[1].meta).dev, "desktop");
  t.DB._sql.prepare("UPDATE sessions SET expires_at=? WHERE admin_id IN (SELECT id FROM admins WHERE shop_id=?)").run(Date.now() - 1000, t.bid);
  assert.equal((await B3.call("GET", "/api/admin/dashboard")).status, 401);
  assert.equal((await B3.call("GET", "/api/admin/dashboard")).status, 401);
  O = ev(t, t.bid, "admin_logout"); assert.equal(O.length, 2); assert.deepEqual(JSON.parse(O[1].meta), { how: "expired" });
  // an expired session swept at someone's next login is also counted (once)
  const B4 = t.jar(); await B4.call("POST", "/api/admin/login", { username: "9123456780", password: "bshoppass1" });
  t.DB._sql.prepare("UPDATE sessions SET expires_at=? WHERE admin_id IN (SELECT id FROM admins WHERE shop_id=?)").run(Date.now() - 1000, t.bid);
  await t.jar().call("POST", "/api/admin/login", { username: "bhaiya", password: "strongpass1" });
  assert.equal(ev(t, t.bid, "admin_logout").length, 4, "B4's + the sign-up session (t.B) both ran out → 2 more"); assert.equal(ev(t, 1, "admin_login").length, 1, "shop #1's login is its own");
  for (const r of t.sql("SELECT meta FROM shop_events")) { assert.ok(!/9\.9\.9\.9|1\.1\.1\.1|9123456780|\d{6,}/.test(r.meta), r.meta); }
});

test("v10.9 📊 visit throttle: once per device per shop per 30 min; name kept (phone digits stripped); bad device id refused; per-IP rate limit", async () => {
  const t = await twoShops(); const { C, slug, bid } = t;
  let r = await visit(C, slug, DID("a"), "Ramesh 9876543210"); assert.equal(r.status, 200); assert.equal(r.body.recorded, true);
  r = await visit(C, slug, DID("a"), "Ramesh"); assert.equal(r.body.recorded, false, "same phone again within 30 min");
  assert.equal(ev(t, bid, "cust_visit").length, 1); assert.deepEqual(JSON.parse(ev(t, bid, "cust_visit")[0].meta), { d: DID("a"), n: "Ramesh" });
  r = await visit(C, slug, DID("b"), ""); assert.equal(r.body.recorded, true); assert.deepEqual(JSON.parse(ev(t, bid, "cust_visit")[1].meta), { d: DID("b") });
  t.DB._sql.prepare("UPDATE shop_events SET ts=ts-? WHERE kind='cust_visit'").run(31 * 60000); // 31 min later
  r = await visit(C, slug, DID("a"), "Ramesh"); assert.equal(r.body.recorded, true);
  assert.equal(ev(t, bid, "cust_visit").length, 3);
  for (const bad of ["", "short", "x".repeat(41), "not-hex-ok!!!!!!!!!!"]) assert.equal((await visit(C, slug, bad, "")).status, 400, bad);
  assert.equal((await C.call("POST", "/api/visit", { did: DID("z") }, { shop: "no-such-shop" })).status, 404);
  // per-IP limit (30 per 10 min per isolate) → 429, nothing written past it
  const before = t.one("SELECT COUNT(*) AS n FROM shop_events").n; let ok = 0, limited = 0;
  for (let i = 0; i < 32; i++) { const x = await visit(C, slug, "d" + String(i).padStart(20, "0"), "", "7.7.7.7"); if (x.status === 200) ok++; else if (x.status === 429) limited++; }
  assert.equal(ok, 30); assert.equal(limited, 2); assert.equal(t.one("SELECT COUNT(*) AS n FROM shop_events").n, before + 30);
  // the page fires it without waiting (fire-and-forget, keepalive, no cookies)
  const app = S("app.js"); assert.match(app, /setTimeout\(visitBeacon, 0\)/); assert.match(app, /keepalive: true, credentials: "omit"/); assert.match(app, /\.catch\(\(\) => \{\}\)/);
});

test("v10.9 📊 shop isolation: the slug decides the shop; the same phone visiting two shops counts once in each; a body shop_id is ignored", async () => {
  const t = await twoShops(); const { C, slug, bid } = t;
  assert.equal((await C.call("POST", "/api/visit", { did: DID("s"), name: "Sita", shop_id: 1 }, { shop: slug })).body.recorded, true);
  assert.equal((await C.call("POST", "/api/visit", { did: DID("s"), name: "Sita" })).body.recorded, true, "shop #1 (root) is a different shop → its own visit");
  assert.equal(ev(t, bid, "cust_visit").length, 1); assert.equal(ev(t, 1, "cust_visit").length, 1);
  const r = (await t.dev.call("GET", `/api/dev/dukaan/${bid}?range=today`)).body;
  assert.deepEqual(r.customers.map(c => c.name), ["Sita"]);
  const a = (await t.dev.call("GET", `/api/dev/dukaan/1?range=today`)).body; assert.deepEqual(a.customers.map(c => c.name), ["Sita"]);
  const rep = (await t.dev.call("GET", "/api/dev/dukaan?range=today")).body;
  assert.equal(rep.shops.find(s => s.id === bid).visits, 1); assert.equal(rep.shops.find(s => s.id === 1).visits, 1);
  // deleting a shop removes its events too
  assert.equal((await t.dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: slug })).status, 200);
  assert.equal(ev(t, bid, "cust_visit").length, 0); assert.equal(ev(t, 1, "cust_visit").length, 1);
});

test("v10.9 📊 report numbers on a seeded TEST dataset: orders, Kamai (delivered only, paise), logins, distinct customers (name, else device), visits, IST ranges, sort", async () => {
  const t = await twoShops(); const { B, C, slug, bid, bVar, aVar } = t; const X = t.DB._sql;
  const place = async (shop, v, name, qty = 1) => (await C.call("POST", "/api/orders", { ...cust, name, items: [{ variant_id: v.id, qty }], payment_method: "cod", idempotency_key: idem() }, shop ? { shop } : {})).body.order.code;
  const b1 = await place(slug, bVar, "Ramesh", 2), b2 = await place(slug, bVar, "ramesh "), b3 = await place(slug, bVar, "Mohan"), b4 = await place(slug, bVar, "Old Customer"), bt = await place(slug, bVar, "TEST order");
  const a1 = await place(null, aVar, "Gita");
  const set = (code, sql, ...a) => X.prepare(`UPDATE orders SET ${sql} WHERE code=?`).run(...a, code);
  set(b1, "status='delivered'"); set(b2, "status='delivered'"); set(b3, "status='cancelled'"); set(bt, "is_test=1, status='delivered'");
  set(b4, "status='delivered', created_at=?", Date.now() - 10 * 864e5); // 10 days ago: in 30 din + Sab, not in 7 din
  const tot = c => X.prepare("SELECT total_paise AS p FROM orders WHERE code=?").get(c).p;
  // visits: Ramesh's phone (named), one phone without a name, Sita (named, no order)
  await visit(C, slug, DID("r"), "Ramesh"); await visit(C, slug, DID("n"), ""); await visit(C, slug, DID("s"), "Sita");
  // shopkeeper B: 2 logins, 1 logout
  const K = t.jar(); await K.call("POST", "/api/admin/login", { username: "9123456780", password: "bshoppass1" }, { ua: MOBILE_UA }); await K.call("POST", "/api/admin/logout", {});
  await K.call("POST", "/api/admin/login", { username: "9123456780", password: "bshoppass1" }, { ua: DESK_UA });
  const get = async range => (await t.dev.call("GET", `/api/dev/dukaan?range=${range}`)).body;
  let r = await get("7d"); assert.equal(r.range, "7d");
  let b = r.shops.find(s => s.id === bid), a = r.shops.find(s => s.id === 1);
  assert.equal(r.shops[0].id, bid, "sorted by orders, highest first");
  assert.equal(b.orders, 3, "3 real orders in 7 days (test order + 10-day-old order excluded)"); assert.equal(b.delivered, 2);
  assert.equal(b.kamai_paise, tot(b1) + tot(b2), "Kamai = delivered only, in paise");
  assert.equal(b.logins, 2); assert.equal(b.logouts, 1); assert.ok(b.last_login > Date.now() - 60000);
  assert.equal(b.visits, 3); assert.equal(b.customers, 4, "Ramesh (order+visit, same name) · Mohan · Sita · 1 unnamed phone");
  assert.equal(a.orders, 1); assert.equal(a.kamai_paise, 0); assert.equal(a.customers, 1); assert.equal(a.logins, 0);
  r = await get("30d"); b = r.shops.find(s => s.id === bid); assert.equal(b.orders, 4); assert.equal(b.kamai_paise, tot(b1) + tot(b2) + tot(b4)); assert.equal(b.customers, 5);
  r = await get("all"); assert.equal(r.shops.find(s => s.id === bid).orders, 4); assert.equal(r.from, 0);
  r = await get("today"); b = r.shops.find(s => s.id === bid); assert.equal(b.orders, 3);
  // IST day: "today" starts at IST midnight
  const d = new Date(Date.now() + 330 * 60000); assert.equal(r.from, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 330 * 60000); assert.equal(r.to - r.from, 864e5);
  assert.match(r.note, /counts start 25 Oct/);
  // detail: customers with order counts + last visit; logins with device
  const det = (await t.dev.call("GET", `/api/dev/dukaan/${bid}?range=7d`)).body;
  const ram = det.customers.find(c => c.name.toLowerCase() === "ramesh"); assert.equal(ram.orders, 2); assert.equal(ram.visits, 1); assert.ok(ram.last_visit);
  assert.equal(det.customers.find(c => c.name === "Mohan").orders, 1); assert.equal(det.customers.find(c => c.name === "Sita").orders, 0);
  assert.deepEqual(det.anonymous.devices, 1); assert.equal(det.anonymous.visits, 1);
  assert.deepEqual(det.logins.map(x => [x.kind, x.device, x.how]), [["login", "desktop", null], ["logout", "desktop", "button"], ["login", "mobile", null]]);
  assert.equal(JSON.stringify(det).includes("98765"), false, "no customer phone numbers in the report");
  assert.equal((await t.dev.call("GET", "/api/dev/dukaan/999999?range=7d")).status, 404);
});

test("v10.9 📊 dev auth required on the report endpoints (no login → 401, a shopkeeper login → 403)", async () => {
  const t = await twoShops();
  for (const p of ["/api/dev/dukaan?range=7d", `/api/dev/dukaan/${t.bid}`]) {
    assert.equal((await t.jar().call("GET", p)).status, 401, p);
    assert.equal((await t.B.call("GET", p)).status, 403, p);
    assert.equal((await t.C.call("GET", p)).status, 401, p);
    assert.equal((await t.dev.call("GET", p)).status, 200, p);
  }
  const html = S("dev.html"), js = S("dev.js");
  assert.match(html, /data-for="logs"[\s\S]*?data-tab="dukaan">📊 (?:Dukaan wise|Shop-wise)[\s\S]*?data-tab="health"/, "first in Logs");
  assert.match(js, /logs: "dukaan"/); for (const l of ["Today", "7 days", "30 days", "All", "Login/visit counts start 25 Oct"]) assert.ok(js.includes(l), l); // v10.11: English labels
});

test("v10.9 🧾 new-order push: order ID + total in the title, customer name in the text, tap opens the bill", async () => {
  const t = await twoShops(); const sub = fakeSubscription("b1");
  assert.equal((await t.B.call("POST", "/api/admin/push/subscribe", { subscription: sub.json })).status, 200);
  const r = await t.C.call("POST", "/api/orders", { ...cust, name: "रमेश कुमार", items: [{ variant_id: t.bVar.id, qty: 2 }], payment_method: "cod", idempotency_key: idem() }, { shop: t.slug });
  assert.equal(r.status, 201); const code = r.body.order.code; const oid = t.one("SELECT id FROM orders WHERE code=?", code).id;
  const msg = t.env.sent.filter(s => s.endpoint === sub.json.endpoint); assert.equal(msg.length, 1);
  const pl = decrypt(msg[0].body, sub);
  assert.ok(pl.title.includes(code)); assert.ok(pl.title.includes("₹100")); assert.ok(pl.body.includes("रमेश कुमार")); assert.equal(pl.url, `/admin#bill=${oid}`);
  const adm = S("admin.js"); assert.match(adm, /#\(order\|bill\)=/); assert.match(adm, /openPendingBill\(\)/);
});

test("v10.9 🧾 bill → 📲 Mere WhatsApp pe bhejo: wa.me/91<shop's own mobile> with the bill text, Hindi encoded correctly; shop-isolated", async () => {
  const t = await twoShops();
  const r = await t.C.call("POST", "/api/orders", { ...cust, name: "रमेश", items: [{ variant_id: t.bVar.id, qty: 2 }], payment_method: "cod", idempotency_key: idem() }, { shop: t.slug });
  const code = r.body.order.code; const o = t.one("SELECT id, created_at FROM orders WHERE code=?", code);
  const bill = (await t.B.call("GET", `/api/admin/orders/${o.id}/bill`)).body;
  const ws = bill.wa_self; assert.equal(ws.mobile, "9123456780");
  const u = new URL(ws.url); assert.equal(u.origin + u.pathname, "https://wa.me/919123456780");
  assert.equal(ws.url, "https://wa.me/919123456780?text=" + encodeURIComponent(ws.text));
  assert.equal(u.searchParams.get("text"), ws.text, "decodes back to exactly the bill text");
  assert.ok(ws.url.includes(encodeURIComponent("बी का आटा")) && ws.url.includes("%E0%A4%AC%E0%A5%80"), "Hindi as UTF-8 percent-escapes");
  assert.ok(!/[\u0900-\u097F ]/.test(ws.url.split("?text=")[1]), "no raw Hindi or spaces in the link");
  const lines = ws.text.split("\n");
  assert.equal(lines[0], `🧾 Order ${code}`);
  const d = new Date(o.created_at + 330 * 60000); assert.ok(lines[1].startsWith(`📅 ${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}, `), lines[1]);
  assert.match(lines[1], /\d{1,2}:\d{2} (AM|PM)$/);
  assert.equal(lines[2], "👤 रमेश · 9876543210");
  assert.ok(ws.text.includes("• बी का आटा 1 kg × 2 = ₹100")); assert.ok(ws.text.endsWith("💰 Total: ₹100"));
  // the bill page keeps its other buttons and adds this one only when the link exists
  const adm = S("admin.js"); for (const id of ['id="bPrint"', 'id="bShare"', 'id="bWa"', 'id="bWaSelf"']) assert.ok(adm.includes(id), id);
  assert.ok(adm.includes("मेरे WhatsApp पर भेजें") || adm.includes("Send to my WhatsApp"));
  // another shop can't read this bill
  assert.equal((await t.A.call("GET", `/api/admin/orders/${o.id}/bill`)).status, 404);
  assert.equal((await t.C.call("GET", `/api/admin/orders/${o.id}/bill`)).status, 401);
});
