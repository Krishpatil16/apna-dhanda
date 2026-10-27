// v10.8 tests: orders (Ready, edit/remove with totals + stock, substitutes), bill auth, date filter, dashboard counts in IST, offline-queue idempotency, auto-update, global search isolation, help. Helpers copied from the v10.7 tests.
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

test("v10.8: Ready status — preparing → ready → out_for_delivery → delivered; old flows still work; delivery may skip Ready; customer sees it", async () => {
  const t = await shopWithOrder(); const { B, C, oid, code, token } = t;
  assert.equal((await st(B, oid, "accepted", "pending")).status, 200);
  assert.equal((await st(B, oid, "preparing", "accepted")).status, 200);
  const r = await st(B, oid, "ready", "preparing"); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.order.status, "ready");
  const tr = (await C.call("GET", `/api/orders/${code}`, undefined, { token })).body.order; assert.equal(tr.status, "ready"); assert.ok(tr.events.some(e => e.to_status === "ready"));
  assert.equal((await st(B, oid, "pending", "ready")).status, 409, "no going back");
  assert.equal((await B.call("GET", "/api/admin/orders?status=active")).body.orders.some(o => o.id === oid), true, "ready counts as active");
  assert.equal((await st(B, oid, "out_for_delivery", "ready")).status, 200);
  assert.equal((await st(B, oid, "delivered", "out_for_delivery")).status, 200);
  // skip Ready: preparing → delivered and the old accepted → out_for_delivery path
  const t2 = await shopWithOrder();
  await st(t2.B, t2.oid, "accepted", "pending"); await st(t2.B, t2.oid, "preparing", "accepted");
  assert.equal((await st(t2.B, t2.oid, "delivered", "preparing")).status, 200);
  const t3 = await shopWithOrder(); await st(t3.B, t3.oid, "accepted", "pending");
  assert.equal((await st(t3.B, t3.oid, "out_for_delivery", "accepted")).status, 200);
  assert.match(S("admin.js"), /ready:\["तैयार"/); assert.match(S("track.js"), /"ready"/); assert.match(S("common.js"), /status_ready/);
});

test("v10.8: unavailable items — lower qty / remove: server recalculates subtotal+total, returns stock, logs order_events, customer sees what changed and why; never empty; not after out_for_delivery", async () => {
  const t = await shopWithOrder(); const { B, C, oid, code, token, items, atta, dal, chawal } = t;
  const [iA, iD, iC] = items; const before = t.one("SELECT * FROM orders WHERE id=?", oid);
  assert.equal(before.subtotal_paise, 2*5000 + 12000 + 6000); assert.equal(stockOf(t, atta.id), 8);
  let r = await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: iA.id, qty: 1, reason: "सिर्फ़ एक बचा" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.order.subtotal_paise, 5000 + 12000 + 6000); assert.equal(r.body.order.total_paise, 23000 + before.delivery_paise);
  assert.equal(stockOf(t, atta.id), 9, "1 atta back in stock"); assert.equal(r.body.returned, 1);
  r = await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: iD.id, action: "remove", reason: "दाल ख़त्म" });
  assert.equal(r.status, 200); assert.equal(r.body.order.items.length, 2); assert.equal(r.body.order.subtotal_paise, 11000); assert.equal(stockOf(t, dal.id), 10);
  const ev = t.sql("SELECT * FROM order_events WHERE order_id=? AND kind='edit'", oid); assert.equal(ev.length, 2); assert.match(ev[1].note, /दाल ख़त्म/);
  const cv = (await C.call("GET", `/api/orders/${code}`, undefined, { token })).body.order;
  assert.equal(cv.total_paise, 11000 + before.delivery_paise); assert.equal(cv.changes.length, 2); assert.match(cv.changes[0].note, /2 → 1/); assert.match(cv.changes[1].note, /हटाया/);
  assert.ok(!cv.events.some(e => e.to_status === "pending" && e.note), "status timeline is not polluted");
  r = await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: iA.id, qty: 3 }); assert.equal(r.status, 400, "qty can only go down");
  r = await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: iA.id, action: "remove" }); assert.equal(r.status, 200);
  r = await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: iC.id, action: "remove" }); assert.equal(r.status, 409); assert.equal(r.body.code, "order_empty"); assert.equal(r.body.suggest, "rejected");
  // another shop can't edit this order; not editable once out for delivery
  assert.equal((await t.A.call("POST", `/api/admin/orders/${oid}/items`, { item_id: iC.id, qty: 1 })).status, 404);
  await st(B, oid, "accepted", "pending"); await st(B, oid, "out_for_delivery", "accepted");
  r = await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: iC.id, qty: 0 }); assert.equal(r.status, 409); assert.equal(r.body.code, "not_editable");
  // cancel after an edit returns exactly what is left in the order (no double return)
  await st(B, oid, "cancelled", "out_for_delivery", { reason: "test" });
  assert.equal(stockOf(t, chawal.id), 10); assert.equal(stockOf(t, atta.id), 10); assert.equal(stockOf(t, dal.id), 10);
});

