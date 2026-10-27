// v10.12 BATCH 2 tests (harness copied from v1011.test.mjs / multishop.test.mjs). v5 multi-shop tests: self-signup + approval, per-shop isolation (orders, products, settings, reports, backup, push,
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
const vOf = (t, shopId) => t.one("SELECT id FROM variants WHERE shop_id=? ORDER BY id LIMIT 1", shopId);
const INDORE = { lat: 22.71957, lng: 75.85773 };

test("v10.12 location: shopkeeper saves the shop location once (confirm required, validated, shop-scoped, logged), can clear it; admin view carries it", async () => {
  const t = await base();
  const a = await t.shop("Gupta Kirana", "kirana"), b = await t.shop("Verma Kirana", "kirana");
  let r = await a.J.call("POST", "/api/admin/location", { lat: INDORE.lat, lng: INDORE.lng });
  assert.equal(r.status, 400); assert.equal(r.body.code, "confirm_required");
  for (const bad of [{ lat: 95, lng: 75 }, { lat: 22, lng: 200 }, { lat: "x", lng: 75 }, { lat: 0, lng: 0 }]) {
    r = await a.J.call("POST", "/api/admin/location", { ...bad, confirm: true }); assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(r.body.code, "invalid_location"); }
  r = await a.J.call("POST", "/api/admin/location", { lat: 22.7195712345, lng: 75.857731234, accuracy: 12, confirm: true });
  assert.equal(r.status, 200); assert.deepEqual(r.body.location, { lat: 22.71957, lng: 75.85773 });
  const rowA = t.one("SELECT lat, lng FROM shops WHERE id=?", a.id), rowB = t.one("SELECT lat, lng FROM shops WHERE id=?", b.id);
  assert.equal(rowA.lat, 22.71957); assert.equal(rowB.lat, null, "only the caller's own shop changes");
  assert.ok(JSON.stringify(t.sql("SELECT * FROM service_log WHERE shop_id=?", a.id)).includes("shop location saved (±12 m)"), "logged");
  const st = await a.J.call("GET", "/api/admin/state"); assert.deepEqual(st.body.admin.shop.location, { lat: 22.71957, lng: 75.85773 });
  // no session → 401; CSRF header needed
  assert.equal((await t.jar().call("POST", "/api/admin/location", { lat: 1, lng: 1, confirm: true })).status, 401);
  r = await a.J.call("POST", "/api/admin/location", { clear: true }); assert.equal(r.status, 200); assert.equal(r.body.location, null);
  assert.equal(t.one("SELECT lat FROM shops WHERE id=?", a.id).lat, null);
  assert.ok(S("admin.js").includes('"/api/admin/location"') && S("admin.js").includes("Set my shop location") && S("admin.js").includes("Is this your shop's location?"));
});

test("v10.12 near me: /api/shops sorts by haversine distance with a km label; shops without a location go last; without a position the normal list", async () => {
  const t = await base();
  const near = await t.shop("Near Kirana", "kirana"), far = await t.shop("Far Salon", "kirana"), noloc = await t.shop("No Loc Hotel", "kirana"); // v10.12.3: one category per list
  await far.J.call("POST", "/api/admin/location", { lat: 22.7300, lng: 75.8800, confirm: true });   // ≈ 2.6 km
  await near.J.call("POST", "/api/admin/location", { lat: 22.7200, lng: 75.8600, confirm: true });  // ≈ 0.25 km
  let r = await t.jar().call("GET", `/api/shops?type=grocery&lat=${INDORE.lat}&lng=${INDORE.lng}`);
  assert.equal(r.status, 200); assert.equal(r.body.sorted_by, "distance");
  const names = r.body.shops.map(s => s.name);
  assert.ok(names.indexOf("Near Kirana") < names.indexOf("Far Salon") && names.indexOf("Far Salon") < names.indexOf("No Loc Hotel"));
  const n = r.body.shops.find(s => s.name === "Near Kirana"), f = r.body.shops.find(s => s.name === "Far Salon");
  assert.ok(n.km >= 0.2 && n.km <= 0.3, String(n.km)); assert.match(n.km_text, /^\d+ m$/);
  assert.ok(f.km > 2 && f.km < 3.2, String(f.km)); assert.match(f.km_text, /^\d\.\d km$/);
  assert.equal(r.body.shops.find(s => s.name === "No Loc Hotel").km, null);
  r = await t.jar().call("GET", "/api/shops?type=grocery"); assert.equal(r.body.sorted_by, "default"); assert.ok(r.body.shops.every(s => s.km == null));
  assert.equal((await t.jar().call("GET", "/api/shops?type=grocery&lat=999&lng=1")).status, 400);
  // haversine sanity: Indore → Bhopal ≈ 170 km straight line
  const src = S("_worker.mjs"); const hv = new Function(src.match(/const haversineKm = [\s\S]*?\};/)[0] + "; return haversineKm;")();
  const d = hv(22.7196, 75.8577, 23.2599, 77.4126); assert.ok(d > 165 && d < 180, String(d));
  assert.ok(S("shops.js").includes("navigator.geolocation.getCurrentPosition") && S("shops.js").includes('"/api/shops"'));
  assert.ok(/geolocation=\(self\)/.test(src), "the page may ask for location (permissions-policy)");
});

