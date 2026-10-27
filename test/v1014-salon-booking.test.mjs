// v10.14 tests: salon catalogue booking (Krish 26 Oct 11:30–11:39 PM). Master catalogue, optional shop prices, name-only booking,
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




const store = async (t, slug) => (await t.jar().call("GET", "/api/store", undefined, { shop: slug })).body;
const book = (c, slug, services, extra = {}) => c.call("POST", "/api/orders", { name: "TEST Raju", services, idempotency_key: idem(), ...extra }, { shop: slug });

test("v10.14: a salon's /api/store carries the whole master catalogue (5 groups, 18 services, no price unless set); kirana gets none", async () => {
  const t = await base(); const s = await t.shop("TEST Cat Salon", "salon"); const k = await t.shop("TEST Cat Kirana");
  const pub = await store(t, s.slug);
  assert.deepEqual(pub.salon.groups.map(g => g.key), ["hair", "beard", "face", "massage", "combo"]);
  assert.equal(pub.salon.services.length, 18);
  for (const n of ["Haircut", "Kids haircut", "Hair wash", "Beard trim", "Shave", "Facial", "De-tan", "Head massage", "Haircut + Beard", "Haircut + Shave"]) assert.ok(pub.salon.services.some(x => x.name_en === n), n);
  assert.ok(pub.salon.services.every(x => x.price_paise === null && x.icon && x.name_hi && !("min" in x)), "no price until set; minutes stay hidden");
  assert.equal("salon" in (await store(t, k.slug)), false, "kirana store unchanged");
  const ad = (await s.J.call("GET", "/api/admin/salon-services")).body; assert.equal(ad.services.length, 18); assert.ok(ad.services.every(x => x.on === true), "all ON by default");
  assert.equal((await k.J.call("GET", "/api/admin/salon-services")).status, 400, "kirana has no salon catalogue");
});

test("v10.14: a price the shop sets shows on the customer tile; an unset price shows none; a switched-off service is hidden and cannot be booked", async () => {
  const t = await base(); const s = await t.shop("TEST Price Salon", "salon");
  assert.equal((await s.J.call("PUT", "/api/admin/salon-services", { key: "haircut", price: "100" })).status, 200);
  const off = await s.J.call("PUT", "/api/admin/salon-services", { key: "threading", on: false }); assert.equal(off.status, 200);
  assert.equal(off.body.services.find(x => x.key === "threading").on, false);
  const pub = await store(t, s.slug);
  assert.equal(pub.salon.services.find(x => x.key === "haircut").price_paise, 10000);
  assert.equal(pub.salon.services.find(x => x.key === "shave").price_paise, null);
  assert.equal(pub.salon.services.some(x => x.key === "threading"), false);
  assert.equal((await book(t.jar(), s.slug, ["threading"])).status, 409);
  // the price can be cleared again, and it survives an on/off flip
  await s.J.call("PUT", "/api/admin/salon-services", { key: "haircut", on: false }); await s.J.call("PUT", "/api/admin/salon-services", { key: "haircut", on: true });
  assert.equal((await store(t, s.slug)).salon.services.find(x => x.key === "haircut").price_paise, 10000);
  await s.J.call("PUT", "/api/admin/salon-services", { key: "haircut", price: "" });
  assert.equal((await store(t, s.slug)).salon.services.find(x => x.key === "haircut").price_paise, null);
  assert.equal((await s.J.call("PUT", "/api/admin/salon-services", { key: "nope", price: "5" })).status, 404);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM shop_service_prices WHERE shop_id=?", s.id).n, 2);
});

