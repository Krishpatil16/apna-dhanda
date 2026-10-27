// v7 control-room tests (dev super-admin). Helpers copied from the v6 tests.
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


const PNG = "data:image/png;base64," + Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex").toString("base64");
const J = b => typeof b === "string" ? JSON.parse(b) : b;

const DEV_ENDPOINTS = (bid, ord) => [
  ["GET", "/api/dev/overview"], ["GET", "/api/dev/audit"], ["GET", "/api/dev/audit?shop=" + bid],
  ["GET", "/api/dev/platform"], ["POST", "/api/dev/platform", { signup_open: false }], ["POST", "/api/dev/platform", { price: "1", upi_id: "hack@ybl" }], ["GET", "/api/dev/shops"], ["GET", `/api/dev/shops/${bid}`],
  ["POST", `/api/dev/shops/${bid}/reset-password`, {}], ["POST", `/api/dev/shops/${bid}/reset-recovery`, {}],
  ["POST", `/api/dev/shops/${bid}/identity`, { name: "hack", slug: "hacked-shop" }], ["GET", "/api/dev/backup"],
  ["POST", `/api/dev/shops/${bid}/subscription`, { action: "extend", months: 12 }], ["POST", `/api/dev/shops/${bid}/subscription`, { action: "expire_now" }],
  ["POST", `/api/dev/shops/${bid}/subscription`, { action: "price", price: "1" }], ["POST", `/api/dev/shops/${bid}/bill`, {}], ["POST", "/api/dev/bills/send-due", {}],
  ["GET", "/api/dev/payments"], ["GET", "/api/dev/payments?status=all"], ["POST", "/api/dev/payments/1/verify", {}], ["POST", "/api/dev/payments/1/reject", { reason: "x" }], ["GET", "/api/dev/payments/1/screenshot"],
  ["POST", "/api/dev/settings", { auto_approve: true }], ["POST", "/api/dev/service", { shop_id: bid, action: "pause" }], ["POST", "/api/dev/brand", { name: "x" }],
  ["POST", "/api/dev/shops/app", { shop_id: bid, lock: false }], ["POST", "/api/dev/shops/delete", { shop_id: bid, confirm: "x" }], ["GET", "/api/dev/errors"], ["GET", "/api/dev/health"],
];

test("v7: a shopkeeper session gets 403 on EVERY dev endpoint (incl. the control-room ones); no session 401; dev POST without the same-origin header 403", async () => {
  const t = await twoShops();
  const o = await order(t.C, t.slug, t.bVar); assert.equal(o.status, 201, JSON.stringify(o.body)); const oid = t.one("SELECT id FROM orders WHERE shop_id=?", t.bid).id;
  const before = t.one("SELECT COUNT(*) AS n FROM audit_log").n;
  for (const [m, path, body] of DEV_ENDPOINTS(t.bid, oid)) {
    assert.equal((await t.B.call(m, path, body)).status, 403, "shopkeeper B → " + m + " " + path);
    assert.equal((await t.A.call(m, path, body)).status, 403, "shopkeeper A → " + m + " " + path);
    assert.equal((await t.jar().call(m, path, body)).status, 401, "anonymous → " + m + " " + path);
  }
  // nothing changed by any of those attempts
  assert.equal(t.one("SELECT status FROM orders WHERE id=?", oid).status, "pending");
  assert.equal(t.one("SELECT slug FROM shops WHERE id=?", t.bid).slug, t.slug);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM sessions WHERE dev_id IS NOT NULL").n, 0);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM audit_log").n, before);
  // the dev session itself: POSTs need the same-origin header
  const raw = await t.worker.fetch(new Request("https://k.test/api/dev/platform", { method: "POST", headers: { "content-type": "application/json", cookie: (await (async () => { const r = await t.worker.fetch(new Request("https://k.test/api/dev/login", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "kirana-dev", "cf-connecting-ip": "5.5.5.5" }, body: JSON.stringify({ username: DEV_USER, password: DEV_PASS }) }), t.env.e); return r.headers.get("set-cookie").split(";")[0]; })()) }, body: JSON.stringify({ signup_open: false }) }), t.env.e);
  assert.equal(raw.status, 403);
  assert.equal(t.one("SELECT v FROM service_state WHERE k='signup_open'").v, "1");
});

