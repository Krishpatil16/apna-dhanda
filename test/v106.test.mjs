// v10.6 tests: live dev panel (pulse), dev push devices, dev activity feed (signup / UTR / plan ending / first order). Was: v10.5 tests: Dev, Dukaan (shopkeeper) and each shop's customer app are three separate installable apps — own manifest,
// own id + non-overlapping scope, own service-worker scope, path-scoped session cookies; /s/<slug> is always the storefront.
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

test("v10.6: /api/dev/pulse needs the dev login, is tiny, no-store, and changes after a new shop signs up", async () => {
  const t = await twoShops(); const { dev, A, B, C } = t;
  assert.equal((await C.call("GET", "/api/dev/pulse")).status, 401, "anonymous");
  assert.equal((await A.call("GET", "/api/dev/pulse")).status, 403, "shopkeeper #1");
  assert.equal((await B.call("GET", "/api/dev/pulse")).status, 403, "shopkeeper B");
  const p1 = await dev.call("GET", "/api/dev/pulse"); assert.equal(p1.status, 200);
  assert.equal(p1.headers.get("cache-control"), "no-store");
  assert.ok(JSON.stringify(p1.body).length < 700, "small payload: " + JSON.stringify(p1.body).length);
  for (const k of ["sig", "shops", "pay_verify", "orders_today", "errors", "notice_reads", "events"]) assert.ok(k in p1.body, k);
  assert.equal(p1.body.shops.waiting, 0); assert.deepEqual(p1.body.new, []);
  assert.equal((await dev.call("GET", "/api/dev/pulse")).body.sig, p1.body.sig, "nothing changed → same stamp");
  const N = t.jar(); const s = await N.call("POST", "/api/admin/signup", { owner_name: "Vijay", shop_name: "TEST Nayi Dukaan", mobile: "9000000001", password: "newshop123" }, { ip: "2.2.2.2" });
  assert.equal(s.status, 201);
  const p2 = (await dev.call("GET", "/api/dev/pulse?since=" + p1.body.events.last_id)).body;
  assert.notEqual(p2.sig, p1.body.sig); assert.equal(p2.shops.waiting, 1); assert.equal(p2.shops.total, p1.body.shops.total + 1);
  assert.equal(p2.new.length, 1); assert.equal(p2.new[0].kind, "signup"); assert.equal(p2.new[0].label, "TEST Nayi Dukaan"); assert.equal(p2.new[0].url, "/dev#waiting");
  assert.equal(p2.events.unread, p1.body.events.unread + 1);
  // first-ever event (empty feed, since=0) is still returned for the toast
  assert.ok((await dev.call("GET", "/api/dev/pulse?since=0")).body.new.length >= 1, "since=0 returns the first events"); assert.equal((await dev.call("GET", "/api/dev/pulse")).body.new.length, 0, "no since → baseline only");
  // the live poll is not counted in the hourly metrics (no D1 write per poll)
  const before = t.one("SELECT COALESCE(SUM(n),0) AS n FROM metrics WHERE k='dev'").n; await dev.call("GET", "/api/dev/pulse"); assert.equal(t.one("SELECT COALESCE(SUM(n),0) AS n FROM metrics WHERE k='dev'").n, before);
});