test("v10.8: edit keeps the offer honest — discount re-checked on the new subtotal (never more), delivery never goes up", async () => {
  const t = await shopWithOrder(); const { B, oid, items } = t;
  t.DB._sql.prepare("UPDATE orders SET discount_paise=3000, delivery_paise=2000, total_paise=subtotal_paise-3000+2000 WHERE id=?").run(oid);
  const r = await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: items[1].id, action: "remove" });
  assert.equal(r.status, 200); const o = r.body.order; assert.equal(o.subtotal_paise, 16000); assert.equal(o.discount_paise, 3000); assert.equal(o.delivery_paise, 2000); assert.equal(o.total_paise, 16000 - 3000 + 2000);
});

test("v10.8: substitute — shopkeeper suggests a same-shop in-stock item; customer Accept swaps the line (stock reserved/returned, total recalculated); Decline removes it; answers are idempotent; shop gets 🔔 + push", async () => {
  const t = await shopWithOrder(); const { B, C, oid, code, token, items, dal, basmati, chawal } = t;
  const subs = { endpoint: "https://push.test/admin/1", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
  await B.call("POST", "/api/admin/push/subscribe", { subscription: subs });
  let r = await B.call("POST", `/api/admin/orders/${oid}/substitute`, { item_id: items[1].id, variant_id: basmati.id });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.sub.diff_paise, 9000 - 12000); assert.equal(r.body.sub.status, "pending");
  const again = await B.call("POST", `/api/admin/orders/${oid}/substitute`, { item_id: items[1].id, variant_id: basmati.id }); assert.equal(again.body.duplicate, true);
  assert.equal(t.sql("SELECT * FROM order_subs WHERE order_id=?", oid).length, 1, "double submit = one suggestion");
  // isolation: other shop's item can't be suggested; other shop can't suggest on this order
  assert.equal((await B.call("POST", `/api/admin/orders/${oid}/substitute`, { item_id: items[1].id, variant_id: t.aVar.id })).status, 404);
  assert.equal((await t.A.call("POST", `/api/admin/orders/${oid}/substitute`, { item_id: items[1].id, variant_id: t.aVar.id })).status, 404);
  const tv = (await C.call("GET", `/api/orders/${code}`, undefined, { token })).body.order; assert.equal(tv.subs.length, 1); assert.equal(tv.subs[0].to.name, "बासमती");
  const sid = tv.subs[0].id;
  assert.equal((await C.call("POST", `/api/orders/${code}/substitute`, { sub_id: sid, answer: "accept" }, { token: "0".repeat(48) })).status, 404, "needs the private token");
  const sent0 = t.env.sent.length;
  r = await C.call("POST", `/api/orders/${code}/substitute`, { sub_id: sid, answer: "accept" }, { token });
  assert.equal(r.status, 200, JSON.stringify(r.body)); const o = r.body.order;
  assert.ok(o.items.some(i => i.product_name === "बासमती" && i.qty === 1 && i.line_total_paise === 9000)); assert.ok(!o.items.some(i => i.product_name === "दाल"));
  assert.equal(o.subtotal_paise, 10000 + 9000 + 6000); assert.equal(stockOf(t, basmati.id), 4); assert.equal(stockOf(t, dal.id), 10);
  const r2 = await C.call("POST", `/api/orders/${code}/substitute`, { sub_id: sid, answer: "accept" }, { token }); assert.equal(r2.body.already, true); assert.equal(stockOf(t, basmati.id), 4, "accept twice = once");
  assert.equal((await C.call("POST", `/api/orders/${code}/substitute`, { sub_id: sid, answer: "decline" }, { token })).status, 409);
  assert.ok(t.env.sent.length > sent0, "shopkeeper push sent");
  const noti = (await B.call("GET", "/api/admin/notifications")).body.items.find(n => n.meta && n.meta.sub_id === sid); assert.ok(noti && !noti.read); assert.match(noti.title, /बदलाव माना/);
  assert.equal((await B.call("POST", "/api/admin/notifications/read", { ids: [noti.id] })).status, 200);
  assert.ok((await B.call("GET", "/api/admin/notifications")).body.items.find(n => n.id === noti.id).read);
  // decline removes the line + returns stock
  const chawalItem = t.sql("SELECT * FROM order_items WHERE order_id=? AND product_name='चावल'", oid)[0];
  r = await B.call("POST", `/api/admin/orders/${oid}/substitute`, { item_id: chawalItem.id, variant_id: dal.id }); assert.equal(r.status, 200);
  r = await C.call("POST", `/api/orders/${code}/substitute`, { sub_id: r.body.sub.id, answer: "decline" }, { token });
  assert.equal(r.status, 200); assert.ok(!r.body.order.items.some(i => i.product_name === "चावल")); assert.equal(stockOf(t, chawal.id), 10); assert.equal(stockOf(t, dal.id), 10);
  assert.equal(r.body.order.subtotal_paise, 19000); assert.ok(r.body.order.changes.some(c => /नहीं माना/.test(c.note)));
  // no answer → shopkeeper removes manually; the pending suggestion is withdrawn
  const att = t.sql("SELECT * FROM order_items WHERE order_id=? AND product_name='बी का आटा'", oid)[0];
  r = await B.call("POST", `/api/admin/orders/${oid}/substitute`, { item_id: att.id, variant_id: chawal.id, qty: 1 }); const s3 = r.body.sub.id;
  assert.equal((await B.call("POST", `/api/admin/orders/${oid}/items`, { item_id: att.id, qty: 1 })).status, 200);
  assert.equal(t.one("SELECT status FROM order_subs WHERE id=?", s3).status, "withdrawn");
  assert.equal((await C.call("POST", `/api/orders/${code}/substitute`, { sub_id: s3, answer: "accept" }, { token })).status, 409);
  // out of stock substitute is refused
  t.DB._sql.prepare("UPDATE variants SET stock=0 WHERE id=?").run(chawal.id);
  assert.equal((await B.call("POST", `/api/admin/orders/${oid}/substitute`, { item_id: att.id, variant_id: chawal.id })).status, 409);
});

