// v10.13.0 tests: salon / service walk-in token (QR → book → "Your number" + people ahead). Kirana / restaurant unchanged.
// Harness copied from v1011.test.mjs.
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
  return { sent, e: { DB, ASSETS: { fetch: async r => new Response(`<html><head><meta charset="utf-8">\n<meta name="ak-shop" content=""><link rel="manifest" href="/manifest.webmanifest"></head><body>asset ${new URL(r.url).pathname}</body></html>`, {headers:{"content-type":"text/html"}}) },
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


const ist = (t = Date.now()) => new Date(t + 19800000).toISOString().slice(0, 10);
async function salonWorld(){
  const t = await base();
  const s = await t.shop("TEST – Token Salon", "salon"); await t.item(s.J, "150", "30 min", 999);
  const v = t.one("SELECT v.id FROM variants v WHERE v.shop_id=?", s.id);
  const book = (name, ip, source = "walkin") => t.jar({ ip }).call("POST", "/api/orders", { name, phone: "98765 43210", items: [{ variant_id: v.id, qty: 1 }], payment_method: "cod", idempotency_key: idem(), ...(source ? { source } : {}) }, { shop: s.slug });
  const view = async o => (await t.jar().call("GET", `/api/orders/${o.body.order.code}`, undefined, { token: o.body.token })).body;
  const idOf = o => t.one("SELECT id FROM orders WHERE code=?", o.body.order.code).id;
  return { t, s, v, book, view, idOf };
}

test("v10.13 token: salon walk-ins need no address and get #1, #2 for today; 'ahead' counts waiting + in-service with a lower token", async () => {
  const { t, s, book, view, idOf } = await salonWorld();
  const o1 = await book("Rahul", "3.3.3.1"); assert.equal(o1.status, 201, JSON.stringify(o1.body));
  const o2 = await book("Amit", "3.3.3.2"); assert.equal(o2.status, 201, JSON.stringify(o2.body));
  assert.equal(o1.body.order.token_no, 1); assert.equal(o2.body.order.token_no, 2);
  const r1 = t.one("SELECT token_no, token_day, address, delivery_paise FROM orders WHERE code=?", o1.body.order.code);
  assert.deepEqual({ ...r1 }, { token_no: 1, token_day: ist(), address: "", delivery_paise: 0 });
  assert.equal(t.one("SELECT source FROM orders WHERE code=?", o1.body.order.code).source, "walkin");
  let v2 = await view(o2); assert.equal(v2.order.token.no, 2); assert.equal(v2.order.token.ahead, 1); assert.equal(v2.order.token.today, true); assert.ok(v2.shop.name);
  assert.equal((await view(o1)).order.token.ahead, 0);
  // #1 goes in the chair (accepted = In Service): still ahead of #2
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(o1)}/status`, { status: "accepted", from: "pending" })).status, 200);
  assert.equal((await view(o2)).order.token.ahead, 1);
  // #1 completed → #2 is next
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(o1)}/status`, { status: "delivered", from: "accepted" })).status, 200);
  v2 = await view(o2); assert.equal(v2.order.token.ahead, 0);
  assert.equal((await view(o1)).order.token.ahead, null, "a finished token has no queue position");
  // the shopkeeper's list carries the token number for the "#7" badge
  const list = await s.J.call("GET", "/api/admin/orders?status=all");
  const nos = (list.body.orders || []).map(o => o.token_no).sort(); assert.deepEqual(nos, [1, 2]);
});

