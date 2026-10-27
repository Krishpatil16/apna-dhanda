// v10.8.1 tests (shopkeeper details on /s/<slug>). Helpers copied from the v10.8 tests. Original v10.8 header: orders (Ready, edit/remove with totals + stock, substitutes), bill auth, date filter, dashboard counts in IST, offline-queue idempotency, auto-update, global search isolation, help. Helpers copied from the v10.7 tests.
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


const png = n => "data:image/jpeg;base64," + Buffer.alloc(n, 7).toString("base64");
test("v10.8.1 shop info: additive migration — shops.address + shops.owner_photo_id exist; old shops show name + number only", async () => {
  const t = await twoShops();
  const cols = t.sql(`PRAGMA table_info(shops)`).map(c => c.name); assert.ok(cols.includes("address")); assert.ok(cols.includes("owner_photo_id"));
  const st = (await t.C.call("GET", "/api/store", undefined, { shop: t.slug })).body;
  assert.deepEqual(st.shop.owner, { owner_name: "Suresh Sharma", mobile: "9123456780", address: "", photo: null });
});
test("v10.8.1 shop info: owner photo + address saved per shop; public store API exposes exactly owner_name/mobile/address/photo", async () => {
  const t = await twoShops();
  const up = await t.B.call("POST", "/api/admin/image", { data_url: png(12000) }); assert.equal(up.status, 200);
  const r = await t.B.call("PUT", "/api/admin/settings", { owner_photo_id: up.body.image_id, address: "Main Road, near bus stand, Indore" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.shop_info.address, "Main Road, near bus stand, Indore");
  const st = (await t.C.call("GET", "/api/store", undefined, { shop: t.slug })).body;
  assert.deepEqual(Object.keys(st.shop.owner).sort(), ["address", "mobile", "owner_name", "photo"]);
  assert.equal(st.shop.owner.photo, `/api/img/${up.body.image_id}`); assert.equal(st.shop.owner.address, "Main Road, near bus stand, Indore");
  // nothing private rides along anywhere in the shop object
  const flat = JSON.stringify(st.shop); for (const k of ["recovery", "pass", "salt", "paid_until", "trial_end", "price_paise", "note", "owner_photo_id", "app_icons"]) assert.ok(!flat.includes(`"${k}`), k);
  // shop #1 is untouched
  const a = (await t.C.call("GET", "/api/store")).body; assert.equal(a.shop.owner.address, ""); assert.equal(a.shop.owner.photo, null);
  // dashboard gives the shopkeeper the same data back for the Settings card
  const d = (await t.B.call("GET", "/api/admin/dashboard")).body; assert.equal(d.shop_info.owner_photo_id, up.body.image_id); assert.equal(d.shop_info.mobile, "9123456780");
  // remove → photo gone (image row deleted, scoped to this shop)
  const rm = await t.B.call("PUT", "/api/admin/settings", { owner_photo_id: "" }); assert.equal(rm.status, 200);
  assert.equal((await t.C.call("GET", "/api/store", undefined, { shop: t.slug })).body.shop.owner.photo, null);
  assert.equal(t.one(`SELECT COUNT(*) AS n FROM images WHERE id=?`, up.body.image_id).n, 0);
});
test("v10.8.1 shop info: photo size limit (30 KB) and address length limit (200)", async () => {
  const t = await twoShops();
  const big = await t.B.call("POST", "/api/admin/image", { data_url: png(40000) }); assert.equal(big.status, 200);
  const r = await t.B.call("PUT", "/api/admin/settings", { owner_photo_id: big.body.image_id }); assert.equal(r.status, 413);
  assert.equal(t.one(`SELECT owner_photo_id AS p FROM shops WHERE id=?`, t.bid).p, null);
  const long = await t.B.call("PUT", "/api/admin/settings", { address: "x".repeat(201) }); assert.equal(long.status, 400);
  const ok = await t.B.call("PUT", "/api/admin/settings", { address: "y".repeat(200) }); assert.equal(ok.status, 200);
  assert.equal(t.one(`SELECT address AS a FROM shops WHERE id=?`, t.bid).a.length, 200);
});
test("v10.8.1 shop info: isolation — a shop can't use another shop's image as its owner photo, and edits touch only its own row", async () => {
  const t = await twoShops();
  const aImg = await t.A.call("POST", "/api/admin/image", { data_url: png(5000) }); assert.equal(aImg.status, 200);
  const r = await t.B.call("PUT", "/api/admin/settings", { owner_photo_id: aImg.body.image_id }); assert.equal(r.status, 404);
  await t.B.call("PUT", "/api/admin/settings", { address: "B ka pata" });
  assert.equal(t.one(`SELECT address AS a FROM shops WHERE id=1`).a || "", "");
  assert.equal(t.one(`SELECT address AS a FROM shops WHERE id=?`, t.bid).a, "B ka pata");
  assert.equal((await t.C.call("PUT", "/api/admin/settings", { address: "hack" })).status, 401);
});
