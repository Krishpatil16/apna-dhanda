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

test("VAPID public key is served; the private key never leaves the server", async () => {
  const t = await env();
  const k = await t.call("GET", "/api/push/key"); assert.equal(k.status, 200);
  assert.equal(Buffer.from(k.body.public_key, "base64url").length, 65);
  assert.equal((await t.call("GET", "/api/push/key")).body.public_key, k.body.public_key, "stable key");
  const blob = JSON.stringify([(await t.call("GET", "/api/store")).body, (await t.call("GET", "/api/admin/push")).body, (await t.call("GET", "/api/admin/state")).body]);
  const { d } = JSON.parse(JSON.parse(t.DB._sql.prepare("SELECT v FROM server_secrets WHERE k='vapid'").get().v).jwk ? JSON.stringify(JSON.parse(t.DB._sql.prepare("SELECT v FROM server_secrets WHERE k='vapid'").get().v).jwk) : "{}");
  assert.ok(d && !blob.includes(d), "private key not in any API response");
});

test("customer push subscription: needs the order's private token; save, dedupe, remove; bad endpoints refused", async () => {
  const t = await env(); const o = await placeOrder(t); const sub = fakeSubscription("c1");
  assert.equal((await t.call("POST", "/api/push/order", { code: o.order.code, token: "0".repeat(48), subscription: sub.json })).status, 404);
  assert.equal((await t.call("POST", "/api/push/order", { code: o.order.code, token: o.token, subscription: { ...sub.json, endpoint: "https://evil.example/x" } })).status, 400);
  assert.equal((await t.call("POST", "/api/push/order", { code: o.order.code, token: o.token, subscription: { ...sub.json, keys: { p256dh: "abc", auth: "def" } } })).status, 400);
  assert.equal((await t.call("POST", "/api/push/order", { code: o.order.code, token: o.token, subscription: sub.json })).status, 200);
  assert.equal((await t.call("POST", "/api/push/order", { code: o.order.code, token: o.token, subscription: sub.json })).status, 200);
  assert.equal(t.DB._sql.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE role='customer'").get().n, 1, "same device saved once");
  const rm = await t.call("POST", "/api/push/order/remove", { code: o.order.code, token: o.token, endpoint: sub.json.endpoint });
  assert.equal(rm.body.removed, 1);
  assert.equal(t.DB._sql.prepare("SELECT COUNT(*) n FROM push_subscriptions").get().n, 0);
});

test("admin alert subscription needs login; new order sends an encrypted, VAPID-signed push to bhaiya", async () => {
  const t = await env(); const sub = fakeSubscription("admin1");
  assert.equal((await t.call("POST", "/api/admin/push/subscribe", { subscription: sub.json }, { nocookie: true })).status, 401);
  assert.equal((await t.call("POST", "/api/admin/push/subscribe", { subscription: sub.json })).status, 200);
  assert.equal((await t.call("GET", "/api/admin/push")).body.devices.length, 1);
  const o = await placeOrder(t);
  const msgs = t.push.sent.filter(s => s.endpoint === sub.json.endpoint); assert.equal(msgs.length, 1);
  const k = checkVapid(msgs[0].headers, sub.json.endpoint);
  assert.equal(k, (await t.call("GET", "/api/push/key")).body.public_key);
  const payload = decrypt(msgs[0].body, sub);
  assert.equal(payload.title, `नया ऑर्डर आया — ${o.order.code}, ₹${(o.order.total_paise/100).toLocaleString("en-IN")}`);
  assert.match(payload.url, /^\/admin#bill=\d+$/); // v10.9: the tap opens the order's bill
  assert.ok(httpEce || process.env.NO_HTTP_ECE, "http_ece (reference RFC 8188 implementation) should be installed: npm i -D http_ece");
  if (httpEce) { // cross-check with the reference implementation of RFC 8188/8291
    const plain = httpEce.decrypt(msgs[0].body, { version: "aes128gcm", privateKey: sub.ecdh, authSecret: sub.auth });
    assert.equal(JSON.parse(plain.toString("utf8")).title, payload.title);
  }
  const att = (await t.call("GET", "/api/admin/push")).body.attempts;
  assert.equal(att[0].event, "new_order"); assert.equal(att[0].outcome, "accepted"); assert.equal(att[0].http_status, 201);
  // test button
  const tb = await t.call("POST", "/api/admin/push/test", {}); assert.equal(tb.body.results[0].outcome, "accepted");
  // unsubscribe
  assert.equal((await t.call("POST", "/api/admin/push/unsubscribe", { endpoint: sub.json.endpoint })).body.removed, 1);
  const before = t.push.sent.length; await placeOrder(t); assert.equal(t.push.sent.length, before, "no push after unsubscribe");
  assert.equal((await t.call("GET", "/api/admin/push")).body.attempts[0].outcome, "no_subscription");
});

test("customer gets a push on every status change: accepted, preparing, out for delivery, delivered; and rejected/cancelled with reason", async () => {
  const t = await env(); const o = await placeOrder(t); const sub = fakeSubscription("cust");
  await t.call("POST", "/api/push/order", { code: o.order.code, token: o.token, subscription: sub.json });
  const id = t.DB._sql.prepare("SELECT id FROM orders WHERE code=?").get(o.order.code).id;
  const expect = { accepted: "✅ ऑर्डर मंज़ूर हो गया", preparing: "🧺 ऑर्डर तैयार हो रहा है", out_for_delivery: "🛵 ऑर्डर रास्ते में है", delivered: "🏠 ऑर्डर पहुँच गया" };
  for (const st of Object.keys(expect)) {
    const n = t.push.sent.length;
    assert.equal((await t.call("POST", `/api/admin/orders/${id}/status`, { status: st })).status, 200);
    assert.equal(t.push.sent.length, n + 1, st);
    const pl = decrypt(t.push.sent.at(-1).body, sub); checkVapid(t.push.sent.at(-1).headers, sub.json.endpoint);
    assert.equal(pl.title, expect[st]); assert.ok(pl.body.includes(o.order.code)); assert.equal(pl.url, `/track#open=${o.order.code}`);
    assert.ok(!JSON.stringify(pl).includes(o.token), "private token never in a push");
  }
  // rejected
  const o2 = await placeOrder(t); await t.call("POST", "/api/push/order", { code: o2.order.code, token: o2.token, subscription: sub.json });
  const id2 = t.DB._sql.prepare("SELECT id FROM orders WHERE code=?").get(o2.order.code).id;
  await t.call("POST", `/api/admin/orders/${id2}/status`, { status: "rejected", reason: "आटा ख़त्म है" });
  let pl = decrypt(t.push.sent.at(-1).body, sub); assert.equal(pl.title, "❌ ऑर्डर नहीं लिया जा सका"); assert.ok(pl.body.includes("आटा ख़त्म है"));
  // cancelled
  const o3 = await placeOrder(t); await t.call("POST", "/api/push/order", { code: o3.order.code, token: o3.token, subscription: sub.json });
  const id3 = t.DB._sql.prepare("SELECT id FROM orders WHERE code=?").get(o3.order.code).id;
  await t.call("POST", `/api/admin/orders/${id3}/status`, { status: "accepted" });
  await t.call("POST", `/api/admin/orders/${id3}/status`, { status: "cancelled", reason: "ग्राहक ने मना किया" });
  pl = decrypt(t.push.sent.at(-1).body, sub); assert.equal(pl.title, "⚠️ ऑर्डर रद्द हुआ"); assert.ok(pl.body.includes("ग्राहक ने मना किया"));
  // honest log on the admin order list
  const list = (await t.call("GET", "/api/admin/orders?status=all")).body.orders;
  const row = list.find(x => x.code === o3.order.code); assert.equal(row.push.customer_devices, 1); assert.equal(row.push.last.outcome, "accepted");
});

test("expired subscriptions (404/410) are removed and logged; other failures are logged, not hidden", async () => {
  const t = await env(); const o = await placeOrder(t); const a = fakeSubscription("gone"), b = fakeSubscription("err");
  await t.call("POST", "/api/push/order", { code: o.order.code, token: o.token, subscription: a.json });
  await t.call("POST", "/api/push/order", { code: o.order.code, token: o.token, subscription: b.json });
  t.push.statusFor.set(a.json.endpoint, 410); t.push.statusFor.set(b.json.endpoint, 500);
  const id = t.DB._sql.prepare("SELECT id FROM orders WHERE code=?").get(o.order.code).id;
  await t.call("POST", `/api/admin/orders/${id}/status`, { status: "accepted" });
  const subs = t.DB._sql.prepare("SELECT endpoint, fail_count FROM push_subscriptions").all();
  assert.deepEqual(subs.map(s => s.endpoint), [b.json.endpoint]); assert.equal(subs[0].fail_count, 1);
  const outcomes = t.DB._sql.prepare("SELECT outcome, http_status FROM notification_attempts WHERE order_id=? AND role='customer' ORDER BY id").all(id).map(r => r.outcome + ":" + r.http_status).sort();
  assert.deepEqual(outcomes, ["expired:410", "rejected:500"]);
});

test("offers: live % offer and fixed offer price are applied by the server at checkout and snapshotted", async () => {
  const t = await env();
  let store = (await t.call("GET", "/api/store")).body;
  assert.deepEqual(store.offers, [], "no customer-visible offers by default (demo offer is off)");
  const demo = (await t.call("GET", "/api/admin/offers")).body.offers; assert.equal(demo.length, 1); assert.equal(demo[0].active, false); assert.equal(demo[0].is_demo, true);
  const atta = store.products.find(p => p.name_en === "Wheat Atta"); const dal = store.products.find(p => p.name_en === "Toor Dal");
  // fixed price on Atta 5 kg (₹245 -> ₹229)
  let r = await t.call("POST", "/api/admin/offers", { title_hi: "आटा सस्ता", kind: "price", active: true, product_ids: [atta.id], variant_prices: [{ variant_id: atta.variants[0].id, offer_price: "229" }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // offer price must be below normal price
  assert.equal((await t.call("POST", "/api/admin/offers", { title_hi: "गलत", kind: "price", active: true, variant_prices: [{ variant_id: atta.variants[0].id, offer_price: "300" }] })).status, 400);
  // 10% off dal (₹80 -> ₹72, ₹155 -> ₹139.50)
  r = await t.call("POST", "/api/admin/offers", { title_hi: "दाल पर 10%", kind: "percent", percent_off: 10, active: true, product_ids: [dal.id] }); assert.equal(r.status, 201);
  store = (await t.call("GET", "/api/store")).body;
  assert.equal(store.offers.length, 2);
  const atta2 = store.products.find(p => p.id === atta.id), dal2 = store.products.find(p => p.id === dal.id);
  assert.equal(atta2.variants[0].price_paise, 22900); assert.equal(atta2.variants[0].base_price_paise, 24500); assert.ok(atta2.offer_id);
  assert.equal(atta2.variants[1].price_paise, 48000, "other size keeps normal price"); assert.equal(atta2.variants[1].base_price_paise, null);
  assert.equal(dal2.variants[0].price_paise, 7200); assert.equal(dal2.variants[1].price_paise, 13950);
  // a browser that sends the normal price is told the price changed (server decides)
  const stale = await t.call("POST", "/api/orders", { ...customer, items: [{ variant_id: atta.variants[0].id, qty: 2, price_paise: 24500 }], payment_method: "cod", idempotency_key: idem() });
  assert.equal(stale.status, 409); assert.equal(stale.body.problems[0].price_paise, 22900);
  // a browser that lies with a lower price is refused too
  assert.equal((await t.call("POST", "/api/orders", { ...customer, items: [{ variant_id: atta.variants[0].id, qty: 1, price_paise: 100 }], payment_method: "cod", idempotency_key: idem() })).status, 409);
  const o = await placeOrder(t, [{ variant_id: atta.variants[0].id, qty: 2, price_paise: 22900 }, { variant_id: dal.variants[1].id, qty: 1, price_paise: 13950 }]);
  assert.equal(o.order.subtotal_paise, 22900*2 + 13950);
  const items = t.DB._sql.prepare("SELECT unit_price_paise, base_price_paise, offer_title, line_total_paise FROM order_items ORDER BY id").all();
  assert.deepEqual(items.map(i => [i.unit_price_paise, i.base_price_paise, i.offer_title]), [[22900, 24500, "आटा सस्ता"], [13950, 15500, "दाल पर 10%"]]);
  // editing the offer later does not rewrite the order
  const offers = (await t.call("GET", "/api/admin/offers")).body.offers; const aOffer = offers.find(x => x.title_hi === "आटा सस्ता");
  await t.call("DELETE", `/api/admin/offers/${aOffer.id}`);
  assert.equal(t.DB._sql.prepare("SELECT unit_price_paise FROM order_items ORDER BY id LIMIT 1").get().unit_price_paise, 22900);
  assert.equal((await t.call("GET", "/api/store")).body.products.find(p => p.id === atta.id).variants[0].price_paise, 24500);
});

test("offers: scheduled and expired offers do not apply; switching off stops them", async () => {
  const t = await env(); const store = (await t.call("GET", "/api/store")).body;
  const milk = store.products.find(p => p.name_en === "Toned Milk"); const v = milk.variants[0];
  const now = Date.now();
  await t.call("POST", "/api/admin/offers", { title_hi: "पुराना", kind: "price", active: true, ends_at: now - 1000, variant_prices: [{ variant_id: v.id, offer_price: "20" }] });
  await t.call("POST", "/api/admin/offers", { title_hi: "आने वाला", kind: "price", active: true, starts_at: now + 3600e3, variant_prices: [{ variant_id: v.id, offer_price: "21" }] });
  let s = (await t.call("GET", "/api/store")).body; assert.equal(s.products.find(p => p.id === milk.id).variants[0].price_paise, 2800); assert.equal(s.offers.length, 0);
  const states = (await t.call("GET", "/api/admin/offers")).body.offers.map(o => o.state).sort(); assert.deepEqual(states, ["expired", "off", "scheduled"]);
  // order at normal price works; offer price is refused
  assert.equal((await t.call("POST", "/api/orders", { ...customer, items: [{ variant_id: v.id, qty: 1, price_paise: 2000 }], payment_method: "cod", idempotency_key: idem() })).status, 409);
  await placeOrder(t, [{ variant_id: v.id, qty: 1, price_paise: 2800 }]);
  // an offer that is live, then expires between browsing and checkout: server applies the normal price
  const r = await t.call("POST", "/api/admin/offers", { title_hi: "अभी", kind: "percent", percent_off: 50, active: true, ends_at: now + 60e3, product_ids: [milk.id] });
  s = (await t.call("GET", "/api/store")).body; assert.equal(s.products.find(p => p.id === milk.id).variants[0].price_paise, 1400);
  t.DB._sql.prepare("UPDATE offers SET ends_at=? WHERE id=?").run(Date.now() - 1, r.body.id);
  const late = await t.call("POST", "/api/orders", { ...customer, items: [{ variant_id: v.id, qty: 1, price_paise: 1400 }], payment_method: "cod", idempotency_key: idem() });
  assert.equal(late.status, 409); assert.equal(late.body.problems[0].price_paise, 2800);
  // switch on/off
  t.DB._sql.prepare("UPDATE offers SET ends_at=NULL WHERE id=?").run(r.body.id);
  await t.call("POST", `/api/admin/offers/${r.body.id}/active`, { active: false });
  assert.equal((await t.call("GET", "/api/store")).body.products.find(p => p.id === milk.id).variants[0].price_paise, 2800);
  // category-wide % offer
  await t.call("POST", "/api/admin/offers", { title_hi: "दूध-दही सस्ता", kind: "percent", percent_off: 10, active: true, category_id: milk.category_id });
  assert.equal((await t.call("GET", "/api/store")).body.products.find(p => p.id === milk.id).variants[0].price_paise, 2520);
  // offers are admin-only to create
  assert.equal((await t.call("POST", "/api/admin/offers", { title_hi: "x", kind: "info" }, { nocookie: true })).status, 401);
});

test("My Orders lists only the orders this browser holds tokens for", async () => {
  const t = await env(); const a = await placeOrder(t); const b = await placeOrder(t); const other = await placeOrder(t, undefined, { name: "Suresh", phone: "9123456780" });
  const r = await t.call("POST", "/api/orders/mine", { orders: [{ code: a.order.code, token: a.token }, { code: b.order.code, token: b.token }, { code: other.order.code, token: "f".repeat(48) }] });
  assert.equal(r.status, 200);
  const ok = r.body.orders.filter(o => !o.missing); assert.deepEqual(ok.map(o => o.code).sort(), [a.order.code, b.order.code].sort());
  assert.ok(r.body.orders.find(o => o.code === other.order.code).missing, "a code without its token reveals nothing");
  assert.ok(!JSON.stringify(r.body).includes("Suresh") && !JSON.stringify(r.body).includes("9123456780"));
  assert.ok(!JSON.stringify(r.body).includes("98765"), "no phone or address in the list");
  assert.equal(ok[0].status, "pending"); assert.ok(ok[0].item_count >= 1);
  // live status: after accept, the list shows it
  const id = t.DB._sql.prepare("SELECT id FROM orders WHERE code=?").get(a.order.code).id;
  await t.call("POST", `/api/admin/orders/${id}/status`, { status: "accepted" });
  const r2 = await t.call("POST", "/api/orders/mine", { orders: [{ code: a.order.code, token: a.token }] });
  assert.equal(r2.body.orders[0].status, "accepted");
});

test("v6: demo removal endpoint no longer exists", async () => {
  const t = await env();
  assert.equal((await t.call("POST", "/api/admin/demo/remove", {})).status, 404);
});
