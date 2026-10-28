// v10.12.3 tests: /shops privacy — categories first, one category per list. Harness (harness copied from v1011.test.mjs / multishop.test.mjs). v5 multi-shop tests: self-signup + approval, per-shop isolation (orders, products, settings, reports, backup, push,
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
const vOf = (t, shopId) => t.one("SELECT id FROM variants WHERE shop_id=? ORDER BY id LIMIT 1", shopId);
const INDORE = { lat: 22.71957, lng: 75.85773 };


const PAGES_FAKE = t => { const fake = t.env.e.ASSETS.fetch; t.env.e.ASSETS.fetch = async q => { const p = new URL(q.url).pathname; return ["/shops.html", "/shops-list.html", "/landing.html"].includes(p) ? new Response(S(p.slice(1)), {headers: {"content-type": "text/html"}}) : fake(q); }; };
async function seeded(){
  const t = await base(); t.DB._sql.prepare("UPDATE shops SET name='Bhaiya Kirana Store', online=1 WHERE id=1").run();
  const k = await t.shop("Gupta General Store", "kirana"), s = await t.shop("Glamour Salon", "salon"), r = await t.shop("Sharma Bhojnalaya", "restaurant");
  const tst = await t.shop("TEST – Secret Clinic", "clinic"), tk = await t.shop("TEST Kirana Hidden", "kirana");
  const hid = await t.shop("Hidden Repair Works", "repair"); assert.equal((await t.dev.call("POST", "/api/dev/shops/flags", { shop_id: hid.id, dir_hidden: true })).status, 200);
  const hidk = await t.shop("Hidden Kirana Mart", "kirana"); assert.equal((await t.dev.call("POST", "/api/dev/shops/flags", { shop_id: hidk.id, dir_hidden: true })).status, 200);
  const off = await t.shop("Offline Sweets", "other", { online: false }); const pend = await t.shop("Pending Parlour", "salon", { approve: false });
  PAGES_FAKE(t);
  const all = [k, s, r, tst, tk, hid, hidk, off, pend];
  const secrets = ["Bhaiya Kirana", ...all.map(x => x.signup.shop.name), ...all.map(x => x.slug), "bhaiya-kirana"];
  return { ...t, k, s, r, tst, tk, hid, hidk, off, pend, all, secrets };
}

test("v10.12.3 privacy: the /shops first screen (HTML) and its API carry no shop names, slugs or ids — only 6 category tiles (active / Coming soon)", async () => {
  const t = await seeded();
  const html = (await t.jar().call("GET", "/shops")).body;
  assert.ok(html.includes("What do you need today?"));
  for (const x of t.secrets) assert.ok(!html.includes(x), "first screen leaks " + x);
  assert.ok(!html.includes('href="/s/') && !html.includes('id="q"') && !html.includes("data-n=") && !/\bshop_id\b|"id":/.test(html), "no shop links, no name search, no ids");
  const tiles = [...html.matchAll(/class="cat t-[a-z]+( soon)?" href="\/shops\/([a-z]+)"/g)].map(m => m[2] + (m[1] ? ":soon" : ""));
  assert.deepEqual(tiles, ["grocery", "restaurant", "salon", "clinic:soon", "repair:soon", "other:soon"], "TEST / hidden / offline / pending shops never light a tile");
  for (const w of ["Grocery / Kirana", "Restaurant / Hotel", "Salon / Parlour", "Clinic / Doctor", "Repair / Service", "Coming soon", 'data-hi="किराना / ग्रोसरी"']) assert.ok(html.includes(w), w);
  const api = await t.jar().call("GET", "/api/shops"); assert.equal(api.status, 200);
  const raw = JSON.stringify(api.body); for (const x of t.secrets) assert.ok(!raw.includes(x), "API leaks " + x);
  assert.equal(api.body.shops, undefined); assert.deepEqual(api.body.categories.map(c => Object.keys(c).sort().join()), Array(6).fill("active,key"));
  assert.deepEqual(api.body.categories.filter(c => c.active).map(c => c.key), ["grocery", "restaurant", "salon"]);
  // lat/lng alone still never returns shops
  const api2 = JSON.stringify((await t.jar().call("GET", "/api/shops?lat=22.7&lng=75.8")).body); for (const x of t.secrets) assert.ok(!api2.includes(x), x);
});