test("v10.6: dev push devices — subscribe (phone + laptop), list, test, unsubscribe; shops cannot", async () => {
  const t = await twoShops(); const { dev, B, C } = t;
  const phone = pushSub("phone"), laptop = pushSub("laptop");
  assert.equal((await B.call("POST", "/api/dev/push/subscribe", { subscription: phone }, { })).status, 403);
  assert.equal((await C.call("POST", "/api/dev/push/subscribe", { subscription: phone })).status, 401);
  const r1 = await dev.call("POST", "/api/dev/push/subscribe", { subscription: phone }); assert.equal(r1.status, 200); assert.equal(r1.body.devices, 1);
  const r2 = await dev.call("POST", "/api/dev/push/subscribe", { subscription: laptop }); assert.equal(r2.body.devices, 2);
  assert.equal((await dev.call("POST", "/api/dev/push/subscribe", { subscription: phone })).body.devices, 2, "same device again = no duplicate");
  assert.equal((await dev.call("POST", "/api/dev/push/subscribe", { subscription: { endpoint: "https://evil.example/x", keys: phone.keys } })).status, 400, "unknown push host refused");
  const list = (await dev.call("GET", "/api/dev/push")).body; assert.equal(list.devices.length, 2); assert.ok(list.public_key.length > 80);
  t.env.sent.length = 0;
  const tst = await dev.call("POST", "/api/dev/push/test", { endpoint: phone.endpoint }); assert.equal(tst.status, 200); assert.deepEqual(tst.body.results.map(x => x.outcome), ["accepted"]);
  assert.equal(t.env.sent.length, 1); assert.equal(t.env.sent[0].endpoint, phone.endpoint);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint LIKE 'https://push.test/dev/%'").n, 0, "dev devices are NOT shop push subscriptions");
  assert.equal((await dev.call("POST", "/api/dev/push/unsubscribe", { endpoint: phone.endpoint })).body.removed, 1);
  assert.equal((await dev.call("GET", "/api/dev/push")).body.devices.length, 1);
  assert.equal((await B.call("GET", "/api/dev/push")).status, 403);
});

test("v10.6: a new shop signup → dev feed event + a push attempt to every dev device; nothing secret in the push; no push to shops", async () => {
  const t = await twoShops(); const { dev } = t;
  await dev.call("POST", "/api/dev/push/subscribe", { subscription: pushSub("phone") }); await dev.call("POST", "/api/dev/push/subscribe", { subscription: pushSub("laptop") });
  t.env.sent.length = 0;
  // v10.13: a "TEST …" shop is recorded in the feed but never pushed to the developer's phone (live smoke tests stay silent)
  const Q = t.jar(); const ts = await Q.call("POST", "/api/admin/signup", { owner_name: "Test Kaka", shop_name: "TEST Quiet Store", mobile: "9000000077", password: "quietpass123" }, { ip: "3.3.3.4" });
  assert.equal(ts.status, 201); assert.ok(t.one("SELECT id FROM dev_events WHERE kind='signup' AND shop_id=?", ts.body.shop.id)); assert.equal(t.env.sent.length, 0, "no push for a TEST shop");
  const N = t.jar(); const s = await N.call("POST", "/api/admin/signup", { owner_name: "Ramu Kaka", shop_name: "Ramu Store", mobile: "9000000002", password: "ramupass123" }, { ip: "3.3.3.3" });
  assert.equal(s.status, 201);
  const ev = t.one("SELECT * FROM dev_events WHERE kind='signup' AND shop_id=?", s.body.shop.id);
  assert.ok(ev); assert.match(ev.title, /🆕 New shop registered: Ramu Store — please approve/); assert.equal(ev.url, "/dev#waiting"); assert.equal(ev.read_at, null);
  assert.deepEqual(t.env.sent.map(x => x.endpoint).sort(), ["https://push.test/dev/laptop", "https://push.test/dev/phone"]);
  const att = t.sql("SELECT * FROM notification_attempts WHERE role='dev' AND event='dev:signup'"); assert.equal(att.length, 2); assert.ok(att.every(a => a.outcome === "accepted"));
  for (const secret of ["9000000002", "ramupass123", s.body.recovery_key]) { assert.ok(!ev.title.includes(secret) && !ev.body.includes(secret), "no secret in the push: " + secret); }
  // the dev feed lists it; mark read works
  const feed = (await dev.call("GET", "/api/dev/events?limit=5")).body; assert.equal(feed.events[0].id, ev.id); assert.equal(feed.events[0].icon, "🆕"); assert.ok(feed.unread >= 1);
  assert.equal((await dev.call("POST", "/api/dev/events/read", { ids: [ev.id] })).body.marked, 1);
  assert.ok(t.one("SELECT read_at FROM dev_events WHERE id=?", ev.id).read_at > 0);
  await dev.call("POST", "/api/dev/events/read", { all: true }); assert.equal((await dev.call("GET", "/api/dev/pulse")).body.events.unread, 0);
  // no dev push device → the event is still in the feed, nothing is sent, nothing is logged against shop 0
  await dev.call("POST", "/api/dev/push/unsubscribe", { endpoint: "https://push.test/dev/phone" }); await dev.call("POST", "/api/dev/push/unsubscribe", { endpoint: "https://push.test/dev/laptop" });
  t.env.sent.length = 0;
  const s2 = await t.jar().call("POST", "/api/admin/signup", { owner_name: "X", shop_name: "TEST Second", mobile: "9000000003", password: "secondpass1" }, { ip: "4.4.4.4" });
  assert.equal(s2.status, 201); assert.equal(t.env.sent.length, 0); assert.ok(t.one("SELECT id FROM dev_events WHERE shop_id=?", s2.body.shop.id));
  // deleting a (TEST) shop removes its feed events
  assert.equal((await dev.call("POST", "/api/dev/shops/delete", { shop_id: s2.body.shop.id, confirm: "TEST Second" })).status, 200);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM dev_events WHERE shop_id=?", s2.body.shop.id).n, 0);
});

