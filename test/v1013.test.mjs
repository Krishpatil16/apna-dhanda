// v10.13.0 tests: shop-type-aware /admin (salon / service = appointments words, no Stock, no bottom bar, 3 pills; kirana unchanged).
// Harness copied from v1011.test.mjs.
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

import vm from "node:vm";
import { withSecrets } from "./secrets-helper.mjs";
const loadProfiles = () => { const ctx = {}; vm.runInNewContext(S("type-profile.js"), ctx); return ctx.AK_PROFILE; };
const ORDER_STATUSES = ["pending","accepted","preparing","ready","out_for_delivery","delivered","rejected","cancelled"];
const DEV = /[\u0900-\u097F]/;

test("v10.13 profiles: salon Today = 2×2 tiles (Appointments · Services · Reports · Settings), inner pages ‹ Today pills, no Stock/Offers, no bottom bar", () => {
  const P = loadProfiles(); const sal = P.profileFor("salon");
  assert.equal(sal.family, "service"); assert.equal(sal.nav, "pills");
  assert.equal(JSON.stringify(sal.pills), JSON.stringify(["orders", "products", "reports"]));
  assert.ok(sal.pills.length <= 5 && sal.tabs.length <= 5, "≤5 entries");
  for (const k of ["stock", "offers"]) { assert.ok(!sal.pills.includes(k), k + " not in salon nav"); assert.ok(!sal.tabs.includes(k), k + " not a salon page in nav"); }
  assert.equal(sal.stock, false);
  // v10.13.0 grid (Krish 10:07 PM): Today shows a 2×2 tile grid — Appointments, Services, Reports, Settings
  assert.equal(JSON.stringify(sal.grid), JSON.stringify(["orders", "products", "reports", "settings"]));
  assert.ok(!sal.grid.includes("stock") && !sal.grid.includes("offers"));
  for (const t of ["clinic", "repair", "other"]) assert.equal(P.profileFor(t).nav, "pills", t);
  // admin.js: the bottom bar is hidden for pill-nav shops, Settings is a tile (no header ⚙), Offers stays reachable from Settings
  const a = S("admin.js"), css = S("admin.css");
  assert.match(a, /\$\("#tabs"\)\.hidden = isSvc\(\)/); assert.match(a, /class="svc-grid"/); assert.match(a, /class="svc-tile"/); assert.doesNotMatch(a, /id = "gearBtn"/); assert.match(a, /data-go="offers"/);
  assert.match(css, /body\.nav-pills \.a-tabs\{display:none\}/);
  assert.match(S("admin.html"), /<script src="\/type-profile\.js\?v=(?:10\.15\.[2-9]|10\.16\.\d+)"><\/script>\s*<script src="\/admin(?:-core)?\.js\?v=(?:10\.15\.[2-9]|10\.16\.\d+)(-\d+)?">/);
});

test("v10.13 profiles: salon labels say Appointments; statuses map onto the EXISTING stored statuses (labels only)", () => {
  const P = loadProfiles(); const w = P.profileFor("salon").words, st = P.profileFor("salon").status;
  assert.equal(w.today_title[1], "Today's Appointments"); assert.equal(w.orders_tab[1], "Appointments"); assert.equal(w.order[1], "Customer");
  assert.equal(w.empty_title[1], "No appointments today");
  assert.deepEqual([...ORDER_STATUSES.map(s => st[s][1])], ["Waiting","In Service","In Service","In Service","In Service","Completed","Cancelled","Cancelled"]);
  assert.match(w.offers_empty[1], /Haircut \+ beard ₹199/); assert.match(w.offers_empty[1], /20% off facial/);
  assert.doesNotMatch(JSON.stringify(w), /dal|atta|Atta/i, "no grocery examples on a salon");
  for (const [s, [[to]]] of Object.entries(P.profileFor("salon").next)) assert.ok(ORDER_STATUSES.includes(to) && ORDER_STATUSES.includes(s));
});