test("v10.12.3 category page: /shops/<category> and /api/shops?type= return only that type's listable shops; back button; Near me; search inside", async () => {
  const t = await seeded();
  const g = (await t.jar().call("GET", "/shops/grocery")).body;
  assert.ok(g.includes('href="/s/' + t.k.slug + '"') && g.includes("Gupta General Store") && g.includes("Bhaiya Kirana Store"));
  for (const no of ["Glamour Salon", "Sharma Bhojnalaya", t.s.slug, t.r.slug, "TEST Kirana Hidden", "Hidden Kirana Mart", "Secret Clinic"]) assert.ok(!g.includes(no), no);
  assert.ok(g.includes('id="backBtn"') && g.includes('href="/shops"') && g.includes('id="nearBtn"') && g.includes('id="q"') && g.includes('data-cat="grocery"') && g.includes("Grocery / Kirana"));
  const sal = (await t.jar().call("GET", "/shops/salon")).body; assert.ok(sal.includes("Glamour Salon") && !sal.includes("Gupta") && !sal.includes("Pending Parlour"));
  let a = await t.jar().call("GET", "/api/shops?type=grocery"); assert.equal(a.status, 200); assert.equal(a.body.category, "grocery");
  assert.deepEqual(a.body.shops.map(s => s.name).sort(), ["Bhaiya Kirana Store", "Gupta General Store"]); assert.ok(a.body.shops.every(s => s.type === "kirana"));
  a = await t.jar().call("GET", "/api/shops?type=kirana"); assert.deepEqual(a.body.shops.map(s => s.name).sort(), ["Bhaiya Kirana Store", "Gupta General Store"], "type key works too");
  a = await t.jar().call("GET", "/api/shops?type=restaurant"); assert.deepEqual(a.body.shops.map(s => s.name), ["Sharma Bhojnalaya"]);
  assert.equal((await t.jar().call("GET", "/api/shops?type=casino")).status, 400);
  await t.k.J.call("POST", "/api/admin/location", { lat: 22.72, lng: 75.86, confirm: true });
  a = await t.jar().call("GET", "/api/shops?type=grocery&lat=22.71957&lng=75.85773"); assert.equal(a.body.sorted_by, "distance"); assert.equal(a.body.shops[0].name, "Gupta General Store"); assert.match(a.body.shops[0].km_text, /m$/);
  // clean paths: /shops/kirana → /shops/grocery, trailing slash, unknown → the category screen; /customer still → /shops
  for (const [from, to] of [["/shops/kirana", "/shops/grocery"], ["/shops/salon/", "/shops/salon"], ["/shops/casino", "/shops"], ["/customer", "/shops"]]) { const r = await t.jar().call("GET", from); assert.equal(r.status, 302, from); assert.equal(r.headers.get("location"), to, from); }
  const js = S("shops.js"); assert.ok(js.includes('"?type=" + encodeURIComponent(cat)') && js.includes("navigator.geolocation.getCurrentPosition"));
});

test("v10.12.3 TEST and hidden shops never show, in any category page or API; an empty category is a friendly 'Coming soon'", async () => {
  const t = await seeded();
  let pages = "", api = "";
  for (const c of ["grocery", "restaurant", "salon", "clinic", "repair", "other"]) { pages += (await t.jar().call("GET", "/shops/" + c)).body; api += JSON.stringify((await t.jar().call("GET", "/api/shops?type=" + c)).body); }
  for (const no of [t.tst, t.tk, t.hid, t.hidk, t.off, t.pend]) { assert.ok(!pages.includes(no.signup.shop.name) && !pages.includes('/s/' + no.slug + '"'), no.signup.shop.name); assert.ok(!api.includes(no.slug), no.slug); }
  assert.ok(!/TEST/.test(api) && !/9123456|Owner \d/.test(pages + api));
  const e = (await t.jar().call("GET", "/shops/clinic")).body;
  assert.ok(e.includes('data-n="0"') && e.includes("Coming soon") && e.includes("No shops in this category yet") && e.includes('class="e-back" href="/shops"'));
  assert.ok(!e.includes('<li class="sc'));
  // the landing page is unchanged: two choices, no shop list
  const land = (await t.jar().call("GET", "/")).body; assert.ok(land.includes('href="/shops" id="pickCust"') && !land.includes('href="/s/'));
});

test("v10.12.3 dev Shops tab: one grid of big category buttons (6 types + All, always, with counts), one status row inside, no duplicate Notify", () => {
  const d = S("dev.js"); const sv = d.slice(d.indexOf("async function shopsView(){"), d.indexOf("window.__shops = r.shops;"));
  for (const k of ['["kirana", "🛒", "Grocery / Kirana"', '["restaurant", "🍽️", "Restaurant"', '["salon", "💇", "Salon"', '["clinic", "🩺", "Clinic"', '["repair", "🔧", "Repair"', '["other", "🏪", "Other"', '["all", "📋", "All shops"', 'class="dv-cat dc-${st}" data-cat="${k}"', '${list.length} shop']) assert.ok(sv.includes(k), k);
  assert.ok(!sv.includes("goNotify") && !sv.includes("data-xf") && !sv.includes("data-tf"), "no duplicate Notify, no extra filter rows");
  assert.equal((sv.match(/class="fseg"/g) || []).length, 1, "one status row");
  for (const k of ['["active", "✅ Active"]', '["pending", "🕒 Waiting"]', '["paused", "⏸ Paused"]', '["closed", "🔴 Closed"]', 'id="catBack"', "<summary>More</summary>", 'data-a="b2dir"', 'data-a="sub"', 'data-a="pause"', 'data-a="b2open"', 'data-a="b2qr"', 'data-a="delete"']) assert.ok(sv.includes(k), k);
  assert.ok(S("dev.css").includes(".dv-cats{display:grid"));
  assert.ok(S("dev.html").includes('data-sec="notify"') && S("dev.js").includes("notify: notifyView"), "Notify still reachable (v10.12.4: its own bottom tab)");
});
