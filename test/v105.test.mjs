// v10.5 tests: Dev, Dukaan (shopkeeper) and each shop's customer app are three separate installable apps — own manifest,
// own id + non-overlapping scope, own service-worker scope, path-scoped session cookies; /s/<slug> is always the storefront.
// (helpers copied from the v10.4 tests)
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


const raw = async (t, method, path, cookie, body) => {
  const h = {"cf-connecting-ip": "1.1.1.1"}; if (cookie) h.cookie = cookie; if (body !== undefined) h["content-type"] = "application/json";
  if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana"; if (method !== "GET" && path.startsWith("/api/dev/")) h["x-requested-with"] = "kirana-dev";
  return t.worker.fetch(new Request("https://k.test" + path, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)}), t.env.e);
};
const cookies = r => { const all = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : String(r.headers.get("set-cookie") || "").split(/,(?=\s*__)/); return all.map(s => s.trim()).filter(Boolean); };
const rdSite = f => readFileSync(join(here, "..", "site", f), "utf8");

test("v10.5: each page links ONLY its own manifest (landing links none) and loads pwa.js with its role", async () => {
  const t = await twoShops(); const { C, slug } = t;
  const page = async p => { const r = await C.call("GET", p); assert.equal(r.status, 200, p); return r.body; };
  const manifests = h => [...h.matchAll(/<link rel="manifest" href="([^"]+)"/g)].map(m => m[1]);
  const land = await page("/"), adm = await page("/admin"), dev = await page("/dev"), shop = await page(`/s/${slug}`);
  assert.deepEqual(manifests(land), [], "landing is not an app");
  assert.deepEqual(manifests(adm), ["/admin.webmanifest?v=9"]);
  assert.deepEqual(manifests(dev), ["/dev.webmanifest?v=9"]);
  assert.deepEqual(manifests(shop), [`/s/${slug}/manifest.webmanifest?v=9`]);
  assert.match(adm, /<meta name="ak-app" content="admin">/); assert.match(dev, /<meta name="ak-app" content="dev">/); assert.match(shop, /<meta name="ak-app" content="shop">/);
  for (const h of [adm, dev, shop, land]) assert.match(h, /<script src="\/pwa\.js\?v=10\.([5-9]|10|11|12|13|14|15|16)\.\d+"><\/script>/);
  assert.ok(adm.indexOf("/pwa.js") < adm.indexOf("/common.js") && shop.indexOf("/pwa.js") < shop.indexOf("/common.js"), "pwa.js before common.js");
  assert.match(adm, /apple-touch-icon" href="\/app-admin-180\.png\?v=9"/); assert.match(dev, /apple-touch-icon" href="\/app-dev-180\.png\?v=9"/);
  assert.match(adm, /apple-mobile-web-app-title" content="My Dukaan"/); assert.match(dev, /apple-mobile-web-app-title" content="Dhanda Dev"/);
  assert.match(adm, /role-pill[^>]*>🏪 (?:Dukaan|Shop)</); assert.match(dev, /role-pill[^>]*>DEV</);
  assert.ok(!/apple-mobile-web-app-capable/.test(land), "landing added to an iPhone home screen is a plain bookmark, not an app");
});

