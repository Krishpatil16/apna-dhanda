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


const PNG = "data:image/png;base64," + Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex").toString("base64");
const J = b => typeof b === "string" ? JSON.parse(b) : b;


const DAYMS = 864e5;
const realNow = Date.now;
async function withClock(fn){ try { return await fn(); } finally { Date.now = realNow; } }
let W = null; // sessions would expire across injected months; keep them alive so the test is about subscriptions only
const at = t => { Date.now = () => t; if (W) { W.DB._sql.prepare("UPDATE sessions SET expires_at=9e15").run(); W.DB._sql.prepare("UPDATE dev_sessions SET expires_at=9e15").run(); } };
const subOf = async (dev, id) => (await dev.call("GET", `/api/dev/shops/${id}`)).body;
const pushSub = id => { const e = createECDH("prime256v1"); e.generateKeys(); return { endpoint: `https://push.test/send/${id}`, keys: { p256dh: e.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 3).toString("base64url") } }; };

test("v8: trial → DUE → EXPIRED state machine (clock injected); expired = auto-paused storefront, orders refused, admin shows only recharge", () => withClock(async () => {
  const T0 = realNow(); at(T0);
  const t = await twoShops(); W = t; const { B, C, dev, bid, slug } = t;
  let d = await subOf(dev, bid);
  assert.equal(d.sub.state, "TRIAL"); assert.ok(Math.abs(d.sub.trial_end - (T0 + 10*DAYMS)) < 5000, "trial = signup + 10 days");
  assert.equal(d.shop.status, "active");
  at(T0 + 5*DAYMS); assert.equal((await subOf(dev, bid)).sub.state, "TRIAL");
  at(T0 + 8*DAYMS); d = await subOf(dev, bid); assert.equal(d.sub.state, "DUE"); assert.equal(d.sub.days_left, 2);
  const st = (await B.call("GET", "/api/admin/state")).body; assert.equal(st.service.sub.state, "DUE", "shopkeeper sees the reminder state");
  assert.equal((await order(C, slug, t.bVar)).status, 201, "DUE still takes orders");
  at(T0 + 11*DAYMS);
  d = await subOf(dev, bid); assert.equal(d.sub.state, "EXPIRED"); assert.equal(d.service.status, "paused"); assert.equal(d.service.paused_reason, "expired");
  const before = t.one("SELECT COUNT(*) AS n FROM orders WHERE shop_id=?", bid).n;
  const o = await order(C, slug, t.bVar); assert.equal(o.status, 423, "auto-pause blocks orders");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM orders WHERE shop_id=?", bid).n, before);
  const pg = await C.call("GET", `/s/${slug}`); assert.equal(pg.status, 503); assert.match(pg.body, /दुकान अभी बंद है/);
  for (const [m, p, b] of [["GET", "/api/admin/orders"], ["GET", "/api/admin/products"], ["GET", "/api/admin/dashboard"], ["PUT", "/api/admin/settings", { phone: "9000000000" }], ["POST", "/api/admin/online", { online: true }]]) {
    const r = await B.call(m, p, b); assert.equal(r.status, 402, m + " " + p); assert.equal(r.body.code, "subscription_expired");
  }
  const sv = await B.call("GET", "/api/admin/subscription"); assert.equal(sv.status, 200); assert.equal(sv.body.sub.state, "EXPIRED");
  assert.equal((await B.call("GET", "/api/admin/state")).body.service.paused_reason, "expired");
  assert.ok(t.one("SELECT COUNT(*) AS n FROM products WHERE shop_id=?", bid).n > 0, "data kept");
  // the other shop is unaffected by B's expiry; manual extend brings B back
  const ex = await dev.call("POST", `/api/dev/shops/${bid}/subscription`, { action: "extend", months: 1 }); assert.equal(ex.status, 200); assert.equal(ex.body.sub.state, "ACTIVE");
  assert.ok(ex.body.sub.paid_until > T0 + 11*DAYMS + 27*DAYMS);
  assert.equal((await order(C, slug, t.bVar)).status, 201);
  at(ex.body.sub.paid_until - 2*DAYMS); assert.equal((await subOf(dev, bid)).sub.state, "DUE");
  at(ex.body.sub.paid_until + 1000); assert.equal((await subOf(dev, bid)).sub.state, "EXPIRED");
  const log = (await subOf(dev, bid)).log; assert.ok(log.some(l => l.action === "extended"), "change log");
}));

