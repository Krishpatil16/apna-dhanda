// (harness copied from multishop.test.mjs) v5 multi-shop tests: self-signup + approval, per-shop isolation (orders, products, settings, reports, backup, push,
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
test("v10.11 migration: shops.shop_type defaults to 'kirana' (every existing shop stays kirana); orders get order_type/table_no; additive only; schema v15", async () => {
  const t = await base();
  assert.equal(t.one("SELECT MAX(v) AS v FROM schema_version").v, 19);
  const col = t.sql("PRAGMA table_info(shops)").find(c => c.name === "shop_type"); assert.ok(col); assert.equal(col.dflt_value, "'kirana'"); assert.equal(col.notnull, 1);
  assert.equal(t.one("SELECT shop_type FROM shops WHERE id=1").shop_type, "kirana");
  const oc = t.sql("PRAGMA table_info(orders)"); assert.equal(oc.find(c => c.name === "order_type").dflt_value, "'delivery'"); assert.equal(oc.find(c => c.name === "table_no").dflt_value, "''");
  // an old shop inserted without the column (= any shop that existed before v10.11) reads as kirana
  t.DB._sql.prepare("INSERT INTO shops (slug,name,status,created_at,updated_at) VALUES ('old-shop','Old Shop','active',1,1)").run();
  assert.equal(t.one("SELECT shop_type FROM shops WHERE slug='old-shop'").shop_type, "kirana");
  const W = S("_worker.mjs"); const mig = W.slice(W.indexOf("// v10.11: every shop type. Additive only"), W.indexOf("// v10.12: nearby shops", W.indexOf("// v10.11: every shop type. Additive only")));
  assert.ok(mig.length > 0 && !/\b(DROP|DELETE|UPDATE)\b/i.test(mig) && (mig.match(/ALTER TABLE/g) || []).length === 3, "v10.11 migration only ADDs three defaulted columns");
});

test("v10.11 sign-up with a shop type: stored, returned, validated; missing = kirana (old app); restaurant gets food starter categories, others start empty", async () => {
  const t = await base();
  const r = await t.shop("TEST – Sharma Bhojnalaya", "restaurant"); assert.equal(r.signup.shop.type, "restaurant"); assert.equal(r.signup.shop.type_info.mode, "order");
  assert.equal(t.one("SELECT shop_type FROM shops WHERE id=?", r.id).shop_type, "restaurant");
  assert.deepEqual(t.sql("SELECT name_en FROM categories WHERE shop_id=? ORDER BY sort", r.id).map(c => c.name_en), ["Thali", "Snacks", "Main course", "Drinks", "Sweets"]);
  const s = await t.shop("TEST – Style Salon", "salon"); assert.equal(s.signup.shop.type_info.mode, "booking"); assert.equal(s.signup.shop.type_info.flow, "order", "booking is Step 2 — salon still orders for now");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM categories WHERE shop_id=?", s.id).n, 0, "service shop starts empty");
  const k = await t.shop("TEST – Old App Kirana"); assert.equal(t.one("SELECT shop_type FROM shops WHERE id=?", k.id).shop_type, "kirana");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM categories WHERE shop_id=?", k.id).n, 0, "kirana starts empty as before");
  for (const ty of ["clinic", "repair", "other"]) { const x = await t.shop("TEST " + ty, ty); assert.equal(x.signup.shop.type, ty); }
  const bad = await t.jar({ ip: "3.3.3.3" }).call("POST", "/api/admin/signup", { owner_name: "X", shop_name: "X Shop", mobile: "9000000009", password: "shoppass1", shop_type: "casino" });
  assert.equal(bad.status, 400); assert.equal(bad.body.code, "invalid_shop_type");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM admins WHERE mobile='9000000009'").n, 0, "nothing created on a bad type");
});