test("v10.6: a shopkeeper's UTR → dev event 'Payment aaya' (+ push), once per UTR; pulse shows a payment to verify", async () => {
  const t = await twoShops(); const { dev, B, bid } = t;
  await dev.call("POST", "/api/dev/platform", { upi_id: "krish@okaxis", upi_name: "Krish Patil" });
  await dev.call("POST", "/api/dev/push/subscribe", { subscription: pushSub("phone") });
  const bill = await dev.call("POST", `/api/dev/shops/${bid}/bill`, {}); assert.equal(bill.status, 200, JSON.stringify(bill.body));
  const sv = (await B.call("GET", "/api/admin/subscription")).body;
  const p0 = (await dev.call("GET", "/api/dev/pulse")).body;
  t.env.sent.length = 0;
  const pay = await B.call("POST", "/api/admin/subscription/pay", { invoice_id: sv.invoice.id, utr: "4123 5678 9012" }); assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const ev = t.sql("SELECT * FROM dev_events WHERE kind='utr'"); assert.equal(ev.length, 1);
  assert.equal(ev[0].shop_id, bid); assert.equal(ev[0].url, "/dev#payments"); assert.match(ev[0].title, /💰 Payment received: TEST – Sharma Kirana — ₹/); assert.ok(!ev[0].title.includes("412356789012") && !ev[0].body.includes("412356789012"), "UTR not in the push");
  assert.ok(t.env.sent.some(x => x.endpoint === "https://push.test/dev/phone"), "dev phone got a push");
  const p1 = (await dev.call("GET", "/api/dev/pulse?since=" + p0.events.last_id)).body;
  assert.equal(p1.pay_verify, p0.pay_verify + 1); assert.notEqual(p1.sig, p0.sig); assert.equal(p1.new[0].kind, "utr");
});

