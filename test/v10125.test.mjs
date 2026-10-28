// v10.12.5 tests: "/" is the glass flow (Krish 9:20 PM): intro animation (first visit, Skip, reduced motion) → choice (2 small pills)
// → short glass transition → shopkeeper Problem/Solution + "Start your shop →" (/admin) or customer 3 steps + "Browse shops →" (/shops).
// EN | हिंदी on every new text; no shop names, slugs or ids on "/".
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
  const dir = mkdtempSync(join(tmpdir(), "kirana-v10-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
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

const rd = f => readFileSync(join(here, "..", "site", f), "utf8");
async function landing(){
  const w = await world();
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  const dev = w.jar(); assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  const B = w.jar(); const s = await B.call("POST", "/api/admin/signup", { owner_name: "Test Owner", shop_name: "Gupta Glass Kirana", mobile: "9123456789", password: "bshoppass1" });
  assert.equal(s.status, 201); assert.equal((await dev.call("POST", "/api/dev/service", { shop_id: s.body.shop.id, action: "approve" })).status, 200);
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 200);
  const r = await w.jar().call("GET", "/"); assert.equal(r.status, 200); return { html: r.body, shop: s.body.shop, w };
}

test("v10.12.5 intro: glass card + name + sheen + bubbles + Skip, first visit only (localStorage), reduced motion, auto-advance", async () => {
  const { html } = await landing();
  assert.match(html, /<script src="\/intro2?\.js\?v=(?:10\.15\.[2-9]|10\.16\.\d+)(-\d+)?"><\/script>[\s\S]*<\/head>/, "intro control loads in <head> (no flash)");
  assert.match(html, /<div class="lf-intro" id="lfIntro" aria-hidden="true">/);
  for (const c of ["lf-icard", "lf-ilogo", "lf-iname", "lf-sheen", "lf-bubs", "lf-bub b1"]) assert.ok(html.includes(`class="${c}`), c);
  assert.match(html, /<button class="lf-skip" id="lfSkip" type="button"><span data-en="Skip" data-hi="स्किप">Skip<\/span>/);
  const js = rd("intro.js");
  assert.match(js, /localStorage\.getItem\(K\) === "1"/); assert.match(js, /localStorage\.setItem\(K, "1"\)/, "seen is remembered");
  assert.match(js, /prefers-reduced-motion: reduce/); assert.match(js, /setTimeout\(out, reduce \? 1000 : 2300\)/, "auto-advances (~2.8 s with the fade)");
  assert.match(js, /#lfSkip/); assert.match(js, /intro=1/); assert.match(js, /intro=0/);
  const css = rd("landing.css");
  assert.match(css, /html\.lf-intro-on \.lf-intro\{display:flex\}/); assert.match(css, /\.lf-intro\{display:none;/, "hidden unless intro.js turns it on");
  for (const k of ["lfBlurIn", "lfSheen", "lfBub", "lfPop"]) assert.match(css, new RegExp("@keyframes " + k + "\\{"), k);
  assert.match(css, /backdrop-filter:blur\(18px\)/); assert.match(css, /#ffe2c6 0%,#ffe8d6 42%,#fde4ee 70%,#ece6ff 100%/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^\n]*animation:none!important/);
  assert.doesNotMatch(html, /adSplash|shop3d/, "old splash / 3D layer not on /");
  assert.ok(rd("intro.js").length + css.length < 30000, "lightweight");
});

test("v10.12.5 choice: P3 glass card (orange brand logo, kicker, title, tagline) + 2 small pills (customer filled, shopkeeper outline), no-JS links to /shops and /admin", async () => {
  const { html } = await landing();
  assert.match(html, /<section class="lf-view on" id="vChoice" data-view="choice"/);
  assert.match(html, /<a class="pl f" href="\/shops" id="pickCust" data-go="customer"><span aria-hidden="true">🛍️<\/span><b data-en="I&#39;m a customer" data-hi="मैं ग्राहक हूँ">/);
  assert.match(html, /<a class="pl o" href="\/admin" id="pickShop" data-go="shopkeeper"><span aria-hidden="true">🏪<\/span><b data-en="I&#39;m a shopkeeper" data-hi="मैं दुकानदार हूँ">/);
  assert.match(rd("landing.css"), /\.pl\{[^}]*height:40px/, "small ~40px pills");
  assert.match(html, /<div class="lf-card lf-choice">\s*<span class="lf-logo">[\s\S]*?<p class="kicker" data-en=[\s\S]*?<h1 id="lfH" data-en="Your shop, now online 🏪">/, "P3 order: logo, kicker, title");
  assert.match(rd("landing.css"), /rgba\(251,146,60,\.6\)[\s\S]*linear-gradient\(180deg,#ffe2c6 0%,#ffe8d6 42%,#fde4ee 70%,#ece6ff 100%\)/, "peach/orange top, pink middle, lavender bottom");
});

test("v10.12.5 both paths: shopkeeper Problem/Solution + Start your shop → /admin; customer 3 steps + Browse shops → /shops; back arrow; hash views", async () => {
  const { html } = await landing();
  const shop = html.slice(html.indexOf('id="vShop"'), html.indexOf('id="vCust"')), cust = html.slice(html.indexOf('id="vCust"'), html.indexOf("</main>"));
  assert.match(html, /<section class="lf-view" id="vShop" data-view="shopkeeper" aria-labelledby="lfShopH" hidden>/);
  assert.match(html, /<section class="lf-view" id="vCust" data-view="customer" aria-labelledby="lfCustH" hidden>/);
  assert.equal((shop.match(/class="lf-row bad"/g) || []).length, 4, "4 problem rows"); assert.equal((shop.match(/class="lf-row good"/g) || []).length, 4, "4 solution rows");
  for (const t of ["Everything in a paper register", "Mistakes in the hisaab", "Phone &amp; WhatsApp orders get missed", "No online presence", "Your own online shop link + QR", "All orders in one place", "Stock and low-stock alerts", "Daily reports", "Free to start"]) assert.ok(shop.includes(t), t);
  assert.match(shop, /<a class="pl f lf-cta" href="\/admin#signup" id="ctaShop"><b data-en="Start your shop →"/);
  assert.equal((cust.match(/<span class="lf-n">\d<\/span>/g) || []).length, 3, "3 customer steps");
  for (const t of ["Choose a shop", "Place your order", "Pickup or delivery"]) assert.ok(cust.includes(t), t);
  assert.match(cust, /<a class="pl f lf-cta" href="\/shops" id="ctaCust"><b data-en="Browse shops →"/);
  for (const v of [shop, cust]) assert.match(v, /<button class="lf-back" type="button" data-go="choice"><span aria-hidden="true">←<\/span><span data-en="Back" data-hi="वापस">/);
  const js = rd("landing.js");
  assert.match(js, /history\.pushState\(\{lf: n\}, "", "#" \+ n\)/); assert.match(js, /popstate/); assert.match(js, /#\(shopkeeper\|customer\)/);
});

test("v10.12.5 transition: a glass card with 🏪 (shopkeeper) or 🛍️ (customer) between choice and info; off for reduced motion", async () => {
  const { html } = await landing();
  assert.match(html, /<div class="lf-trans" id="lfTrans" aria-hidden="true">/);
  assert.match(html, /<span class="lf-ticon t-shop">🏪<\/span>/); assert.match(html, /<span class="lf-ticon t-cust">🛍️<\/span>/);
  assert.match(html, /class="lf-tl t-shop" data-en="For shopkeepers" data-hi="दुकानदारों के लिए"/); assert.match(html, /class="lf-tl t-cust" data-en="For customers" data-hi="ग्राहकों के लिए"/);
  const js = rd("landing.js"), css = rd("landing.css");
  assert.match(js, /"lf-trans on " \+ \(name === "shopkeeper" \? "t-shop" : "t-cust"\)/, "both paths get their own transition");
  assert.match(js, /reduce \|\| !tr\) return swap/, "reduced motion = instant switch");
  for (const k of [".lf-trans.on{display:flex", ".lf-trans.t-shop .lf-tcard", ".lf-trans.t-cust .lf-tcard", "@keyframes lfExpand", ".lf-in .lf-row{animation:lfUp"]) assert.ok(css.includes(k), k);
  assert.match(css, /prefers-reduced-motion:reduce\)\{[^\n]*\.lf-trans\{display:none!important\}/);
});

test("v10.12.5 i18n: every new text has English + Hindi; EN | हिंदी switch; no shop names, slugs or ids on /", async () => {
  const { html, shop } = await landing();
  const body = html.slice(html.indexOf("<body>"));
  const tags = [...body.matchAll(/<[a-z0-9]+\b[^>]*\bdata-en="([^"]*)"[^>]*>/g)];
  assert.ok(tags.length >= 35, "new texts are translatable: " + tags.length);
  for (const k of ["The problem", "The solution", "Start your shop →", "Browse shops →", "Back", "Skip", "For shopkeepers", "For customers", "Choose a shop"]) assert.ok(body.includes(`data-en="${k}" data-hi="`), k);
  for (const m of body.matchAll(/data-en="([^"]*)" data-hi="([^"]*)"/g)) { assert.ok(m[1].trim() && m[2].trim(), "both languages filled"); if (/[a-z]{4}/i.test(m[1]) && !/WhatsApp|QR/.test(m[1])) assert.match(m[2], /[\u0900-\u097F]/, "Hindi for: " + m[1]); }
  assert.match(html, /id="langBtn"/); assert.match(rd("landing.js"), /"ak_lang"/);
  for (const leak of ["Gupta", shop.slug, "/s/", "data-shop", `"id":${shop.id}`, "9123456789"]) assert.ok(!html.includes(leak), "landing leaks " + leak);
});

test("v10.12.5 Krish tweak: choice card centred, no trial line under it, no footer on \"/\"", async () => {
  const { html } = await landing();
  assert.doesNotMatch(html, /class="lf-trial"/, "no trial line under the choice card");
  assert.doesNotMatch(html, /<footer|class="lf-foot"/, "no footer line on the landing");
  const css = rd("landing.css");
  assert.match(css, /#vChoice:not\(\[hidden\]\)\{[^}]*min-height:calc\(100dvh[^}]*justify-content:center/, "choice view centres its card vertically");
});