test("v7/v8: reset password / recovery key (shown once), rename + slug change, audit filters, dashboard numbers, platform settings", async () => {
  const t = await twoShops();
  // password
  const rp = await t.dev.call("POST", `/api/dev/shops/${t.bid}/reset-password`, {}); assert.equal(rp.status, 200); assert.match(rp.body.password, /^Dk-/);
  assert.equal((await t.B.call("GET", "/api/admin/dashboard")).status, 401, "old sessions logged out");
  const X = t.jar(); assert.equal((await X.call("POST", "/api/admin/login", { username: "9123456780", password: "bshoppass1" })).status, 401);
  const lg = await X.call("POST", "/api/admin/login", { username: "9123456780", password: rp.body.password }); assert.equal(lg.status, 200); assert.equal(lg.body.must_change, true);
  assert.ok(t.one("SELECT * FROM audit_log WHERE shop_id=? AND field='password_reset'", t.bid));
  assert.ok(!JSON.stringify(t.sql("SELECT * FROM audit_log")).includes(rp.body.password), "password never stored in the log");
  // recovery
  const rk = await t.dev.call("POST", `/api/dev/shops/${t.bid}/reset-recovery`, {}); assert.equal(rk.status, 200);
  assert.equal((await t.jar().call("POST", "/api/admin/recover", { username: "9123456780", setup_key: t.recovery, password: "zzpass1234" })).status, 403, "old key dead");
  assert.equal((await t.jar().call("POST", "/api/admin/recover", { username: "9123456780", setup_key: rk.body.recovery_key, password: "zzpass1234" }, { ip: "2.2.2.2" })).status, 200);
  // name + slug
  assert.equal((await t.dev.call("POST", `/api/dev/shops/${t.bid}/identity`, { slug: "admin" })).status, 400);
  assert.equal((await t.dev.call("POST", `/api/dev/shops/${t.bid}/identity`, { slug: t.one("SELECT slug FROM shops WHERE id=1").slug })).status, 409);
  const idn = await t.dev.call("POST", `/api/dev/shops/${t.bid}/identity`, { name: "TEST – नया नाम", slug: "test-naya-naam" }); assert.equal(idn.status, 200); assert.equal(idn.body.slug_changed, true);
  assert.equal((await t.C.call("GET", "/api/store", undefined, { shop: t.slug })).status, 404, "old link stops working");
  const ns = await t.C.call("GET", "/api/store", undefined, { shop: "test-naya-naam" }); assert.equal(ns.status, 200); assert.equal(ns.body.settings.store_name_hi, "TEST – नया नाम");
  assert.ok(t.one("SELECT * FROM audit_log WHERE shop_id=? AND field='slug' AND before=? AND after='test-naya-naam'", t.bid, t.slug));
  // dashboard (subscription numbers, no order numbers) + audit
  const ov = await t.dev.call("GET", "/api/dev/overview"); assert.equal(ov.body.shops.total, 2); assert.equal(ov.body.shops.active, 2); assert.equal(ov.body.shops.pending, 0);
  assert.equal(ov.body.orders, undefined, "no order numbers in dev"); assert.equal(ov.body.subs.TRIAL, 2); assert.equal(ov.body.payments_to_verify, 0);
  const au = await t.dev.call("GET", `/api/dev/audit?shop=${t.bid}`); assert.ok(au.body.audit.length > 0); assert.ok(au.body.audit.every(a => a.shop_id === t.bid));
  assert.ok(au.body.audit.some(a => a.action === "active"), "approval is in the audit"); assert.ok(au.body.audit.every(a => a.src !== "data"), "no item/order history");
  // platform: sign-up off → refused + landing hides the button; landing text
  assert.equal((await t.dev.call("POST", "/api/dev/platform", { signup_open: false, landing_title: "Krish ki <b>dukaan</b>", landing_text: "Sab free" })).status, 200);
  assert.equal((await t.jar().call("POST", "/api/admin/signup", { owner_name: "Z", shop_name: "Z shop", mobile: "9111111111", password: "zshoppass1" }, { ip: "9.9.9.9" })).status, 403);
  assert.equal((await t.jar().call("GET", "/api/admin/state")).body.signup_open, false);
  const land = await t.jar().call("GET", "/"); assert.match(land.body, /class="lf-go closed"/); assert.match(land.body, /Krish ki bdukaan\/b|Krish ki b/); assert.match(land.body, /Sab free/); assert.ok(!land.body.includes("<b>dukaan"));
  assert.match(land.body, /<svg class="bm"/, "built-in Apna Dhanda mark"); assert.ok(!land.body.includes(">क<"));
  assert.equal((await t.dev.call("POST", "/api/dev/platform", { signup_open: true })).status, 200);
  assert.equal((await t.jar().call("POST", "/api/admin/signup", { owner_name: "Z", shop_name: "Z shop", mobile: "9111111111", password: "zshoppass1" }, { ip: "9.9.9.8" })).status, 201);
});
