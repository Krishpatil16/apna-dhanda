// v4 tests (reorder, cancellation, ratings, reports, audit log, cart offers, backup). Shared harness copied from the Web Push tests.
// Tests for Web Push (subscriptions, encryption, sends on new order + every status change), offers, and My Orders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createHash, createECDH, createHmac, createDecipheriv, createPublicKey, verify, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";
import { withSecrets } from "./secrets-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, "..", "site");
const TEST_KEY = "test-setup-key-123456";
const b64u = b => Buffer.from(b).toString("base64url");
let httpEce = null; try { httpEce = createRequire(import.meta.url)("http_ece"); } catch {}

async function loadWorker(){
  const src = readFileSync(join(SITE, "_worker.mjs"), "utf8").replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${createHash("sha256").update("kirana-setup:"+TEST_KEY).digest("hex")}"`);
  const dir = mkdtempSync(join(tmpdir(), "kirana-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, src); return withSecrets((await import(f)).default, {setupKey: TEST_KEY});
}
// A fake push service: records every POST; answers with the status the test chooses per endpoint.
function fakePush(){
  const sent = []; const statusFor = new Map();
  const fetch = async (endpoint, init) => { sent.push({endpoint, headers: init.headers, body: Buffer.from(init.body)}); const st = statusFor.get(endpoint) ?? 201; return new Response(st === 201 ? "" : "gone", {status: st}); };
  return { sent, statusFor, fetch };
}
// A fake browser push subscription with real P-256 keys, so we can decrypt what the server sends.
function fakeSubscription(id){
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys(); const auth = randomBytes(16);
  return { ecdh, auth, json: { endpoint: `https://push.test/send/${id}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } };
}
// Independent RFC 8291 decryption (node:crypto), used to prove the Worker's aes128gcm encryption is correct.
function decrypt(body, sub){
  const salt = body.subarray(0, 16); const rs = body.readUInt32BE(16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
  assert.equal(rs, 4096); assert.equal(idlen, 65);
  const ecdhSecret = sub.ecdh.computeSecret(asPub);
  const prkKey = createHmac("sha256", sub.auth).update(ecdhSecret).digest();
  const ikm = createHmac("sha256", prkKey).update(Buffer.concat([Buffer.from("WebPush: info\0"), sub.ecdh.getPublicKey(), asPub, Buffer.from([1])])).digest();
  const prk = createHmac("sha256", salt).update(ikm).digest();
  const cek = createHmac("sha256", prk).update(Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).digest().subarray(0, 16);
  const nonce = createHmac("sha256", prk).update(Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).digest().subarray(0, 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1; while (end >= 0 && plain[end] === 0) end--; assert.equal(plain[end], 2, "last-record delimiter");
  return JSON.parse(plain.subarray(0, end).toString("utf8"));
}
function checkVapid(headers, endpoint){
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(headers.Authorization); assert.ok(m, "vapid header");
  const [h, c, sig] = m[1].split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), {typ: "JWT", alg: "ES256"});
  const claims = JSON.parse(Buffer.from(c, "base64url")); assert.equal(claims.aud, new URL(endpoint).origin); assert.ok(claims.exp > Date.now()/1000 && claims.exp <= Date.now()/1000 + 24*3600); assert.match(claims.sub, /^https:/);
  const raw = Buffer.from(m[2], "base64url"); assert.equal(raw.length, 65);
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: "jwk" });
  assert.ok(verify("sha256", Buffer.from(h + "." + c), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")), "VAPID signature verifies");
  assert.equal(headers["Content-Encoding"], "aes128gcm"); assert.ok(Number(headers.TTL) > 0);
  return m[2];
}

async function env(){
  const worker = await loadWorker(); const DB = makeD1(); const push = fakePush();
  const e = { DB, ASSETS: { fetch: async () => new Response("asset") }, PUSH_FETCH: push.fetch, PUSH_EXTRA_HOSTS: "push.test" };
  let cookie = "";
  const call = async (method, path, body, headers={}) => {
    const h = { "cf-connecting-ip": headers.ip || "1.1.1.1", ...headers };
    if (body !== undefined) h["content-type"] = "application/json";
    if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
    if (cookie && !headers.nocookie) h.cookie = cookie;
    const r = await worker.fetch(new Request("https://k.test" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
    const sc = r.headers.get("set-cookie"); if (sc && !headers.nocookie) cookie = sc.split(";")[0].replace(/=$/, "");
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text() };
  };
  const r = await call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await call("PUT", "/api/admin/settings", { open_time: "00:00", close_time: "00:00" });
  return { call, DB, push, e };
}
const idem = () => "k" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const customer = { name: "Ramesh", phone: "98765 43210", address: "House 12, Gali 3", locality: "Shanti Nagar", pincode: "452001" };
async function placeOrder(t, items, extra={}){
  const store = (await t.call("GET", "/api/store")).body;
  const lines = items || [{ variant_id: store.products[0].variants[0].id, qty: 1, price_paise: store.products[0].variants[0].price_paise }];
  const r = await t.call("POST", "/api/orders", { ...customer, items: lines, payment_method: "cod", idempotency_key: idem(), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}


const sql = (t, q, ...a) => t.DB._sql.prepare(q).all(...a);
const one = (t, q, ...a) => t.DB._sql.prepare(q).get(...a);
const firstVar = async t => { const s = (await t.call("GET", "/api/store")).body; return s.products.find(p => p.variants[0].in_stock).variants[0]; };
const adminSet = (t, id, to, from, reason) => t.call("POST", `/api/admin/orders/${id}/status`, { status: to, from, reason });
const orderId = (t, code) => one(t, "SELECT id FROM orders WHERE code=?", code).id;
async function deliver(t, code){ const id = orderId(t, code); for (const [to, from] of [["accepted","pending"],["preparing","accepted"],["out_for_delivery","preparing"],["delivered","out_for_delivery"]]) assert.equal((await adminSet(t, id, to, from)).status, 200); }

test("reorder: still-available items come back at CURRENT prices; unavailable items are named", async () => {
  const t = await env(); const s = (await t.call("GET", "/api/store")).body;
  const a = s.products[0].variants[0], b = s.products[1].variants[0];
  const o = await placeOrder(t, [{ variant_id: a.id, qty: 2, price_paise: a.price_paise }, { variant_id: b.id, qty: 1, price_paise: b.price_paise }]);
  t.DB._sql.prepare("UPDATE variants SET price_paise = price_paise + 500 WHERE id=?").run(a.id);   // price went up after the order
  t.DB._sql.prepare("UPDATE variants SET stock = 0 WHERE id=?").run(b.id);                          // other item sold out
  assert.equal((await t.call("POST", "/api/orders/reorder", { code: o.order.code, token: "f".repeat(48) })).status, 404, "token required");
  const r = await t.call("POST", "/api/orders/reorder", { code: o.order.code, token: o.token });
  assert.equal(r.status, 200);
  const ia = r.body.items.find(i => i.variant_id === a.id), ib = r.body.items.find(i => i.variant_id === b.id);
  assert.equal(ia.available, true); assert.equal(ia.qty, 2); assert.equal(ia.price_paise, a.price_paise + 500, "current price, not the old snapshot"); assert.equal(ia.was_paise, a.price_paise);
  assert.equal(ib.available, false); assert.equal(ib.problem, "out_of_stock");
  // the server still revalidates a cart built from the reorder
  const ok = await t.call("POST", "/api/orders", { ...customer, items: [{ variant_id: a.id, qty: 2, price_paise: ia.price_paise }], payment_method: "cod", idempotency_key: idem() });
  assert.equal(ok.status, 201); assert.equal(ok.body.order.subtotal_paise, (a.price_paise + 500) * 2);
});

test("customer cancellation: only while pending, stock released exactly once, idempotent, bhaiya gets a push", async () => {
  const t = await env(); const sub = fakeSubscription("adm"); await t.call("POST", "/api/admin/push/subscribe", { subscription: sub.json });
  const v = await firstVar(t); const stock0 = one(t, "SELECT stock FROM variants WHERE id=?", v.id).stock;
  const o = await placeOrder(t, [{ variant_id: v.id, qty: 3, price_paise: v.price_paise }]);
  assert.equal(one(t, "SELECT stock FROM variants WHERE id=?", v.id).stock, stock0 - 3);
  const H = { "x-order-token": o.token };
  assert.equal((await t.call("POST", `/api/orders/${o.order.code}/cancel`, {}, { "x-order-token": "0".repeat(48) })).status, 404);
  const c1 = await t.call("POST", `/api/orders/${o.order.code}/cancel`, {}, H);
  assert.equal(c1.status, 200, JSON.stringify(c1.body)); assert.equal(c1.body.already, false); assert.equal(c1.body.order.status, "cancelled");
  const c2 = await t.call("POST", `/api/orders/${o.order.code}/cancel`, {}, H);
  assert.equal(c2.status, 200); assert.equal(c2.body.already, true);
  assert.equal(one(t, "SELECT stock FROM variants WHERE id=?", v.id).stock, stock0, "released once, not twice");
  const pushes = t.push.sent.filter(s => s.endpoint === sub.json.endpoint).map(m => decrypt(m.body, sub));
  assert.ok(pushes.some(p => p.title.includes("रद्द") && p.title.includes(o.order.code)), "bhaiya notified of the cancellation");
  // after acceptance the customer can't cancel (server-enforced)
  const o2 = await placeOrder(t, [{ variant_id: v.id, qty: 1, price_paise: v.price_paise }]);
  assert.equal((await adminSet(t, orderId(t, o2.order.code), "accepted", "pending")).status, 200);
  const c3 = await t.call("POST", `/api/orders/${o2.order.code}/cancel`, {}, { "x-order-token": o2.token });
  assert.equal(c3.status, 409); assert.equal(c3.body.code, "not_cancellable");
  assert.equal(one(t, "SELECT status FROM orders WHERE code=?", o2.order.code).status, "accepted");
  assert.equal(one(t, "SELECT stock FROM variants WHERE id=?", v.id).stock, stock0 - 1);
  const det = await t.call("GET", `/api/orders/${o2.order.code}`, undefined, { "x-order-token": o2.token });
  assert.equal(det.body.order.can_cancel, false); assert.ok("phone" in det.body.shop);
});

test("rating: needs the order token, only after delivery, one per order, sanitised; admin sees it", async () => {
  const t = await env(); const o = await placeOrder(t);
  const H = { "x-order-token": o.token };
  assert.equal((await t.call("POST", `/api/orders/${o.order.code}/rating`, { stars: 5 }, H)).body.code, "not_delivered");
  await deliver(t, o.order.code);
  assert.equal((await t.call("POST", `/api/orders/${o.order.code}/rating`, { stars: 5 }, { "x-order-token": "a".repeat(48) })).status, 404, "wrong token rejected");
  assert.equal((await t.call("POST", `/api/orders/${o.order.code}/rating`, { stars: 9 }, H)).status, 400);
  const r1 = await t.call("POST", `/api/orders/${o.order.code}/rating`, { stars: 4, comment: "  <script>alert(1)</script> bahut   badhiya " }, H);
  assert.equal(r1.status, 201); assert.ok(!r1.body.rating.comment.includes("<")); assert.equal(r1.body.rating.comment, "scriptalert(1)/script bahut badhiya");
  const r2 = await t.call("POST", `/api/orders/${o.order.code}/rating`, { stars: 1 }, H);
  assert.equal(r2.status, 409); assert.equal(r2.body.code, "already_rated");
  const ad = (await t.call("GET", "/api/admin/ratings")).body; assert.equal(ad.ratings.length, 1); assert.equal(ad.ratings[0].stars, 4); assert.equal(ad.avg, 4);
  assert.equal((await t.call("GET", "/api/store")).body.reviews, null, "no public reviews unless bhaiya turns them on");
  await t.call("PUT", "/api/admin/settings", { show_reviews: true });
  const pub = (await t.call("GET", "/api/store")).body.reviews; assert.equal(pub.count, 1); assert.equal(pub.recent[0].name, "Ramesh"); assert.ok(!JSON.stringify(pub).includes("98765"));
});

test("reports: only delivered orders count as value; cancelled/rejected counted separately; test orders excluded; CSV export", async () => {
  const t = await env(); const v = await firstVar(t); const line = q => [{ variant_id: v.id, qty: q, price_paise: v.price_paise }];
  const a = await placeOrder(t, line(2), { payment_method: "cod" }); await deliver(t, a.order.code);
  const b = await placeOrder(t, line(1)); await deliver(t, b.order.code);
  const c = await placeOrder(t, line(4)); await adminSet(t, orderId(t, c.order.code), "rejected", "pending", "no stock");
  const d = await placeOrder(t, line(1)); await t.call("POST", `/api/orders/${d.order.code}/cancel`, {}, { "x-order-token": d.token });
  await placeOrder(t, line(5));                                      // still pending: not value
  const tst = await placeOrder(t, line(3), { name: "TEST – check" }); await deliver(t, tst.order.code);   // test order: excluded
  assert.equal(one(t, "SELECT is_test FROM orders WHERE code=?", tst.order.code).is_test, 1);
  const r = (await t.call("GET", "/api/admin/reports?range=today")).body;
  assert.equal(r.delivered.orders, 2);
  assert.equal(r.delivered.value_paise, a.order.total_paise + b.order.total_paise);
  assert.equal(r.delivered.avg_order_paise, Math.round((a.order.total_paise + b.order.total_paise) / 2));
  assert.equal(r.cancelled, 1); assert.equal(r.rejected, 1); assert.equal(r.open, 1); assert.equal(r.test_orders_excluded, 1);
  assert.equal(r.payment.find(x => x.method === "cod").n, 2);
  assert.equal(r.best_sellers[0].qty, 3, "qty from delivered orders only");
  assert.ok(r.slow_moving.length > 0 && r.slow_moving[0].qty === 0);
  assert.match(r.note, /not profit/);
  const day = r.days[r.days.length - 1]; assert.equal(day.value, r.delivered.value_paise);
  const csv = await t.call("GET", "/api/admin/reports.csv?range=7d"); assert.equal(csv.status, 200); assert.match(csv.body, /delivered_order_value_rs,/); assert.match(csv.body, /not profit/);
  assert.equal((await t.call("GET", "/api/admin/reports?range=custom&from=2026-10-10&to=2026-10-01")).status, 400);
  assert.equal((await t.call("GET", "/api/admin/reports", undefined, { nocookie: true })).status, 401);
  const dash = (await t.call("GET", "/api/admin/dashboard")).body; assert.equal(dash.best_sellers[0].qty, 3);
});

test("audit log: every stock change (manual, CSV, order reserve, release on reject/cancel), price change and status change is recorded", async () => {
  const t = await env(); const s = (await t.call("GET", "/api/store")).body; const p = s.products[0]; const v = p.variants[0];
  const base = one(t, "SELECT COALESCE(MAX(id),0) m FROM audit_log").m;
  const newRows = () => sql(t, "SELECT * FROM audit_log WHERE id > ? ORDER BY id", base);
  await t.call("POST", `/api/admin/variants/${v.id}/stock`, { set: 50 });
  let rows = newRows(); let x = rows.find(r => r.field === "stock" && r.after === "50");
  assert.ok(x); assert.equal(x.actor, "admin:bhaiya"); assert.equal(x.reason, "manual stock edit"); assert.equal(x.product_id, p.id);
  // price change through the item editor
  const cat = (await t.call("GET", "/api/admin/catalog")).body; const ap = cat.products.find(q => q.id === p.id);
  const vars = ap.variants.map(w => ({ id: w.id, label: w.label, price: ((w.price_paise + (w.id === v.id ? 300 : 0)) / 100).toFixed(2), mrp: "", stock: w.stock, low_stock: w.low_stock, active: w.active }));
  assert.equal((await t.call("PUT", `/api/admin/products/${p.id}`, { name_hi: ap.name_hi, name_en: ap.name_en, category_id: ap.category_id, icon: ap.icon, variants: vars })).status, 200);
  x = newRows().find(r => r.field === "price"); assert.ok(x); assert.equal(Number(x.after) - Number(x.before), 300); assert.equal(x.reason, "item edited");
  // CSV import
  const csv = (await t.call("GET", "/api/admin/csv")).body.replace(/^\ufeff/, "").split("\n"); const head = csv[0].split(",");
  const row = csv.find(l => l.includes(v.label) && l.includes(ap.name_hi)).split(","); row[head.indexOf("stock")] = "77";
  assert.equal((await t.call("POST", "/api/admin/csv", { csv: [csv[0], row.join(",")].join("\n") })).body.applied, true);
  x = newRows().find(r => r.field === "stock" && r.after === "77"); assert.ok(x); assert.equal(x.reason, "CSV import");
  // order reserve, then release on reject
  const price = (await t.call("GET", "/api/store")).body.products.find(q => q.id === p.id).variants.find(w => w.id === v.id).price_paise;
  const o = await placeOrder(t, [{ variant_id: v.id, qty: 2, price_paise: price }]);
  x = newRows().find(r => r.field === "stock" && r.before === "77" && r.after === "75"); assert.ok(x); assert.equal(x.actor, "customer"); assert.match(x.reason, new RegExp(o.order.code));
  assert.ok(newRows().find(r => r.entity === "order" && r.label === o.order.code && r.after === "pending"));
  await adminSet(t, orderId(t, o.order.code), "rejected", "pending", "no stock");
  x = newRows().find(r => r.field === "stock" && r.before === "75" && r.after === "77"); assert.ok(x); assert.match(x.reason, /rejected — stock released/);
  x = newRows().find(r => r.entity === "order" && r.before === "pending" && r.after === "rejected"); assert.ok(x); assert.equal(x.actor, "admin:bhaiya");
  // release on customer cancel
  const o2 = await placeOrder(t, [{ variant_id: v.id, qty: 1, price_paise: price }]);
  await t.call("POST", `/api/orders/${o2.order.code}/cancel`, {}, { "x-order-token": o2.token });
  x = newRows().find(r => r.field === "stock" && r.before === "76" && r.after === "77"); assert.ok(x); assert.equal(x.actor, "customer"); assert.match(x.reason, /cancelled — stock released/);
  assert.equal(one(t, "SELECT COUNT(*) n FROM audit_ctx").n, 0, "context cleared after each batch");
  const api = (await t.call("GET", `/api/admin/audit?product_id=${p.id}`)).body; assert.ok(api.entries.length >= 6);
  assert.ok(api.entries.every(e => e.product_id === p.id));
  assert.equal((await t.call("GET", "/api/admin/audit", undefined, { nocookie: true })).status, 401);
});

test("cart offers: minimum-purchase discount (₹ and %) and free delivery are applied by the server and stop after expiry", async () => {
  const t = await env(); await t.call("PUT", "/api/admin/settings", { delivery_charge: "20", free_delivery_above: "", min_order: "" });
  const v = await firstVar(t); const need = Math.ceil(50000 / v.price_paise); t.DB._sql.prepare("UPDATE variants SET stock=500 WHERE id=?").run(v.id);
  const line = q => [{ variant_id: v.id, qty: q, price_paise: v.price_paise }];
  assert.equal((await t.call("POST", "/api/admin/offers", { kind: "cart_flat", title_hi: "₹500 पर ₹50 छूट", amount_off: "50", min_cart: "", active: true })).status, 400, "min cart required");
  const f = await t.call("POST", "/api/admin/offers", { kind: "cart_flat", title_hi: "₹500 पर ₹50 छूट", amount_off: "50", min_cart: "500", active: true }); assert.equal(f.status, 201, JSON.stringify(f.body));
  const fd = await t.call("POST", "/api/admin/offers", { kind: "free_delivery", title_hi: "आज फ्री डिलीवरी", min_cart: "300", active: true, ends_at: Date.now() + 3600e3 }); assert.equal(fd.status, 201);
  const pub = (await t.call("GET", "/api/store")).body.offers; assert.ok(pub.some(o => o.rule === "cart_flat" && o.amount_off_paise === 5000 && o.min_cart_paise === 50000));
  // below ₹300: no discount, normal delivery
  const small = await placeOrder(t, line(1)); assert.equal(small.order.discount_paise, 0); assert.equal(small.order.delivery_paise, v.price_paise >= 30000 ? 0 : 2000);
  // above ₹500: ₹50 off + free delivery; client cannot change it
  const big = await placeOrder(t, line(need), { discount_paise: 99999, total_paise: 1 });
  const sub = v.price_paise * need;
  assert.equal(big.order.discount_paise, 5000); assert.equal(big.order.delivery_paise, 0); assert.equal(big.order.total_paise, sub - 5000); assert.equal(big.order.discount_title, "₹500 पर ₹50 छूट");
  // a better % offer wins (one discount, not stacked), with its cap
  const pc = await t.call("POST", "/api/admin/offers", { kind: "cart_percent", title_hi: "10% (₹100 तक)", percent_off: 10, amount_off: "100", min_cart: "500", active: true }); assert.equal(pc.status, 201);
  const big2 = await placeOrder(t, line(need)); const expect = Math.min(Math.round(sub * 0.1), 10000);
  assert.equal(big2.order.discount_paise, Math.max(expect, 5000));
  // expiry: move every offer's end into the past -> nothing applies any more
  t.DB._sql.prepare("UPDATE offers SET ends_at=?").run(Date.now() - 1000);
  const after = await placeOrder(t, line(need)); assert.equal(after.order.discount_paise, 0); assert.equal(after.order.delivery_paise, 2000); assert.equal(after.order.total_paise, sub + 2000);
  assert.equal((await t.call("GET", "/api/store")).body.offers.length, 0);
});

test("backup: admin and dev can download; no passwords, sessions, server keys or push endpoints inside; last backup time recorded", async () => {
  const t = await env(); await placeOrder(t);
  const sub = fakeSubscription("bk"); await t.call("POST", "/api/admin/push/subscribe", { subscription: sub.json });
  await t.call("GET", "/api/push/key"); // makes the VAPID key
  const r = await t.call("GET", "/api/admin/backup"); assert.equal(r.status, 200);
  const b = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  assert.equal(b.format, "kirana-backup"); assert.ok(b.tables.orders.length === 1 && b.tables.products.length > 0 && b.tables.variants.length > 0);
  for (const tb of ["admins","sessions","dev_accounts","dev_sessions","server_secrets","push_subscriptions","rate_events"]) assert.ok(!(tb in b.tables), tb + " excluded");
  const blob = JSON.stringify(b);
  const adm = one(t, "SELECT pass_hash, salt FROM admins"); assert.ok(!blob.includes(adm.pass_hash) && !blob.includes(adm.salt));
  const vap = one(t, "SELECT v FROM server_secrets WHERE k='vapid'").v; const d = JSON.parse(vap).jwk?.d; assert.ok(d && !blob.includes(d));
  assert.ok(!blob.includes(sub.json.endpoint)); assert.ok(!blob.includes("strongpass1"));
  assert.ok(Number(one(t, "SELECT v FROM service_state WHERE k='last_backup_at'").v) > 0);
  assert.equal((await t.call("GET", "/api/admin/backup", undefined, { nocookie: true })).status, 401);
  assert.equal((await t.call("GET", "/api/dev/backup", undefined, { nocookie: true })).status, 401);
});