test("v10.8: bill data needs the shop's own login; date filter (IST days); dashboard counts in IST; global search is shop-isolated", async () => {
  const t = await shopWithOrder(); const { B, A, oid, code, world: _w } = t;
  const anon = t.jar();
  assert.equal((await anon.call("GET", `/api/admin/orders/${oid}/bill`)).status, 401);
  assert.equal((await A.call("GET", `/api/admin/orders/${oid}/bill`)).status, 404, "other shop");
  const b = (await B.call("GET", `/api/admin/orders/${oid}/bill`)).body; assert.equal(b.order.code, code); assert.equal(b.order.items.length, 3); assert.equal(b.shop.name, "TEST – Sharma Kirana"); assert.equal(b.order.total_paise, t.one("SELECT total_paise FROM orders WHERE id=?", oid).total_paise);
  assert.match(S("admin.js"), /window\.print\(\)/); assert.match(S("admin.js"), /navigator\.share/); assert.match(S("admin.js"), /wa\.me\/91/);
  // dates: the order was created now; move a copy of time to yesterday IST
  const DAY = 864e5, IST = 330 * 60000; const dayStart = Math.floor((Date.now() + IST) / DAY) * DAY - IST;
  const ymd = ms => new Date(ms + IST).toISOString().slice(0, 10);
  t.DB._sql.prepare("UPDATE orders SET created_at=? WHERE id=?").run(dayStart - 60000, oid); // 23:59 yesterday IST
  const q = async qs => (await B.call("GET", "/api/admin/orders?status=all&" + qs)).body.orders.map(o => o.id);
  assert.deepEqual(await q(`from=${ymd(dayStart)}&to=${ymd(dayStart)}`), []);
  assert.deepEqual(await q(`from=${ymd(dayStart - DAY)}&to=${ymd(dayStart - DAY)}`), [oid]);
  assert.deepEqual(await q(`from=${ymd(dayStart - DAY)}`), [oid]);
  assert.deepEqual(await q(`to=${ymd(dayStart - 2 * DAY)}`), []);
  assert.equal((await B.call("GET", "/api/admin/orders?status=all&from=bad")).status, 200);
  // dashboard counts: one active order created yesterday; deliver it "today" (IST) → delivered_today 1
  let d = (await B.call("GET", "/api/admin/dashboard")).body.dash;
  assert.equal(d.active, 1); assert.equal(d.delivered_today, 0); assert.equal(d.order_value_today, 0, "yesterday's order is not today's value"); assert.equal(d.day_start, dayStart);
  await st(B, oid, "accepted", "pending"); await st(B, oid, "delivered", "accepted").catch(() => {});
  await st(B, oid, "out_for_delivery", "accepted"); await st(B, oid, "delivered", "out_for_delivery");
  d = (await B.call("GET", "/api/admin/dashboard")).body.dash; assert.equal(d.active, 0); assert.equal(d.delivered_today, 1); assert.ok(d.delivered_value_today > 0);
  t.DB._sql.prepare("UPDATE orders SET updated_at=? WHERE id=?").run(dayStart - 1000, oid); // delivered at 23:59:59 yesterday IST
  d = (await B.call("GET", "/api/admin/dashboard")).body.dash; assert.equal(d.delivered_today, 0, "IST day boundary");
  const r2 = await t.C.call("POST", "/api/orders", { ...cust, items: [{ variant_id: t.chawal.id, qty: 1 }], payment_method: "cod", idempotency_key: idem() }, { shop: t.slug });
  const o2 = t.one("SELECT id FROM orders WHERE code=?", r2.body.order.code).id; await st(B, o2, "rejected", "pending", { reason: "x" });
  d = (await B.call("GET", "/api/admin/dashboard")).body.dash; assert.equal(d.closed_today, 1); assert.equal(d.order_value_today, 0, "rejected not counted");
  assert.deepEqual((await B.call("GET", "/api/admin/orders?status=closed&done=today")).body.orders.map(o => o.id), [o2]);
  // out of stock separate from low
  t.DB._sql.prepare("UPDATE variants SET stock=0 WHERE id=?").run(t.basmati.id); t.DB._sql.prepare("UPDATE variants SET stock=2, low_stock=5 WHERE id=?").run(t.dal.id);
  d = (await B.call("GET", "/api/admin/dashboard")).body.dash; assert.equal(d.out_count, 1); assert.ok(d.low_only_count >= 1);
  // search: B finds its own product + order, A finds none of B's
  const s = (await B.call("GET", "/api/admin/search?q=chawal")).body; assert.ok(s.products.some(p => p.name_en === "Chawal"));
  const so = (await B.call("GET", `/api/admin/search?q=${code}`)).body; assert.deepEqual(so.orders.map(o => o.code), [code]);
  const sp = (await B.call("GET", "/api/admin/search?q=43210")).body; assert.ok(sp.orders.length >= 2, "by phone");
  const sa = (await A.call("GET", `/api/admin/search?q=${code}`)).body; assert.equal(sa.orders.length, 0);
  assert.equal((await A.call("GET", "/api/admin/search?q=chawal")).body.products.length, 0);
  assert.equal((await anon.call("GET", "/api/admin/search?q=chawal")).status, 401);
});

