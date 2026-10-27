// v10 tests: 3D intro splash on the platform pages (/, /admin, /dev) only — never on customer storefronts (/s/<slug>);
// landing reads price + trial from platform settings; sign-up answer carries the customer link.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createHash, pbkdf2Sync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEST_KEY = "test-setup-key-123456";
const DEV_USER = "krish-dev", DEV_PASS = "dev-test-password-xyz";
const sha = s => createHash("sha256").update(s).digest("hex");
async function loadWorker(){
  const salt = "ab".repeat(16); const hash = pbkdf2Sync(DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
  const src = readFileSync(join(here, "..", "site", "_worker.mjs"), "utf8")
    .replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${sha("kirana-setup:" + TEST_KEY)}"`)
    .replace(/const DEV_SEED = \{[^}]*\};/, `const DEV_SEED = {username:"${DEV_USER}", salt:"${salt}", hash:"${hash}"};`);
  const dir = mkdtempSync(join(tmpdir(), "kirana-v10-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, src); return (await import(f)).default;
}
// Real asset files for every page (index.html too), so the storefront check reads the actual storefront HTML.
const ASSETS = { fetch: async r => { const p = join(here, "..", "site", new URL(r.url).pathname);
  if (existsSync(p)) return new Response(readFileSync(p), {headers: {"content-type": p.endsWith(".html") ? "text/html" : "text/plain"}});
  return new Response("not found", {status: 404}); } };
async function world(){
  const worker = await loadWorker(); const DB = makeD1(); const env = { DB, ASSETS };
  const jar = () => { let cookie = "";
    const call = async (method, path, body) => {
      const h = { "cf-connecting-ip": "1.1.1.1" };
      if (body !== undefined) h["content-type"] = "application/json";
      if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
      if (method !== "GET" && path.startsWith("/api/dev/")) h["x-requested-with"] = "kirana-dev";
      if (cookie) h.cookie = cookie;
      const r = await worker.fetch(new Request("https://k.test" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
      const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0].replace(/=$/, "");
      const ct = r.headers.get("content-type") || "";
      return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text(), headers: r.headers };
    };
    return { call }; };
  return { jar, DB };
}

test("v10: splash markup + loader on /, /admin and /dev, never on /s/<slug>", async () => {
  const w = await world();
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  const dev = w.jar(); assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  const B = w.jar();
  const s = await B.call("POST", "/api/admin/signup", { owner_name: "Test Owner", shop_name: "TEST Splash Kirana", mobile: "9123456781", password: "bshoppass1" });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(s.body.customer_url, `https://k.test/s/${s.body.shop.slug}`, "sign-up answer carries the full customer link");
  assert.equal(s.body.trial_days, 10, "default free trial is 10 days");
  assert.equal((await dev.call("POST", "/api/dev/service", { shop_id: s.body.shop.id, action: "approve" })).status, 200);
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 200);
  const C = w.jar();
  // v10.12.5: "/" has its own glass intro (first visit only), so the old splash stays on /admin and /dev only
  { const r = await C.call("GET", "/"); assert.equal(r.status, 200); assert.doesNotMatch(r.body, /adSplash|splash\.js|splash\.css/, "no old splash on /");
    assert.match(r.body, /<div class="lf-intro" id="lfIntro" aria-hidden="true">/); assert.match(r.body, /<script src="\/intro2?\.js\?v=10\.\d+\.\d+(-\d+)?"><\/script>/); // v10.16.0: intro2.js (landing2 is live)
    assert.doesNotMatch(r.body, /\{\{[A-Z_]+\}\}/); assert.ok(r.body.indexOf("lfIntro") < r.body.indexOf("<main")); }
  for (const path of ["/admin", "/dev"]) {
    const r = await C.call("GET", path); assert.equal(r.status, 200, path);
    assert.match(r.body, /<div id="adSplash" class="ad-sp" aria-hidden="true">/, `splash markup on ${path}`);
    assert.match(r.body, /<script src="\/splash\.js\?v=10\.\d+\.\d+"><\/script>/, `splash loader on ${path}`);
    assert.match(r.body, /<link rel="stylesheet" href="\/splash\.css\?v=10\.\d+\.\d+">/, `splash css on ${path}`);
    assert.match(r.body, /class="ad-sp-logo"/); assert.match(r.body, /<span style="--i:0">A<\/span>/, "3D letters for the brand name");
    assert.match(r.body, /अपना धंधा/);
    assert.doesNotMatch(r.body, /\{\{[A-Z_]+\}\}/, `no unreplaced placeholder on ${path}`);
    assert.ok(r.body.indexOf("adSplash") < r.body.indexOf("<main"), "splash sits before the page content");
  }
  // storefront: real index.html, approved + online shop → no splash anywhere on it
  for (const path of [`/s/${s.body.shop.slug}`, `/s/${s.body.shop.slug}/info`]) {
    const r = await C.call("GET", path); assert.equal(r.status, 200, path + " " + String(r.body).slice(0, 200));
    assert.doesNotMatch(r.body, /adSplash|splash\.js|splash\.css|ad-sp/, `no splash on ${path}`);
  }
  // offline / missing storefront pages too
  assert.equal((await B.call("POST", "/api/admin/online", { online: false })).status, 200);
  const off = await C.call("GET", `/s/${s.body.shop.slug}`); assert.equal(off.status, 503); assert.doesNotMatch(off.body, /adSplash|splash\.js/);
  const miss = await C.call("GET", "/s/no-such-shop"); assert.doesNotMatch(String(miss.body), /adSplash|splash\.js/);
});

test("v10: splash.js skips storefronts, runs once per session, honours reduced motion; CSS has a 3D stage + fade fallback", () => {
  const js = readFileSync(join(here, "..", "site", "splash.js"), "utf8"), css = readFileSync(join(here, "..", "site", "splash.css"), "utf8");
  assert.match(js, /\^\\\/s\\\//, "bails out on /s/ paths");
  assert.match(js, /sessionStorage\.getItem\(K\)/); assert.match(js, /sessionStorage\.setItem\(K, "1"\)/);
  assert.match(js, /prefers-reduced-motion/); assert.match(js, /pointerdown/);
  assert.match(css, /perspective/); assert.match(css, /preserve-3d/); assert.match(css, /rotateY/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.ad-sp\{display:none\}/, "hidden unless JS turns it on");
  assert.match(css, /animation:adSpOut[^;]*2s forwards/, "ends on its own (~2.5 s) even without JS");
  assert.ok(js.length + css.length < 12000, "small");
  const idx = readFileSync(join(here, "..", "site", "index.html"), "utf8");
  assert.doesNotMatch(idx, /splash/, "storefront template carries no splash");
});

test("v10: landing reads price + trial days from platform settings (not hard-coded) and carries the glass flow + CTAs", async () => {
  const w = await world();
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  w.DB._sql.prepare(`INSERT OR REPLACE INTO service_state (k,v) VALUES ('sub_price_paise','37700'),('trial_days','21')`).run();
  const r = await w.jar().call("GET", "/"); assert.equal(r.status, 200);
  assert.match(r.body, /फिर ₹377\/महीना/); assert.match(r.body, /21 दिन फ्री ट्रायल/);
  assert.doesNotMatch(r.body, /₹199|₹500/);
  // v10.12.5 glass flow: shopkeeper problem/solution + CTA, customer 3 steps + CTA
  for (const t of ["अपनी दुकान शुरू करें →", "लॉगिन करें", "दुकान चुनें", "ऑर्डर करें", "पिकअप या डिलीवरी", "समाधान"]) assert.ok(r.body.includes(t), t);
  assert.match(r.body, /href="\/admin#signup"/); assert.match(r.body, /href="\/shops" id="ctaCust"/); assert.match(r.body, /id="langBtn"/);
});
