// v10.16.1 speed pass 2 tests (header kept from v10.15.2): the owner Today screen's dashboard (and the orders list, reports, store, state) answer EXACTLY what 10.15.1 answered,
// in far fewer D1 round trips (each costs ~100 ms on live). The 10.15.1 worker is kept as a fixture and run on the same database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createHash, pbkdf2Sync, createECDH } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";
import { withSecrets } from "./secrets-helper.mjs";

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
  writeFileSync(f, src); return withSecrets((await import(f)).default, {setupKey: TEST_KEY, devSeed: {username: DEV_USER, salt, hash}});
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

const nowless = o => { const c = JSON.parse(JSON.stringify(o)); delete c.now; delete c.version; return c; };

test("v10.16.1: 🔔 notifications, subscription and both developer overviews answer exactly what 10.15.1 answered (same database)", async () => {
  const { t, k, sal } = await richWorld();
  // a plan ending in 2 days: the panel's lazy reminder writes a notice on the first read (the new worker reads again after writing)
  t.DB._sql.prepare(`UPDATE shops SET trial_end=? WHERE id=?`).run(Date.now() + 2 * 86400000 - 3600000, k.id);
  const fresh = (await k.J.call("GET", "/api/admin/notifications")).body;
  assert.ok(fresh.items.some(n => n.type === "due"), "the reminder written in this request is in the answer: " + JSON.stringify(fresh.items.map(n => n.type)));
  const old = await world(t.DB, await loadWorker(OLD));
  for (const s of [k, sal]) {
    const O = old.jar({ ip: "3.3.3.3" }); assert.equal((await O.call("POST", "/api/admin/login", { username: s.mobile, password: "shoppass1" })).status, 200);
    for (const p of ["/api/admin/notifications", "/api/admin/subscription"]) { const a = await O.call("GET", p), b = await s.J.call("GET", p);
      assert.equal(b.status, 200, p); assert.deepEqual(b.body, a.body, s.slug + " " + p); assert.deepEqual(Object.keys(b.body), Object.keys(a.body), "key order " + p); }
    const a = await old.jar().call("GET", "/api/store", undefined, { shop: s.slug }), b = await t.jar().call("GET", "/api/store?shop=" + s.slug);
    assert.equal(b.status, 200); assert.deepEqual(b.body, a.body, "store by ?shop= = store by header: " + s.slug);
  }
  const OD = old.jar({ ip: "5.5.5.5" }); assert.equal((await OD.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  for (const p of ["/api/dev/overview", "/api/dev/god/overview"]) { const a = await OD.call("GET", p), b = await t.dev.call("GET", p);
    assert.equal(b.status, 200, p); assert.deepEqual(nowless(b.body), nowless(a.body), p); assert.deepEqual(Object.keys(b.body), Object.keys(a.body), "key order " + p); }
});

test("v10.16.1: 🔔 notifications, subscription and the developer overviews are each ONE batched read after login", async () => {
  const { t, k } = await richWorld();
  const { c, DB } = counted(t.DB); const w = await world(DB, t.worker);
  const J = w.jar({ ip: "4.4.4.4" }); assert.equal((await J.call("POST", "/api/admin/login", { username: k.mobile, password: "shoppass1" })).status, 200);
  await J.call("GET", "/api/admin/notifications"); await J.call("GET", "/api/admin/subscription"); // warm
  const base = async p => { c.n = 0; c.batches = []; assert.equal((await J.call("GET", p)).status, 200, p); return {n: c.n, b: c.batches.slice()}; };
  const login = await base("/api/admin/state"); // login check + state, for scale
  const n1 = await base("/api/admin/notifications"), s1 = await base("/api/admin/subscription");
  assert.ok(n1.n <= 6, `notifications used ${n1.n} D1 calls (10.15.3: 10)`); assert.ok(n1.b.some(x => x >= 6), "one batch of 6 reads: " + n1.b);
  assert.ok(s1.n <= 6, `subscription used ${s1.n} D1 calls (10.15.3: 9)`); assert.ok(s1.b.some(x => x >= 5), "one batch of 5 reads: " + s1.b);
  const D = w.jar({ ip: "6.6.6.6" }); assert.equal((await D.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  await D.call("GET", "/api/dev/overview"); await D.call("GET", "/api/dev/god/overview");
  for (const [p, k2] of [["/api/dev/overview", 6], ["/api/dev/god/overview", 6]]) { c.n = 0; c.batches = []; assert.equal((await D.call("GET", p)).status, 200);
    assert.ok(c.n <= 6, `${p} used ${c.n} D1 calls`); assert.ok(c.batches.some(x => x >= k2), p + " one batch: " + c.batches); }
  assert.ok(login.n >= 1);
});

test("v10.16.1: the shop page preloads its data; the main-page intro never holds the buttons; new always-versioned files are cached a year", async () => {
  const t = await base(); const k = await t.shop("Preload Kirana", "kirana"); const sal = await t.shop("Preload Salon", "salon");
  for (const s of [k, sal]) { const h = (await t.jar().call("GET", "/s/" + s.slug)).body;
    assert.ok(h.includes(`<link rel="preload" href="/api/store?shop=${s.slug}" as="fetch" crossorigin>`), "preload on /s/" + s.slug);
    assert.ok(!(await t.jar().call("GET", "/s/" + s.slug + "/info")).body.includes("rel=\"preload\" href=\"/api/store"), "no preload on the info page"); }
  const cm = S("common.js"); assert.match(cm, /path === "\/api\/store" && o\.method === "GET" && SHOP\.slug && !opts\.headers\) path = "\/api\/store\?shop=" \+ encodeURIComponent\(SHOP\.slug\)/);
  const i2 = S("intro2.js"); assert.match(i2, /e\.target\.closest\("#lfSkip"\) \|\| e\.target\.closest\("#lfIntro"\)/); assert.match(i2, /setTimeout\(out, reduce \? 700 : 1050\)/);
  assert.match(S("landing2.css"), /html\.lf-intro-out \.lf-intro\{pointer-events:none\}/);
  const hd = S("_headers"); for (const f of ["landing2.css", "landing2.js", "intro2.js", "salon.css", "salon.js", "god-as.js"]) assert.match(hd, new RegExp(`\\n/${f.replace(".", "\\.")}\\n  Cache-Control: public, max-age=31536000, immutable`), f);
  for (const f of ["qr.js", "appicon.js", "kirana-catalog.js", "sw.js"]) assert.ok(!new RegExp(`\\n/${f.replace(".", "\\.")}\\n`).test(hd), f + " is loaded without ?v and must not be cached a year");
  const home = (await t.jar().call("GET", "/")).body; assert.match(home, /intro2\.js\?v=10\.16\.\d+-2/); assert.match(home, /landing2\.css\?v=10\.16\.\d+-2/);
});
