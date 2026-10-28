// (helpers copied from the v10 tests)
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
  const dir = mkdtempSync(join(tmpdir(), "kirana-v101-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
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


// v10.1: Dev → 🏠 Landing editor
async function devWorld(){ const w = await world(); const dev = w.jar(); assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200); return {...w, dev}; }
const getL = async dev => { const r = await dev.call("GET", "/api/dev/landing"); assert.equal(r.status, 200); return r.body; };

test("v10.1 landing editor: save/load round-trip in both languages, one JSON in D1, rendered on / with data-en", async () => {
  const w = await devWorld(); const { dev } = w;
  const g = await getL(dev); assert.equal(g.landing.text.title.hi, ""); assert.equal(g.defaults.cards.length, 6); assert.equal(g.limits.cards, 12);
  const L = g.landing; L.text.title = {hi: "मेरी दुकान ऑनलाइन", en: "My shop online"}; L.text.kicker.en = "For everyone"; L.text.footer = {hi: "{brand} · धन्यवाद", en: "{brand} · Thanks"};
  L.text.plan_then = {hi: "बस {price} हर महीना", en: "only {price} a month"}; L.icons.s1 = "✍️"; L.theme.primary = "#123456";
  const s = await dev.call("POST", "/api/dev/landing", { landing: L }); assert.equal(s.status, 200, JSON.stringify(s.body));
  const row = w.DB._sql.prepare(`SELECT v FROM service_state WHERE k='landing_json'`).get(); assert.ok(row); assert.equal(JSON.parse(row.v).text.title.en, "My shop online");
  const g2 = await getL(dev); assert.equal(g2.landing.text.title.hi, "मेरी दुकान ऑनलाइन"); assert.equal(g2.landing.icons.s1, "✍️"); assert.equal(g2.landing.theme.primary, "#123456");
  const r = await w.jar().call("GET", "/"); assert.equal(r.status, 200);
  // v10.12.5 glass flow: the editor's kicker/title head the choice card, the lead sits in the shopkeeper view; footer + trial lines stay editable
  assert.match(r.body, /<h1 id="lfH" data-en="My shop online">मेरी दुकान ऑनलाइन<\/h1>/);
  // v10.12.5 (Krish): no footer line and no trial line under the choice card on "/"
  assert.doesNotMatch(r.body, /class="lf-foot"|धन्यवाद/, "landing footer removed"); assert.doesNotMatch(r.body, /class="lf-trial"/, "trial line under the card removed");
  assert.match(r.body, /फिर ₹199\/महीना/, "{price} comes from platform settings");
  assert.match(r.body, /--g:#123456/); assert.match(r.body, /<meta name="theme-color" content="#fde2ef">/, "glass landing keeps its own bar colour");
  assert.doesNotMatch(r.body, /\{\{[A-Z_]+\}\}|\{price\}|\{trial_days\}|\{brand\}/);
  // shopkeepers and the public cannot read or write it
  assert.equal((await w.jar().call("GET", "/api/dev/landing")).status, 401);
  assert.equal((await w.jar().call("POST", "/api/dev/landing", { landing: L })).status, 401);
});

test("v10.1 landing editor: empty fields fall back to the built-in default text; no config = the page as before", async () => {
  const w = await devWorld(); const { dev } = w;
  const before = (await w.jar().call("GET", "/")).body;
  for (const t of ["data-en=\"Your shop, now online 🏪\"", "data-en=\"The problem\"", "data-en=\"The solution\"", "data-en=\"Start your shop →\"", "data-en=\"Browse shops →\"", "data-en=\"{trial_days} days free trial\"".replace("{trial_days}", "10")]) assert.ok(before.includes(t), t);
  assert.doesNotMatch(before, /id="landingTheme"/, "default colours add no style override");
  const L = (await getL(dev)).landing; for (const k of Object.keys(L.text)) L.text[k] = {hi: "  ", en: ""}; L.cards.forEach(c => { c.t_hi = ""; c.t_en = ""; c.d_hi = ""; c.d_en = ""; c.icon = ""; });
  assert.equal((await dev.call("POST", "/api/dev/landing", { landing: L })).status, 200);
  const after = (await w.jar().call("GET", "/")).body;
  assert.equal(after, before, "all-empty config renders exactly the default page");
  for (const m of after.matchAll(/data-en="([^"]*)">([^<]*)</g)) { assert.ok(m[1].trim(), "no blank EN text"); assert.ok(m[2].trim(), "no blank HI text"); }
  // old Platform title/text map into the editor (one place only)
  assert.equal((await dev.call("POST", "/api/dev/platform", { landing_title: "Purana title" })).status, 200);
  const g = await getL(dev); assert.deepEqual(g.landing.text.title, {hi: "Purana title", en: "Purana title"});
  assert.equal(w.DB._sql.prepare(`SELECT v FROM service_state WHERE k='landing_title'`).get().v, "", "legacy key emptied");
  assert.match((await w.jar().call("GET", "/")).body, /<h1 id="lfH" data-en="Purana title">Purana title<\/h1>/);
  // legacy value written before the editor existed is still shown, and appears in the editor
  w.DB._sql.prepare(`DELETE FROM service_state WHERE k='landing_json'`).run(); w.DB._sql.prepare(`UPDATE service_state SET v='Legacy text' WHERE k='landing_text'`).run();
  assert.equal((await getL(dev)).landing.text.lead.hi, "Legacy text"); assert.match((await w.jar().call("GET", "/")).body, /Legacy text/);
});

test("v10.1 landing editor: escaping + validation (no HTML/script, length limits, colours, max 12 cards)", async () => {
  const w = await devWorld(); const { dev } = w;
  const L = (await getL(dev)).landing;
  L.text.title.hi = `<script>alert(1)</script>"onmouseover="x`; L.text.lead.en = `a" onload="alert(2)`; L.cards[0].t_hi = "<img src=x onerror=alert(3)>"; L.cards[0].icon = `"><b>`; L.text.kicker.hi = "{{SPLASH}} {{BRAND}}"; /* v10.12.5: footer no longer on "/", kicker carries the token check */
  assert.equal((await dev.call("POST", "/api/dev/landing", { landing: L })).status, 200);
  const r = (await w.jar().call("GET", "/")).body;
  assert.ok(!r.includes("<script>alert"), "no script tag"); assert.ok(!r.includes("<img src=x"), "no injected img"); assert.ok(!/onload="alert/.test(r) && !/" onmouseover=/.test(r), "no attribute break-out");
  assert.match(r, /scriptalert\(1\)\/script&quot;onmouseover=&quot;x/); assert.match(r, /a&quot; onload=&quot;alert\(2\)/);
  assert.match(r, /\{\{SPLASH\}\} \{\{BRAND\}\}/, "typed template tokens are shown as text, never expanded");
  const g = await getL(dev); assert.equal(g.landing.cards[0].icon, "b", "icon stripped of markup");
  const bad = async (mut, re) => { const x = structuredClone((await getL(dev)).landing); mut(x); const s = await dev.call("POST", "/api/dev/landing", { landing: x }); assert.equal(s.status, 400, JSON.stringify(s.body)); if (re) assert.match(s.body.error, re); };
  await bad(x => { x.text.title.hi = "x".repeat(101); }, /too long/);
  await bad(x => { x.cards[1].d_en = "y".repeat(121); }, /too long/);
  await bad(x => { x.theme.accent = "red;}body{display:none"; }, /Colour/);
  await bad(x => { x.cards = Array.from({length: 13}, (_, i) => ({id: "k" + i, t_hi: "T" + i})); }, /12/);
  await bad(x => { x.cards[0].icon = "🙂".repeat(9); }, /icon/);
  const twelve = structuredClone((await getL(dev)).landing); twelve.cards = Array.from({length: 12}, (_, i) => ({id: "k" + i, icon: "⭐", t_hi: "कार्ड " + i, t_en: "Card " + i}));
  assert.equal((await dev.call("POST", "/api/dev/landing", { landing: twelve })).status, 200, "12 cards is fine");
  // shopkeeper session can't write it
  const B = w.jar(); await B.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" });
  assert.notEqual((await B.call("POST", "/api/dev/landing", { landing: twelve })).status, 200);
});

test("v10.1 landing editor: feature cards add / delete / reorder / hide; sections hide", async () => {
  const w = await devWorld(); const { dev } = w;
  const L = (await getL(dev)).landing;
  // reorder: move "switch" (last) to the top, delete "stickers", hide "alerts", add a custom card
  const sw = L.cards.pop(); L.cards.unshift(sw); L.cards = L.cards.filter(c => c.id !== "stickers"); L.cards.find(c => c.id === "alerts").show = false;
  L.cards.push({id: "cnew1", icon: "🚚", t_hi: "होम डिलीवरी", t_en: "Home delivery", d_hi: "", d_en: "Deliver to the door", show: true});
  L.cards.find(c => c.id === "orders").t_en = "Orders from home";
  assert.equal((await dev.call("POST", "/api/dev/landing", { landing: L })).status, 200);
  const r = (await w.jar().call("GET", "/")).body;
  assert.ok(!r.includes("data-card="), "v10.12.5: feature cards are saved for the editor but the glass landing shows Problem/Solution rows instead");
  const g = await getL(dev); assert.deepEqual(g.landing.cards.map(c => c.id), ["switch", "orders", "link", "app", "alerts", "cnew1"]); assert.equal(g.landing.cards[4].show, false);
  // sections off: scene, steps, features, plan
  const L2 = g.landing; Object.assign(L2.show, {scene: false, steps: false, features: false, plan: false});
  assert.equal((await dev.call("POST", "/api/dev/landing", { landing: L2 })).status, 200);
  const r2 = (await w.jar().call("GET", "/")).body;
  assert.match(r2, /अपनी दुकान शुरू करें →/, "CTAs stay"); assert.match(r2, /id="langBtn"/); assert.match(r2, /days free trial/, "trial line still shown");
  L2.show.trial = false; assert.equal((await dev.call("POST", "/api/dev/landing", { landing: L2 })).status, 200);
  assert.ok(!(await w.jar().call("GET", "/")).body.includes("days free trial"), "trial line hides");
  // reset = empty config → default 6 cards in default order again
  const e = (await getL(dev)).landing; e.cards = g.landing.cards.length && (await getL(dev)).defaults.cards.map(c => ({id: c.id})); Object.keys(e.show).forEach(k => e.show[k] = true);
  assert.equal((await dev.call("POST", "/api/dev/landing", { landing: e })).status, 200);
  assert.deepEqual((await getL(dev)).landing.cards.map(c => c.id), ["orders", "link", "app", "stickers", "alerts", "switch"]);
});

test("v10.1 dev panel: 🏠 Landing tab exists, editor has cards/reset/preview, no browser confirm, Platform has no second title/text box", async () => {
  const js = readFileSync(join(here, "..", "site", "dev.js"), "utf8"), html = readFileSync(join(here, "..", "site", "dev.html"), "utf8");
  assert.match(html, /data-tab="landing"/); assert.match(js, /landing: landingView/);
  for (const s of ["function landingView", "landingResetModal", 'data-cm="up"', 'data-cm="down"', 'data-cm="del"', 'data-cm="vis"', "lcAdd", 'type="color"', 'href="/?splash=0" target="_blank"', "/api/dev/landing"]) assert.ok(js.includes(s), s);
  const blk = js.slice(js.indexOf("v10.1: 🏠 Landing page editor"), js.indexOf("async function platformView")); assert.ok(blk.length > 2000);
  assert.ok(!/\bconfirm\s*\(/.test(blk), "no browser confirm() in the editor"); assert.ok(!/\bprompt\s*\(/.test(js));
  assert.ok(!js.includes('id="lt"') && !js.includes('id="lx"'), "old landing title/text inputs removed from Platform");
});