test("v10.8: offline queue is idempotent — a status change / stock +qty re-sent with the same key applies once; packing checklist saved per order", async () => {
  const t = await shopWithOrder(); const { B, oid, items, atta } = t;
  const k = idem();
  const r1 = await st(B, oid, "accepted", "pending", { idempotency_key: k }); assert.equal(r1.status, 200);
  const r2 = await st(B, oid, "accepted", "pending", { idempotency_key: k }); assert.equal(r2.status, 200); assert.equal(r2.body.duplicate, true);
  assert.equal(t.sql("SELECT * FROM order_events WHERE order_id=? AND to_status='accepted'", oid).length, 1);
  // a lost response: the move happened but the key was never saved → re-send still OK (no second move)
  const r3 = await st(B, oid, "preparing", "accepted", {}); assert.equal(r3.status, 200);
  const r4 = await st(B, oid, "preparing", "accepted", { idempotency_key: idem() }); assert.equal(r4.status, 200); assert.equal(r4.body.duplicate, true);
  const sk = idem(); const s0 = stockOf(t, atta.id);
  for (let i = 0; i < 3; i++) assert.equal((await B.call("POST", "/api/admin/stock/in", { idempotency_key: sk, items: [{ variant_id: atta.id, qty: 5 }] })).status < 300, true);
  assert.equal(stockOf(t, atta.id), s0 + 5, "stock +5 once");
  // packing checklist
  let p = await B.call("POST", `/api/admin/orders/${oid}/packed`, { packed: [items[0].id, items[2].id, 999999] }); assert.equal(p.status, 200); assert.deepEqual(p.body.packed, [items[0].id, items[2].id]); assert.equal(p.body.total, 3);
  const lo = (await B.call("GET", "/api/admin/orders?status=active")).body.orders.find(o => o.id === oid); assert.deepEqual(lo.packed, [items[0].id, items[2].id]);
  assert.equal((await t.A.call("POST", `/api/admin/orders/${oid}/packed`, { packed: [] })).status, 404);
  assert.equal((await B.call("POST", `/api/admin/orders/${oid}/status`, { status: "ready", from: "preparing" })).status, 200, "checklist never blocks");
  const js = S("admin.js"); assert.match(js, /ak_outbox/); assert.match(js, /idempotency_key/); assert.match(S("pwa.js"), /Internet nahi hai|इंटरनेट नहीं/);
});