test("v10.5: manifests — distinct ids, non-overlapping scopes, own names/icons/colours; old /manifest.webmanifest is not an app", async () => {
  const t = await twoShops(); const { C, slug } = t;
  const get = async p => { const r = await C.call("GET", p); assert.equal(r.status, 200, p); assert.match(r.headers.get("content-type"), /manifest\+json/); return J(r.body); };
  const dev = await get("/dev.webmanifest"), adm = await get("/admin.webmanifest"), shop = await get(`/s/${slug}/manifest.webmanifest`), land = await get("/manifest.webmanifest");
  assert.deepEqual([dev.id, dev.scope, dev.start_url], ["/dev-app", "/dev", "/dev"]);
  assert.deepEqual([adm.id, adm.scope, adm.start_url], ["/admin-app", "/admin", "/admin"]);
  assert.deepEqual([shop.id, shop.scope, shop.start_url], [`/s/${slug}`, `/s/${slug}`, `/s/${slug}`]);
  assert.equal(dev.name, "Apna Dhanda Dev"); assert.equal(adm.name, "Apna Dhanda Dukaan"); assert.equal(shop.name, "TEST – Sharma Kirana");
  assert.notEqual(dev.short_name, adm.short_name); assert.ok([...dev.short_name].length <= 12 && [...adm.short_name].length <= 12);
  const apps = [dev, adm, shop];
  assert.equal(new Set(apps.map(m => m.id)).size, 3, "ids unique");
  for (const a of apps) { assert.equal(a.display, "standalone"); assert.notEqual(a.scope, "/");
    for (const b of apps) if (a !== b) assert.ok(!(b.start_url === a.scope || b.start_url.startsWith(a.scope.replace(/\/?$/, "/"))), `${a.id} must not capture ${b.start_url}`); }
  assert.notEqual(dev.theme_color, adm.theme_color);
  assert.match(dev.icons[0].src, /^\/app-dev-192\.png/); assert.match(adm.icons[0].src, /^\/app-admin-192\.png/); assert.match(shop.icons[0].src, /^\/app-shop-192\.png/);
  assert.ok(dev.icons.some(i => i.purpose === "maskable") && adm.icons.some(i => i.purpose === "maskable"));
  assert.equal(land.display, "browser", "the old landing manifest can never be installed as a standalone app"); assert.ok(!("scope" in land) && !("id" in land));
  for (const f of ["app-dev-192.png", "app-dev-512.png", "app-dev-maskable-512.png", "app-dev-180.png", "app-admin-192.png", "app-admin-512.png", "app-admin-maskable-512.png", "app-admin-180.png", "app-shop-192.png", "app-shop-512.png", "app-shop-maskable-512.png", "app-shop-180.png"])
    assert.ok(existsSync(join(here, "..", "site", f)), f);
});

test("v10.5: /s/<slug> is ALWAYS the customer storefront — same page with a shopkeeper cookie, a dev cookie, or old cookies; no redirect, no admin", async () => {
  const t = await twoShops(); const { B, C, dev, slug } = t;
  const anon = await C.call("GET", `/s/${slug}`), asShop = await B.call("GET", `/s/${slug}`), asDev = await dev.call("GET", `/s/${slug}`);
  for (const r of [anon, asShop, asDev]) {
    assert.equal(r.status, 200); assert.equal(r.headers.get("location"), null); assert.equal(r.headers.get("set-cookie"), null);
    assert.match(r.body, new RegExp(`<meta name="ak-shop" content="${slug}"`)); assert.match(r.body, /\/app\.js/);
    assert.doesNotMatch(r.body, /admin\.js|dev\.js|devmode\.js|a-top|devBanner|दुकानदार पैनल/);
  }
  assert.equal(asShop.body, anon.body); assert.equal(asDev.body, anon.body);
  // Even the pre-v10.5 cookies (Path=/) sent by an old phone change nothing on the storefront.
  const lg = await raw(t, "POST", "/api/admin/login", null, { username: "9123456780", password: "bshoppass1" }); const tok = cookies(lg)[0].split(";")[0].split("=")[1];
  const old = await raw(t, "GET", `/s/${slug}`, `__Host-ks_admin=${tok}; __Host-ks_dev=${"a".repeat(64)}`);
  assert.equal(old.status, 200); assert.equal(await old.text(), anon.body); assert.equal(old.headers.get("set-cookie"), null);
  // The storefront API ignores the sessions too.
  const s0 = (await C.call("GET", "/api/store", undefined, { shop: slug })).body, s1 = (await B.call("GET", "/api/store", undefined, { shop: slug })).body, s2 = (await dev.call("GET", "/api/store", undefined, { shop: slug })).body;
  assert.deepEqual(s1, s0); assert.deepEqual(s2, s0);
  assert.equal((await C.call("GET", "/api/admin/state")).body.admin, null, "the customer jar never became a shopkeeper");
});

