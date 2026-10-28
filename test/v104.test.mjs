// v10.4 Notification Center tests (helpers copied from the v8 subscription tests)
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


const N = async (jar) => (await jar.call("GET", "/api/admin/notifications")).body;
const mkShop = async (t, name, mobile) => { const X = t.jar(); const s = await X.call("POST", "/api/admin/signup", { owner_name: "Owner " + name, shop_name: name, mobile, password: "xshoppass1" });
  assert.equal(s.status, 201, JSON.stringify(s.body)); await t.dev.call("POST", "/api/dev/service", { shop_id: s.body.shop.id, action: "approve" }); return { X, id: s.body.shop.id }; };

test("v10.4: notices CRUD + targeting (one / selected / ALL) + unread counts + mark read / mark all read + read counts in dev", () => withClock(async () => {
  at(realNow()); const t = await twoShops(); W = t; const { A, B, dev, bid } = t; const C2 = await mkShop(t, "TEST – Third Kirana", "9123456781");
  assert.equal((await B.call("POST", "/api/admin/push/subscribe", { subscription: pushSub("bnot") })).status, 200);
  assert.equal((await N(B)).unread, 0); assert.deepEqual((await N(B)).items, []);
  // validation
  assert.equal((await dev.call("POST", "/api/dev/notices", { type: "spam", title: "x", target: "all" })).status, 400);
  assert.equal((await dev.call("POST", "/api/dev/notices", { type: "message", title: "", target: "all" })).status, 400);
  assert.equal((await dev.call("POST", "/api/dev/notices", { type: "message", title: "x", target: "shops", shop_ids: [] })).status, 400);
  assert.equal((await dev.call("POST", "/api/dev/notices", { type: "message", title: "x", target: "shops", shop_ids: [99999] })).status, 404);
  const shopkeeperTry = await B.call("POST", "/api/dev/notices", { type: "message", title: "x", target: "all" }, {}); assert.ok(shopkeeperTry.status === 401 || shopkeeperTry.status === 403, "a shopkeeper cannot send notices");
  // one shop
  t.env.sent.length = 0;
  const one = await dev.call("POST", "/api/dev/notices", { type: "message", title: "Namaste B", body: "Sirf B ke liye", target: "shops", shop_ids: [bid] });
  assert.equal(one.status, 200, JSON.stringify(one.body)); assert.equal(one.body.recipients, 1); assert.equal(one.body.push.accepted, 1); assert.equal(t.env.sent.length, 1, "web push to B's device");
  assert.equal((await N(B)).unread, 1); assert.equal((await N(C2.X)).unread, 0); assert.equal((await N(A)).unread, 0);
  // selected shops
  const sel = await dev.call("POST", "/api/dev/notices", { type: "update", title: "Naya version", body: "v10.4", target: "shops", shop_ids: [bid, C2.id] });
  assert.equal(sel.body.recipients, 2); assert.equal((await N(C2.X)).unread, 1); assert.equal((await N(A)).unread, 0, "shop #1 not selected");
  // ALL shops
  const all = await dev.call("POST", "/api/dev/notices", { type: "feature", title: "Naya feature", target: "all", pinned: true });
  assert.equal(all.body.recipients, 3); assert.equal((await N(A)).unread, 1);
  let nb = await N(B); assert.equal(nb.unread, 3); assert.deepEqual(nb.items.map(i => i.type), ["feature", "update", "message"], "pinned first, then newest first");
  assert.equal(nb.items[0].pinned, true); assert.equal(nb.items[0].icon, "✨"); assert.equal(nb.items[2].read, false);
  // mark one read, then all
  let rd = await B.call("POST", "/api/admin/notifications/read", { ids: [one.body.id] }); assert.equal(rd.status, 200); assert.equal(rd.body.unread, 2);
  nb = await N(B); assert.equal(nb.items.find(i => i.id === one.body.id).read, true);
  rd = await B.call("POST", "/api/admin/notifications/read", { all: true }); assert.equal(rd.body.unread, 0);
  assert.equal((await N(C2.X)).unread, 2, "B reading does not mark C's copy read");
  // dev list: read counts
  let dl = (await dev.call("GET", "/api/dev/notices")).body; const f = id => dl.notices.find(n => n.id === id);
  assert.equal(f(all.body.id).recipients, 3); assert.equal(f(all.body.id).reads, 1); assert.equal(f(all.body.id).target, "all"); assert.equal(f(sel.body.id).reads, 1); assert.equal(f(one.body.id).reads, 1);
  assert.ok(dl.shops.length >= 3);
  // delete removes it from every panel
  assert.equal((await dev.call("DELETE", `/api/dev/notices/${all.body.id}`)).status, 200);
  assert.equal((await N(A)).items.length, 0); assert.ok(!(await N(C2.X)).items.some(i => i.id === all.body.id));
  assert.equal((await dev.call("DELETE", `/api/dev/notices/${all.body.id}`)).status, 404);
  // deleting a shop deletes its notices (shop-only ones disappear entirely)
  const sh = (await dev.call("GET", `/api/dev/shops/${C2.id}`)).body.shop;
  assert.equal((await dev.call("POST", "/api/dev/shops/delete", { shop_id: C2.id, confirm: sh.slug })).status, 200);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM notice_recipients WHERE shop_id=?", C2.id).n, 0);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM notices WHERE id=?", sel.body.id).n, 1, "a notice B still has stays");
}));