test("v10.6: cron — plan ending / auto-paused → one dev event per stage (no duplicates); a shop's first order → one dev event", async () => {
  const t = await twoShops(); const { dev, C, bid, slug } = t; const DAY = 864e5;
  t.DB._sql.prepare("UPDATE shops SET trial_end=? WHERE id=?").run(Date.now() + 2*DAY + 3600e3, bid);
  await t.worker.scheduled({cron: "30 3 * * *"}, t.env.e, undefined);
  await t.worker.scheduled({cron: "30 3 * * *"}, t.env.e, undefined);
  let ev = t.sql("SELECT * FROM dev_events WHERE kind='expiring' AND shop_id=?", bid); assert.equal(ev.length, 1, "once per stage"); assert.match(ev[0].title, /⏰ TEST – Sharma Kirana: free trial ends in \d days/);
  t.DB._sql.prepare("UPDATE shops SET trial_end=? WHERE id=?").run(Date.now() - 3600e3, bid);
  await t.worker.scheduled({cron: "30 3 * * *"}, t.env.e, undefined);
  ev = t.sql("SELECT * FROM dev_events WHERE kind='expired' AND shop_id=?", bid); assert.equal(ev.length, 1); assert.match(ev[0].title, /auto-paused/);
  // first order (shop B re-opened)
  t.DB._sql.prepare("UPDATE shops SET trial_end=? WHERE id=?").run(Date.now() + 9*DAY, bid);
  const o1 = await order(C, slug, t.bVar); assert.equal(o1.status, 201, JSON.stringify(o1.body));
  const o2 = await order(C, slug, t.bVar); assert.equal(o2.status, 201);
  const fo = t.sql("SELECT * FROM dev_events WHERE kind='first_order'"); assert.equal(fo.length, 1); assert.equal(fo[0].shop_id, bid); assert.match(fo[0].title, /First order for/);
});

test("v10.6: no shop can call ANY dev endpoint (pulse, events, push) — with its own cookie or a forged header", async () => {
  const t = await twoShops(); const { A, B } = t;
  for (const [m, p, b] of [["GET", "/api/dev/pulse"], ["GET", "/api/dev/events"], ["POST", "/api/dev/events/read", { all: true }], ["GET", "/api/dev/push"], ["POST", "/api/dev/push/subscribe", { subscription: pushSub("x") }], ["POST", "/api/dev/push/unsubscribe", { endpoint: "https://push.test/dev/x" }], ["POST", "/api/dev/push/test", {}]])
    for (const who of [A, B]) { const r = await who.call(m, p, b); assert.ok(r.status === 403 || r.status === 401, `${m} ${p} → ${r.status}`); }
  // without the CSRF header a dev POST is refused even for the dev
  const r = await t.worker.fetch(new Request("https://k.test/api/dev/events/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), t.env.e); assert.equal(r.status, 403);
});

test("v10.6: dev UI — live poll ~15 s only while visible, refresh in place, red nav badges, 🔔 alert toggle on Home + Settings, activity feed", () => {
  const js = rdSite("dev.js"), html = rdSite("dev.html"), css = rdSite("dev.css");
  assert.match(js, /PULSE_MS = 15000/); assert.match(js, /\/api\/dev\/pulse/); assert.match(js, /\?since=/);
  assert.match(js, /visibilitychange/); assert.match(js, /if \(!me \|\| document\.hidden\) return; pulseT = setTimeout/, "no poll while hidden");
  assert.match(js, /addEventListener\("focus"/); assert.match(js, /softRefresh/); assert.match(js, /if \(dirty/, "never redraws while typing");
  for (const id of ['id="nbShops"', 'id="nbPay"', 'id="nbHome"', 'id="ltoast"']) assert.ok(html.includes(id), id);
  assert.match(js, /Mujhe alert bhejo/); assert.match(js, /\/api\/dev\/push\/subscribe/); assert.match(js, /alertCard\(\$\("#alHost"\)\)/);
  assert.equal((js.match(/id="alHost"/g) || []).length, 2, "toggle on Home and on Settings");
  assert.match(js, /🔔 Activity/); assert.match(js, /\/api\/dev\/events\/read/);
  assert.match(css, /\.ltoast/); assert.match(css, /\.tabs \.nb/);
  assert.ok(!/\bconfirm\s*\(/.test(js) && !/window\.prompt\s*\(/.test(js));
  const secs = [...html.matchAll(/<nav class="tabs"[\s\S]*?<\/nav>/g)][0][0].match(/data-sec="(\w+)"/g).length; assert.equal(secs, 6, "v10.12.4: 6 sections (📢 Notify added)");
  assert.match(html, /<link rel="manifest" href="\/dev\.webmanifest">/);
});