test("v10.5: cookie paths — shopkeeper Path=/api/admin, dev Path=/api/dev (__Secure-, HttpOnly, SameSite=Strict, no Domain); old Path=/ cookies move over with no re-login; logout clears both", async () => {
  const t = await twoShops();
  const a = await raw(t, "POST", "/api/admin/login", null, { username: "9123456780", password: "bshoppass1" }); assert.equal(a.status, 200);
  const ac = cookies(a)[0]; assert.match(ac, /^__Secure-ks_admin=[a-f0-9]{64}; Path=\/api\/admin; Secure; HttpOnly; SameSite=Strict; Max-Age=\d+$/); assert.doesNotMatch(ac, /Domain/i);
  const d = await raw(t, "POST", "/api/dev/login", null, { username: DEV_USER, password: DEV_PASS }); assert.equal(d.status, 200);
  const dc = cookies(d)[0]; assert.match(dc, /^__Secure-ks_dev=[a-f0-9]{64}; Path=\/api\/dev; Secure; HttpOnly; SameSite=Strict; Max-Age=\d+$/); assert.doesNotMatch(dc, /Domain/i);
  const atok = ac.split(";")[0].split("=")[1], dtok = dc.split(";")[0].split("=")[1];
  // new cookies work
  assert.equal((await (await raw(t, "GET", "/api/admin/state", `__Secure-ks_admin=${atok}`)).json()).admin.username, "9123456780");
  assert.equal((await raw(t, "GET", "/api/dev/health", `__Secure-ks_dev=${dtok}`)).status, 200);
  // an old (pre-v10.5) cookie still logs in, and is swapped for the new path-scoped one carrying the same session
  const m = await raw(t, "GET", "/api/admin/state", `__Host-ks_admin=${atok}`); assert.equal((await m.json()).admin.username, "9123456780");
  const mc = cookies(m); assert.ok(mc.some(c => c.startsWith(`__Secure-ks_admin=${atok}; Path=/api/admin;`)), JSON.stringify(mc)); assert.ok(mc.some(c => /^__Host-ks_admin=; Path=\/;.*Max-Age=0/.test(c)));
  const md = await raw(t, "GET", "/api/dev/health", `__Host-ks_dev=${dtok}`); assert.equal(md.status, 200);
  const mdc = cookies(md); assert.ok(mdc.some(c => c.startsWith(`__Secure-ks_dev=${dtok}; Path=/api/dev;`))); assert.ok(mdc.some(c => /^__Host-ks_dev=; Path=\/;.*Max-Age=0/.test(c)));
  // the shopkeeper cookie still never opens dev, and the dev cookie never opens a shop
  assert.ok([401, 403].includes((await raw(t, "GET", "/api/dev/health", `__Secure-ks_admin=${atok}`)).status));
  assert.equal((await (await raw(t, "GET", "/api/admin/state", `__Secure-ks_dev=${dtok}`)).json()).admin, null);
  // logout clears the new and the old cookie
  const lo = await raw(t, "POST", "/api/admin/logout", `__Secure-ks_admin=${atok}`, {}); const loc = cookies(lo);
  assert.ok(loc.some(c => /^__Secure-ks_admin=; Path=\/api\/admin;.*Max-Age=0/.test(c)) && loc.some(c => /^__Host-ks_admin=; Path=\/;.*Max-Age=0/.test(c)), JSON.stringify(loc));
  const dlo = await raw(t, "POST", "/api/dev/logout", `__Secure-ks_dev=${dtok}`, {}); const dloc = cookies(dlo);
  assert.ok(dloc.some(c => /^__Secure-ks_dev=; Path=\/api\/dev;.*Max-Age=0/.test(c)) && dloc.some(c => /^__Host-ks_dev=; Path=\/;.*Max-Age=0/.test(c)));
  assert.equal((await (await raw(t, "GET", "/api/admin/state", `__Secure-ks_admin=${atok}`)).json()).admin, null);
});

