// v10.10.1 tests: first-load speed on slow networks (small brand logo, early state fetch, lazy 3D layer, long cache for versioned files) + audit bug fixes.
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

const S = f => readFileSync(join(here, "..", "site", f), "utf8");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFUlEQVR4nGOUz7b6z4AHMOGTHD4KANTQAdPAJmcuAAAAAElFTkSuQmCC";
const WEBP = "data:image/webp;base64,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";

test("v10.10.1: splash + header use the small s256 WebP logo; without it the 192 PNG, never the 512", async () => {
  const w = await world(); const dev = w.jar();
  assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  const up = async d => (await dev.call("POST", "/api/dev/image", { shop_id: "brand", data_url: d })).body.image_id;
  const i192 = await up(PNG), i512 = await up(PNG), m512 = await up(PNG), a180 = await up(PNG);
  let r = await dev.call("POST", "/api/dev/brand", { icons: { i192, i512, m512, a180 } }); assert.equal(r.status, 200);
  const C = w.jar();
  { const h = (await C.call("GET", "/")).body; assert.doesNotMatch(h, new RegExp(`/api/img/${i512}`), "no 512 logo on /"); // v10.12.5: "/" has the glass intro, not the splash
    assert.match(h, new RegExp(`class="bm" src="/api/img/${i192}"`), "/ logo falls back to 192"); }
  for (const p of ["/admin", "/dev"]) {
    const h = (await C.call("GET", p)).body;
    assert.doesNotMatch(h, new RegExp(`/api/img/${i512}`), `no 512 logo on ${p}`);
    assert.match(h, new RegExp(`class="f" src="/api/img/${i192}"`), `splash falls back to 192 on ${p}`);
  }
  const s256 = await up(WEBP); assert.ok(s256);
  r = await dev.call("POST", "/api/dev/brand", { icons: { i192, i512, m512, a180, s256 } }); assert.equal(r.status, 200);
  assert.equal(r.body.brand.icon_urls.s256, `/api/img/${s256}`);
  assert.match((await C.call("GET", "/")).body, new RegExp(`class="bm" src="/api/img/${s256}"`), "/ logo uses s256");
  for (const p of ["/admin", "/dev"]) {
    const h = (await C.call("GET", p)).body;
    assert.match(h, new RegExp(`class="f" src="/api/img/${s256}"`), `splash uses s256 on ${p}`);
    assert.match(h, new RegExp(`class="bm" src="/api/img/${s256}"`), `header mark uses s256 on ${p}`);
    assert.match(h, new RegExp(`rel="icon" href="/api/img/${s256}" type="image/webp"`), `tab icon on ${p}`);
    assert.doesNotMatch(h, new RegExp(`/api/img/${i512}`));
  }
  // a bad id is still refused
  assert.equal((await dev.call("POST", "/api/dev/brand", { icons: { s256: "ffffffffffffffffffff" } })).status, 400);
});

test("v10.10.1: logo maker makes the s256 WebP and uploads it with the others", () => {
  const js = S("appicon.js");
  assert.match(js, /s256: small\(src, bg, text\)/); assert.match(js, /toDataURL\("image\/webp"/);
  assert.match(js, /\["i192","i512","m512","a180","s256"\]\) if \(set\[k\]\)/);
});

test("v10.10.1: state fetch starts with the HTML; 3D layer lazy; bill check only when logged in", async () => {
  assert.match(S("admin.html"), /<link rel="preload" href="\/api\/admin\/state" as="fetch" crossorigin>/);
  assert.match(S("dev.html"), /<link rel="preload" href="\/api\/dev\/state" as="fetch" crossorigin>/);
  assert.doesNotMatch(S("admin.html"), /shop3d/);
  const a = S("admin.js");
  assert.match(a, /document\.body\.classList\.add\("auth-mode"\); load3d\(\);/);
  assert.doesNotMatch(a, /\n  refreshBill\(\);\n\}\)\(\);/, "no logged-out /api/admin/subscription call");
  assert.match(a, /if \(me\) refreshBill\(\);/);
  // the preload must be the same request admin.js / dev.js make (GET, same-origin credentials)
  assert.match(S("common.js"), /credentials: "same-origin"/);
});

test("v10.10.1: always-versioned css/js are cached a year via _headers; on-demand files are not; every page ref carries this version", () => {
  const V = S("_worker.mjs").match(/const APP_VERSION = "([\d.]+)"/)[1]; assert.equal(V, "10.16.2");
  const hd = S("_headers"); const long = new Set([...hd.matchAll(/^(\/[a-z0-9-]+\.(?:js|css))\n  Cache-Control: public, max-age=31536000, immutable$/gm)].map(m => m[1]));
  for (const f of ["/admin.js", "/admin.css", "/styles.css", "/common.js", "/icons.js", "/dev.js", "/app.js", "/pwa.js", "/shop3d.js"]) assert.ok(long.has(f), f);
  for (const f of ["/sw.js", "/qr.js", "/appicon.js", "/kirana-catalog.js", "/stock-import.js", "/pdf-text.js"]) assert.ok(!long.has(f), `${f} must not be pinned`);
  // nothing that is pinned is ever asked for without ?v=
  for (const file of ["admin.html", "index.html", "dev.html", "landing.html", "track.html", "info.html", "admin.js", "app.js", "dev.js", "landing.js", "common.js", "pwa.js", "sw.js", "_worker.mjs"]) {
    const src = S(file);
    for (const f of long) for (const m of src.matchAll(new RegExp(f.replace(/[.]/g, "\\.") + `(["'\`?])`, "g"))) assert.equal(m[1], "?", `${file} asks for ${f} without ?v=`);
  }
  for (const h of ["admin.html", "index.html", "dev.html", "landing.html", "track.html", "info.html"]) for (const m of S(h).matchAll(/(?:src|href)="(\/[a-z0-9-]+\.(?:js|css))\?v=([\d.]+)"/g)) assert.equal(m[2], V, `${h} ${m[1]}`);
});

test("v10.10.1 audit fixes: inline product icons sit in the text line; tabs and pills fit at 360px", () => {
  assert.match(S("styles.css"), /img\.aki-i\{display:inline-block;/, "global img{display:block} no longer drops icons onto their own line (stock, reports, checklist)");
  assert.match(S("styles.css"), /\.open-pill\{[^}]*white-space:nowrap/, "Open now pill on one line");
  assert.match(S("landing.css"), /\.pl\{[^}]*white-space:nowrap/, "v10.12.5: landing pills on one line");
  assert.match(S("admin.css"), /html\[lang=en\] \.a-tabs button b\{font-size:9\.5px/);
  assert.match(S("admin.html"), /data-t="a_tab_cat"/); assert.match(S("admin.js"), /a_tab_cat:\["कैटेगरी","Category"\]/);
  const d = S("dev.css"); assert.match(d, /\.tabs\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/); assert.match(d, /#logout,\.top \.pill\{white-space:nowrap\}/);
  // the later rules must win: they come after the old ones
  assert.ok(d.lastIndexOf("repeat(5,minmax(0,1fr))") > d.lastIndexOf("grid-template-columns:repeat(5,1fr)"));
});