test("v8: bill from dev → invoice + web push + WhatsApp link; UTR submit → provisional resume; verify extends; overview numbers", () => withClock(async () => {
  const T0 = realNow(); at(T0);
  const t = await twoShops(); W = t; const { B, C, dev, bid, slug } = t;
  assert.equal((await B.call("POST", "/api/admin/push/subscribe", { subscription: pushSub("bkeeper") })).status, 200);
  const pl = await dev.call("POST", "/api/dev/platform", { price: "299", months: 3, upi_id: "krish@okaxis", upi_name: "Krish Patil" }); assert.equal(pl.status, 200);
  assert.equal(pl.body.platform.price_paise, 29900); assert.equal(pl.body.platform.months, 3);
  assert.equal((await dev.call("POST", "/api/dev/platform", { months: 2 })).status, 400);
  assert.equal((await dev.call("POST", "/api/dev/platform", { upi_id: "not a upi" })).status, 400);
  at(T0 + 40*DAYMS); assert.equal((await subOf(dev, bid)).sub.state, "EXPIRED");
  t.env.sent.length = 0;
  const bill = await dev.call("POST", `/api/dev/shops/${bid}/bill`, {}); assert.equal(bill.status, 200, JSON.stringify(bill.body));
  assert.match(bill.body.invoice.number, /^AD-\d{6}-\d{4}$/); assert.equal(bill.body.invoice.amount_paise, 29900*3); assert.equal(bill.body.invoice.months, 3); assert.equal(bill.body.invoice.status, "unpaid");
  assert.equal(bill.body.push.accepted, 1); assert.equal(t.env.sent.length, 1, "web push sent to the shopkeeper's device");
  assert.match(bill.body.wa_url, /^https:\/\/wa\.me\/919123456780\?text=/); const msg = decodeURIComponent(bill.body.wa_url.split("text=")[1]);
  assert.match(msg, /897/); assert.match(msg, /\/admin#recharge/); assert.match(msg, new RegExp(bill.body.invoice.number));
  // sending again reuses the open invoice
  const again = await dev.call("POST", `/api/dev/shops/${bid}/bill`, {}); assert.equal(again.body.invoice.id, bill.body.invoice.id); assert.equal(again.body.invoice.sent_count, 2);
  // shopkeeper sees the bill + where to pay
  const sv = (await B.call("GET", "/api/admin/subscription")).body; assert.equal(sv.invoice.number, bill.body.invoice.number); assert.equal(sv.pay_to.upi_id, "krish@okaxis"); assert.equal(sv.pay_to.upi_name, "Krish Patil");
  // UTR: invalid → 400; good → provisional access, shop resumes by itself
  assert.equal((await B.call("POST", "/api/admin/subscription/pay", { invoice_id: sv.invoice.id, utr: "12345" })).status, 400);
  const pay = await B.call("POST", "/api/admin/subscription/pay", { invoice_id: sv.invoice.id, utr: "4123 5678 9012", screenshot: "data:image/png;base64,iVBORw0KGgo=" });
  assert.equal(pay.status, 200, JSON.stringify(pay.body)); assert.equal(pay.body.provisional, true); assert.equal(pay.body.sub.state, "PAYMENT_PENDING_VERIFY");
  assert.ok(Math.abs(pay.body.sub.provisional_until - (T0 + 40*DAYMS + 48*3600e3)) < 5000);
  assert.equal((await order(C, slug, t.bVar)).status, 201, "resumed provisionally");
  assert.equal((await C.call("GET", `/s/${slug}`)).status, 200);
  assert.equal((await B.call("GET", "/api/admin/orders")).status, 200, "admin usable again");
  assert.equal((await B.call("POST", "/api/admin/subscription/pay", { invoice_id: sv.invoice.id, utr: "999988887777" })).status, 409, "one pending payment per bill");
  // dev: payments to verify
  const ov1 = (await dev.call("GET", "/api/dev/overview")).body; assert.equal(ov1.payments_to_verify, 1); assert.equal(ov1.subs.PAYMENT_PENDING_VERIFY, 1);
  const list = (await dev.call("GET", "/api/dev/payments")).body.payments; assert.equal(list.length, 1); assert.equal(list[0].utr, "412356789012"); assert.equal(list[0].has_screenshot, true);
  const shot = await dev.call("GET", `/api/dev/payments/${list[0].id}/screenshot`); assert.equal(shot.status, 200);
  const v = await dev.call("POST", `/api/dev/payments/${list[0].id}/verify`, {}); assert.equal(v.status, 200); assert.equal(v.body.sub.state, "ACTIVE");
  const expect = new Date(T0 + 40*DAYMS + 330*60000); expect.setUTCMonth(expect.getUTCMonth() + 3);
  assert.ok(Math.abs(v.body.sub.paid_until - (expect.getTime() - 330*60000)) < 5000, "verify extends paid_until by the billed period");
  assert.equal(t.one("SELECT status FROM invoices WHERE id=?", sv.invoice.id).status, "paid");
  assert.equal((await dev.call("POST", `/api/dev/payments/${list[0].id}/verify`, {})).status, 409, "only once");
  const ov2 = (await dev.call("GET", "/api/dev/overview")).body; assert.equal(ov2.payments_to_verify, 0); assert.equal(ov2.revenue.received_month_paise, 29900*3); assert.equal(ov2.subs.ACTIVE, 1);
  // per-shop page: invoice history, paid-until, log
  const d = await subOf(dev, bid); assert.equal(d.invoices.length, 1); assert.equal(d.invoices[0].status, "paid"); assert.ok(d.log.some(l => l.action === "payment_verified")); assert.ok(d.log.some(l => l.action === "bill_sent"));
  // per-shop price override
  assert.equal((await dev.call("POST", `/api/dev/shops/${bid}/subscription`, { action: "price", price: "150" })).status, 200);
  assert.equal((await dev.call("GET", "/api/dev/shops")).body.shops.find(s => s.id === bid).monthly_paise, 15000);
}));

test("v8: reject re-pauses; duplicate UTR refused; 48h provisional access lapses; no provisional loop after a rejection", () => withClock(async () => {
  const T0 = realNow(); at(T0);
  const t = await twoShops(); W = t; const { A, B, C, dev, bid, slug } = t;
  at(T0 + 35*DAYMS);
  const inv = (await B.call("POST", "/api/admin/subscription/invoice", {})).body.invoice; assert.equal(inv.amount_paise, 19900, "default ₹199 × 1 month");
  const p1 = await B.call("POST", "/api/admin/subscription/pay", { invoice_id: inv.id, utr: "111122223333" }); assert.equal(p1.body.sub.state, "PAYMENT_PENDING_VERIFY");
  // duplicate UTR, even from another shop
  const invA = (await A.call("POST", "/api/admin/subscription/invoice", {})).body.invoice;
  const dup = await A.call("POST", "/api/admin/subscription/pay", { invoice_id: invA.id, utr: "111122223333" }); assert.equal(dup.status, 409); assert.equal(dup.body.code, "duplicate_utr");
  // shop A can't pay B's bill
  assert.equal((await A.call("POST", "/api/admin/subscription/pay", { invoice_id: inv.id, utr: "555566667777" })).status, 404);
  // reject → re-paused with reason
  const pid = (await dev.call("GET", "/api/dev/payments")).body.payments.find(p => p.shop_id === bid).id;
  const rj = await dev.call("POST", `/api/dev/payments/${pid}/reject`, { reason: "UTR नहीं मिला" }); assert.equal(rj.status, 200); assert.equal(rj.body.sub.state, "EXPIRED");
  assert.equal((await order(C, slug, t.bVar)).status, 423); assert.equal(t.one("SELECT status FROM invoices WHERE id=?", inv.id).status, "unpaid");
  const sv = (await B.call("GET", "/api/admin/subscription")).body; assert.equal(sv.payments[0].status, "rejected"); assert.equal(sv.payments[0].reason, "UTR नहीं मिला");
  // the rejected UTR can't be reused; a new UTR is accepted for verification but gives no new provisional access (fake-UTR loop)
  assert.equal((await B.call("POST", "/api/admin/subscription/pay", { invoice_id: inv.id, utr: "111122223333" })).status, 409);
  const p2 = await B.call("POST", "/api/admin/subscription/pay", { invoice_id: inv.id, utr: "444455556666" }); assert.equal(p2.status, 200); assert.equal(p2.body.provisional, false); assert.equal(p2.body.sub.state, "EXPIRED");
  // 48h lapse: a fresh shop pays, nobody verifies within 48h → back to EXPIRED by itself
  const X = t.jar(); const s = await X.call("POST", "/api/admin/signup", { owner_name: "Lapse", shop_name: "TEST – Lapse Store", mobile: "9000022222", password: "lapsepass1" }, { ip: "7.7.7.7" });
  const xid = s.body.shop.id; await dev.call("POST", "/api/dev/service", { shop_id: xid, action: "approve" });
  at(T0 + 35*DAYMS + 31*DAYMS);
  const xi = (await X.call("POST", "/api/admin/subscription/invoice", {})).body.invoice;
  const xp = await X.call("POST", "/api/admin/subscription/pay", { invoice_id: xi.id, utr: "777788889999" }); assert.equal(xp.body.sub.state, "PAYMENT_PENDING_VERIFY");
  at(T0 + 66*DAYMS + 47*3600e3); assert.equal((await subOf(dev, xid)).sub.state, "PAYMENT_PENDING_VERIFY");
  at(T0 + 66*DAYMS + 49*3600e3); const lapsed = await subOf(dev, xid); assert.equal(lapsed.sub.state, "EXPIRED"); assert.equal(lapsed.service.status, "paused");
  assert.equal((await X.call("GET", "/api/admin/orders")).status, 402);
  // Krish can still verify late → active again
  const xpid = (await dev.call("GET", "/api/dev/payments")).body.payments.find(p => p.shop_id === xid).id;
  assert.equal((await dev.call("POST", `/api/dev/payments/${xpid}/verify`, {})).body.sub.state, "ACTIVE");
  // send-to-all-due bills only DUE/EXPIRED approved shops
  const sd = await dev.call("POST", "/api/dev/bills/send-due", {}); assert.equal(sd.status, 200); assert.ok(sd.body.bills.every(b => b.shop_id !== xid));
}));

test("v8: dev has no item/order/customer endpoints left; dev shop views carry no shop internals; force-expiry via dev", async () => {
  const t = await twoShops(); const { dev, bid } = t;
  for (const [m, p, b] of [["GET", "/api/dev/orders"], ["GET", `/api/dev/shops/${bid}/a/products`], ["POST", `/api/dev/shops/${bid}/a/products`, { name_hi: "x" }], ["GET", `/api/dev/shops/${bid}/a/orders`],
    ["POST", `/api/dev/shops/${bid}/login-as`, {}], ["GET", `/api/dev/shops/${bid}/backup`], ["GET", `/api/dev/shops/${bid}/a/settings`]])
    assert.equal((await dev.call(m, p, b)).status, 404, m + " " + p);
  const d = (await dev.call("GET", `/api/dev/shops/${bid}`)).body; assert.equal(d.counts, undefined);
  const txt = JSON.stringify(d) + JSON.stringify((await dev.call("GET", "/api/dev/shops")).body) + JSON.stringify((await dev.call("GET", "/api/dev/audit")).body);
  assert.ok(!txt.includes("बी का आटा") && !txt.includes("Ramesh"), "no item names or customers anywhere in dev");
  const ex = await dev.call("POST", `/api/dev/shops/${bid}/subscription`, { action: "expire_now" }); assert.equal(ex.body.sub.state, "EXPIRED");
  assert.equal((await order(t.C, t.slug, t.bVar)).status, 423);
});

test("v8: every shop incl. shop #1 can be deleted; platform keeps working afterwards (landing, signup, storefront 404s)", async () => {
  const t = await twoShops(); const { dev } = t;
  assert.equal((await dev.call("POST", "/api/dev/shops/delete", { shop_id: 1, confirm: "nope" })).status, 400);
  assert.equal((await dev.call("POST", "/api/dev/shops/delete", { shop_id: 1, confirm: "mahesh-kirana" })).status, 200);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM shops WHERE id=1").n, 0); assert.equal(t.one("SELECT COUNT(*) AS n FROM orders WHERE shop_id=1").n, 0);
  assert.equal((await t.A.call("GET", "/api/admin/dashboard")).status, 401);
  const C = t.jar();
  assert.equal((await C.call("GET", "/")).status, 200);
  assert.equal((await C.call("GET", "/s/mahesh-kirana")).status, 404);
  assert.ok([404, 200].includes((await C.call("GET", "/api/store")).status));
  const st = (await C.call("GET", "/api/admin/state")).body; assert.equal(st.needs_setup, false, "no setup screen after shop #1 is gone");
  assert.equal((await C.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "evil", password: "evilpass12" })).status, 409);
  const s = await t.jar().call("POST", "/api/admin/signup", { owner_name: "Fresh", shop_name: "TEST – Fresh Start", mobile: "9000033333", password: "freshpass1" }, { ip: "6.6.6.6" });
  assert.equal(s.status, 201); assert.equal((await C.call("GET", `/s/${t.slug}`)).status, 200, "other shop still works");
  assert.equal((await dev.call("GET", "/api/dev/overview")).status, 200); assert.equal((await dev.call("GET", "/api/dev/health")).status, 200);
});

