// v10.13.1 tests: salon Services = preset services (no price until the shopkeeper sets one), one-tap chips, salon form without MRP / brand / stock / time.
// Krish 26 Oct 11:02, 11:04 and 11:07 PM. Kirana / restaurant unchanged. Harness copied from v1013-token.test.mjs.
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



import vm from "node:vm";
const NAMES = ["Haircut","Beard trim","Shave","Hair colour","Facial","Head massage"];
const store = async (t, slug) => (await t.jar().call("GET", "/api/store", undefined, { shop: slug })).body;
const adminCat = async J => (await J.call("GET", "/api/admin/catalog")).body;
const fn = (src, name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i > 0, name); return src.slice(i, src.indexOf("\n  }\n", i)); };

test("v10.13.1: a NEW salon starts with the 6 preset services, unpriced and hidden from customers; nothing to book until priced", async () => {
  const t = await base(); const s = await t.shop("TEST Fresh Salon", "salon");
  const rows = t.sql("SELECT name_en, duration_min, active, (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) AS nv FROM products p WHERE shop_id=? ORDER BY id DESC", s.id);
  assert.deepEqual(rows.map(r => r.name_en), NAMES);
  assert.deepEqual((await adminCat(s.J)).products.map(p => p.name_en), NAMES, "the panel lists Haircut first");
  assert.deepEqual(rows.map(r => r.duration_min), [20, 15, 15, 45, 30, 15]);
  assert.ok(rows.every(r => r.nv === 0 && r.active === 1), "no price row = no price");
  const pub = await store(t, s.slug); assert.equal(pub.ok, true); assert.equal(pub.products.length, 0, "customers see no unpriced service");
  const adm = await adminCat(s.J); assert.equal(adm.products.length, 6); assert.ok(adm.products.every(p => p.variants.length === 0 && p.duration_min > 0));
});