test("v10.14: booking stores the selected catalogue items with a NAME only — no mobile, no payment, total 0; online waits, walk-in gets a token", async () => {
  const t = await base(); const s = await t.shop("TEST Book Salon", "salon");
  await s.J.call("PUT", "/api/admin/salon-services", { key: "haircut", price: "120" });
  const C = t.jar({ ip: "9.9.9.9" });
  const on = await book(C, s.slug, ["haircut", "beard_trim"]); assert.equal(on.status, 201, JSON.stringify(on.body));
  const row = t.one("SELECT * FROM orders WHERE code=?", on.body.order.code);
  assert.deepEqual(JSON.parse(row.svc_items), ["haircut", "beard_trim"]); assert.equal(row.svc_min, 35);
  assert.equal(row.phone, ""); assert.equal(row.total_paise, 0); assert.equal(row.token_no, null); assert.equal(row.source, "online"); assert.equal(row.address, "");
  const items = t.sql("SELECT * FROM order_items WHERE order_id=? ORDER BY id", row.id);
  assert.deepEqual(items.map(i => i.product_name_en), ["Haircut", "Beard trim"]); assert.ok(items.every(i => i.variant_id === null && i.line_total_paise === 0));
  assert.equal(items[0].unit_price_paise, 12000, "the shop's own price rides the line (shown to him, never charged)");
  const cv = (await C.call("GET", `/api/orders/${on.body.order.code}`, undefined, { token: on.body.token })).body;
  assert.equal(cv.order.salon_booking, true); assert.equal(cv.order.phone_masked, ""); assert.equal(cv.order.token.requested, true);
  // the shopkeeper sees it as a request listing the service names, and accepts it into the queue
  const ord = (await s.J.call("GET", "/api/admin/orders?status=active")).body.orders || [];
  const mine = ord.find(o => o.code === on.body.order.code); assert.ok(mine, "request listed"); assert.deepEqual(mine.items.map(i => i.product_name_en), ["Haircut", "Beard trim"]);
  assert.equal((await s.J.call("POST", `/api/admin/orders/${row.id}/queue`, {})).status, 200);
  assert.equal(t.one("SELECT token_no FROM orders WHERE id=?", row.id).token_no, 1);
  const wk = await book(t.jar({ ip: "9.9.9.8" }), s.slug, ["shave"], { source: "walkin" }); assert.equal(wk.status, 201);
  const w2 = (await t.jar().call("GET", `/api/orders/${wk.body.order.code}`, undefined, { token: wk.body.token })).body.order.token;
  assert.equal(w2.no, 2); assert.equal(w2.ahead, 1); assert.equal(w2.eta_min, 35, "ETA uses the catalogue minutes (haircut 20 + beard 15)");
  assert.equal((await book(t.jar(), s.slug, [])).status, 400); assert.equal((await book(t.jar(), s.slug, ["haircut"], { name: "" })).status, 400);
});

test("v10.14: the salon customer page is a booking app — no price total, cart, qty, sort, heart or payment; /s/<salon> serves it, kirana keeps index.html", async () => {
  const t = await base(); const s = await t.shop("TEST Page Salon", "salon"); const k = await t.shop("TEST Page Kirana");
  const ps = await t.jar().call("GET", `/s/${s.slug}`); assert.equal(ps.status, 200); assert.match(ps.body, /asset \/salon\.html/);
  const pk = await t.jar().call("GET", `/s/${k.slug}`); assert.match(pk.body, /asset \/index\.html/);
  const html = S("salon.html"), js = S("salon.js"), both = html + js;
  for (const bad of ["cart", "Cart", "qty", "Sort", "sort", "♡", "❤", "fav", "View cart", "How to order", "Pay", "payment", '"cod"', "money("]) assert.ok(!both.includes(bad), bad);
  assert.ok(!html.includes("₹"), "no ₹ in the page");
  assert.equal((js.match(/₹/g) || []).length, 1, "the only ₹ is the shop's own optional price on a tile");
  assert.match(js, /services: ?keys/); assert.ok(!/phone/.test(js), "name only — no mobile field");
  assert.match(html, /id="guestName"/); assert.ok(!/type="tel"/.test(html));
  assert.match(html, /My bookings\|मेरी बुकिंग/); assert.match(html, /Services\|सेवाएँ/);
  const tr = S("track.js"); assert.match(tr, /const SALON = AK\.shopType === "salon"/); assert.match(tr, /Request sent ✓/); assert.match(tr, /a\[href="\/#cart"\]/);
});