test("v10.8: auto-update — every page carries its deploy version; sw.js versioned + skipWaiting + clients.claim, no fetch cache; pwa.js checks /health on open + visibilitychange and shows the update bar", async () => {
  const t = await twoShops(); const { C } = t;
  const V = S("_worker.mjs").match(/const APP_VERSION = "([\d.]+)"/)[1]; assert.equal(V, "10.16.2");
  for (const path of ["/admin", "/dev", `/s/${t.slug}`, "/track"]) {
    const h = (await C.call("GET", path)).body; assert.match(h, new RegExp(`<meta name="ak-ver" content="${V.replace(/\./g, "\\.")}">`), path);
    for (const m of h.matchAll(/(?:src|href)="\/([\w.-]+\.(?:js|css))(\?v=[^"]*)?"/g)) assert.ok(m[2], `${m[1]} is version-busted on ${path}`);
  }
  const sw = S("sw.js"); assert.ok(sw.includes(`SW_VERSION = "${V}"`)); assert.match(sw, /skipWaiting/); assert.match(sw, /clients\.claim/); assert.ok(!/addEventListener\(\s*["']fetch/.test(sw.replace(/\/\/ v10\.10: AI product icons[\s\S]*?\n\}\);\n/, "")));
  const pwa = S("pwa.js"); assert.match(pwa, /visibilitychange/); assert.match(pwa, /\/health/); assert.match(pwa, /Naya update aaya/); assert.match(pwa, /reg\.update|\.update\(\)/);
  // the comparison itself (pure function, run here)
  const win = { document: { querySelector: () => null, addEventListener() {} }, addEventListener() {}, navigator: {}, location: { pathname: "/admin" } };
  const fn = new Function("window", "document", "navigator", "location", pwa + "\nreturn window.AKUpdate;")(win, win.document, win.navigator, win.location);
  assert.equal(fn.isNewer("10.8.0", "10.8.1"), true); assert.equal(fn.isNewer("10.8.0", "10.8.0"), false); assert.equal(fn.isNewer("10.8.0", "10.7.9"), false); assert.equal(fn.isNewer("10.8.0", "10.10.0"), true); assert.equal(fn.isNewer("", "10.8.0"), false);
  const h = (await C.call("GET", "/health")).body; assert.equal(J(h).version, V);
});

test("v10.8: Madad (help) in admin with Hindi steps + Krish WhatsApp; migration additive; icon buttons labelled", async () => {
  const js = S("admin.js"); assert.match(js, /Madad|मदद/); assert.match(js, /wa\.me\/918435424535/); assert.match(js, /Kaise use karein|कैसे इस्तेमाल करें/);
  const w = S("_worker.mjs"); const mig = w.slice(w.indexOf("// v10.8: order tools"), w.indexOf("];", w.indexOf("// v10.8: order tools")));
  assert.ok(mig.length > 100 && !/DROP|DELETE|UPDATE |RENAME/i.test(mig), "migration is additive only");
  const t = await twoShops(); assert.equal(t.one("SELECT MAX(v) AS v FROM schema_version").v, 19); // v10.9 adds shop_events
  for (const m of js.matchAll(/<button[^>]*>([^<]{1,3})<\/button>/g)) assert.ok(/aria-label=|title=/.test(m[0]) || /[A-Za-z\u0900-\u097F]{2}/.test(m[1]), "icon-only button needs a label: " + m[0]);
});