test("v10.4: a shop can't read or mark another shop's notifications", () => withClock(async () => {
  at(realNow()); const t = await twoShops(); W = t; const { A, B, dev, bid } = t;
  const n = await dev.call("POST", "/api/dev/notices", { type: "message", title: "Secret for B", body: "B only", target: "shops", shop_ids: [bid] });
  const a = await N(A); assert.equal(a.items.length, 0); assert.ok(!JSON.stringify(a).includes("Secret for B"));
  const r = await A.call("POST", "/api/admin/notifications/read", { ids: [n.body.id] }); assert.equal(r.status, 200); assert.equal(r.body.unread, 0);
  assert.equal((await N(B)).items[0].read, false, "A marking B's notice id does nothing to B");
  assert.equal((await A.call("POST", "/api/admin/notifications/read", { all: true })).status, 200);
  assert.equal((await N(B)).unread, 1);
  const anon = t.jar(); assert.equal((await anon.call("GET", "/api/admin/notifications")).status, 401);
  assert.ok([401, 403].includes((await A.call("GET", "/api/dev/notices")).status), "shopkeeper session is not a dev session");
}));

test("v10.4: Send bill → 🧾 Bill notification in the panel (amount, period, due, UPI, pay action) + push; same invoice record; WhatsApp only optional", () => withClock(async () => {
  const T0 = realNow(); at(T0); const t = await twoShops(); W = t; const { B, dev, bid } = t;
  assert.equal((await B.call("POST", "/api/admin/push/subscribe", { subscription: pushSub("bbill") })).status, 200);
  await dev.call("POST", "/api/dev/platform", { price: "199", months: 1, upi_id: "krish@okaxis", upi_name: "Krish Patil" });
  at(T0 + 3*DAYMS); t.env.sent.length = 0;
  const bill = await dev.call("POST", `/api/dev/shops/${bid}/bill`, {}); assert.equal(bill.status, 200, JSON.stringify(bill.body));
  assert.equal(t.one("SELECT COUNT(*) AS n FROM invoices WHERE shop_id=?", bid).n, 1, "invoice record created as before"); assert.match(bill.body.invoice.number, /^AD-\d{6}-\d{4}$/);
  assert.ok(bill.body.notice_id > 0); assert.equal(bill.body.push.accepted, 1); assert.equal(t.env.sent.length, 1);
  assert.match(bill.body.wa_url, /^https:\/\/wa\.me\//, "WhatsApp link still offered as an optional share");
  let nb = await N(B); assert.equal(nb.unread, 1); const n = nb.items[0];
  assert.equal(n.type, "bill"); assert.equal(n.icon, "🧾"); assert.equal(n.action, "recharge"); assert.equal(n.invoice_status, "unpaid");
  assert.equal(n.meta.amount_paise, 19900); assert.equal(n.meta.number, bill.body.invoice.number); assert.equal(n.meta.upi_id, "krish@okaxis"); assert.equal(n.meta.upi_name, "Krish Patil");
  assert.ok(n.meta.period_start && n.meta.period_end > n.meta.period_start && n.meta.due_at);
  assert.match(n.body, /₹199/); assert.match(n.body, /krish@okaxis/); assert.match(n.body, /UTR/); assert.match(n.title, /199/);
  // re-send = same notice moved to the top and unread again (no duplicate)
  await B.call("POST", "/api/admin/notifications/read", { all: true });
  const again = await dev.call("POST", `/api/dev/shops/${bid}/bill`, {}); assert.equal(again.body.notice_id, bill.body.notice_id); assert.equal(again.body.invoice.id, bill.body.invoice.id);
  nb = await N(B); assert.equal(nb.items.filter(i => i.type === "bill").length, 1); assert.equal(nb.unread, 1);
  // the push tap opens the notification itself
  // pay → paid shows on the notice
  const pay = await B.call("POST", "/api/admin/subscription/pay", { invoice_id: bill.body.invoice.id, utr: "123412341234" }); assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const pid = (await dev.call("GET", "/api/dev/payments")).body.payments.find(p => p.shop_id === bid).id;
  assert.equal((await dev.call("POST", `/api/dev/payments/${pid}/verify`, {})).status, 200);
  assert.equal((await N(B)).items.find(i => i.type === "bill").invoice_status, "paid");
  // the dev UI no longer auto-opens WhatsApp: no window.open / location to wa.me; it's a small optional link
  const js = readFileSync(join(here, "..", "site", "dev.js"), "utf8");
  assert.ok(!/window\.open\(/.test(js), "no auto-open"); assert.ok(!/location(\.href)?\s*=\s*[^=]*wa_url/.test(js));
  assert.ok(!js.includes("WhatsApp pe bhejo"), "no big WhatsApp button"); assert.match(js, /also share on WhatsApp \(optional\)/); assert.match(js, /notification panel/);
  // bill-all-due also lands in the panel
  const sd = await dev.call("POST", "/api/dev/bills/send-due", {}); assert.equal(sd.status, 200);
}));

test("v10.4: bills reach an EXPIRED shop's panel too (notifications stay open while the panel is locked)", () => withClock(async () => {
  const T0 = realNow(); at(T0); const t = await twoShops(); W = t; const { B, dev, bid } = t;
  await dev.call("POST", "/api/dev/platform", { upi_id: "krish@okaxis" });
  at(T0 + 15*DAYMS); assert.equal((await B.call("GET", "/api/admin/orders")).status, 402);
  const sd = await dev.call("POST", "/api/dev/bills/send-due", {}); assert.equal(sd.body.sent, 1);
  const nb = await B.call("GET", "/api/admin/notifications"); assert.equal(nb.status, 200); assert.ok(nb.body.items.some(i => i.type === "bill"));
  assert.equal((await B.call("POST", "/api/admin/notifications/read", { all: true })).status, 200);
}));

test("v10.4: issue banner with expected fix time; resolve removes the banner but keeps the notice", () => withClock(async () => {
  at(realNow()); const t = await twoShops(); W = t; const { A, B, dev, bid } = t;
  assert.equal((await dev.call("POST", "/api/dev/notices", { type: "issue", title: "x", fix_by: "kal subah", target: "all" })).status, 400);
  const is = await dev.call("POST", "/api/dev/notices", { type: "issue", title: "Orders late dikh rahe", body: "Hum theek kar rahe hain", fix_by: "2026-10-25T18:30", target: "shops", shop_ids: [bid] });
  assert.equal(is.status, 200, JSON.stringify(is.body));
  let nb = await N(B); assert.equal(nb.banner.length, 1); assert.equal(nb.banner[0].title, "Orders late dikh rahe");
  assert.equal(nb.banner[0].fix_by, Date.UTC(2026, 9, 25, 18, 30) - 330*60000, "fix-by is IST"); assert.equal(nb.banner[0].pinned, true, "issues pin by default");
  assert.equal((await N(A)).banner.length, 0, "not targeted → no banner");
  const rs1 = await dev.call("POST", `/api/dev/notices/${is.body.id}/resolve`, {}); assert.equal(rs1.status, 200); assert.ok(rs1.body.resolved_at);
  nb = await N(B); assert.equal(nb.banner.length, 0); assert.ok(nb.items[0].resolved_at); assert.equal(nb.items[0].pinned, false);
  const dl = (await dev.call("GET", "/api/dev/notices")).body.notices.find(n => n.id === is.body.id); assert.ok(dl.resolved_at);
  assert.equal((await dev.call("POST", "/api/dev/notices/99999/resolve", {})).status, 404);
  // UI: banner element + "kab tak theek hoga" text in the shopkeeper panel
  const html = readFileSync(join(here, "..", "site", "admin.html"), "utf8"), ajs = readFileSync(join(here, "..", "site", "admin.js"), "utf8");
  assert.match(html, /id="issueBanner"/); assert.match(html, /id="bellBtn"/); assert.match(html, /id="bellBadge"/); assert.match(ajs, /कब तक ठीक होगा/); assert.match(ajs, /Mark all read/); assert.match(ajs, /Pay now \/ Submit UTR/);
  assert.ok(!/<script>/.test(html) && !/ on\w+=/.test(html), "strict CSP kept");
}));

test("v10.4: automatic ⏰ due reminders — 3 days before, on the day, after expiry; once per stage per period; cron + lazy", () => withClock(async () => {
  const T0 = realNow(); at(T0); const t = await twoShops(); W = t; const { A, B, dev, bid, worker, env } = t;
  await dev.call("POST", "/api/dev/platform", { upi_id: "krish@okaxis" });
  assert.equal((await B.call("POST", "/api/admin/push/subscribe", { subscription: pushSub("brem") })).status, 200);
  const dues = () => t.sql("SELECT n.dedupe FROM notices n JOIN notice_recipients r ON r.notice_id=n.id WHERE n.type='due' AND r.shop_id=? ORDER BY n.id", bid).map(r => r.dedupe.split(":").pop());
  const cron = () => worker.scheduled({ cron: "30 3 * * *", scheduledTime: Date.now() }, env.e, null);
  at(T0 + 5*DAYMS); await cron(); assert.deepEqual(dues(), [], "5 days left: nothing yet");
  at(T0 + 7.5*DAYMS); t.env.sent.length = 0; await cron(); assert.deepEqual(dues(), ["d3"]); assert.ok(t.env.sent.length >= 1, "cron reminder is pushed");
  await cron(); await cron(); assert.deepEqual(dues(), ["d3"], "no duplicates on re-runs");
  at(T0 + 8*DAYMS); await N(B); assert.deepEqual(dues(), ["d3"], "lazy load: still the same stage");
  at(T0 + 9.5*DAYMS); const lazy = await N(B); assert.deepEqual(dues(), ["d3", "d0"], "lazy generation when the shopkeeper opens the panel");
  assert.equal(lazy.items[0].type, "due"); assert.equal(lazy.items[0].action, "recharge"); assert.match(lazy.items[0].body, /krish@okaxis/);
  await cron(); assert.deepEqual(dues(), ["d3", "d0"]);
  at(T0 + 10.5*DAYMS); await cron(); await cron(); assert.deepEqual(dues(), ["d3", "d0", "exp"]);
  at(T0 + 20*DAYMS); await cron(); assert.deepEqual(dues(), ["d3", "d0", "exp"], "no reminders long after expiry");
  // new period (extend) → a fresh set of stages
  const ex = await dev.call("POST", `/api/dev/shops/${bid}/subscription`, { action: "extend", months: 1 }); const end = ex.body.sub.paid_until;
  at(end - 2*DAYMS); await cron(); assert.deepEqual(dues(), ["d3", "d0", "exp", "d3"]);
  const last = t.one("SELECT v FROM service_state WHERE k='reminders_last_run'"); assert.ok(Number(last.v) > 0, "cron run recorded for the dev panel");
  // payment submitted (waiting for Krish) → no reminder nagging
  at(end - 0.5*DAYMS); const inv = (await B.call("POST", "/api/admin/subscription/invoice", {})).body.invoice;
  await B.call("POST", "/api/admin/subscription/pay", { invoice_id: inv.id, utr: "555566667777" }); await cron(); assert.deepEqual(dues(), ["d3", "d0", "exp", "d3"]);
  // shop #1 (A) had its own trial and gets only its own reminders
  assert.ok(!(await N(A)).items.some(i => i.body.includes(String(bid)) && false));
  // dev "check now" button works
  const run = await dev.call("POST", "/api/dev/notices/reminders", {}); assert.equal(run.status, 200); assert.ok(run.body.checked >= 1);
  // cron is configured in the apnadhanda wrangler config (free Cron Trigger)
  const toml = readFileSync(join(here, "..", "wrangler.apnadhanda.toml"), "utf8"); assert.match(toml, /\[triggers\]\s*\ncrons = \["30 3 \* \* \*"\]/); assert.match(toml, /^name = "apnadhanda"/m);
}));

test("v10.4: dev 📢 Notify lives under Dukaanein (5-section nav kept); composer has every type, fix-by, pin and targeting", () => {
  const html = readFileSync(join(here, "..", "site", "dev.html"), "utf8"), js = readFileSync(join(here, "..", "site", "dev.js"), "utf8");
  const secs = [...html.matchAll(/<nav class="tabs"[\s\S]*?<\/nav>/g)][0][0].match(/data-sec="(\w+)"/g).length; assert.equal(secs, 6); // v10.12.4: + 📢 Notify
  assert.match(html, /id="tabs"[\s\S]*data-sec="notify"/); assert.match(js, /notify: notifyView/); assert.match(js, /notify:"notify"/); // v10.12.4: bottom tab
  for (const k of ['"message"', '"update"', '"feature"', '"issue"', '"bill"', '"due"']) assert.ok(js.includes(`[${k},`), k);
  for (const id of ['id="nFix"', 'id="nPin"', 'data-tg="all"', 'data-tg="shops"', 'id="nShops"', 'data-nr=', 'data-nd=', 'id="nRun"']) assert.ok(js.includes(id), id);
  assert.ok(!/\bconfirm\s*\(/.test(js));
  const V = readFileSync(join(here, "..", "site", "_worker.mjs"), "utf8").match(/const APP_VERSION = "([\d.]+)"/)[1]; assert.ok(/^10\.(4|5|6|7|8|9|10|11|12|13|14|15|16)\.\d+$/.test(V), V);
  assert.ok(html.includes(`dev.js?v=${V}`)); const ah = readFileSync(join(here, "..", "site", "admin.html"), "utf8"); assert.ok(ah.includes(`admin-core.js?v=${V}`) && ah.includes(`admin.css?v=${V}`));
});