test("v10.12 directory privacy: only active + online + in-plan + not hidden + not TEST shops; no owner, phone or coordinates leave the server", async () => {
  const t = await base();
  const ok = await t.shop("Public Kirana", "kirana"); await t.shop("TEST – Secret Salon", "salon"); await t.shop("Offline Clinic", "clinic", { online: false });
  await t.shop("Pending Repair", "repair", { approve: false }); const hid = await t.shop("Hidden Hotel", "restaurant");
  await ok.J.call("POST", "/api/admin/location", { lat: 22.7, lng: 75.8, confirm: true });
  assert.equal((await t.dev.call("POST", "/api/dev/shops/flags", { shop_id: hid.id, dir_hidden: true })).status, 200);
  t.DB._sql.prepare("UPDATE shops SET online=1 WHERE id=1").run();
  const all = []; for (const ty of ["grocery", "restaurant", "salon", "clinic", "repair", "other"]) all.push(...(await t.jar().call("GET", `/api/shops?type=${ty}&lat=22.71&lng=75.81`)).body.shops);
  const r = {body: {shops: all}}; const names = r.body.shops.map(s => s.name);
  assert.ok(names.includes("Public Kirana"));
  for (const no of ["TEST – Secret Salon", "Offline Clinic", "Pending Repair", "Hidden Hotel"]) assert.ok(!names.includes(no), no);
  const raw = JSON.stringify(r.body);
  for (const leak of ["owner", "mobile", "phone", "\"lat\"", "\"lng\"", "Owner ", ok.mobile, "9876500011"]) assert.ok(!raw.includes(leak), leak);
  for (const s of r.body.shops) assert.deepEqual(Object.keys(s).sort(), ["km", "km_text", "logo", "name", "open", "slug", "type"]);
  // the /shops page itself carries the same rule
  const fake = t.env.e.ASSETS.fetch; t.env.e.ASSETS.fetch = async q => { const p = new URL(q.url).pathname; return p === "/shops.html" || p === "/shops-list.html" ? new Response(S(p.slice(1)), {headers: {"content-type": "text/html"}}) : fake(q); };
  let h = (await t.jar().call("GET", "/shops")).body;
  assert.ok(h.includes("What do you need today?") && !h.includes('href="/s/') && !h.includes("Public Kirana"), "v10.12.3: the first screen shows categories only");
  h = (await t.jar().call("GET", "/shops/grocery")).body + (await t.jar().call("GET", "/shops/salon")).body + (await t.jar().call("GET", "/shops/clinic")).body + (await t.jar().call("GET", "/shops/repair")).body + (await t.jar().call("GET", "/shops/restaurant")).body;
  assert.ok(h.includes('id="q"') && h.includes('id="nearBtn"') && h.includes('href="/s/public-kirana"'));
  for (const no of ["Secret Salon", "Offline Clinic", "Pending Repair", "Hidden Hotel", "Owner ", ok.mobile]) assert.ok(!h.includes(no), no);
});

