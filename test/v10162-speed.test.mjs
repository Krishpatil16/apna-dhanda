// v10.16.2 speed pass 3 tests: the shop panel's admin.js is built into admin-core.js (first screens) + admin-more.js (rarely used
// screens, loaded on first use and quietly after the first screen), minified; admin-boot.js starts Today's two reads with the page.
// Nothing a shopkeeper sees or does changes: every moved function keeps its exact body (checked below), and the built files must be
// rebuilt from site/admin.js (node tools/build-admin.mjs) whenever it changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build, LAZY } from "../tools/build-admin.mjs";

const here = dirname(fileURLToPath(import.meta.url)); const SITE = join(here, "..", "site");
const S = f => readFileSync(join(SITE, f), "utf8");
const V = S("_worker.mjs").match(/const APP_VERSION = "([\d.]+)"/)[1];

test("v10.16.2: admin-core.js and admin-more.js are fresh builds of site/admin.js (run node tools/build-admin.mjs after editing admin.js)", () => {
  const r = build(S("admin.js"), V);
  assert.equal(S("admin-core.js"), r.core, "admin-core.js is stale"); assert.equal(S("admin-more.js"), r.more, "admin-more.js is stale");
  for (const n of LAZY) assert.ok(r.moved.includes(n), n);
  assert.ok(r.core.includes(`/admin-more.js?v=${V}`), "admin-more.js is asked for with this version");
  // the first screens' code stays in admin-core.js
  for (const n of ["start", "todayView", "svcTodayView", "ordersView", "loadOrders", "orderCard", "loginView", "signupView", "billView", "editItemSheet", "renderAlerts", "drawNoti"]) assert.ok(!r.moved.includes(n), n + " stays in core");
  // much smaller first download (raw bytes)
  assert.ok(Buffer.byteLength(r.core) < 110 * 1024, "admin-core.js " + Buffer.byteLength(r.core)); assert.ok(Buffer.byteLength(S("admin.js")) - Buffer.byteLength(r.core) > 140 * 1024);
});

test("v10.16.2: every moved function is byte-for-byte its admin.js body (only closure names read through the live __S object)", () => {
  const src = S("admin.js"), r = build(src, V);
  for (const n of r.moved) {
    const m = r.moreSrc.indexOf(`${JSON.stringify(n)}: `); assert.ok(m >= 0, n);
    // the moved text, with __S.x → x and "x: __S.x" (shorthand) → x, must be exactly the original declaration
    const start = m + JSON.stringify(n).length + 2; const next = r.moved[r.moved.indexOf(n) + 1];
    const end = next ? r.moreSrc.indexOf(`,\n${JSON.stringify(next)}: `) : r.moreSrc.lastIndexOf(",\n}; };");
    const moved = r.moreSrc.slice(start, end).replace(/\b(\w+|\$): __S\.\1\b/g, "$1").replace(/__S\.([\w$]+)/g, "$1");
    const orig = src.match(new RegExp(`(async )?function ${n}\\(`)); assert.ok(orig, n);
    assert.ok(src.includes(moved), n + " body differs from admin.js");
    assert.ok(new RegExp(`function ${n}\\(\\)\\{ return __lzCall\\(${JSON.stringify(n).replace(/"/g, '"')}, arguments\\); \\}`).test(r.coreSrc), n + " stub");
  }
});

test("v10.16.2: the moved screens run — load core + more in a sandbox, a moved function reaches closure state live", async () => {
  // tiny DOM-free check of the loader: stubs wait for admin-more.js, then call straight through; __S getters/setters are live
  const src = `(function(){ let n = 1; const L = x => x * 2; function eager(){ return n; } function moved(a){ n = n + a; return L(n); } function moved2(){ return moved(1) + eager(); } AK.peek = () => ({eager: eager(), moved, moved2}); })();`;
  // build() is checked on admin.js above; here the same build runs on a toy source with the same shape
  const B = build; const mod = await import("../tools/build-admin.mjs"); const LZ = mod.LAZY.splice(0, mod.LAZY.length, "moved", "moved2");
  try {
    const out = B(src, "9.9.9"); let script = null;
    const doc = {createElement: () => ({ remove(){} }), head: {appendChild: sc => { script = sc; }}};
    const ctx = {AK: {t: () => "net", toast(){}}, document: doc, window: {addEventListener(){}}, setTimeout, Promise};
    vm.createContext(ctx); vm.runInContext(out.core, ctx);
    const p = ctx.AK.peek(); assert.equal(p.eager, 1);
    const pr = p.moved(2); assert.ok(script && script.src === "/admin-more.js?v=9.9.9"); vm.runInContext(out.more, ctx); script.onload();
    assert.equal(await pr, 6, "moved(2) ran after load with the live n");
    assert.equal(ctx.AK.peek().eager, 3, "the write went to the closure variable");
    assert.equal(p.moved2(), 8 + 4, "loaded: plain synchronous calls (n is 4 now)");
  } finally { mod.LAZY.splice(0, mod.LAZY.length, ...LZ); }
});