test("v10.14: kirana is unchanged — the order still needs a mobile and items, keeps its ₹ total, and gets no svc columns", async () => {
  const t = await base(); const k = await t.shop("TEST Kirana Same"); await t.item(k.J, "40", "1 kg", 9);
  const v = t.one("SELECT id FROM variants WHERE shop_id=?", k.id);
  const C = t.jar({ ip: "7.7.7.7" });
  assert.equal((await C.call("POST", "/api/orders", { name: "Ramesh", services: ["haircut"], idempotency_key: idem() }, { shop: k.slug })).status, 400, "services[] means nothing to a kirana");
  const ok = await order(C, k.slug, v); assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const row = t.one("SELECT * FROM orders WHERE code=?", ok.body.order.code);
  assert.equal(row.svc_items, null); assert.equal(row.svc_min, null); assert.equal(row.total_paise, 4000); assert.equal(row.phone, "9876543210");
  assert.equal(ok.body.order.salon_booking, false);
});

test("v10.14: existing salon rows are untouched — preset products stay, the old items[] path still books, migration only adds", async () => {
  const t = await base(); const s = await t.shop("TEST Old Salon", "salon");
  const before = JSON.stringify(t.sql("SELECT * FROM products WHERE shop_id=? ORDER BY id", s.id)) + JSON.stringify(t.sql("SELECT * FROM variants WHERE shop_id=? ORDER BY id", s.id));
  await s.J.call("PUT", "/api/admin/salon-services", { key: "haircut", price: "90" }); await book(t.jar(), s.slug, ["haircut"]);
  const after = JSON.stringify(t.sql("SELECT * FROM products WHERE shop_id=? ORDER BY id", s.id)) + JSON.stringify(t.sql("SELECT * FROM variants WHERE shop_id=? ORDER BY id", s.id));
  assert.equal(after, before, "catalogue prices live in their own table; old service rows are never touched");
  const w = S("_worker.mjs"); const m = w.slice(w.indexOf("const MIGRATIONS = ["), w.indexOf("];", w.indexOf("const MIGRATIONS = [")));
  const chunks = m.split("`").filter((x, i) => i % 2 === 1); const last = chunks.find(c => c.includes("svc_items")); // v10.15: migration 18 is no longer the last one
  for (const stmt of last.split(/;\s*\n/).map(x => x.trim()).filter(Boolean)) assert.match(stmt, /^(ALTER TABLE orders ADD COLUMN (svc_items TEXT|svc_min INTEGER)|CREATE TABLE IF NOT EXISTS shop_service_prices )/, stmt);
  assert.ok(!/DROP|DELETE|UPDATE /.test(last));
  // a priced old-style service still books through items[] (old cached clients)
  const p = await s.J.call("POST", "/api/admin/products", { name_hi: "पुरानी", name_en: "Old cut", variants: [{ label: "Regular", price: "50", stock: 5 }] }); assert.equal(p.status, 201);
  const v = t.one("SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id WHERE p.shop_id=? AND p.name_en='Old cut'", s.id);
  const old = await order(t.jar({ ip: "6.6.6.6" }), s.slug, v); assert.equal(old.status, 201, JSON.stringify(old.body));
  // deleting the shop removes its catalogue prices too
  assert.equal((await t.dev.call("POST", "/api/dev/shops/delete", { shop_id: s.id, confirm: s.slug })).status, 200);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM shop_service_prices WHERE shop_id=?", s.id).n, 0);
});

test("v10.14: admin — salon Services = read-only catalogue with price boxes + switches; the Open/Close + link bar shows on the home tab only; salon header", () => {
  const a = S("admin.js"), c = S("admin.css");
  assert.match(a, /if \(shopType\(\) === "salon"\) return salonCatalogView\(\);/);
  assert.match(a, /api\("\/api\/admin\/salon-services", \{method: "PUT", body\}\)/); assert.match(a, /data-price=/); assert.match(a, /data-on=/); assert.match(a, /Saved ✓/);
  assert.match(a, /sb\.classList\.toggle\("sb-away", t !== "today"\)/); assert.match(c, /\.shop-bar\.sb-away\{display:none!important\}/);
  assert.match(a, /function salonHead/); assert.match(a, /"✂️ " \+ L\("सैलून","Salon"\)/); assert.match(c, /body\.salon-admin \.a-top:after/); assert.match(c, /prefers-reduced-motion:reduce\)\{body\.salon-admin/);
  assert.match(a, /const SB = !!o\.svc_items/);
});