test("v10.13 token: numbers restart at 1 on a new IST day and are per shop; cancelled ones stop counting as ahead", async () => {
  const { t, s, book, view, idOf } = await salonWorld();
  const a = await book("A", "4.4.4.1"); const b = await book("B", "4.4.4.2"); const c = await book("C", "4.4.4.3");
  assert.deepEqual([a, b, c].map(o => o.body.order.token_no), [1, 2, 3]);
  assert.equal((await view(c)).order.token.ahead, 2);
  assert.equal((await t.jar().call("POST", `/api/orders/${a.body.order.code}/cancel`, {}, { token: a.body.token })).status, 200);
  assert.equal((await view(c)).order.token.ahead, 1, "a cancelled token is not ahead");
  // another salon starts its own count at 1
  const s2 = await t.shop("TEST – Second Salon", "salon"); await t.item(s2.J, "100", "15 min", 999);
  const v2 = t.one("SELECT v.id FROM variants v WHERE v.shop_id=?", s2.id);
  const x = await t.jar({ ip: "4.4.4.9" }).call("POST", "/api/orders", { name: "X", phone: "9876543210", items: [{ variant_id: v2.id, qty: 1 }], payment_method: "cod", idempotency_key: idem(), source: "walkin" }, { shop: s2.slug });
  assert.equal(x.body.order.token_no, 1);
  // yesterday's tokens: today restarts at 1, and an old token shows no live position
  t.DB._sql.prepare("UPDATE orders SET token_day='2000-01-01' WHERE shop_id=?").run(s.id);
  const d = await book("D", "4.4.4.4"); assert.equal(d.body.order.token_no, 1);
  const old = (await view(b)).order.token; assert.equal(old.today, false); assert.equal(old.ahead, null);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM orders WHERE shop_id=? AND token_day=?", s.id, ist()).n, 1);
});

test("v10.13 token: kirana and restaurant flows unchanged (address still required, no token)", async () => {
  const t = await base();
  const k = await t.shop("TEST – Token Kirana"); await t.item(k.J, "50", "1 kg");
  const kv = t.one("SELECT v.id FROM variants v WHERE v.shop_id=?", k.id);
  const noAddr = await t.jar({ ip: "5.5.5.1" }).call("POST", "/api/orders", { name: "R", phone: "9876543210", items: [{ variant_id: kv.id, qty: 1 }], payment_method: "cod", idempotency_key: idem() }, { shop: k.slug });
  assert.equal(noAddr.status, 400, "kirana still needs an address");
  const ko = await order(t.jar({ ip: "5.5.5.2" }), k.slug, kv); assert.equal(ko.status, 201);
  assert.equal(ko.body.order.token_no, null);
  assert.equal((await t.jar().call("GET", `/api/orders/${ko.body.order.code}`, undefined, { token: ko.body.token })).body.order.token, null);
  const r = await t.shop("TEST – Token Hotel", "restaurant"); await t.item(r.J, "120", "Full plate");
  const rv = t.one("SELECT v.id FROM variants v WHERE v.shop_id=?", r.id);
  const ro = await order(t.jar({ ip: "5.5.5.3" }), r.slug, rv, { order_type: "parcel" }); assert.equal(ro.status, 201, JSON.stringify(ro.body));
  assert.equal(ro.body.order.token_no, null); assert.equal(t.one("SELECT token_no, token_day FROM orders WHERE code=?", ro.body.order.code).token_day, null);
});