test("v10.16.2: admin.html loads admin-core.js (not admin.js) + admin-boot.js async; new files are cache-busted and cached a year", () => {
  const h = S("admin.html");
  assert.ok(h.includes(`<script src="/admin-core.js?v=${V}"></script>`)); assert.ok(!/src="\/admin\.js/.test(h));
  assert.ok(h.includes(`<script src="/admin-boot.js?v=${V}-2" async></script>`), "admin-boot.js (changed after the first 10.16.2 upload: -2)");
  for (const f of ["admin.html", "index.html", "salon.html", "track.html"]) assert.ok(S(f).includes(`/common.js?v=${V}-2"`), f + " asks for the fixed common.js");
  assert.ok(h.indexOf("/type-profile.js?v=") < h.indexOf("/admin-core.js?v=") && h.indexOf("/admin-core.js?v=") < h.indexOf("/devmode.js?v="), "same order as before");
  for (const f of ["/admin-core.js", "/admin-more.js", "/admin-boot.js"]) assert.match(S("_headers"), new RegExp(f.replace(/[.]/g, "\\.") + "\\n\\s+Cache-Control: public, max-age=31536000, immutable"));
  assert.equal(S("sw.js").match(/const SW_VERSION = "([^"]+)"/)[1], V);
});

function runBoot({hash = "", path = "/admin", state}){
  const calls = []; const mk = body => Promise.resolve({ok: true, clone(){ return {json: () => Promise.resolve(body)}; }, json: () => Promise.resolve(body)});
  const win = {location: {hash, pathname: path}, fetch: (u, o) => { calls.push([u, o]); return u === "/api/admin/state" ? mk(state) : mk({}); }};
  win.window = win; win.setTimeout = (f, ms) => { const h = setTimeout(f, ms); h.unref?.(); return h; }; vm.createContext(win); vm.runInContext(S("admin-boot.js"), win); return {calls, win};
}
test("v10.16.2: admin-boot.js starts the dashboard + active orders only for a logged-in owner opening Today", async () => {
  const tick = () => new Promise(r => setTimeout(r, 5));
  let b = runBoot({state: {admin: {id: 1}}}); await tick();
  assert.equal(b.calls.map(c => c[0]).join(" "), "/api/admin/state /api/admin/dashboard /api/admin/orders?status=active&q=");
  for (const [, o] of b.calls) assert.equal(JSON.stringify(o), JSON.stringify({method: "GET", headers: {}, credentials: "same-origin"}), "the exact request api() makes");
  await b.win.__adPre.__dec; assert.ok(b.win.__adPre["/api/admin/dashboard"] && b.win.__adPre["/api/admin/orders?status=active&q="], "copies waiting for api()");
  b = runBoot({state: {admin: null}}); await tick(); await b.win.__adPre.__dec; assert.equal(b.calls.map(c => c[0]).join(" "), "/api/admin/state", "logged out: nothing more");
  b = runBoot({state: {admin: {must_change: true}}}); await tick(); assert.equal(b.calls.length, 1);
  b = runBoot({hash: "#signup", state: {admin: {id: 1}}}); await tick(); assert.equal(b.calls.length, 0);
  b = runBoot({path: "/dev/as/5", state: {admin: {id: 1}}}); await tick(); assert.equal(b.calls.length, 0, "God Mode viewing is untouched");
});

test("v10.16.2: common.js api() uses an early copy once, only for the same plain GET, only within 20 s; waits for admin-boot.js's decision (never asks twice)", async () => {
  const c = S("common.js");
  assert.match(c, /const pre = o\.method === "GET" && !opts\.headers && takePre\(path\);\n    let r; try \{ r = await \(pre \? pre\.then\(x => x \|\| fetch\(path, o\)\) : fetch\(path, o\)\); \}/);
  const body = c.slice(c.indexOf("  function takePre(path){"), c.indexOf("  async function api(path"));
  const mk = (w, D) => new Function("window", "Date", body + "; return takePre;")(w, D);
  const w = {__adPre: {"/x": Promise.resolve("P1")}, __adPreT: 1000}; let now = 2000; const t = mk(w, {now: () => now});
  assert.equal(await t("/x"), "P1"); assert.equal(t("/x"), null, "once");
  w.__adPre["/y"] = Promise.resolve("P2"); now = 1000 + 20001; assert.equal(t("/y"), null, "too old"); assert.equal(w.__adPre["/y"], undefined);
  const w2 = {}; const t2 = mk(w2, Date); assert.equal(t2("/api/admin/state"), null); assert.equal(JSON.stringify(w2.__adPre), "{}", "a late admin-boot.js then stays out of the way");
  // admin-boot.js still deciding: a call for one of its two paths waits, then takes its copy (or gets null → its own fetch)
  let decide; const w3 = {__adPre: {__paths: ["/d", "/o"], __dec: new Promise(r => { decide = r; })}, __adPreT: Date.now()}; const t3 = mk(w3, Date);
  const pd = t3("/d"), po = t3("/o"); assert.ok(pd && typeof pd.then === "function"); assert.equal(t3("/other"), null);
  w3.__adPre["/d"] = Promise.resolve("D1"); decide(); assert.equal(await pd, "D1"); assert.equal(await po, null, "not started by boot → api() fetches it itself");
});