test("v10.12 open/closed: the one-tap toggle is the ONLINE flag — closed = order refused (423) + 'closed' page + not in the directory; hours-closed shows as Closed", async () => {
  const t = await base();
  const s = await t.shop("Toggle Kirana", "kirana"); await t.item(s.J); const v = vOf(t, s.id);
  assert.equal((await order(t.jar(), s.slug, v)).status, 201);
  let r = await s.J.call("POST", "/api/admin/online", { online: false }); assert.equal(r.status, 200); assert.equal(r.body.online, false);
  r = await order(t.jar(), s.slug, v); assert.equal(r.status, 423); assert.equal(r.body.code, "service_paused");
  assert.equal((await t.jar().call("GET", "/s/" + s.slug)).status, 503);
  assert.ok(!(await t.jar().call("GET", "/api/shops?type=grocery")).body.shops.some(x => x.slug === s.slug));
  await s.J.call("POST", "/api/admin/online", { online: true });
  assert.equal((await order(t.jar(), s.slug, v)).status, 201);
  await s.J.call("PUT", "/api/admin/settings", { force_closed: true });
  const row = (await t.jar().call("GET", "/api/shops?type=grocery")).body.shops.find(x => x.slug === s.slug); assert.equal(row.open, false);
  assert.equal((await order(t.jar(), s.slug, v)).status >= 400, true, "closed today: no order");
  const adm = S("admin.js"); assert.ok(adm.includes('id="onSw" role="switch"') && adm.includes('L("दुकान खुली है","Shop Open")') && adm.includes('L("दुकान बंद है","Shop Closed")'));
});

test("v10.12 QR poster: a real QR for /s/<slug> made in the browser (no CDN), English 'Scan to order', allowed by the CSP; buttons in /admin and /dev", async () => {
  const q = S("qr.js"); assert.ok(q.includes('"Scan to order"') && q.includes("function poster({url, name, nameEn, phone, lang})"));
  globalThis.window = globalThis.window || globalThis; await import(join(here, "..", "site", "qr.js") + "?t=" + Date.now());
  const m = globalThis.AKQR.encode("https://apnadhanda.krishpatil.workers.dev/s/vaibhav-laxmi-kirana-and-daily-n");
  assert.ok(m.size >= 25 && m.modules.length === m.size); assert.equal(m.modules[0][0], true); assert.equal(m.modules[6][6], true, "finder pattern corner");
  const csp = S("_worker.mjs").match(/"content-security-policy":"([^"]+)"/)[1]; assert.ok(/script-src 'self'/.test(csp) && !/script-src[^;]*https:/.test(csp), "QR code is our own script");
  assert.ok(S("admin.js").includes('big("tdQr", "🖨️", L("QR पोस्टर","QR poster"))') && S("admin.js").includes('id="qrPoster"'));
  assert.ok(S("dev.js").includes('data-a="b2qr"') && S("dev.js").includes("async function devPoster(s, b)"));
});

test("v10.12 dev: per-shop open/closed, directory show/hide, clear location — shop-scoped, logged with the dev name, admin can't call it; list shows type/open/location/listed/today", async () => {
  const t = await base();
  const a = await t.shop("Dev Flag Kirana", "kirana"), b = await t.shop("Other Salon", "salon"); await t.item(a.J);
  await a.J.call("POST", "/api/admin/location", { lat: 22.7, lng: 75.8, confirm: true });
  assert.equal((await order(t.jar(), a.slug, vOf(t, a.id))).status, 201);
  let L = (await t.dev.call("GET", "/api/dev/shops")).body.shops.find(s => s.id === a.id);
  assert.equal(L.type, "kirana"); assert.equal(L.open_now, true); assert.deepEqual(L.location, { lat: 22.7, lng: 75.8 }); assert.equal(L.listed, true); assert.equal(L.dir_hidden, false); assert.equal(L.orders_today, 1);
  const before = t.one("SELECT online, dir_hidden, lat FROM shops WHERE id=?", b.id);
  assert.ok([401, 403].includes((await a.J.call("POST", "/api/dev/shops/flags", { shop_id: a.id, online: false })).status), "a shopkeeper session can't use dev routes");
  let r = await t.dev.call("POST", "/api/dev/shops/flags", { shop_id: a.id, online: false, dir_hidden: true, clear_location: true });
  assert.equal(r.status, 200); assert.equal(r.body.changed, true);
  const row = t.one("SELECT online, dir_hidden, lat, lng FROM shops WHERE id=?", a.id); assert.deepEqual({...row}, { online: 0, dir_hidden: 1, lat: null, lng: null });
  assert.deepEqual({...t.one("SELECT online, dir_hidden, lat FROM shops WHERE id=?", b.id)}, {...before}, "the other shop is untouched");
  const log = t.one("SELECT actor, detail FROM sub_log WHERE shop_id=? AND action='dev_flags' ORDER BY id DESC LIMIT 1", a.id);
  assert.match(log.actor, /^dev:/); assert.match(log.detail, /closed .*hidden.*location cleared/);
  L = (await t.dev.call("GET", "/api/dev/shops")).body.shops.find(s => s.id === a.id); assert.equal(L.open_now, false); assert.equal(L.listed, false); assert.equal(L.location, null);
  r = await t.dev.call("POST", "/api/dev/shops/flags", { shop_id: a.id, online: true, dir_hidden: false }); assert.equal(r.status, 200);
  assert.equal(t.one("SELECT online, dir_hidden FROM shops WHERE id=?", a.id).online, 1);
  assert.equal((await t.dev.call("POST", "/api/dev/shops/flags", { shop_id: 99999, online: true })).status, 404);
  const d = S("dev.js"); for (const k of ['data-a="b2open"', 'data-a="b2dir"', 'data-a="b2loc"', 'data-a="b2qr"', "today</span>", "📍 Location set"]) assert.ok(d.includes(k), k);
});