test("v10.13.1: saving a price makes a preset service visible and bookable at once (stock unlimited, no MRP)", async () => {
  const t = await base(); const s = await t.shop("TEST Price Salon", "salon");
  const hc = (await adminCat(s.J)).products.find(p => p.name_en === "Haircut");
  const r = await s.J.call("PUT", `/api/admin/products/${hc.id}`, { name_hi: hc.name_hi, name_en: hc.name_en, icon: hc.icon, category_id: null, active: true, duration_min: 20, variants: [{ label: "Regular", price: 120, mrp: "", stock: 100000, low_stock: 0 }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pub = await store(t, s.slug); assert.deepEqual(pub.products.map(p => p.name_en), ["Haircut"]);
  const v = pub.products[0].variants[0]; assert.equal(v.price_paise, 12000); assert.equal(v.in_stock, true); assert.equal(v.few_left, false); assert.equal(v.mrp_paise, null);
  const o = await t.jar({ ip: "4.4.4.1" }).call("POST", "/api/orders", { name: "Rahul", phone: "98765 43210", items: [{ variant_id: v.id, qty: 1 }], payment_method: "cod", idempotency_key: idem(), source: "walkin" }, { shop: s.slug });
  assert.equal(o.status, 201, JSON.stringify(o.body)); assert.equal(o.body.order.token_no, 1);
  // the server forces "unlimited" for a service shop even if a client sends a small stock / an MRP
  const r2 = await s.J.call("PUT", `/api/admin/products/${hc.id}`, { name_hi: hc.name_hi, name_en: hc.name_en, icon: hc.icon, active: true, variants: [{ label: "Regular", price: 120, mrp: 200, stock: 1 }] });
  assert.equal(r2.status, 200); assert.deepEqual({ ...t.one("SELECT stock, mrp_paise FROM variants WHERE product_id=?", hc.id) }, { stock: 100000, mrp_paise: null });
});

test("v10.13.1: a one-tap chip adds a service with its preset minutes; the chip list = the server's preset list", async () => {
  const t = await base(); const s = await t.shop("TEST Chip Salon", "salon");
  const hc = (await adminCat(s.J)).products.find(p => p.name_en === "Facial");
  assert.equal((await s.J.call("DELETE", `/api/admin/products/${hc.id}`)).status, 200);
  const P = (() => { const ctx = {}; vm.runInNewContext(S("type-profile.js"), ctx); return ctx.AK_PROFILE; })();
  const d = P.SALON_DEFAULTS.find(x => x.en === "Facial"); assert.equal(d.min, 30); assert.equal("price" in d, false, "no default price (Krish 11:04 PM)");
  // exactly what the chip's Add sends (admin.js svcServicesView)
  const r = await s.J.call("POST", "/api/admin/products", { name_hi: d.hi, name_en: d.en, icon: d.icon, category_id: null, active: true, featured: false, duration_min: d.min, variants: [{ label: "Regular", price: 250, mrp: "", stock: 100000, low_stock: 0 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual({ ...t.one("SELECT duration_min, active FROM products WHERE id=?", r.body.id) }, { duration_min: 30, active: 1 });
  assert.deepEqual((await store(t, s.slug)).products.map(p => p.name_en), ["Facial"]);
  // client and server preset lists match (names, Hindi, icons, minutes)
  const W = S("_worker.mjs"); const m = W.match(/const SALON_DEFAULTS = (\[.*?\]\]);/); assert.ok(m);
  assert.deepEqual(JSON.parse(m[1]), JSON.parse(JSON.stringify(P.SALON_DEFAULTS.map(x => [x.icon, x.hi, x.en, x.min]))));
  const A = S("admin.js"); const sv = fn(A, "svcServicesView");
  assert.match(sv, /data-sugg=/); assert.match(sv, /svcHas\(d\)/, "a chip whose service exists is ticked"); assert.match(sv, /"Added ✓"/); assert.match(A, /const svcPriceBox = [^\n]*inputmode="numeric"/); assert.match(sv, /svcPriceBox\(/);
  assert.match(sv, /"Set prices to start taking bookings"/); assert.match(sv, /"Set price"/); assert.match(sv, /"दाम डालें"/);
  assert.match(sv, /"No services yet\. Tap one to add:"/);
  assert.doesNotMatch(sv, /min"\)|मिनट|duration_min \|\| 20\)\} /, "no minutes on the chips or the list (Krish 11:07 PM)");
  assert.doesNotMatch(sv, /coming soon|Stock & price history|Bulk items|csvIn|स्टॉक/i);
});

test("v10.13.1: the salon form has no MRP / brand / stock / category / time; the kirana form is unchanged", async () => {
  const A = S("admin.js"); const es = fn(A, "editService"); const row = fn(A, "svcRow");
  for (const bad of [/name="mrp"/, /name="brand"/, /name="stock"/, /name="category_id"/, /MRP/, /ब्रांड/, /Brand/, /durChips|data-min=/, /कितना समय/]) assert.doesNotMatch(es + row, bad, String(bad));
  assert.match(es, /name="name_hi"/); assert.match(row, /name="price"/); assert.match(es, /id="ph"/, "optional photo"); assert.match(es, /id="addV"/, "+ Another type");
  assert.match(es, /सेवा का नाम/); assert.match(es, /name="name_hi" value="\$\{esc\(p\.name_hi\)\}"/, "the Hindi box holds the Hindi name in EN mode too"); assert.match(row, /रेट ₹/);
  assert.match(es, /stock: SVC_STOCK/); assert.match(A, /const SVC_STOCK = 100000;/);
  // routing: service shops get the new page/form; kirana / restaurant keep the old ones, byte for byte
  assert.match(fn(A, "productsView"), /if \(isSvc\(\)\) return svcServicesView\(\);/);
  assert.match(fn(A, "editProduct"), /if \(isSvc\(\)\) return editService\(id\);/);
  const ep = fn(A, "editProduct"); for (const keep of [/name="brand"/, /name="mrp"|vrow/, /name="category_id"/, /स्टॉक\/रेट हिस्ट्री/]) assert.match(ep, keep, String(keep));
  const vr = fn(A, "vrow"); assert.match(vr, /name="mrp"/); assert.match(vr, /name="stock"/);
  const pv = fn(A, "productsView"); assert.match(pv, /Bulk items \(CSV \/ Excel\)/); assert.match(pv, /Stock & price history/);
});

test("v10.13.1: existing shops get nothing inserted — a kirana / restaurant signup and a switch to salon add no services", async () => {
  const t = await base();
  const k = await t.shop("TEST Kirana", "kirana"); const r = await t.shop("TEST Dhaba", "restaurant"); const c = await t.shop("TEST Clinic", "clinic");
  for (const s of [k, r, c]) assert.equal(t.one("SELECT COUNT(*) AS n FROM products WHERE shop_id=?", s.id).n, 0);
  await t.item(k.J, "40", "1 kg", 10); const before = t.sql("SELECT * FROM variants WHERE shop_id=?", k.id);
  const sw = await k.J.call("POST", "/api/admin/shop-type", { shop_type: "salon", confirm: true }); assert.equal(sw.status, 200, JSON.stringify(sw.body));
  assert.equal(t.one("SELECT COUNT(*) AS n FROM products WHERE shop_id=?", k.id).n, 1, "switching type inserts nothing");
  assert.deepEqual(t.sql("SELECT * FROM variants WHERE shop_id=?", k.id), before);
  // kirana stock still behaves as before (no forced unlimited stock, MRP kept)
  const r2 = t.one("SELECT stock FROM variants WHERE shop_id=?", r.id); assert.equal(r2, undefined);
  await t.item(r.J, "120", "Full plate", 7); assert.equal(t.one("SELECT stock FROM variants WHERE shop_id=?", r.id).stock, 7);
});

test("v10.13.1: salon customer nav says My bookings (मेरी बुकिंग); kirana keeps My orders", () => {
  const C = S("common.js"); const svc = C.slice(C.indexOf("service: {"), C.indexOf("\n    }", C.indexOf("service: {")));
  assert.match(svc, /my_orders:\["मेरी बुकिंग","My bookings"\]/);
  assert.match(C, /my_orders:\["मेरे ऑर्डर","My orders"\]/);
});
