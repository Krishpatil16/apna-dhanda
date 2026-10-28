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

test("landing page: Apna Dhanda, register + login buttons, and NO shop data", async () => {
  const t = await twoShops(); const { C } = t;
  const r = await C.call("GET", "/"); assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /text\/html/);
  assert.match(r.body, /अपनी दुकान शुरू करें →/); assert.match(r.body, /href="\/admin#signup" id="ctaShop"/); assert.match(r.body, /लॉगिन करें/); assert.match(r.body, /href="\/admin" id="login"/); // v10.12.5 glass flow
  assert.match(r.body, /Apna Dhanda/); assert.doesNotMatch(r.body, /\{\{BRAND/);
  // v10.11: the landing now lists approved + ONLINE shops (name, type, link) for customers — never pending/offline/TEST shops, owners or phones
  for (const leak of ["Sharma", t.slug, "ak-shop", "/api/store", "9123456780"]) assert.ok(!r.body.includes(leak), "landing leaks " + leak);
  const mf = J((await C.call("GET", "/manifest.webmanifest")).body); assert.equal(mf.name, "Apna Dhanda"); assert.equal(mf.start_url, "/");
  // developer renames the platform → landing + manifests follow
  assert.equal((await t.dev.call("POST", "/api/dev/brand", { name: "Apna Dhanda Pro" })).status, 200);
  assert.match((await C.call("GET", "/")).body, /Apna Dhanda Pro/);
  assert.equal(J((await C.call("GET", "/admin.webmanifest")).body).start_url, "/admin");
  assert.equal((await t.B.call("POST", "/api/dev/brand", { name: "hack" })).status, 403, "shopkeeper can't change the brand");
});

test("online switch: approved shop starts OFFLINE; offline blocks orders + shows 'अभी बंद है'; pending can't go online", async () => {
  const w = await world(); const dev = w.jar(); await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS });
  const A = w.jar(); await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" });
  const B = w.jar(); const s = await B.call("POST", "/api/admin/signup", { owner_name: "Ravi", shop_name: "Ravi General Store", mobile: "9000011112", password: "ravipass12" });
  const slug = s.body.shop.slug; const bid = s.body.shop.id;
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 409, "pending shop can't go online");
  const cats = [{ id: (await B.call("POST", "/api/admin/categories", { name_hi: "मसाले", icon: "🌶️" })).body.id }];
  await B.call("POST", "/api/admin/products", { name_hi: "नमक", icon: "🧂", category_id: cats[0].id, variants: [{ label: "1 kg", price: "20", stock: 5 }] });
  await dev.call("POST", "/api/dev/service", { shop_id: bid, action: "approve" });
  const st = (await B.call("GET", "/api/admin/state")).body; assert.equal(st.admin.shop.online, false); assert.equal(st.admin.shop.customer_url, `https://k.test/s/${slug}`);
  const C = w.jar(); const store = (await C.call("GET", "/api/store", undefined, { shop: slug })).body; assert.equal(store.service_paused, true); assert.equal(store.shop.online, false);
  const pg = await C.call("GET", `/s/${slug}`); assert.equal(pg.status, 503); assert.match(pg.body, /अभी बंद है/); assert.doesNotMatch(pg.body, /मंज़ूरी|starting soon/i);
  assert.equal((await order(C, slug, store.products[0].variants[0])).status, 423);
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 200);
  assert.equal((await C.call("GET", `/s/${slug}`)).status, 200);
  const s2 = (await C.call("GET", "/api/store", undefined, { shop: slug })).body; assert.equal(s2.service_paused, false);
  assert.equal(s2.products[0].icon, "🧂", "sticker shows on the storefront card when there is no photo");
  assert.equal((await order(C, slug, s2.products[0].variants[0])).status, 201);
  assert.equal((await B.call("POST", "/api/admin/online", { online: false })).status, 200);
  assert.equal((await order(C, slug, s2.products[0].variants[0])).status, 423, "switching offline blocks new orders again");
  // shop #1 (online from the migration) is unaffected; paused ≠ offline ≠ pending pages
  assert.equal((await C.call("GET", "/s/mahesh-kirana")).status, 200);
  await dev.call("POST", "/api/dev/service", { shop_id: bid, action: "pause" });
  const pp = await C.call("GET", `/s/${slug}`); assert.equal(pp.status, 503); assert.match(pp.body, /दुकान अभी बंद है/); assert.doesNotMatch(pp.body, /ऑनलाइन ऑर्डर नहीं ले रही/);
});