test("v10.12 two sides: /shopkeeper → /admin and /customer → /shops (302, bookmarkable); landing has the two choices and no shop list; admin opens on Today's orders; remembered customer at checkout; English server errors", async () => {
  const t = await base();
  for (const [from, to] of [["/shopkeeper", "/admin"], ["/customer", "/shops"], ["/shops/", "/shops"]]) { const r = await t.jar().call("GET", from); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), to); }
  const land = S("_worker.mjs"); assert.ok(!land.includes("renderShopDir(") && land.includes("I'm a customer") && land.includes("I'm a shopkeeper"));
  const adm = S("admin.js"); assert.ok(adm.includes('let tab = "today"') && adm.includes("async function todayView()") && adm.includes(`L("आज के ऑर्डर","Today's orders")`));
  assert.ok(S("admin.html").indexOf('data-tab="today"') < S("admin.html").indexOf('data-tab="orders"'));
  const app = S("app.js"); assert.ok(app.includes('const ME_KEY = "cust._me"') && app.includes('L("आप नहीं? बदलें","Not you? Change")') && app.includes("localStorage.setItem(ME_KEY, JSON.stringify({name: val(\"name\"), phone: ph}))"));
  // "हिंदी · English" messages: the page shows one language (English by default)
  const cm = S("common.js"); const pick = new Function("lang", cm.match(/function pickMsg\(m, want\)\{[\s\S]*?\n    return [^\n]*\}/)[0] + "; return pickMsg;");
  assert.equal(pick("en")("पक्का करें · Please confirm"), "Please confirm"); assert.equal(pick("hi")("पक्का करें · Please confirm"), "पक्का करें");
  assert.equal(pick("en")("Plain English"), "Plain English"); assert.equal(pick("en")("नई दुकान का रजिस्ट्रेशन अभी बंद है। · New shop sign-up is closed right now."), "New shop sign-up is closed right now.");
  const w = S("_worker.mjs"); for (const m of w.matchAll(/fail\(\d+,\s*"[^"]+",\s*("[^"]*"|`[^`]*`)/g)) if (/[\u0900-\u097F]/.test(m[1])) assert.ok(m[1].includes(" · "), "every Hindi server message has an English half: " + m[1].slice(0, 60));
});

test("v10.12 migration: additive only — shops.lat, shops.lng (nullable) and shops.dir_hidden (default 0); schema v16; existing rows keep their values", async () => {
  const W = S("_worker.mjs"); const a = W.indexOf("// v10.12: nearby shops"); const mig = W.slice(a, W.indexOf("];", a));
  assert.ok(a > 0 && !/\b(DROP|DELETE|UPDATE)\b/i.test(mig) && (mig.match(/ALTER TABLE shops ADD COLUMN/g) || []).length === 3);
  const t = await base(); assert.equal(t.one("SELECT MAX(v) AS v FROM schema_version").v, 19);
  const s1 = t.one("SELECT lat, lng, dir_hidden, shop_type FROM shops WHERE id=1"); assert.deepEqual({...s1}, { lat: null, lng: null, dir_hidden: 0, shop_type: "kirana" });
});
