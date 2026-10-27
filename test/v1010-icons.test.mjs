// v10.10 tests: AI product icons — iconFor() resolver (photo → exact → fuzzy → category → emoji), /icons/*.webp assets, lazy SW cache.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url)); const SITE = join(here, "..", "site");
const S = f => readFileSync(join(SITE, f), "utf8");
function loadIcons(){ const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(S("icons.js"), ctx); return ctx.AKIcons; }
const I = loadIcons();
const slug = (p, c) => { const r = I.iconFor(p, c); return r && r.slug; };

test("v10.10: resolver — tricky real-shop names get a sensible icon", () => {
  const cases = [
    [{name_en: "Colgate Plax Mouthwash"}, "colgate-toothpaste"],
    [{name_en: "Patanjali Dant Kanti"}, "colgate-toothpaste"],
    [{name_en: "Tea", name_hi: "Tea"}, "loose-chai-patti"],
    [{name_hi: "चाय"}, "loose-chai-patti"],
    [{name_en: "Amul Masti Curd"}, "dahi-curd"],
    [{name_en: "Mother Dairy Curd"}, "dahi-curd"],
    [{name_en: "Detergent Powder"}, "surf-excel-powder"],
    [{name_en: "Rin Advanced Detergent Powder"}, "surf-excel-powder"],
    [{name_en: "Surf Excel Stain Eraser Bar"}, "surf-excel-bar"],
    [{name_en: "Dishwash Bar"}, "vim-bar"],
    [{name_en: "Toilet Cleaner"}, "harpic"],
    [{name_en: "Refined Oil"}, "sunflower-oil"],
    [{name_en: "Sarso Tel 1L"}, "mustard-oil"],
    [{name_en: "Namak"}, "tata-salt"], [{name_en: "Cheeni 1 kg"}, "sugar"], [{name_en: "Sabun"}, "lifebuoy-soap"],
    [{name_en: "Catch Black Pepper"}, "kali-mirch"],
    [{name_en: "Red Chilli Powder"}, "lal-mirch-powder"],
    [{name_en: "Harvest Gold Atta Bread", name_hi: "ब्रेड (सफ़ेद)"}, "bread-white"],
    [{name_en: "Cadbury Dairy Milk"}, "cadbury-dairy-milk"],
    [{name_en: "Good Knight Fast Card"}, "good-knight-refill"],
    [{name_en: "Whisper Choice XL"}, "whisper-pads"],
    [{name_en: "Toor Dal", name_hi: "तूर दाल (अरहर)"}, "toor-dal-arhar"],
    [{name_en: "Aashirvaad Atta 10 kg"}, "aashirvaad-atta"],
    [{name_en: "Instant Noodles"}, "maggi-noodles"],
    [{name_en: "B Natural Orange Juice"}, "real-juice"],
  ];
  for (const [p, want] of cases) assert.equal(slug(p), want, JSON.stringify(p));
  // every resolved icon file exists
  for (const [p] of cases) { const r = I.iconFor(p); assert.ok(existsSync(join(SITE, "icons", r.slug + ".webp")), r.slug); assert.match(r.src, /^\/icons\/[a-z0-9-]+\.webp\?v=\d+$/); }
});

test("v10.10: every one of the 368 ready-list catalog rows resolves to its own icon (exact match)", () => {
  const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(S("kirana-catalog.js"), ctx);
  const C = ctx.AKCatalog; assert.equal(C.items.length, 368);
  const byEn = new Map(I.data.items.map(([s, en]) => [en, s]));
  let n = 0; for (const it of C.items) { const r = I.iconFor({name_en: it[1], name_hi: it[2]}); assert.ok(r && r.kind === "item", it[1]); if (byEn.has(it[1])) { assert.equal(r.slug, byEn.get(it[1]), it[1]); n++; } }
  assert.ok(n >= 360, "rows matched by their own English name: " + n);
});

test("v10.10: category fallback when the name is unknown; emoji only when nothing fits", () => {
  assert.equal(slug({name_en: "Xyzzy Special"}, {name_en: "Masale"}), "cat-masale");
  assert.equal(slug({name_en: "Xyzzy Special", cat_hi: "पूजा सामग्री"}), "cat-pooja");
  assert.equal(slug({name_en: "Xyzzy Special", cat_en: "Dairy & Eggs"}), "cat-dairy");
  assert.equal(I.iconFor({name_en: "Xyzzy Special"}, {name_en: "Masale"}).kind, "cat");
  assert.equal(slug({name_en: "Xyzzy Special", icon: "🧴", cat_en: "Other"}), "cat-personal"); // "Other" → the item's own emoji says which shelf
  assert.equal(I.iconFor({name_en: "Fevicol MR", icon: "🛍️", cat_en: "Other"}), null);     // nothing fits → the emoji stays
  assert.match(I.picHtml({name_en: "Fevicol MR", icon: "🛍️"}), /class="emo"[^>]*>🛍️</);
});