test("v10.11 type is visible: /api/store, page meta (first paint), admin state, dev list + type list; kirana shop #1 unchanged", async () => {
  const t = await base(); const r = await t.shop("TEST – Bhojnalaya", "restaurant"); const C = t.jar();
  const st = await C.call("GET", "/api/store", undefined, { shop: r.slug }); assert.equal(st.body.shop.type, "restaurant");
  assert.equal((await C.call("GET", "/api/store")).body.shop.type, "kirana");
  const page = await C.call("GET", `/s/${r.slug}`); assert.match(page.body, /<meta name="ak-shop" content="[^"]+" data-id="\d+" data-name="[^"]*" data-type="restaurant">/);
  assert.equal((await r.J.call("GET", "/api/admin/state")).body.admin.shop.type, "restaurant");
  const dv = (await t.dev.call("GET", "/api/dev/shops")).body; assert.equal(dv.shops.find(s => s.id === r.id).type, "restaurant"); assert.equal(dv.shops.find(s => s.id === 1).type, "kirana");
  assert.deepEqual(dv.shop_types.map(x => x.type), ["kirana", "restaurant", "salon", "clinic", "repair", "other"]);
  assert.deepEqual(dv.shop_types.map(x => x.mode), ["order", "order", "booking", "booking", "booking", "booking"]);
});

test("v10.11 change type in Settings: needs confirm, CSRF header and a login; changes ONLY this shop; logged; restaurant starters only into an empty shop", async () => {
  const t = await base(); const a = await t.shop("TEST – A", "kirana"); const b = await t.shop("TEST – B", "kirana");
  await t.item(a.J);
  assert.equal((await a.J.call("POST", "/api/admin/shop-type", { shop_type: "salon" })).body.code, "confirm_required");
  assert.equal((await a.J.call("POST", "/api/admin/shop-type", { shop_type: "boat", confirm: true })).status, 400);
  assert.equal((await t.jar().call("POST", "/api/admin/shop-type", { shop_type: "salon", confirm: true })).status, 401);
  const ok = await a.J.call("POST", "/api/admin/shop-type", { shop_type: "restaurant", confirm: true }); assert.equal(ok.status, 200); assert.equal(ok.body.type, "restaurant"); assert.equal(ok.body.changed, true);
  assert.equal(t.one("SELECT shop_type FROM shops WHERE id=?", a.id).shop_type, "restaurant");
  assert.equal(t.one("SELECT shop_type FROM shops WHERE id=?", b.id).shop_type, "kirana", "other shop untouched");
  assert.equal(t.one("SELECT shop_type FROM shops WHERE id=1").shop_type, "kirana", "shop #1 untouched");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM categories WHERE shop_id=?", a.id).n, 5, "A had no categories → food starter categories added (items untouched)");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM products WHERE shop_id=?", a.id).n, 1, "items kept");
  assert.ok(t.one("SELECT note FROM service_log WHERE shop_id=? AND note LIKE '%shop type%' ORDER BY id DESC", a.id).note.includes("kirana → restaurant"));
  const b2 = await b.J.call("POST", "/api/admin/shop-type", { shop_type: "restaurant", confirm: true }); assert.equal(b2.status, 200);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM categories WHERE shop_id=?", b.id).n, 5, "empty shop → food starter categories");
  const again = await b.J.call("POST", "/api/admin/shop-type", { shop_type: "restaurant", confirm: true }); assert.equal(again.body.changed, false);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM categories WHERE shop_id=?", b.id).n, 5, "never duplicated");
  // CSRF: without the kirana header the write is refused
  const raw = await t.worker.fetch(new Request("https://k.test/api/admin/shop-type", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shop_type: "salon", confirm: true }) }), t.env.e);
  assert.equal(raw.status, 403);
});

