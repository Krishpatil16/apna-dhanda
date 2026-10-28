// v10.15 tests: 👑 God Mode (dev control centre). Harness copied from v1014. Old line: (Krish 26 Oct 11:30–11:39 PM). Master catalogue, optional shop prices, name-only booking,
// no price/cart/payment UI on the salon customer page, kirana unchanged, existing salon rows untouched. Harness copied from v10131.
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




const store = async (t, slug) => (await t.jar().call("GET", "/api/store", undefined, { shop: slug })).body;
const book = (c, slug, services, extra = {}) => c.call("POST", "/api/orders", { name: "TEST Raju", services, idempotency_key: idem(), ...extra }, { shop: slug });

const OLD = join(here, "fixtures", "worker-10.14.0.mjs");
const norm = s => String(s).replace(/<link rel="preload" href="\/api\/store\?shop=[^"]*" as="fetch" crossorigin>\n/g, "").replace(/10\.1[456]\.[0-9]/g, "V").replace(/"build":"[^"]*"/g, "").replace(/content="[0-9T:\-Z.]+"/g, "");
const GOD_GET = ["/api/dev/god/overview", "/api/dev/god/shop/1", "/api/dev/god/orders", "/api/dev/god/customers", "/api/dev/god/push", "/api/dev/god/settings", "/api/dev/god/audit", "/api/dev/god/tables", "/api/dev/god/reports", "/api/dev/god/as/1/api/admin/state"];

test("v10.15 God Mode: every /api/dev/god route is developer-only (anonymous 401, shopkeeper refused, POST without header refused)", async () => {
  const t = await base(); const k = await t.shop("Sharma Kirana", "kirana");
  const anon = t.jar();
  for (const p of GOD_GET) { const r = await anon.call("GET", p); assert.ok([401, 403].includes(r.status), p + " " + r.status); }
  for (const p of GOD_GET) { const r = await k.J.call("GET", p); assert.ok([401, 403].includes(r.status), "shopkeeper " + p + " " + r.status); }
  assert.ok([401, 403].includes((await anon.call("POST", "/api/dev/god/settings", {key: "banner", value: {on: true, text_en: "x"}})).status));
  assert.ok([401, 403].includes((await k.J.call("POST", "/api/dev/god/settings", {key: "banner", value: {on: true, text_en: "x"}})).status));
  // dev cookie but no x-requested-with on a write → refused (CSRF)
  const devCookie = await (async () => { const r = await t.worker.fetch(new Request("https://k.test/api/dev/login", {method: "POST", headers: {"content-type": "application/json", "x-requested-with": "kirana-dev", "cf-connecting-ip": "9.9.9.9"}, body: JSON.stringify({username: DEV_USER, password: DEV_PASS})}), t.env.e); return r.headers.get("set-cookie").split(";")[0]; })();
  const nh = await t.worker.fetch(new Request("https://k.test/api/dev/god/settings", {method: "POST", headers: {"content-type": "application/json", cookie: devCookie, "cf-connecting-ip": "9.9.9.9"}, body: JSON.stringify({key: "banner", value: {on: true, text_en: "x"}})}), t.env.e);
  assert.equal(nh.status, 403);
  for (const p of GOD_GET) { const r = await t.dev.call("GET", p); assert.equal(r.status, 200, p + " " + JSON.stringify(r.body).slice(0, 200)); }
  // the as-shop page needs the dev login too
  const pg = await anon.call("GET", "/dev/as/1"); assert.ok(pg.status === 302 || pg.status === 401 || pg.status === 403 || !/God Mode viewing/.test(pg.body), "as-page anon " + pg.status);
});