test("v10.13 token: migration is additive (nullable columns + index only); UI wires Book, token screen (EN + Hindi), 15 s refresh and the #N badge", () => {
  const w = S("_worker.mjs");
  const m = w.slice(w.indexOf("const MIGRATIONS = ["), w.indexOf("];", w.indexOf("const MIGRATIONS = [")));
  const t0 = m.indexOf("ALTER TABLE orders ADD COLUMN token_no"); const last = m.slice(m.lastIndexOf("`", t0), m.indexOf("`", t0) + 1); // v10.14 appended migration 18 after this one
  for (const stmt of last.replace(/`/g, "").split(/;\s*\n/).map(x => x.trim()).filter(Boolean)) assert.match(stmt, /^(ALTER TABLE orders ADD COLUMN (token_no INTEGER|token_day TEXT|near_notified_at INTEGER|next_notified_at INTEGER|source TEXT|queued_at INTEGER)|ALTER TABLE products ADD COLUMN duration_min INTEGER|ALTER TABLE orders ADD COLUMN skipped_at INTEGER|CREATE UNIQUE INDEX IF NOT EXISTS orders_token_day ON orders\(shop_id, token_day, token_no\) WHERE token_no IS NOT NULL)$/, stmt);
  const tr = S("track.js"); assert.match(tr, /function tokenView/); assert.match(tr, /setTimeout\(show, 15000\)/);
  for (const s of ["आपका नंबर", "Your number", "लोग आपसे आगे", "people ahead of you", "अगला नंबर आपका है!", "You're next!"]) assert.ok(tr.includes(s), s);
  const ap = S("app.js"); assert.match(ap, /const deliverOrder = \(\) => !isSvcShop\(\)/); assert.match(ap, /\/track\?s=\$\{encodeURIComponent\(AK\.SHOP\.slug/);
  assert.match(S("common.js"), /place:\["📅 बुक करें","📅 Book"\]/);
  assert.match(S("admin.js"), /class="tok-badge"[^`]*>#\$\{Number\(o\.token_no\)\}/);
});

import { randomBytes } from "node:crypto";
function fakeSub(id){ const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  return { endpoint: `https://push.test/send/${id}`, keys: { p256dh: Buffer.from(ecdh.getPublicKey()).toString("base64url"), auth: randomBytes(16).toString("base64url") } }; }

test("v10.13 queue alerts: '2 ahead' and 'you're next' pushes go once per booking, only to that salon's waiting customers with alerts on", async () => {
  const { t, s, book, idOf } = await salonWorld();
  const o = []; for (let i = 1; i <= 5; i++) o.push(await book("TEST Q" + i, "6.6.6." + i));
  assert.deepEqual(o.map(x => x.body.order.token_no), [1, 2, 3, 4, 5]);
  // #1–#4 turn alerts on; #5 does not
  for (let i = 0; i < 4; i++) assert.equal((await t.jar({ ip: "7.7.7." + i }).call("POST", "/api/push/order", { code: o[i].body.order.code, token: o[i].body.token, subscription: fakeSub("q" + i) })).status, 200);
  // a kirana customer with alerts on in another shop must never get a queue alert
  const k = await t.shop("TEST – Q Kirana"); await t.item(k.J, "50", "1 kg");
  const ko = await order(t.jar({ ip: "8.8.8.8" }), k.slug, t.one("SELECT id FROM variants WHERE shop_id=?", k.id));
  await t.jar({ ip: "8.8.8.9" }).call("POST", "/api/push/order", { code: ko.body.order.code, token: ko.body.token, subscription: fakeSub("kq") });
  const queue = () => t.sql("SELECT o.token_no AS no, n.event FROM notification_attempts n JOIN orders o ON o.id=n.order_id WHERE n.event LIKE 'queue:%' ORDER BY n.id").map(r => r.event.slice(6) + "#" + r.no);
  const st = (i, to, from) => s.J.call("POST", `/api/admin/orders/${idOf(o[i])}/status`, { status: to, from });
  assert.equal((await st(0, "accepted", "pending")).status, 200);          // #1 in the chair → #3 has 2 ahead
  assert.deepEqual(queue(), ["near#3"]);
  assert.equal((await st(0, "delivered", "accepted")).status, 200);        // #1 done → #2 next, #4 has 2 ahead
  assert.deepEqual(queue(), ["near#3", "next#2", "near#4"]);
  assert.equal((await st(1, "accepted", "pending")).status, 200);          // #2 in the chair → nobody new (flags hold)
  assert.deepEqual(queue(), ["near#3", "next#2", "near#4"]);
  assert.equal((await st(1, "delivered", "accepted")).status, 200);        // #2 done → #3 next; #5 has 2 ahead but alerts are off
  assert.deepEqual(queue(), ["near#3", "next#2", "near#4", "next#3"]);
  // #3 cancels (customer) → #4 becomes next; repeat triggers send nothing twice
  assert.equal((await t.jar({ ip: "9.9.9.1" }).call("POST", `/api/orders/${o[2].body.order.code}/cancel`, {}, { token: o[2].body.token })).status, 200);
  assert.deepEqual(queue(), ["near#3", "next#2", "near#4", "next#3", "next#4"]);
  const once = t.sql("SELECT near_notified_at AS a, next_notified_at AS b, token_no FROM orders WHERE shop_id=? ORDER BY token_no", s.id);
  assert.equal(once[4].a, null); assert.equal(once[4].b, null, "#5 has alerts off: no flag, so turning them on later still works");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM notification_attempts WHERE event LIKE 'queue:%' AND order_id=?", t.one("SELECT id FROM orders WHERE code=?", ko.body.order.code).id).n, 0);
  for (const e of t.env.sent) assert.match(e.endpoint, /^https:\/\/push\.test\//);
});

test("v10.13 queue alerts: token screen offers '🔔 Notify me when my turn is near' (EN + Hindi) with the keep-open / home-screen note; TEST shop signups never push the developer", () => {
  const c = S("common.js");
  for (const x of ["🔔 Notify me when my turn is near", "🔔 नंबर पास आने पर मुझे बताएँ", "Keep this page open, or add to home screen for alerts."]) assert.ok(c.includes(x), x);
  assert.match(S("track.js"), /notifyBox\(document\.getElementById\("notifBox"\), \{code, token\}, \{token: true\}\)/);
  const w = S("_worker.mjs"); assert.match(w, /publicOrigin\(env, url\), isTestShop\(shopName\)\)/); assert.match(w, /ev\.push !== false && !quiet/);
  assert.match(w, /Your turn is coming soon at \$\{shop\}, 2 ahead\. Please leave now\./); assert.match(w, /You're next at \$\{shop\}!/);
});

test("v10.13 sources: an online (home) booking is a request until ✅ Accept (then it gets the next token); reject = 'couldn't accept'; auto-accept ON skips the request step", async () => {
  const { t, s, book, view, idOf } = await salonWorld();
  const w1 = await book("TEST Walk 1", "10.0.0.1");                     // QR walk-in → #1 at once
  const on = await book("TEST Home 1", "10.0.0.2", null);               // no source = online request
  assert.equal(w1.body.order.token_no, 1); assert.equal(on.body.order.token_no, null);
  let v = (await view(on)).order.token; assert.equal(v.requested, true); assert.equal(v.no, null); assert.equal(v.source, "online");
  const w2 = await book("TEST Walk 2", "10.0.0.3");                     // a later walk-in is #2: the request holds no number
  assert.equal(w2.body.order.token_no, 2); assert.equal((await view(w2)).order.token.ahead, 1, "a request is never 'ahead'");
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(on)}/status`, { status: "accepted", from: "pending" })).status, 409, "Start service needs Accept first");
  const acc = await s.J.call("POST", `/api/admin/orders/${idOf(on)}/queue`, {}); assert.equal(acc.status, 200, JSON.stringify(acc.body));
  assert.equal(acc.body.order.token_no, 3); v = (await view(on)).order.token; assert.equal(v.no, 3); assert.equal(v.ahead, 2); assert.equal(v.requested, false);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(on)}/queue`, {})).body.already, true, "accepting twice gives no second number");
  const on2 = await book("TEST Home 2", "10.0.0.4", "online");
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(on2)}/status`, { status: "rejected", from: "pending", reason: "Busy today" })).status, 200);
  v = (await view(on2)).order.token; assert.equal(v.not_accepted, true); assert.equal(v.no, null);
  // auto-accept (per-shop setting, default OFF)
  assert.equal((await s.J.call("GET", "/api/admin/settings")).body.settings?.auto_accept ?? false, false);
  assert.equal((await s.J.call("PUT", "/api/admin/settings", { auto_accept: true })).status, 200);
  const on3 = await book("TEST Home 3", "10.0.0.5", "online"); assert.equal(on3.body.order.token_no, 4);
  assert.equal(t.one("SELECT source FROM orders WHERE code=?", on3.body.order.code).source, "online");
  // the kirana queue endpoint is refused
  const k = await t.shop("TEST – Q2 Kirana"); assert.equal((await k.J.call("POST", `/api/admin/orders/1/queue`, {})).status, 400);
});

test("v10.13 salon admin: no manual add; big Waiting / In service counts, online requests with ✅ Accept, auto-accept switch, read-only history, 🏪/🏠 source tags, QR poster carries ?src=qr", () => {
  const a = S("admin.js"); const today = a.slice(a.indexOf("async function svcTodayView"), a.indexOf("async function svcHistoryView"));
  assert.doesNotMatch(today, /tdAdd|add_walkin/, "no + Add walk-in");
  for (const x of ["tbWait", "tbIn", "Online requests", "aaSw", "auto_accept", "Today's queue", "gridHtml()"]) assert.ok(today.includes(x), x);
  assert.ok(today.indexOf("olist") < today.indexOf("gridHtml()"), "tiles stay below the queue");
  const hist = a.slice(a.indexOf("async function svcHistoryView"), a.indexOf("async function ordersView"));
  assert.doesNotMatch(hist, /data-st=|data-queue|btn-primary/, "history is read-only");
  assert.match(a, /if \(isSvc\(\)\) return svcHistoryView\(\);/);
  assert.match(a, /data-queue="\$\{o\.id\}">✅/); assert.match(a, /🏪 \$\{L\("वॉक-इन","Walk-in"\)\}/); assert.match(a, /🏠 \$\{L\("ऑनलाइन","Online"\)\}/);
  assert.match(a, /const qrUrl = u => !isSvc\(\) \|\| !u \? u : u \+ \(u\.includes\("\?"\) \? "&" : "\?"\) \+ "src=qr"/);
  assert.match(S("app.js"), /get\("src"\) === "qr"/);
  const tr = S("track.js"); assert.ok(tr.includes("Waiting for salon to accept")); assert.ok(tr.includes("Salon couldn't accept, please try later."));
});

test("v10.13 ETA + accept push: wait = minutes of queued bookings ahead (in-service counts half, default 20); ✅ Accept sends ONE 'accepted' push with token + ETA", async () => {
  const { t, s, v, book, view, idOf } = await salonWorld();
  // service minutes: the test service = 30 min (shop editor field), a second service left empty = 20
  const pid = t.one("SELECT product_id FROM variants WHERE id=?", v.id).product_id;
  const prod = (await s.J.call("GET", "/api/admin/catalog")).body;
  const pr = (prod.products || []).find(p => p.id === pid);
  const put = await s.J.call("PUT", `/api/admin/products/${pid}`, { name_hi: pr.name_hi, name_en: pr.name_en, category_id: pr.category_id, icon: pr.icon, active: true, featured: false, variants: pr.variants.map(x => ({ id: x.id, label: x.label, price: String(x.price_paise / 100), stock: x.stock })), duration_min: "30" });
  assert.equal(put.status, 200, JSON.stringify(put.body)); assert.equal(t.one("SELECT duration_min FROM products WHERE id=?", pid).duration_min, 30);
  assert.equal((await s.J.call("PUT", `/api/admin/products/${pid}`, { name_hi: pr.name_hi, variants: pr.variants.map(x => ({ id: x.id, label: x.label, price: String(x.price_paise / 100), stock: x.stock })), duration_min: "3" })).status, 400, "5–600 minutes");
  const a = await book("TEST E1", "11.0.0.1"), b = await book("TEST E2", "11.0.0.2"), c = await book("TEST E3", "11.0.0.3");
  assert.equal((await view(a)).order.token.eta_min, 0);
  assert.equal((await view(b)).order.token.eta_min, 30);
  assert.equal((await view(c)).order.token.eta_min, 60);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(a)}/status`, { status: "accepted", from: "pending" })).status, 200);
  assert.equal((await view(c)).order.token.eta_min, 45, "the one in the chair counts half");
  t.DB._sql.prepare("UPDATE products SET duration_min=NULL WHERE id=?").run(pid);
  assert.equal((await view(c)).order.token.eta_min, 30, "unset minutes = 20 (10 + 20)");
  // accept push: an online request with alerts on gets exactly one 'accepted' push on ✅ Accept (a repeat Accept sends nothing)
  const on = await book("TEST Online", "11.0.0.9", "online");
  assert.equal((await t.jar({ ip: "11.1.1.1" }).call("POST", "/api/push/order", { code: on.body.order.code, token: on.body.token, subscription: fakeSub("acc") })).status, 200);
  const acc = () => t.one("SELECT COUNT(*) AS n FROM notification_attempts WHERE event='queue:accepted' AND order_id=?", idOf(on)).n;
  assert.equal(acc(), 0);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(on)}/queue`, {})).status, 200); assert.equal(acc(), 1);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(on)}/queue`, {})).status, 200); assert.equal(acc(), 1, "once");
  const tk = (await view(on)).order.token; assert.equal(tk.no, 4); assert.equal(tk.eta_min, 50); // #1 half (10) + #2 20 + #3 20
  assert.match(S("_worker.mjs"), /✅ Your booking at \$\{sh\.name \|\| ""\} is accepted\. Token #\$\{o\.token_no\}\$\{eta\}/);
  assert.match(S("track.js"), /~\$\{tk\.eta_min\} min wait/); assert.match(S("admin.js"), /name="duration_min"/);
});