test("v10.11 restaurant orders: 🥡 parcel / 🛵 delivery / 🍽️ table (table no. required), no address or delivery fee for parcel/table; kirana checkout unchanged", async () => {
  const t = await base(); const r = await t.shop("TEST – Dhaba", "restaurant"); await t.item(r.J);
  await r.J.call("PUT", "/api/admin/settings", { delivery_charge: "20", free_delivery_above: "" });
  const C = t.jar({ ip: "4.4.4.4" }); const v = (await C.call("GET", "/api/store", undefined, { shop: r.slug })).body.products[0].variants[0];
  const post = (extra, c = C, shop = r.slug, vv = v) => c.call("POST", "/api/orders", { name: "Ramesh", phone: "98765 43210", items: [{ variant_id: vv.id, qty: 1 }], payment_method: "cod", idempotency_key: idem(), ...extra }, { shop });
  const tb = await post({ order_type: "table", table_no: "4" }); assert.equal(tb.status, 201, JSON.stringify(tb.body));
  assert.equal(tb.body.order.order_type, "table"); assert.equal(tb.body.order.table_no, "4"); assert.equal(tb.body.order.delivery_paise, 0); assert.equal(tb.body.order.total_paise, 12000);
  assert.equal((await post({ order_type: "table", table_no: "" })).body.code, "invalid_table_no");
  assert.equal((await post({ order_type: "table", table_no: "<b>" })).body.code, "invalid_table_no");
  assert.equal((await post({ order_type: "drone" })).body.code, "invalid_order_type");
  const pc = await post({ order_type: "parcel" }); assert.equal(pc.status, 201); assert.equal(pc.body.order.order_type, "parcel"); assert.equal(pc.body.order.delivery_paise, 0);
  assert.equal((await post({ order_type: "delivery" })).status, 400, "delivery still needs the address");
  const C2 = t.jar({ ip: "4.4.4.5" }); const dl = await post({ order_type: "delivery", address: cust.address }, C2); assert.equal(dl.status, 201); assert.equal(dl.body.order.delivery_paise, 2000); assert.equal(dl.body.order.total_paise, 14000);
  const row = t.one("SELECT order_type, table_no, address, shop_id FROM orders WHERE code=?", tb.body.order.code); assert.equal(row.order_type, "table"); assert.equal(row.address, ""); assert.equal(row.shop_id, r.id);
  // the shopkeeper sees it on the order card data
  const ao = (await r.J.call("GET", "/api/admin/orders")).body; const list = ao.orders || ao; assert.ok(JSON.stringify(list).includes('"table_no":"4"'));
  // kirana: an order_type sent by a customer is ignored — stays delivery, address still required
  const k = await t.shop("TEST – Kirana K", "kirana"); await t.item(k.J, "50", "1 kg");
  const C3 = t.jar({ ip: "4.4.4.6" }); const kv = (await C3.call("GET", "/api/store", undefined, { shop: k.slug })).body.products[0].variants[0];
  assert.equal((await post({ order_type: "table", table_no: "4" }, C3, k.slug, kv)).status, 400, "kirana: no address = refused as before");
  const ko = await post({ order_type: "table", table_no: "4", address: cust.address }, C3, k.slug, kv); assert.equal(ko.status, 201); assert.equal(ko.body.order.order_type, "delivery"); assert.equal(ko.body.order.table_no, "");
  // UI: the 3-choice only renders for restaurant shops, and sends order_type/table_no only for them
  const js = S("app.js"); assert.ok(js.includes('const isFood = () => !!(S && S.shop && S.shop.type === "restaurant")'));
  assert.ok(js.includes('...(isFood() ? {order_type: orderType(), table_no:'));
  for (const k2 of ['"parcel","🥡"', '"delivery","🛵"', '"table","🍽️"']) assert.ok(js.includes(k2), k2);
  const adm = S("admin.js"); assert.ok(adm.includes("function otypeChip(o)") && adm.includes('o-type ot-'));
});