test("v10.10: an uploaded photo always wins; icon <img> falls back to the emoji on error", () => {
  const r = I.iconFor({name_en: "Tea", image: "/api/img/abc123", icon: "☕"});
  assert.equal(r.kind, "photo"); assert.equal(r.src, "/api/img/abc123");
  assert.match(I.picHtml({name_en: "Tea", image: "/api/img/abc123"}), /<img src="\/api\/img\/abc123"/);
  const h = I.picHtml({name_en: "Tea", icon: "☕"});
  assert.match(h, /class="aki" src="\/icons\/loose-chai-patti\.webp\?v=\d+"/); assert.match(h, /data-e="☕"/); assert.ok(!/onerror=/.test(h) && S("icons.js").includes('document.addEventListener("error"'), "v10.11.1: fallback via a capture listener (CSP blocks inline onerror)");
  assert.match(I.inlineHtml({product_name: "दूध", product_name_en: "Milk", icon: "🥛"}), /class="aki-i" src="\/icons\/[a-z-]*milk[a-z-]*\.webp/);
  assert.equal(I.inlineHtml({name_en: "Fevicol MR", icon: "🛍️", cat_en: "Other"}), "🛍️");
  assert.doesNotMatch(I.picHtml({name_en: '"><script>x</script>', icon: '"><b>'}), /<script>|<b>/); // names/emoji are escaped
});

test("v10.10: resolver is fast and memoised (300 products, twice)", () => {
  const names = I.data.items.map(([, en]) => en).concat(["Tea", "Detergent Powder", "Colgate Plax Mouthwash"]).slice(0, 300);
  const t0 = performance.now(); for (const n of names) I.iconFor({name_en: n + " 1 kg", cat_en: "Other"}); const t1 = performance.now();
  for (const n of names) I.iconFor({name_en: n + " 1 kg", cat_en: "Other"}); const t2 = performance.now();
  assert.ok(t1 - t0 < 400, `first pass ${t1 - t0} ms`); assert.ok(t2 - t1 < 30, `memo pass ${t2 - t1} ms`);
});

test("v10.10: 287 icons bundled under /icons, small, one per slug; pages load icons.js before their app code", () => {
  const files = readdirSync(join(SITE, "icons")).filter(f => f.endsWith(".webp")); assert.equal(files.length, 287);
  const total = files.reduce((a, f) => a + statSync(join(SITE, "icons", f)).size, 0); assert.ok(total < 900 * 1024, "total " + total);
  for (const [s] of I.data.items) assert.ok(files.includes(s + ".webp"), s);
  for (const k of Object.keys(I.data.cats)) assert.ok(files.includes("cat-" + k + ".webp"), k);
  assert.equal(Object.keys(I.data.cats).length, 13);
  assert.match(S("_headers"), /\/icons\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  for (const [page, app] of [["index.html", "app.js"], ["admin.html", "admin-core.js"], ["track.html", "track.js"]]) {
    const h = S(page); const a = h.indexOf("/icons.js?v="), b = h.indexOf("/" + app + "?v="); assert.ok(a > 0 && a < b, page);
  }
});

async function loadWorker(){ const { mkdtempSync, writeFileSync } = await import("node:fs"); const { tmpdir } = await import("node:os");
  const d = mkdtempSync(join(tmpdir(), "kirana-1010-")); const f = join(d, "w.mjs"); writeFileSync(f, S("_worker.mjs")); return (await import(f)).default; }
test("v10.10: /icons/<slug>.webp is served 200 image/webp with a long cache", async () => {
  const { makeD1 } = await import("./d1-shim.mjs");
  const worker = await loadWorker();
  const ASSETS = { fetch: async r => { const p = join(SITE, new URL(r.url).pathname); if (existsSync(p) && statSync(p).isFile()) return new Response(readFileSync(p), {headers: {"content-type": p.endsWith(".webp") ? "image/webp" : "application/octet-stream"}}); return new Response("Not found", {status: 404}); } };
  const env = { DB: makeD1(), ASSETS };
  for (const s of ["aashirvaad-atta", "loose-chai-patti", "cat-other-missing"]) {
    const r = await worker.fetch(new Request(`https://k.test/icons/${s}.webp?v=1`), env);
    if (s.startsWith("cat-other")) { assert.equal(r.status, 404); continue; }
    assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/webp"); assert.match(r.headers.get("cache-control"), /max-age=31536000/);
    const b = new Uint8Array(await r.arrayBuffer()); assert.equal(String.fromCharCode(...b.slice(8, 12)), "WEBP");
  }
});

test("v10.10: service worker caches icons lazily (on first use) and intercepts nothing else", async () => {
  const handlers = {}; const store = new Map(); let fetched = 0;
  const self = { registration: { scope: "https://k.test/s/demo/" }, location: { origin: "https://k.test" }, addEventListener: (t, f) => { handlers[t] = f; }, clients: {} };
  const caches = { open: async () => ({ match: async r => store.get(r.url), put: async (r, res) => { store.set(r.url, res); } }) };
  const fetch = async r => { fetched++; return new Response("img", {status: 200, headers: {"content-type": "image/webp"}}); };
  const ctx = { self, caches, fetch, URL, Response }; vm.createContext(ctx); vm.runInContext(S("sw.js"), ctx);
  assert.equal(store.size, 0, "nothing precached");
  const ev = url => { let p = null; handlers.fetch({ request: { url, method: "GET" }, respondWith: x => { p = x; } }); return p; };
  assert.equal(ev("https://k.test/admin.js?v=1"), null); assert.equal(ev("https://k.test/api/products"), null); assert.equal(ev("https://other.test/icons/a.webp"), null);
  const r1 = await ev("https://k.test/icons/aashirvaad-atta.webp?v=1"); assert.equal(r1.status, 200); assert.equal(fetched, 1); assert.equal(store.size, 1);
  await ev("https://k.test/icons/aashirvaad-atta.webp?v=1"); assert.equal(fetched, 1, "second view comes from the cache");
});