test("v10.13 one serial queue: walk-in + online share strictly increasing unique serials (online at Accept / auto-accept); a request holds none; ⏭ Skip recomputes 'ahead'", async () => {
  const { t, s, book, view, idOf } = await salonWorld();
  const w1 = await book("TEST S-W1", "12.0.0.1");               // #1 walk-in
  const o1 = await book("TEST S-O1", "12.0.0.2", "online");     // request, no serial
  const w2 = await book("TEST S-W2", "12.0.0.3");               // #2 walk-in
  assert.equal(o1.body.order.token_no, null); assert.equal((await view(w2)).order.token.ahead, 1);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(o1)}/queue`, {})).body.order.token_no, 3); // accepted after #2 → #3
  const w3 = await book("TEST S-W3", "12.0.0.4");               // #4
  await s.J.call("PUT", "/api/admin/settings", { auto_accept: true });
  const o2 = await book("TEST S-O2", "12.0.0.5", "online");     // auto → #5
  const serials = t.sql("SELECT token_no FROM orders WHERE shop_id=? AND token_no IS NOT NULL ORDER BY queued_at, id", s.id).map(r => r.token_no);
  assert.deepEqual(serials, [1, 2, 3, 4, 5]); assert.equal(new Set(serials).size, serials.length);
  assert.equal(w3.body.order.token_no, 4); assert.equal(o2.body.order.token_no, 5);
  // the database itself refuses a duplicate serial for the same shop and day
  assert.throws(() => t.DB._sql.prepare("UPDATE orders SET token_no=1 WHERE id=?").run(idOf(w2)), /UNIQUE/);
  // ⏭ Skip #2 (not here) → #3, #4, #5 move up; skipping twice is a no-op; only a queued waiting booking can be skipped
  assert.equal((await view(o2)).order.token.ahead, 4);
  const sk = await s.J.call("POST", `/api/admin/orders/${idOf(w2)}/skip`, {}); assert.equal(sk.status, 200, JSON.stringify(sk.body));
  assert.equal(t.one("SELECT status FROM orders WHERE id=?", idOf(w2)).status, "cancelled");
  assert.equal((await view(o2)).order.token.ahead, 3); assert.equal((await view(w2)).order.skipped, true);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(w2)}/skip`, {})).body.already, true);
  const req = await book("TEST S-O3", "12.0.0.6", "online");    // auto-accept still on → #6, never reuses #2
  assert.equal(req.body.order.token_no, 6);
  await s.J.call("PUT", "/api/admin/settings", { auto_accept: false });
  const req2 = await book("TEST S-O4", "12.0.0.7", "online");
  assert.equal((await s.J.call("POST", `/api/admin/orders/${idOf(req2)}/skip`, {})).status, 409, "a request has no serial to skip");
  assert.match(S("track.js"), /Please reach on time; if you're not there when your number comes, your turn may be skipped\./);
  assert.match(S("_worker.mjs"), /"Please reach on time; if you're not there when your number comes, your turn may be skipped\."/);
  assert.match(S("admin.js"), /data-skip="\$\{o\.id\}">⏭/);
});
