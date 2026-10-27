// v10.15.1 QA-fix tests (night audit of every window). Harness copied from v1015-godmode. Old line: (Krish 26 Oct 11:30–11:39 PM). Master catalogue, optional shop prices, name-only booking,
// no price/cart/payment UI on the salon customer page, kirana unchanged, existing salon rows untouched. Harness copied from v10131.
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




const store = async (t, slug) => (await t.jar().call("GET", "/api/store", undefined, { shop: slug })).body;
const book = (c, slug, services, extra = {}) => c.call("POST", "/api/orders", { name: "TEST Raju", services, idempotency_key: idem(), ...extra }, { shop: slug });


import { randomBytes } from "node:crypto";
function fakeSub(id){ const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  return { endpoint: `https://push.test/send/${id}`, keys: { p256dh: Buffer.from(ecdh.getPublicKey()).toString("base64url"), auth: randomBytes(16).toString("base64url") } }; }

test("v10.15.1: the /shops/<type> list has no \"I'm a shopkeeper\" button either", async () => {
  const t = await base(); await t.shop("Gupta Kirana", "kirana");
  const html = S("shops-list.html"); assert.ok(!/id="toShop"|I'm a shopkeeper|मैं दुकानदार/.test(html));
  const r = await t.jar().call("GET", "/shops/kirana"); assert.ok([200, 302].includes(r.status)); assert.ok(!/toShop|I'm a shopkeeper/.test(String(r.body)));
});

test("v10.15.1: unknown pages and wrong shop links get the friendly bilingual not-found card; files and APIs keep a plain 404", async () => {
  const t = await base();
  const pg = await t.jar().call("GET", "/kuch-bhi-galat", undefined, {}); // no Accept header → plain
  assert.equal(pg.status, 404);
  const w = t.worker, env = t.env.e;
  const r = await w.fetch(new Request("https://k.test/kuch-bhi-galat", {headers: {accept: "text/html,application/xhtml+xml"}}), env);
  assert.equal(r.status, 404); const h = await r.text();
  assert.match(h, /Page not found/); assert.match(h, /यह पेज नहीं मिला/); assert.match(h, /href="\/shops"/); assert.match(h, /href="\/"/); assert.ok(!/<script/i.test(h));
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  const f = await w.fetch(new Request("https://k.test/nope.png", {headers: {accept: "text/html"}}), env); assert.equal(f.status, 404); assert.ok(!/Page not found/.test(await f.text()));
  const a = await t.jar().call("GET", "/api/nope"); assert.equal(a.status, 404); assert.equal(typeof a.body, "object");
  const s = await w.fetch(new Request("https://k.test/s/no-such-shop", {headers: {accept: "text/html"}}), env);
  assert.equal(s.status, 404); const sh = await s.text(); assert.match(sh, /Shop not found/); assert.match(sh, /दुकान नहीं मिली/);
});

test("v10.15.1: salon visits are counted again and the salon report counts bookings, completed, visits and value at the shop's prices", async () => {
  const t = await base(); const s = await t.shop("Shine Salon", "salon");
  assert.match(S("salon.js"), /function visitBeacon\(\)/); assert.match(S("salon.js"), /fetch\("\/api\/visit"/); assert.match(S("salon.js"), /renderGroups\(\); paintCount\(\); visitBeacon\(\);/);
  for (let i = 0; i < 3; i++) assert.equal((await t.jar({ip: "5.5.5." + i}).call("POST", "/api/visit", {did: "d" + i + "aaaaaaaaaaaaaaaaaa"}, {shop: s.slug})).status, 200);
  assert.equal((await s.J.call("PUT", "/api/admin/salon-services", {key: "haircut", price: "150"})).status, 200);
  const b = await t.jar({ip: "6.6.6.1"}).call("POST", "/api/orders", {name: "Raju", services: ["haircut", "shave"], source: "walkin", idempotency_key: idem()}, {shop: s.slug});
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const id = t.one("SELECT id FROM orders WHERE code=?", b.body.order.code).id;
  assert.equal((await s.J.call("POST", `/api/admin/orders/${id}/status`, {status: "accepted", from: "pending"})).status, 200);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${id}/status`, {status: "delivered", from: "accepted"})).status, 200);
  const r = (await s.J.call("GET", "/api/admin/reports?range=today")).body;
  assert.equal(r.visits, 3); assert.equal(r.bookings, 1); assert.equal(r.delivered.orders, 1); assert.equal(r.svc_value_paise, 15000);
  assert.ok(r.best_sellers.some(x => x.name_en === "Haircut"));
  const ad = S("admin.js"); assert.match(ad, /if \(shopType\(\) === "salon"\) \{/); assert.match(ad, /"Top services"/); assert.match(ad, /"At your prices"/);
});

test("v10.15.1: an AUTO-accepted online booking sends \"Booking accepted\" once, when the customer first turns alerts on", async () => {
  const t = await base(); const s = await t.shop("Shine Salon", "salon");
  assert.equal((await s.J.call("PUT", "/api/admin/settings", {auto_accept: true})).status, 200);
  const b = await t.jar({ip: "6.6.6.2"}).call("POST", "/api/orders", {name: "Raju", services: ["haircut"], idempotency_key: idem()}, {shop: s.slug});
  assert.equal(b.status, 201); assert.ok(b.body.order.token_no != null || t.one("SELECT token_no FROM orders WHERE code=?", b.body.order.code).token_no != null);
  const sub = fakeSub("auto1");
  const p1 = await t.jar({ip: "7.7.7.1"}).call("POST", "/api/push/order", {code: b.body.order.code, token: b.body.token, subscription: sub});
  assert.equal(p1.status, 200); assert.equal(p1.body.accepted_push, true);
  const ev = () => t.sql("SELECT event FROM notification_attempts WHERE event='queue:accepted'").length;
  assert.equal(ev(), 1);
  const p2 = await t.jar({ip: "7.7.7.1"}).call("POST", "/api/push/order", {code: b.body.order.code, token: b.body.token, subscription: sub});
  assert.equal(p2.body.accepted_push, false); assert.equal(ev(), 1);
  // a request still waiting for the salon (auto-accept OFF) gets nothing yet
  assert.equal((await s.J.call("PUT", "/api/admin/settings", {auto_accept: false})).status, 200);
  const w = await t.jar({ip: "6.6.6.3"}).call("POST", "/api/orders", {name: "Mohan", services: ["shave"], idempotency_key: idem()}, {shop: s.slug});
  const p3 = await t.jar({ip: "7.7.7.2"}).call("POST", "/api/push/order", {code: w.body.order.code, token: w.body.token, subscription: fakeSub("wait1")});
  assert.equal(p3.body.accepted_push, false); assert.equal(ev(), 1);
});

test("v10.15.1: the Hindi shop name is not pre-filled with the English signup name, and an empty Hindi name falls back to English", async () => {
  const t = await base(); const k = await t.shop("Sumit Store", "kirana");
  const r = await k.J.call("PUT", "/api/admin/settings", {store_name_hi: "", store_name_en: "Sumit Store"}); assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = (await k.J.call("GET", "/api/admin/dashboard")).body.settings;
  assert.equal(s.store_name_hi, "Sumit Store");
  assert.equal((await k.J.call("PUT", "/api/admin/settings", {store_name_hi: "", store_name_en: ""})).status, 400);
  const ad = S("admin.js"); assert.match(ad, /hiSame \? "" : s\.store_name_hi/); assert.match(ad, /Leave it empty to use the English name/);
});

test("v10.15.1: salon wording — Cancel booking, singular service, booking-system type card, no dead Offers/Categories, God Mode 'Waiting' queue card", () => {
  const tr = S("track.js"); assert.match(tr, /"Cancel booking"/); assert.match(tr, /o\.item_count === 1 \? "service" : "services"/); assert.ok(!/L\("टोकन", "Token"\) \$\{dayTxt\}/.test(tr));
  const ad = S("admin.js"); assert.match(ad, /"Booking system · services"/); assert.ok(!/booking soon/.test(ad)); assert.match(ad, /isSvc\(\) && shopType\(\) !== "salon" \? `<div class="a-card set-tools">/);
  assert.match(ad, /L\("सूचना पट्टी \(English\)","Notice bar \(English\)"\)/);
  const g = S("god.js"); assert.match(g, /⏳ Waiting/); assert.match(g, /✂️ Start/);
  const css = S("god.css"); assert.match(css, /body\.god \.seg button\[aria-current=true\]/); assert.match(css, /body\.god \.pill\.active\{color:#86efac/);
});

test("v10.16.0: the approved landing2 page is the live main page; /?preview=landing2 still serves it", async () => {
  const t = await base();
  const live = String((await t.jar().call("GET", "/")).body), pv = await t.jar().call("GET", "/?preview=landing2");
  assert.equal(pv.status, 200); const h = String(pv.body);
  for (const page of [live, h]) for (const s of ["landing2.css", "intro2.js", "landing2.js", 'class="lf2-chips"', 'class="lf2-types"', 'class="lf2-amb"', "Book a slot", "बुकिंग", 'href="/shops"', 'href="/admin"']) assert.ok(page.includes(s), s);
  assert.ok(!/<script src="\/intro\.js/.test(live)); assert.ok(!/<script src="\/intro\.js/.test(h));
  assert.ok(!live.includes('name="robots" content="noindex"'), "live / must be indexable"); assert.ok(h.includes('name="robots" content="noindex"'));
  assert.equal(live, h.replace('<meta name="robots" content="noindex">', ""), "/ = the preview page, minus noindex");
  const i2 = S("intro2.js"); assert.ok(!/seen && !force/.test(i2)); assert.match(i2, /setTimeout\(out, reduce \? 700 : 1050\)/);
  const c2 = S("landing2.css"); assert.match(c2, /prefers-reduced-motion:reduce/); assert.ok(!/purple|#8b5cf6|#7c3aed/i.test(c2));
  assert.equal(String((await t.jar().call("GET", "/?preview=other")).body), live);
});

test("v10.15.1: owner screens that load slowly don't crash when the owner taps to another screen; 'My orders' back link keeps the shop", async () => {
  const a = S("admin.js");
  assert.match(a, /await loadOrders\((pre)?\);\n\s*if \(!\$\("#reqBox"\)\) return;/); // v10.15.2: Today passes its early orders request
  assert.match(a, /if \(!\$\("#hist"\)\) return;/);
  assert.match(a, /if \(!\$\("#rbody"\)\) return;/);
  const tr = S("track.js"); assert.ok(!tr.includes('<a href="/track">'), "bare /track back link"); assert.match(tr, /<a href="\/track\$\{esc\(location\.search\)\}">/);
});