test("v10.12 (was v10.11 home page): \"/\" has NO shop list, only the two choices; the type-grouped list moved to /shops — chips only for types that have a shop, only approved + online shops, never TEST shops", async () => {
  const t = await base();
  await t.shop("Sharma Bhojnalaya", "restaurant"); await t.shop("Style Salon", "salon"); await t.shop("Waiting Clinic", "clinic", { approve: false });
  await t.shop("Offline Repair", "repair", { online: false }); await t.shop("TEST – Hidden Salon", "salon");
  t.DB._sql.prepare("UPDATE shops SET online=1 WHERE id=1").run();
  const fake = t.env.e.ASSETS.fetch; t.env.e.ASSETS.fetch = async r => { const p = new URL(r.url).pathname; return p === "/landing.html" || p === "/shops.html" || p === "/shops-list.html" ? new Response(S(p.slice(1)), {headers: {"content-type": "text/html"}}) : fake(r); };
  const land = (await t.jar().call("GET", "/")).body;
  assert.ok(!land.includes('data-ft="') && !land.includes('href="/s/') && !land.includes('id="dukaanein"'), "no shop directory on /");
  assert.ok(land.includes('href="/shops" id="pickCust"') && land.includes('href="/admin" id="pickShop"')) // v10.12.5: the shopkeeper pill falls back to /admin without JS;
  // v10.12.3: /shops = 6 category tiles (active only where a listable shop exists, else "Coming soon"); each category is its own list
  const c = (await t.jar().call("GET", "/shops")).body;
  const tiles = [...c.matchAll(/class="cat t-[a-z]+( soon)?" href="\/shops\/([a-z]+)"/g)].map(m => m[2] + (m[1] ? ":soon" : ""));
  assert.deepEqual(tiles, ["grocery", "restaurant", "salon", "clinic:soon", "repair:soon", "other:soon"]);
  assert.ok(!c.includes('href="/s/') && !c.includes("Sharma") && !c.includes("Style Salon"));
  const h = (await t.jar().call("GET", "/shops/restaurant")).body + (await t.jar().call("GET", "/shops/salon")).body + (await t.jar().call("GET", "/shops/clinic")).body + (await t.jar().call("GET", "/shops/repair")).body;
  assert.ok(h.includes('href="/s/sharma-bhojnalaya"') && h.includes('href="/s/style-salon"'));
  for (const no of ["Waiting Clinic", "Offline Repair", "Hidden Salon"]) assert.ok(!h.includes(no), no);
  assert.ok(!/9123456|Owner \d/.test(h), "no owner names or phones in the public list");
  assert.ok(S("shops.js").includes('"?type=" + encodeURIComponent(cat)'));
});

