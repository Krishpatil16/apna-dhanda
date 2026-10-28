// v10.2 tests: decorative 3D shop/grocery layer on "/" and "/admin" only — never on /s/<slug> or /dev; light, CSP-safe, motion-aware.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createHash, pbkdf2Sync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";
import { withSecrets } from "./secrets-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEST_KEY = "test-setup-key-123456";
const DEV_USER = "krish-dev", DEV_PASS = "dev-test-password-xyz";
const sha = s => createHash("sha256").update(s).digest("hex");
async function loadWorker(){
  const salt = "ab".repeat(16); const hash = pbkdf2Sync(DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
  const src = readFileSync(join(here, "..", "site", "_worker.mjs"), "utf8")
    .replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${sha("kirana-setup:" + TEST_KEY)}"`)
    .replace(/const DEV_SEED = \{[^}]*\};/, `const DEV_SEED = {username:"${DEV_USER}", salt:"${salt}", hash:"${hash}"};`);
  const dir = mkdtempSync(join(tmpdir(), "kirana-v102-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, src); return withSecrets((await import(f)).default, {setupKey: TEST_KEY, devSeed: {username: DEV_USER, salt, hash}});
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

test("v10.2: 3D shop layer on / and /admin, not on /dev or /s/<slug>", async () => {
  const w = await world();
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  const dev = w.jar(); assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  const B = w.jar();
  const s = await B.call("POST", "/api/admin/signup", { owner_name: "Test Owner", shop_name: "TEST Anim Kirana", mobile: "9123456782", password: "bshoppass1" });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await dev.call("POST", "/api/dev/service", { shop_id: s.body.shop.id, action: "approve" })).status, 200);
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 200);
  const C = w.jar();
  // v10.10.1: /admin no longer carries the 3D layer in its HTML — admin.js loads it after the login/sign-up form shows (see v10101 tests)
  const ad = await C.call("GET", "/admin"); assert.equal(ad.status, 200); assert.doesNotMatch(ad.body, /shop3d/, "3D layer is lazy on /admin");
  assert.match(readFileSync(join(here, "..", "site", "admin.js"), "utf8"), /function load3d\(\)[\s\S]*\/shop3d\.css[\s\S]*\/shop3d\.js/);
  // v10.12.5: "/" is the glass flow (own intro animation), so the 3D layer is gone from it
  { const r = await C.call("GET", "/"); assert.equal(r.status, 200); assert.doesNotMatch(r.body, /shop3d/, "no 3D layer on the glass landing"); assert.match(r.body, /id="lfIntro"/); }
  const d = await C.call("GET", "/dev"); assert.doesNotMatch(d.body, /shop3d/, "no 3D layer on /dev");
  for (const path of [`/s/${s.body.shop.slug}`, `/s/${s.body.shop.slug}/info`]) {
    const r = await C.call("GET", path); assert.equal(r.status, 200, path);
    assert.doesNotMatch(r.body, /shop3d|class="s3d/, `no 3D layer on ${path}`);
  }
  const miss = await C.call("GET", "/s/no-such-shop"); assert.doesNotMatch(String(miss.body), /shop3d/);
});

test("v10.2: shop3d is decoration only — aria-hidden, no clicks, all objects, reduced motion, pause when hidden, small", () => {
  const js = readFileSync(join(here, "..", "site", "shop3d.js"), "utf8"), css = readFileSync(join(here, "..", "site", "shop3d.css"), "utf8");
  assert.ok(js.length + css.length < 40000, "under 40 KB");
  assert.match(js, /aria-hidden/); assert.match(css, /\.s3d\{[^}]*pointer-events:none/);
  for (const k of ["shop","cart","bag","sack","milk","biscuit","soap","chai","apple","banana","mango","coin","scooter"]) assert.match(js, new RegExp(k + ":'<"), k);
  assert.match(js, /prefers-reduced-motion/); assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(js, /visibilitychange/); assert.match(css, /s3d-paused[^{]*\{animation-play-state:paused/);
  assert.match(js, /\/\^\\\/s\\\/\//, "skips storefront paths");
  assert.match(js, /auth-mode/, "admin: only on the login/signup screen");
  assert.doesNotMatch(js, /https?:\/\/(?!www\.w3\.org)/, "no external URLs / CDNs");
  assert.doesNotMatch(js, /\beval\(|new Function/);
  // the Register-button colour fix stays
  assert.match(readFileSync(join(here, "..", "site", "landing.css"), "utf8"), /\.pl\.f\{[^}]*linear-gradient\(180deg,#fb923c,#ec4899\)/, "v10.12.5: glossy glass pill");
});