test("v8: shops without a logo use the platform logo (uploaded brand, else built-in mark) in manifest, icon and pages — no letter tile", async () => {
  const t = await twoShops(); const { C, dev, slug } = t;
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const ids = {}; for (const k of ["i192","i512","m512","a180"]) ids[k] = (await dev.call("POST", "/api/dev/image", { shop_id: "brand", data_url: png })).body.image_id;
  assert.equal((await dev.call("POST", "/api/dev/brand", { icons: ids })).status, 200);
  const mfb = (await C.call("GET", `/s/${slug}/manifest.webmanifest`)).body; const mf = typeof mfb === "string" ? JSON.parse(mfb) : mfb; assert.equal(mf.icons[0].src, `/api/img/${ids.i192}`);
  const ic = await C.call("GET", `/s/${slug}/icon.svg`); assert.equal(ic.status, 302); assert.equal(ic.headers.get("location"), `/api/img/${ids.i192}`);
  const pg = (await C.call("GET", `/s/${slug}`)).body; assert.match(pg, new RegExp(`apple-touch-icon" href="/api/img/${ids.a180}"`)); assert.match(pg, new RegExp(`rel="icon" href="/api/img/${ids.i192}"`));
  for (const f of ["admin.js", "app.js", "index.html", "landing.html", "admin.html", "dev.html"]) assert.ok(!readFileSync(join(here, "..", "site", f), "utf8").includes(">क<"), f);
});