test("v10.11: ration list + grocery icons only for kirana — stickers, ready list, catalog, icon picker, AI icons, hero crate", async () => {
  const adm = S("admin.js");
  assert.ok(adm.includes('const stickersFor = () => isKirana() ? (window.AK_STICKERS || []) : shopFam() === "food" ? FOOD_STICKERS : [];'));
  assert.ok(!/window\.AK_STICKERS/.test(adm.replace('(window.AK_STICKERS || [])', "")), "the grocery stickers are read only through stickersFor()");
  assert.ok(adm.includes('const iconsFor = () => isKirana() ? ICONS : shopFam() === "food" ? FOOD_ICONS : SERVICE_ICONS;') && adm.includes("iconsFor().map("));
  assert.ok(!/\bICONS\.map\(/.test(adm), "icon picker never shows the grocery set directly");
  assert.ok(adm.includes('if (!isKirana()) { try { await loadCatalog(); } catch (x) { return toast(x.message); } return editProduct(null); }'), "ready list opens only for kirana");
  assert.ok(adm.includes('async function ensureCatalog(){ if (isKirana()) return loadStockScript("/kirana-catalog.js"); window.AKCatalog = typeCatalog(); }'));
  assert.equal((adm.match(/loadStockScript\("\/kirana-catalog\.js"\)/g) || []).length, 2, "kirana-catalog.js: the kirana-only picker + ensureCatalog");
  // the food stickers and icons carry no grocery item
  const food = adm.slice(adm.indexOf("const FOOD_STICKERS"), adm.indexOf("const stickersFor"));
  for (const g of ["आटा", "Atta", "दाल\"", "Toor", "Detergent", "साबुन", "Ghee", "Basmati"]) assert.ok(!food.includes(g), g);
  // AI grocery icons switch off for other types (photo / emoji stay)
  const I = (await import(join(here, "..", "site", "icons.js") + "?t=" + Date.now())).default || globalThis.AKIcons;
  const AKI = globalThis.AKIcons; assert.ok(AKI.iconFor({ name_en: "Aashirvaad Atta" }), "kirana: grocery icon");
  AKI.setGrocery(false); assert.equal(AKI.iconFor({ name_en: "Aashirvaad Atta" }), null); assert.equal(AKI.iconFor({ name_en: "Tea" }), null);
  assert.equal(AKI.iconFor({ name_en: "Veg Thali", image: "/api/img/abc" }).kind, "photo"); AKI.setGrocery(true); assert.ok(AKI.iconFor({ name_en: "Aashirvaad Atta" }));
  assert.ok(S("icons.js").includes(`m.dataset.type !== "kirana"`), "icons.js reads the page's shop type before first paint");
  // customer page: hero crate swaps to the type's emoji; common.js applies type words before first paint
  const app = S("app.js"); assert.ok(app.includes("function crateForType()") && app.includes('const set = CRATE[AK.shopType]; if (!set) {'));
  const cm = S("common.js"); assert.ok(cm.includes("if (SHOP.slug) useShopType(SHOP.type);") && cm.includes('search_ph:["थाली, समोसा, चाय खोजें…"'));
  assert.ok(cm.includes('AKIcons.setGrocery(shopType === "kirana")'));
});

test("v10.11 sign-up UI: big type cards (icon + Hindi + English), required, sent as shop_type; Settings shows the type with a 2-step confirm; dev has type pill + filter", () => {
  const adm = S("admin.js");
  for (const k of ['["kirana","restaurant","salon","clinic","repair","other"]', 'class="type-opt"', 'name="${name}" value="${k}"', "shop_type: st}", 'id="typeErr"', 'id="typeChange"', 'id="tcYes"', 'confirm: true}', 'class="type-pick"']) assert.ok(adm.includes(k), k);
  const cm = S("common.js"); for (const e of ["🛒", "🍽️", "💇", "🩺", "🔧", "🏪"]) assert.ok(cm.includes(`icon:"${e}"`), e);
  const W = S("_worker.mjs"); for (const [k, e] of [["kirana", "🛒"], ["restaurant", "🍽️"], ["salon", "💇"], ["clinic", "🩺"], ["repair", "🔧"], ["other", "🏪"]]) assert.ok(new RegExp(`${k}:\\s+\\{icon: "${e}"`).test(W), k);
  assert.ok(W.includes("const BOOKING_LIVE = false;") && W.includes('const shopFlow = t => BOOKING_LIVE && shopMode(t) === "booking" ? "booking" : "order";'), "Step 2 hook: one switch");
  const dv = S("dev.js"); assert.ok(dv.includes('data-cat="${k}"') && dv.includes('class="pill type-pill"') && dv.includes("shopsView.t = b.dataset.cat"), "v10.12.3: type = big category buttons");
  const css = S("admin.css"); assert.ok(css.includes(".type-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))"));
  assert.ok(S("index.html").includes('<span class="type-badge" id="typeBadge" hidden></span>'));
});

test("v10.11 language: English is the default everywhere; one EN | हिंदी switch at the top, remembered; product names follow the language; type cards in English first", async () => {
  const cm = S("common.js");
  assert.ok(cm.includes('let lang = localStorage.getItem("ak_lang") || "en";'), "default English");
  assert.ok(cm.includes('setLang(l){ lang = l; localStorage.setItem("ak_lang", l); }'), "choice remembered");
  assert.ok(cm.includes('>EN</span><i aria-hidden="true">|</i><span') && cm.includes('lang="hi">हिंदी</span>') && /applyT[\s\S]{0,400}paintLang\(\);/.test(cm), "EN | हिंदी painted on every applyT");
  assert.ok(cm.includes('const nm = (o, hiKey="name_hi", enKey="name_en") => (lang==="en" && o[enKey]) ? o[enKey] : (o[hiKey] || o[enKey] || "");'), "name_en by default, name_hi in Hindi, falls back");
  assert.ok(cm.includes('const alt = () => "";'), "one name per language");
  for (const [k, en] of [["kirana", "Grocery / Kirana"], ["restaurant", "Restaurant / Hotel"], ["salon", "Salon / Parlour"], ["clinic", "Clinic / Doctor"], ["repair", "Repair / Service"], ["other", "Other"]]) assert.ok(new RegExp(`${k}:\\s+\\{icon:"[^"]+", hi:"[^"]+", en:"${en.replace(/[/]/g, "\\/")}"`).test(cm), k);
  assert.ok(S("admin.js").includes("<b>${esc(L(t.hi, t.en))}</b><small>${esc(L(t.d[0], t.d[1]))}</small>"), "type cards follow the language");
  const lj = S("landing.js"); assert.ok(lj.includes('lang = "en"; try { lang = localStorage.getItem(KEY) || "en"; }') && lj.includes("  apply();"), "landing English first");
  for (const f of ["admin.js", "app.js", "track.js", "landing.js"]) assert.ok(!S(f).includes('? "हिं" : "EN"'), f + " uses the EN | हिंदी switch");
  // no Hinglish left on the English side of the shopkeeper / customer UI
  const hing = /\b(jodo|jodein|aaya|Dukaan|dukaan|karein|kaise|Kaise|jaankari|Madad|bhejo|nahi|Kam|dekho|karo)\b/;
  for (const f of ["admin.js", "app.js", "track.js"]) for (const m of S(f).matchAll(/L\(\s*(?:"[^"]*"|`[^`]*`)\s*,\s*("(?:[^"\\]|\\.)*"|`[^`]*`)\s*\)/g)) assert.ok(!hing.test(m[1]), `${f}: ${m[1]}`);
  // the browser actually starts in English and the switch flips + remembers it (run common.js in a tiny DOM stub)
  const store = {}; const el = { classList: { add(){} }, setAttribute(){}, innerHTML: "" };
  const g = { localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, document: { addEventListener(){}, removeEventListener(){}, querySelector: () => null, querySelectorAll: () => [], getElementById: id => id === "langBtn" ? el : null, documentElement: { dataset: {} }, body: { classList: { add(){}, remove(){}, toggle(){} } } }, matchMedia: () => ({ matches: false }), navigator: {}, location: { pathname: "/", search: "", hash: "" }, addEventListener(){}, setTimeout(){}, setInterval(){} };
  g.window = g; const fn = new Function("window", "localStorage", "document", "matchMedia", "navigator", "location", S("common.js") + "\nreturn window.AK;");
  const AK = fn(g, g.localStorage, g.document, g.matchMedia, g.navigator, g.location);
  assert.equal(AK.lang, "en"); AK.applyT(); assert.ok(el.innerHTML.includes('<span class="on">EN</span>'));
  assert.equal(AK.t("place"), "Send order request"); assert.equal(AK.nm({ name_hi: "चाय", name_en: "Tea" }), "Tea");
  AK.setLang("hi"); AK.applyT(); assert.equal(store.ak_lang, "hi"); assert.ok(el.innerHTML.includes('<span class="on" lang="hi">हिंदी</span>')); assert.equal(AK.nm({ name_hi: "चाय", name_en: "Tea" }), "चाय");
  assert.equal(AK.nm({ name_hi: "", name_en: "Tea" }), "Tea", "falls back to English when Hindi is empty");
});

test("v10.11.1: renderDelivery still defines its settings on its own line (a comment once swallowed it and broke kirana/restaurant pages)", () => {
  const js = S("app.js"); const f = js.slice(js.indexOf("function renderDelivery(edit){"), js.indexOf("function renderDelivery(edit){") + 600);
  assert.match(f, /\n\s+const s = S\.settings, pins = s\.delivery_pincodes/); assert.ok(!/\/\/[^\n]*const s = S\.settings/.test(f));
});
