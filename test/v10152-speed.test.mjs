// v10.15.2 speed pass tests: the owner Today screen's dashboard (and the orders list, reports, store, state) answer EXACTLY what 10.15.1 answered,
// in far fewer D1 round trips (each costs ~100 ms on live). The 10.15.1 worker is kept as a fixture and run on the same database.
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
function makeEnv(DB){ // v10.15: ASSETS serves the real site files, so old and new workers render the same pages

  const sent = [];
  return { sent, e: { DB, ASSETS: { fetch: async r => { const pth = new URL(r.url).pathname; try { return new Response(readFileSync(join(here, "..", "site", pth)), {headers: {"content-type": pth.endsWith(".html") ? "text/html" : "text/plain"}}); } catch { return new Response("Not found", {status: 404}); } } },
    PUSH_FETCH: async (endpoint, init) => { sent.push({endpoint}); return new Response("", {status: 201}); }, PUSH_EXTRA_HOSTS: "push.test" } };
}
async function world(DB = makeD1(), worker = null){
  worker = worker || await loadWorker(); const env = makeEnv(DB);
  const jar = (dflt = {}) => { const ck = new Map(); // v10.15: keeps every cookie (dev + maintenance bypass)
    const call = async (method, path, body, headers = {}) => {
      headers = {...dflt, ...headers};
      const h = { "cf-connecting-ip": headers.ip || "1.1.1.1" };
      if (headers.shop) h["x-shop"] = headers.shop;
      if (body !== undefined) h["content-type"] = "application/json";
      if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
      if (method !== "GET" && path.startsWith("/api/dev/")) h["x-requested-with"] = "kirana-dev";
      if (headers.token) h["x-order-token"] = headers.token;
      if (ck.size) h.cookie = [...ck].map(([k, v]) => k + "=" + v).join("; ");
      const r = await worker.fetch(new Request("https://k.test" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env.e);
      for (const sc of (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean))) { const [kv] = sc.split(";"); const q = kv.indexOf("="); const k = kv.slice(0, q), v = kv.slice(q + 1); if (!v || /Max-Age=0/i.test(sc)) ck.delete(k); else ck.set(k, v); }
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

const S = f => readFileSync(join(here, "..", "site", f), "utf8");
// shop #1 (setup key) + developer + helper to sign up an approved shop of a given type
async function base(){
  const w = await world();
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  await A.call("PUT", "/api/admin/settings", { open_time: "00:00", close_time: "00:00", phone: "9876500011" });
  const dev = w.jar(); assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  let n = 0;
  const shop = async (name, type, { approve = true, online = true, ip } = {}) => {
    const J = w.jar({ ip: ip || ("2.2.2." + (++n)) }); const mobile = "91234567" + String(10 + n).slice(-2);
    const body = { owner_name: "Owner " + n, shop_name: name, mobile, password: "shoppass1" }; if (type !== undefined) body.shop_type = type;
    const s = await J.call("POST", "/api/admin/signup", body); assert.equal(s.status, 201, JSON.stringify(s.body));
    if (approve) assert.equal((await dev.call("POST", "/api/dev/service", { shop_id: s.body.shop.id, action: "approve" })).status, 200);
    if (approve && online) assert.equal((await J.call("POST", "/api/admin/online", { online: true })).status, 200);
    await J.call("PUT", "/api/admin/settings", { open_time: "00:00", close_time: "00:00", phone: mobile });
    return { J, id: s.body.shop.id, slug: s.body.shop.slug, signup: s.body, mobile };
  };
  const item = async (J, price = "120", label = "Full plate", stock = 20) => { const p = await J.call("POST", "/api/admin/products", { name_hi: "थाली", name_en: "Thali", variants: [{ label, price, stock }] }); assert.equal(p.status, 201, JSON.stringify(p.body)); };
  return { ...w, A, dev, shop, item };
}




const OLD = join(here, "fixtures", "worker-10.15.1.mjs");
// counts D1 calls (each = one round trip on live); a batch is one call
function counted(DB){ const c = {n: 0, batches: []};
  const wrap = s => new Proxy(s, { get(o, k){ if (k === "bind") return (...a) => wrap(o.bind(...a)); if (["first", "all", "run", "raw"].includes(k)) return (...a) => { c.n++; return o[k](...a); }; const v = o[k]; return typeof v === "function" ? v.bind(o) : v; } });
  return { c, DB: { prepare: q => wrap(DB.prepare(q)), batch: st => { c.n++; c.batches.push(st.length); return DB.batch(st); }, exec: q => DB.exec(q), _sql: DB._sql } }; }

async function richWorld(){
  const t = await base();
  const k = await t.shop("Speed Kirana", "kirana"); await t.item(k.J, "120"); await t.item(k.J, "40", "Half plate", 2);
  const sal = await t.shop("Speed Salon", "salon"); await sal.J.call("PUT", "/api/admin/salon-services", { key: "haircut", price: "150" });
  const vars = (await k.J.call("GET", "/api/admin/catalog")).body.products.flatMap(p => p.variants);
  const C = t.jar({ ip: "7.7.7.7" });
  for (let i = 0; i < 4; i++) assert.equal((await order(C, k.slug, vars[i % vars.length])).status, 201);
  for (const n of ["Ravi", "Amit", "Sonu"]) assert.equal((await C.call("POST", "/api/orders", { name: n, services: ["haircut"], idempotency_key: idem() }, { shop: sal.slug })).status, 201);
  for (const s of [k, sal]) { const os = (await s.J.call("GET", "/api/admin/orders?status=all&q=")).body.orders.sort((a, b) => a.id - b.id);
    for (const st of ["accepted", "preparing", "ready", "out_for_delivery", "delivered"]) await s.J.call("POST", `/api/admin/orders/${os[0].id}/status`, { status: st });
    await s.J.call("POST", `/api/admin/orders/${os[1].id}/status`, { status: "rejected", reason: "busy" });
    await s.J.call("POST", `/api/admin/orders/${os[2].id}/status`, { status: "accepted" }); }
  return { t, k, sal };
}
const PATHS = ["/api/admin/dashboard", "/api/admin/orders?status=active&q=", "/api/admin/orders?status=all&q=", "/api/admin/reports", "/api/admin/reports?range=7d", "/api/admin/state"];

test("v10.15.2: dashboard, orders, reports, state and the customer store answer exactly what 10.15.1 answered (same database, kirana + salon)", async () => {
  const { t, k, sal } = await richWorld();
  const old = await world(t.DB, await loadWorker(OLD));
  for (const s of [k, sal]) {
    const O = old.jar({ ip: "3.3.3.3" }); assert.equal((await O.call("POST", "/api/admin/login", { username: s.mobile, password: "shoppass1" })).status, 200);
    for (const p of PATHS) { const a = await O.call("GET", p), b = await s.J.call("GET", p); assert.equal(b.status, 200, p); assert.deepEqual(b.body, a.body, s.slug + " " + p);
      assert.deepEqual(Object.keys(b.body), Object.keys(a.body), "same key order " + p); }
    const a = await old.jar().call("GET", "/api/store", undefined, { shop: s.slug }), b = await t.jar().call("GET", "/api/store", undefined, { shop: s.slug });
    assert.deepEqual(b.body, a.body, s.slug + " store"); assert.deepEqual(Object.keys(b.body), Object.keys(a.body));
  }
  const d = (await k.J.call("GET", "/api/admin/dashboard")).body; // the shape the Today screen reads
  for (const key of ["today", "counts", "best_sellers", "delivered_30d", "rating", "low_stock", "low_count", "dash", "demo_products", "latest_order_id", "settings", "shop_info", "service", "admin"]) assert.ok(key in d, key);
  assert.equal(d.delivered_30d.orders, 1); assert.ok(d.low_count >= 1); assert.equal(d.dash.active, 2); assert.equal(d.best_sellers.length, 1);
});

test("v10.15.2: the dashboard is ONE batched D1 read after login (was ~22 one-by-one); orders list and store are batched too", async () => {
  const { t, k } = await richWorld();
  const { c, DB } = counted(t.DB); const w = await world(DB, t.worker);
  const J = w.jar({ ip: "4.4.4.4" }); assert.equal((await J.call("POST", "/api/admin/login", { username: k.mobile, password: "shoppass1" })).status, 200);
  await J.call("GET", "/api/admin/dashboard"); // warm
  c.n = 0; c.batches = []; assert.equal((await J.call("GET", "/api/admin/dashboard")).status, 200);
  assert.ok(c.n <= 5, `dashboard used ${c.n} D1 calls`); assert.ok(c.batches.some(n => n >= 20), "one big read batch: " + c.batches);
  c.n = 0; assert.equal((await J.call("GET", "/api/admin/orders?status=all&q=")).status, 200); assert.ok(c.n <= 5, `orders used ${c.n} D1 calls`);
  c.n = 0; assert.equal((await J.call("GET", "/api/admin/reports")).status, 200); assert.ok(c.n <= 4, `reports used ${c.n} D1 calls`);
  // audit housekeeping still runs (after the answer)
  assert.match(S("_worker.mjs"), /await later\(ctx, \(\) => pruneAudit\(db\)\)/);
});

test("v10.15.2: Today asks for its active orders at the same time as the dashboard; changed static files are cache-busted", () => {
  const a = S("admin.js");
  assert.match(a, /async function todayView\(\)\{\n    const pre = activeOrders\(\);\n    try \{ await loadDash\(\);/);
  assert.match(a, /if \(isSvc\(\)\) return svcTodayView\(pre\);/); assert.equal((a.match(/await loadOrders\(pre\);/g) || []).length, 2);
  assert.match(a, /const activeOrders = \(\) => \{ const p = api\(`\/api\/admin\/orders\?\$\{new URLSearchParams\(\{status: "active", q: ""\}\)\}`\); p\.catch\(\(\) => \{\}\); return p; \};/);
  assert.match(S("admin.html"), /<script src="\/admin(?:-core)?\.js\?v=(?:10\.15\.[2-9]|10\.16\.\d+)(-\d+)?"><\/script>/);
});