test("v10.15 God Mode: with default settings, customer + shopkeeper pages and the store API render exactly as v10.14 did", async () => {
  const DB = makeD1(); const neu = await world(DB); const old = await world(DB, await loadWorker(OLD));
  const A = neu.jar(); assert.equal((await A.call("POST", "/api/admin/setup", {setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1"})).status, 200);
  await A.call("PUT", "/api/admin/settings", {open_time: "00:00", close_time: "00:00", phone: "9876500011"});
  const dev = neu.jar(); assert.equal((await dev.call("POST", "/api/dev/login", {username: DEV_USER, password: DEV_PASS})).status, 200);
  const mk = async (name, type, n) => { const J = neu.jar({ip: "3.3.3." + n}); const s = await J.call("POST", "/api/admin/signup", {owner_name: "O" + n, shop_name: name, mobile: "91234560" + (10 + n), password: "shoppass1", shop_type: type}); assert.equal(s.status, 201);
    await dev.call("POST", "/api/dev/service", {shop_id: s.body.shop.id, action: "approve"}); await J.call("POST", "/api/admin/online", {online: true}); return s.body.shop; };
  const K = await mk("Gupta Kirana", "kirana", 1), SL = await mk("Shine Salon", "salon", 2);
  await dev.call("GET", "/api/dev/god/settings"); // the god tables exist; nothing set
  const pages = ["/", "/shops", "/customer", "/admin", "/shopkeeper", "/track", "/info", "/s/" + K.slug, "/s/" + SL.slug];
  // v10.16.0: the main page is now the approved landing2 page (Krish 8:48 AM Oct 27), so a landing page is compared with the new worker's own
  // /?preview=landing2 (minus its noindex) instead of v10.14's; every other page must still match v10.14 exactly.
  const pv = String((await neu.jar().call("GET", "/?preview=landing2")).body).replace('<meta name="robots" content="noindex">', "");
  for (const p of pages) { const a = await old.jar().call("GET", p), b = await neu.jar().call("GET", p);
    const ref = /id="lfIntro"/.test(String(a.body)) ? pv : a.body;
    assert.equal(b.status, a.status, p); assert.equal(norm(b.body), norm(ref), "page differs: " + p); assert.ok(!/adBanner/.test(String(b.body)), p); }
  for (const slug of [K.slug, SL.slug]) { const a = await old.jar().call("GET", "/api/store", undefined, {shop: slug}), b = await neu.jar().call("GET", "/api/store", undefined, {shop: slug});
    assert.equal(b.status, 200); assert.equal(norm(JSON.stringify(b.body)), norm(JSON.stringify(a.body)), "store differs: " + slug); }
  const a = await old.jar().call("GET", "/api/shops"), b = await neu.jar().call("GET", "/api/shops");
  assert.equal(norm(JSON.stringify(b.body)), norm(JSON.stringify(a.body)), "directory differs");
});

test("v10.15 God Mode: site banner shows only when switched on (audience respected) and switching off restores the page byte-for-byte", async () => {
  const t = await base(); const k = await t.shop("Sharma Kirana", "kirana");
  const before = (await t.jar().call("GET", "/")).body, beforeAdmin = (await t.jar().call("GET", "/admin")).body;
  assert.equal((await t.dev.call("POST", "/api/dev/god/settings", {key: "banner", value: {on: true, text_en: "Diwali offers <b>live</b>", audience: "customers", tone: "offer"}})).status, 200);
  const on = (await t.jar().call("GET", "/")).body; assert.match(on, /id="adBanner"/); assert.match(on, /Diwali offers &lt;b&gt;live&lt;\/b&gt;/);
  assert.match((await t.jar().call("GET", "/s/" + k.slug)).body, /adBanner/);
  assert.equal((await t.jar().call("GET", "/admin")).body, beforeAdmin, "shopkeeper page untouched for a customers-only banner");
  assert.ok(!/adBanner/.test((await t.jar().call("GET", "/dev")).body), "dev panel never gets the banner");
  assert.equal((await t.dev.call("POST", "/api/dev/god/settings", {key: "banner", value: {on: false, text_en: "Diwali offers <b>live</b>", audience: "customers", tone: "offer"}})).status, 200);
  assert.equal((await t.jar().call("GET", "/")).body, before);
});

test("v10.15 God Mode: maintenance is off by default; on → customer pages say back soon and new orders wait, the developer's device still gets through; off → normal", async () => {
  const t = await base(); const k = await t.shop("Sharma Kirana", "kirana"); await t.item(k.J);
  const v = (await store(t, k.slug)).products[0].variants[0];
  assert.equal((await t.jar().call("GET", "/")).status, 200);
  const r = await t.dev.call("POST", "/api/dev/god/settings", {key: "maintenance", value: {on: true, msg_en: "Back at 6"}}); assert.equal(r.status, 200);
  const pg = await t.jar().call("GET", "/"); assert.equal(pg.status, 503); assert.match(pg.body, /Back at 6/);
  assert.equal((await order(t.jar({ip: "5.5.5.5"}), k.slug, v)).status, 503);
  assert.equal((await t.dev.call("GET", "/")).status, 200, "the developer's bypass cookie still sees the site");
  assert.equal((await t.jar().call("GET", "/admin")).status, 200, "shopkeepers can still sign in");
  assert.equal((await t.dev.call("POST", "/api/dev/god/settings", {key: "maintenance", value: {on: false}})).status, 200);
  assert.equal((await t.jar().call("GET", "/")).status, 200);
  assert.equal((await order(t.jar({ip: "5.5.5.6"}), k.slug, v)).status, 201);
});

test("v10.15 God Mode: every settings change is audited with before → after, and Undo puts the last one back", async () => {
  const t = await base();
  await t.dev.call("POST", "/api/dev/god/settings", {key: "banner", value: {on: true, text_en: "One"}});
  await t.dev.call("POST", "/api/dev/god/settings", {key: "banner", value: {on: true, text_en: "Two"}});
  const a = (await t.dev.call("GET", "/api/dev/god/audit")).body.audit; const last = a.find(x => x.action === "settings");
  assert.equal(last.target, "banner"); assert.match(last.before, /One/); assert.match(last.after, /Two/); assert.match(last.actor, /krish-dev/);
  assert.equal((await t.dev.call("POST", "/api/dev/god/undo", {})).status, 200);
  assert.equal((await t.dev.call("GET", "/api/dev/god/settings")).body.settings.banner.text_en, "One");
  assert.ok((await t.dev.call("GET", "/api/dev/god/audit")).body.audit.some(x => x.action === "undo"));
});

test("v10.15 God Mode: edit any shop — open/closed, name, settings, a price, accept a booking — all through the dev login, all audited", async () => {
  const t = await base(); const s = await t.shop("TEST Shine Salon", "salon"); const k = await t.shop("TEST Gupta Kirana", "kirana"); await t.item(k.J);
  const as = (m, p, b) => t.dev.call(m, `/api/dev/god/as/${s.id}${p}`, b);
  assert.equal((await as("POST", "/api/admin/online", {online: false})).status, 200);
  assert.equal((await t.dev.call("GET", "/api/dev/god/shop/" + s.id)).body.shop.online, false);
  assert.equal((await as("POST", "/api/admin/online", {online: true})).status, 200);
  assert.equal((await t.dev.call("POST", `/api/dev/shops/${s.id}/identity`, {name: "TEST Shine Salon & Spa"})).status, 200);
  assert.equal((await t.dev.call("GET", "/api/dev/god/shop/" + s.id)).body.shop.name, "TEST Shine Salon & Spa");
  assert.equal((await as("PUT", "/api/admin/settings", {tagline_en: "Fresh cuts"})).status, 200);
  assert.equal((await as("PUT", "/api/admin/salon-services", {key: "haircut", price: "150", on: true})).status, 200);
  assert.equal((await store(t, s.slug)).salon.services.find(x => x.key === "haircut").price_paise, 15000);
  const kv = (await t.dev.call("GET", "/api/dev/god/shop/" + k.id)).body.items[0];
  assert.equal((await t.dev.call("POST", `/api/dev/god/shop/${k.id}/variant`, {variant_id: kv.variant_id, price: "99"})).status, 200);
  assert.equal((await store(t, k.slug)).products[0].variants[0].price_paise, 9900);
  const bk = await book(t.jar({ip: "6.6.6.6"}), s.slug, ["haircut"]); assert.equal(bk.status, 201);
  const oid = (await t.dev.call("GET", "/api/dev/god/shop/" + s.id)).body.orders.find(o => o.code === bk.body.order.code).id;
  assert.equal((await as("POST", `/api/admin/orders/${oid}/queue`, {})).status, 200);
  assert.ok((await t.dev.call("GET", "/api/dev/god/shop/" + s.id)).body.orders.find(o => o.id === oid).token_no >= 1);
  const a = (await t.dev.call("GET", "/api/dev/god/audit?limit=50")).body.audit;
  for (const want of [/online/, /identity/, /settings/, /salon-services/, /queue/]) assert.ok(a.some(x => want.test(x.target)), "audit for " + want);
  assert.ok(a.some(x => x.action === "item"), "variant price audited");
  const set = a.find(x => /\/api\/admin\/settings/.test(x.target)); assert.ok(set.before != null && set.after != null, "settings before/after kept");
  assert.ok(!a.some(x => /shoppass1|strongpass1/.test(String(x.after) + String(x.before))), "no passwords in the audit log");
});

test("v10.15 God Mode: delete needs the shop's name typed; a wrong name changes nothing; the delete is audited", async () => {
  const t = await base(); const k = await t.shop("TEST Delete Me", "kirana");
  const bad = await t.dev.call("POST", "/api/dev/shops/delete", {shop_id: k.id, confirm: "Delete"}); assert.equal(bad.status, 400);
  assert.equal((await t.dev.call("GET", "/api/dev/god/shop/" + k.id)).status, 200);
  assert.equal((await t.dev.call("POST", "/api/dev/shops/delete", {shop_id: k.id})).status, 400);
  assert.equal((await t.dev.call("POST", "/api/dev/shops/delete", {shop_id: k.id, confirm: "TEST Delete Me"})).status, 200);
  assert.equal((await t.dev.call("GET", "/api/dev/god/shop/" + k.id)).status, 404);
  assert.ok((await t.dev.call("GET", "/api/dev/god/audit")).body.audit.some(x => /shops\/delete/.test(x.target)));
});

test("v10.15 God Mode: notifications to a TEST shop's customers are a dry count only — no real phones are pushed", async () => {
  const t = await base(); const s = await t.shop("TEST Push Salon", "salon");
  const r = await t.dev.call("POST", "/api/dev/god/push", {target: "customers", shop_id: s.id, title: "Hello", body: "test", dry: true});
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.sent || 0, 0);
});

test("v10.15 God Mode: panel = top bar (God Mode 👑 + bell + log out), bell dropdown with Mark all read / View all, no full feed on Home; old tabs hidden", () => {
  const html = S("dev.html"), js = S("god.js"), css = S("god.css");
  assert.match(html, /God Mode/); assert.match(html, /id="gBell"/); assert.match(html, /id="gDrop"/); assert.match(html, /god\.js\?v=(?:10\.15\.[2-9]|10\.16\.\d+)/); assert.match(html, /god\.css\?v=(?:10\.15\.[2-9]|10\.16\.\d+)/);
  assert.match(js, /Mark all read/); assert.match(js, /View all activity/); assert.match(js, /\/api\/dev\/events\/read/);
  assert.match(css, /body\.god #tabs\{display:none/);
  assert.ok(!/window\.(prompt|confirm|alert)\(/.test(js), "in-page dialogs only");
  assert.ok(!/<script>(?!<\/script>)/.test(html), "no inline scripts (CSP)");
});

test("v10.15 steer: /shops (and /customer) no longer show the “I'm a shopkeeper” button, in English or Hindi; /admin and /shopkeeper still work", async () => {
  const sh = S("shops.html"); assert.ok(!/id="toShop"/.test(sh)); assert.ok(!/I'm a shopkeeper|मैं दुकानदार/.test(sh));
  const t = await base();
  for (const p of ["/shops", "/customer"]) { const r = await t.jar().call("GET", p); assert.ok([200, 301, 302].includes(r.status), p + " " + r.status); assert.ok(!/toShop|I'm a shopkeeper/.test(r.body), p); }
  assert.equal((await t.jar().call("GET", "/admin")).status, 200);
  const sk = await t.jar().call("GET", "/shopkeeper"); assert.ok([200, 301, 302].includes(sk.status), "shopkeeper " + sk.status);
});

test("v10.15 steer 2: ✨ Features — feature_flags exist and are all OFF; only known keys stored; public pages stay the same when one is switched on", async () => {
  const t = await base(); const k = await t.shop("Sharma Kirana", "kirana");
  const f = await t.dev.call("GET", "/api/dev/god/features"); assert.equal(f.status, 200);
  assert.deepEqual(Object.keys(f.body.flags).sort(), [...f.body.flag_keys].sort()); assert.equal(f.body.flag_keys.length, 10);
  assert.ok(Object.values(f.body.flags).every(v => v === false), "every coming feature is OFF by default");
  assert.match(f.body.cron.does, /NOT a backup/); assert.equal(f.body.cron.schedule, "30 3 * * *");
  const before = (await t.jar().call("GET", "/s/" + k.slug)).body;
  assert.equal((await t.dev.call("POST", "/api/dev/god/settings", {key: "feature_flags", value: {reviews: true, hack: true}})).status, 200);
  const g = (await t.dev.call("GET", "/api/dev/god/settings")).body.settings.feature_flags; assert.equal(g.reviews, true); assert.ok(!("hack" in g)); assert.equal(g.offers, false);
  assert.equal((await t.jar().call("GET", "/s/" + k.slug)).body, before, "a flag alone changes nothing customers see (features ship later)");
  assert.ok([401, 403].includes((await k.J.call("GET", "/api/dev/god/features")).status));
  const js = S("god.js"), css = S("god.css");
  for (const w of ["Book ahead when closed", "Staff / barber choice", "Reviews & ratings", "Offers & coupons", "Google Maps", "WhatsApp share", "receipt PDF", "Charts", "Shop timings & holiday", "New shop types"]) assert.ok(js.includes(w), w);
  assert.match(js, /Coming next/); assert.match(js, /Download full source zip/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /#06051a/);
});
