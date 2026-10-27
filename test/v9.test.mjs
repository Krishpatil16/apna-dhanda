// v9 tests: Cloudflare usage tab (token masked, dev-only, cache) + v10.3: AI helper removed. Helpers copied from v8.
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



const TOKEN = "cfTESTtoken_abcdefghijklmnopqrstuvwxyz0123WXYZ";
const ACCT = "035acb1f910dcfbd0151e407038db7d9";
const GQL = {data:{viewer:{accounts:[{w:[{sum:{requests:70000,errors:2},dimensions:{scriptName:"kirana"}},{sum:{requests:15000,errors:0},dimensions:{scriptName:"__unknown__"}}],
  d:[{sum:{rowsRead:3100000,rowsWritten:2000},dimensions:{databaseId:"0fd7e022-f6f3-4697-8b34-eb81d2552888"}}],
  st:[{max:{databaseSizeBytes:2236416},dimensions:{databaseId:"0fd7e022-f6f3-4697-8b34-eb81d2552888"}}]}]}},errors:null};
function cfMock(t, {bad = false} = {}){
  const calls = []; t.env.e.CF_FETCH = async (url, init) => { calls.push({url, auth: init?.headers?.authorization, body: init?.body});
    if (bad) return new Response(JSON.stringify({success:false, errors:[{code:1000, message:"Invalid API Token"}]}), {status: 403, headers:{"content-type":"application/json"}});
    if (url.includes("/accounts")) return new Response(JSON.stringify({success:true, result:[{id: ACCT, name:"Krish patil"}]}), {headers:{"content-type":"application/json"}});
    if (url.endsWith("/graphql")) return new Response(JSON.stringify(GQL), {headers:{"content-type":"application/json"}});
    return new Response("{}", {status: 404}); };
  return calls;
}
function aiMock(t, answer){ const calls = []; t.env.e.AI = { run: async (model, input) => { calls.push({model, input}); if (answer instanceof Error) throw answer; return {response: typeof answer === "function" ? answer() : JSON.stringify(answer)}; } }; return calls; }

test("v9: Cloudflare token — dev-only (shopkeeper 403), never shown back in full, not in backups; usage bars + 5-min cache", async () => {
  const t = await twoShops(); const { B, dev } = t;
  const calls = cfMock(t);
  for (const [m, p, b] of [["GET", "/api/dev/cloudflare"], ["POST", "/api/dev/cloudflare", {token: TOKEN}], ["GET", "/api/dev/assistant"], ["POST", "/api/dev/assistant", {messages:[{role:"user", content:"hi"}]}]]) {
    const r = await B.call(m, p, b); assert.equal(r.status, 403, "shopkeeper " + m + " " + p);
  }
  assert.equal(calls.length, 0, "shopkeeper never reached Cloudflare");
  assert.equal(t.one("SELECT COUNT(*) AS n FROM server_secrets WHERE k='cf_token'").n, 0);
  let r = await dev.call("GET", "/api/dev/cloudflare"); assert.equal(r.status, 200); assert.equal(r.body.configured, false); assert.equal(r.body.usage, undefined);
  // bad token → refused, nothing stored
  cfMock(t, {bad: true});
  r = await dev.call("POST", "/api/dev/cloudflare", {token: TOKEN}); assert.equal(r.status, 400); assert.match(r.body.error, /Invalid API Token/);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM server_secrets WHERE k='cf_token'").n, 0);
  const good = cfMock(t);
  r = await dev.call("POST", "/api/dev/cloudflare", {token: TOKEN});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.account_id, ACCT, "account id auto-detected");
  assert.equal(r.body.token_masked, "••••••••WXYZ");
  assert.ok(!JSON.stringify(r.body).includes(TOKEN.slice(0, 20)), "token never echoed");
  const u = r.body.usage; assert.ok(u);
  assert.equal(u.metrics.requests.used, 85000, "both Workers summed"); assert.equal(u.metrics.requests.pct, 85); assert.equal(u.metrics.requests.level, "red");
  assert.equal(u.metrics.rows_read.pct, 62); assert.equal(u.metrics.rows_read.level, "yellow");
  assert.equal(u.metrics.rows_written.level, "green"); assert.equal(u.metrics.storage.used, 2236416); assert.equal(u.any_red, true);
  assert.ok(good.every(c => c.auth === "Bearer " + TOKEN));
  const gq = good.find(c => c.url.endsWith("/graphql")); assert.match(JSON.parse(gq.body).variables.a, new RegExp(ACCT));
  const n = good.length;
  r = await dev.call("GET", "/api/dev/cloudflare"); assert.equal(r.body.cached, true); assert.equal(good.length, n, "cached for 5 minutes, no new Cloudflare call");
  assert.ok(!JSON.stringify(r.body).includes(TOKEN.slice(0, 20)));
  // the token is in server_secrets (excluded from backups), never in the full backup or the audit log
  const bk = await dev.call("GET", "/api/dev/backup"); assert.ok(!JSON.stringify(bk.body).includes(TOKEN.slice(0, 20)), "token not in backup");
  assert.ok(!JSON.stringify(t.sql("SELECT * FROM service_log")).includes(TOKEN.slice(0, 20)));
  assert.ok(!JSON.stringify(t.sql("SELECT * FROM service_state")).includes(TOKEN.slice(0, 20)));
  // remove
  r = await dev.call("POST", "/api/dev/cloudflare", {clear: true}); assert.equal(r.body.configured, false);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM server_secrets WHERE k='cf_token'").n, 0);
});

test("v10.3: AI helper removed — assistant route gone, no AI binding, dev UI has no helper", async () => {
  const t = await twoShops(); const { dev } = t;
  for (const m of ["GET", "POST"]) {
    const r = await dev.call(m, "/api/dev/assistant", m === "POST" ? {messages: [{role: "user", content: "hi"}]} : undefined);
    assert.notEqual(r.status, 200, m + " /api/dev/assistant must not answer");
  }
  const fs = await import("node:fs");
  const root = new URL("../", import.meta.url);
  const toml = fs.readFileSync(new URL("wrangler.apnadhanda.toml", root), "utf8");
  assert.ok(!/\[ai\]/.test(toml), "no Workers AI binding in the apnadhanda config");
  const devjs = fs.readFileSync(new URL("site/dev.js", root), "utf8"), devhtml = fs.readFileSync(new URL("site/dev.html", root), "utf8");
  assert.ok(!/helper|jarvis|\/api\/dev\/assistant/i.test(devjs + devhtml), "no helper UI left in dev");
});
