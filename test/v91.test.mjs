// v9.1 tests: dev shop delete accepts slug OR shop name (trimmed, case-insensitive) with Hindi errors; no window.prompt left in dev.js; panel code revalidates.
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


test("v9.1: dev delete accepts the shop NAME or slug, any case, extra spaces; wrong text → 400 with Hindi message naming both", async () => {
  const t = await twoShops(); const { dev, bid, slug } = t;
  const name = t.one("SELECT name FROM shops WHERE id=?", bid).name;
  const bad = await dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: "galat naam" });
  assert.equal(bad.status, 400); assert.equal(bad.body.code, "confirm");
  assert.match(bad.body.error, /did not match/); assert.ok(bad.body.error.includes(slug) && bad.body.error.includes(name), "error names the shop name and link");
  assert.equal((await dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: "" })).status, 400);
  const mixed = "  " + name.split("").map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join("").replace(/ /g, "   ") + "  ";
  const ok = await dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: mixed });
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(t.one("SELECT COUNT(*) AS n FROM shops WHERE id=?", bid).n, 0);
  const gone = await dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: slug });
  assert.equal(gone.status, 404); assert.match(gone.body.error, /not found/);
});

test("v9.1: slug in UPPER case with spaces also deletes; shopkeeper still gets 403", async () => {
  const t = await twoShops(); const { dev, bid, slug, B } = t;
  assert.equal((await B.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: slug }, { })).status, 403);
  const r = await dev.call("POST", "/api/dev/shops/delete", { shop_id: bid, confirm: "  " + slug.toUpperCase() + " " });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test("v9.1: dev.js has no window.prompt; delete + reject use in-page modals; dev.html busts cache; panel js/css revalidate", async () => {
  const js = readFileSync(join(here, "..", "site", "dev.js"), "utf8");
  assert.ok(!/\bprompt\s*\(/.test(js), "no prompt() in dev.js");
  assert.match(js, /function deleteModal/); assert.match(js, /function rejectModal/); assert.match(js, /id="dmCopy"/); assert.match(js, /b-red" id="dmYes"/);
  assert.match(js, /e\.message/); // server error text shown in the modal
  const html = readFileSync(join(here, "..", "site", "dev.html"), "utf8");
  const V = readFileSync(join(here, "..", "site", "_worker.mjs"), "utf8").match(/const APP_VERSION = "([\d.]+)"/)[1]; // v10: the cache-bust follows the app version
  assert.ok(html.includes(`dev.js?v=${V}`)); assert.ok(html.includes(`dev.css?v=${V}`));
  const w = await world(); const C = w.jar();
  const r = await C.call("GET", "/dev.js?v=9.1.0"); assert.equal(r.headers.get("cache-control"), "no-cache");
  const sw = readFileSync(join(here, "..", "site", "sw.js"), "utf8"); assert.ok(!/addEventListener\(\s*["']fetch/.test(sw.replace(/\/\/ v10\.10: AI product icons[\s\S]*?\n\}\);\n/, "")), "service worker does not intercept fetches (cannot serve a stale dev.js)");
});