test("v10.5: service workers — one narrow scope per app, never \"/\"; the old \"/\" worker removes itself; storage keys namespaced per app", () => {
  const sw = rdSite("sw.js"), pwa = rdSite("pwa.js"), common = rdSite("common.js"), admin = rdSite("admin.js"), dev = rdSite("dev.js"), app = rdSite("app.js");
  assert.match(sw, /IS_ROOT = SCOPE_PATH === "\/"/); assert.match(sw, /if \(IS_ROOT\) \{ try \{ await self\.registration\.unregister\(\)/);
  assert.ok(!/addEventListener\(\s*["']fetch/.test(sw.replace(/\/\/ v10\.10: AI product icons[\s\S]*?\n\}\);\n/, "")), "no fetch interception (v10.10: except the lazy /icons/ cache)");
  assert.match(pwa, /app === "dev" \? "\/dev" : app === "admin" \? "\/admin" : \(app === "shop" && slug\) \? "\/s\/" \+ slug : ""/);
  assert.match(pwa, /register\("\/sw\.js\?app=" \+ app, \{scope: scope\}\)/); assert.match(pwa, /pathname !== "\/"\) return null;[\s\S]*?r\.unregister\(\)/);
  for (const f of [pwa, common, admin, dev, app, rdSite("track.js")]) assert.ok(!/scope\s*:\s*["']\/["']/.test(f), "nothing registers a worker at /");
  assert.ok(!/serviceWorker\.ready/.test(common), "uncontrolled pages (e.g. /track) must not wait on .ready");
  assert.match(pwa, /beforeinstallprompt/); assert.match(pwa, /Home screen pe add karo/); assert.match(pwa, /Dukaan app/); assert.match(pwa, /Apna Dhanda Dev app/);
  // storage: customer = cust.<slug>.*, Dukaan = admin.*, Dev = dev.*
  assert.match(common, /const SK = k => k === "ak_lang" \? k : "cust\." \+ \(SHOP\.slug \|\| "_"\) \+ "\." \+ k;/);
  assert.match(admin, /const PUSH_KEY = "admin\.push"/); assert.ok(!/localStorage\.(get|set|remove)Item\("ak_(cart|orders|favs|addrs)/.test(admin));
  assert.match(dev, /localStorage\.setItem\("dev\.stale"/);
  assert.ok(!/localStorage\.(getItem|setItem)\("ak_(cart|orders|favs|addrs|customer|area)/.test(app + rdSite("track.js")), "customer keys always go through SK()");
  // Dev Settings explains the separate apps; QR / open-shop links are full customer URLs opened outside the panel
  assert.match(dev, /📱 Apps — Dev, Shop and Customer install separately/);
  assert.match(admin, /br\.setAttribute\("href", me\.shop\.customer_url \|\| \(location\.origin \+ me\.shop\.link\)\); br\.setAttribute\("target", "_blank"\)/);
  assert.match(dev, /href="\$\{esc\(s\.customer_url \|\| s\.link\)\}" target="_blank"/);
});

test("v10.5: /sw.js is served no-cache as JavaScript; /pwa.js and the app icons are served", async () => {
  const t = await twoShops(); const { C } = t;
  const sw = await C.call("GET", "/sw.js"); assert.equal(sw.status, 200); assert.equal(sw.headers.get("cache-control"), "no-cache"); assert.match(sw.headers.get("content-type"), /javascript/);
  const v = (await C.call("GET", "/health")).body; assert.match(J(v).version, /^10\.(5|6|7|8|9|10|11|12|13|14|15|16)\.\d+$/); // v10.6 keeps every v10.5 behaviour
});