test("per-shop app manifest: own name/short_name/icons, start_url + scope = /s/<slug>; page links it; lock stops the shopkeeper", async () => {
  const t = await twoShops(); const { B, C, dev, slug, bid } = t;
  let mf = J((await C.call("GET", `/s/${slug}/manifest.webmanifest`)).body);
  assert.equal(mf.start_url, `/s/${slug}`); assert.equal(mf.scope, `/s/${slug}`); assert.equal(mf.id, `/s/${slug}`); assert.equal(mf.name, "TEST – Sharma Kirana");
  assert.ok([...mf.short_name].length <= 12); assert.equal(mf.icons[0].src, "/app-shop-192.png?v=9", "v10.5: no platform logo uploaded → the customer-app icon, never a letter tile");
  const fic = (await C.call("GET", `/s/${slug}/icon.svg`)).body; assert.match(fic, /<svg/); assert.doesNotMatch(fic, /<text/);
  const m1 = J((await C.call("GET", "/s/mahesh-kirana/manifest.webmanifest")).body); assert.equal(m1.name, "Mahesh Agrawal Kirana Store"); assert.equal(m1.scope, "/s/mahesh-kirana");
  // shopkeeper sets the home-screen app
  const ids = {}; for (const k of ["i192","i512","m512","a180"]) ids[k] = (await B.call("POST", "/api/admin/image", { data_url: PNG })).body.image_id;
  assert.equal((await B.call("PUT", "/api/admin/app", { name: "शर्मा जी की दुकान बहुत बड़ी", icons: ids })).status, 400, "name > 12 refused");
  const ok = await B.call("PUT", "/api/admin/app", { name: "शर्मा स्टोर", icons: ids, theme: "#7c3aed" }); assert.equal(ok.status, 200, JSON.stringify(ok.body));
  mf = J((await C.call("GET", `/s/${slug}/manifest.webmanifest`)).body);
  assert.equal(mf.short_name, "शर्मा स्टोर"); assert.equal(mf.name, "शर्मा स्टोर"); assert.equal(mf.theme_color, "#7c3aed");
  assert.deepEqual(mf.icons.map(i => i.src), [`/api/img/${ids.i192}`, `/api/img/${ids.i512}`, `/api/img/${ids.m512}`]); assert.equal(mf.icons[2].purpose, "maskable");
  const pg = (await C.call("GET", `/s/${slug}`)).body;
  assert.match(pg, new RegExp(`href="/s/${slug}/manifest.webmanifest\\?v=9"`)); assert.match(pg, new RegExp(`apple-touch-icon" href="/api/img/${ids.a180}"`)); assert.match(pg, /apple-mobile-web-app-title" content="शर्मा स्टोर"/);
  // another shop's image can't be used as my icon
  const A1 = (await t.A.call("POST", "/api/admin/image", { data_url: PNG })).body.image_id;
  assert.equal((await B.call("PUT", "/api/admin/app", { icons: { i192: A1 } })).status, 400);
  // developer override + lock
  const lk = await dev.call("POST", "/api/dev/shops/app", { shop_id: bid, name: "Sharma", lock: true }); assert.equal(lk.status, 200); assert.equal(lk.body.app.lock, true);
  assert.equal((await B.call("PUT", "/api/admin/app", { name: "Changed" })).status, 423, "locked: shopkeeper can't change");
  assert.equal(J((await C.call("GET", `/s/${slug}/manifest.webmanifest`)).body).short_name, "Sharma");
  const dimg = (await dev.call("POST", "/api/dev/image", { shop_id: bid, data_url: PNG })).body.image_id;
  assert.equal((await dev.call("POST", "/api/dev/shops/app", { shop_id: bid, icons: { i192: dimg, i512: dimg } })).status, 200, "developer can still change a locked app");
  assert.equal((await B.call("GET", "/api/admin/state")).body.admin.shop.app.lock, true);
  await dev.call("POST", "/api/dev/shops/app", { shop_id: bid, lock: false });
  assert.equal((await B.call("PUT", "/api/admin/app", { name: "Changed" })).status, 200, "unlocked again");
  assert.equal((await B.call("POST", "/api/dev/shops/app", { shop_id: bid, lock: false })).status, 403);
});

test("developer can delete a shop with all its data (typed link name)", async () => {
  const t = await twoShops(); const { B, C, dev, slug, bid } = t;
  await order(C, slug, t.bVar);
  assert.equal((await dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: "wrong" })).status, 400);
  const before1 = t.one("SELECT COUNT(*) AS n FROM orders WHERE shop_id=1").n;
  assert.equal((await dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: slug })).status, 200);
  for (const tb of ["shops WHERE id=?", "orders WHERE shop_id=?", "products WHERE shop_id=?", "variants WHERE shop_id=?", "categories WHERE shop_id=?", "admins WHERE shop_id=?", "shop_settings WHERE shop_id=?", "audit_log WHERE shop_id=?", "images WHERE shop_id=?"])
    assert.equal(t.one(`SELECT COUNT(*) AS n FROM ${tb}`, bid).n, 0, tb);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)").n, 0);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM orders WHERE shop_id=1").n, before1);
  assert.equal((await C.call("GET", `/s/${slug}`)).status, 404);
  assert.equal((await B.call("GET", "/api/admin/dashboard")).status, 401);
});

test("stickers: 40+ ready kirana stickers with Hindi labels, grouped, loaded by the admin panel", async () => {
  const src = readFileSync(join(here, "..", "site", "stickers.js"), "utf8"); const win = {}; new Function("window", src)(win);
  const all = win.AK_STICKERS.flatMap(g => g.items); assert.ok(all.length >= 40, "count " + all.length); assert.ok(win.AK_STICKERS.length >= 6);
  for (const [e, hi, en] of all) { assert.ok(e && [...e].length <= 4); assert.match(hi, /[\u0900-\u097F]/); assert.ok(en); }
  for (const want of ["आटा", "चावल", "दाल", "तेल", "घी", "दूध", "चीनी", "नमक", "बिस्किट", "चिप्स", "साबुन", "शैम्पू", "अंडे", "ब्रेड", "मैगी", "चाय", "कॉफ़ी", "कोल्ड ड्रिंक"]) assert.ok(all.some(x => x[1].includes(want)), want);
  assert.match(readFileSync(join(here, "..", "site", "admin.html"), "utf8"), /<script src="\/stickers.js(\?v=[\d.]+)?"><\/script>/);
  assert.match(readFileSync(join(here, "..", "site", "admin.js"), "utf8"), /AK_STICKERS/);
});