test("v10.13 profiles: grocery (kirana) wording and bottom bar unchanged; unknown types fall back to grocery", () => {
  const P = loadProfiles(); const k = P.profileFor("kirana");
  assert.equal(k.nav, "tabs"); assert.equal(k.stock, true); assert.equal(JSON.stringify(k.status), "{}"); assert.equal(k.next, undefined);
  assert.equal(k.words.today_title[1], "Today's orders"); assert.equal(k.words.orders_tab[1], "Orders"); assert.equal(k.words.kpi_sales[1], "Sales today");
  assert.match(k.words.offers_empty[1], /10% off dal/);
  for (const t of [undefined, null, "", "bakery", "__proto__"]) assert.equal(P.profileFor(t).type, "kirana", String(t));
  const a = S("admin.js");
  for (const s of ["Today's orders", "No new orders right now", "Sales today", "New / active", "All orders"]) assert.ok(a.includes(s), "kirana text kept: " + s);
  const html = S("admin.html"); for (const t of ["today","orders","stock","products","categories","offers","reports","settings"]) assert.ok(html.includes(`data-tab="${t}"`), "kirana tab kept: " + t);
});

test("v10.13 profiles: every word and status has a Hindi and an English text, the same keys in every family", () => {
  const P = loadProfiles();
  for (const [t, p] of Object.entries(P.TYPE_PROFILE)) {
    for (const [k, v] of Object.entries(p.words)) { if (!Array.isArray(v)) continue; assert.equal(v.length, 2, t + "." + k);
      if (v[1]) assert.match(v[0], DEV, `${t}.${k} has Hindi`); }
    for (const [s, v] of Object.entries(p.status)) { assert.match(v[0], DEV, `${t} status ${s} Hindi`); assert.ok(v[1]); }
  }
  const sal = P.profileFor("salon");
  for (const k of ["today_title","orders_tab","order","all_orders","empty_title","kpi_next","kpi_revenue","kpi_waiting","kpi_done","add_walkin","new_toast","offers_empty","reject_reason"]) assert.ok(sal.words[k] && DEV.test(sal.words[k][0]), "salon hi: " + k);
  for (const k of Object.keys(sal.actions)) assert.match(sal.actions[k][0], DEV);
  const kw = Object.keys(P.profileFor("kirana").words), fw = Object.keys(P.profileFor("restaurant").words);
  assert.deepEqual([...fw].sort(), [...kw].sort(), "food has every kirana key");
});

test("v10.13 server: a salon completes in one tap (accepted → delivered); kirana keeps the old transitions; stored values unchanged", async () => {
  const t = await base();
  for (const [type, ok] of [["salon", 200], [undefined, 409]]) {
    const s = await t.shop(type ? "TEST – Glow Salon" : "TEST – Kirana", type); await t.item(s.J, "150", "30 min");
    const v = t.one("SELECT v.id FROM variants v WHERE v.shop_id=?", s.id);
    const o = await order(t.jar(), s.slug, v, type ? { source: "walkin" } : {}); assert.equal(o.status, 201, JSON.stringify(o.body)); // v10.13: a QR walk-in is in the queue at once
    const id = t.one("SELECT id FROM orders WHERE code=?", o.body.order.code).id;
    assert.equal((await s.J.call("POST", `/api/admin/orders/${id}/status`, { status: "delivered", from: "pending" })).status, 409, "pending → delivered never");
    assert.equal((await s.J.call("POST", `/api/admin/orders/${id}/status`, { status: "accepted", from: "pending" })).status, 200);
    assert.equal((await s.J.call("POST", `/api/admin/orders/${id}/status`, { status: "delivered", from: "accepted" })).status, ok, String(type));
    assert.equal(t.one("SELECT status FROM orders WHERE id=?", id).status, ok === 200 ? "delivered" : "accepted");
  }
});
