// v10.16.2 speed pass 3: builds the shop panel's two script files from the readable source site/admin.js.
//   site/admin-core.js — everything the first screens need (Today, orders/queue, bookings, login/signup), minified.
//   site/admin-more.js — the rarely used screens (settings, items/catalog editor, stock, offers, reports, recharge,
//                        salon catalogue, history, help …), minified. admin-core.js loads it on first use and also
//                        quietly after the first screen is drawn, so by the time the owner taps one it is already here.
// Nothing about the code changes: each moved function keeps its exact body. Inside admin-more.js every name that belonged
// to the panel's closure is read through a live getter/setter object (__S), so the moved code sees the same variables.
// In admin-core.js each moved function becomes a stub with the same name that calls the real one (at once when the file
// is loaded, else after loading it). Edit site/admin.js, then run: node tools/build-admin.mjs  (npm test checks it is fresh).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";
import { analyze } from "eslint-scope";
import { transformSync } from "esbuild";

// Functions that move to admin-more.js (plus, automatically, any function only these call).
export const LAZY = ["settingsView", "editOffer", "editProduct", "importer", "reportsView", "rechargeView", "catalogPicker", "recoveryShown",
  "editService", "svcServicesView", "productsView", "homeScreenSheet", "offersView", "drawLocCard", "helpView", "salonCatalogView", "historyView",
  "categoriesView", "typeChangeView", "drawStock", "stockInSheet", "editCategory", "recoverView", "stockRow", "drawStockList", "vrow", "limitSheet",
  "stockAdd", "shrinkAvatar", "downloadPoster", "stockChange", "loadStockLog", "shrink", "stockClick"];

export function build(src, version){
  const ast = acorn.parse(src, {ecmaVersion: 2023, sourceType: "script", ranges: true});
  if (ast.body.length !== 1 || ast.body[0].type !== "ExpressionStatement") throw new Error("admin.js: expected one IIFE statement");
  const call = ast.body[0].expression; const fn = call.callee;
  if (call.type !== "CallExpression" || fn.type !== "FunctionExpression") throw new Error("admin.js: expected (function(){ … })()");
  const sm = analyze(ast, {ecmaVersion: 2023, sourceType: "script"}); const scope = sm.acquire(fn);
  const body = fn.body.body;
  const decls = new Map(body.filter(s => s.type === "FunctionDeclaration").map(s => [s.id.name, s]));
  for (const n of LAZY) if (!decls.has(n)) throw new Error("admin.js: no top-level function " + n);
  if (/\b__S\b|\b__lz\w*/.test(src)) throw new Error("admin.js already uses __S / __lz names");
  const inside = (pos, set) => { for (const n of set) { const d = decls.get(n); if (pos >= d.start && pos < d.end) return n; } return null; };
  // auto-extend: a function referenced only from inside moved functions moves too
  const lazy = new Set(LAZY);
  for (let changed = true; changed;) { changed = false;
    for (const [n, d] of decls) { if (lazy.has(n)) continue; const refs = scope.set.get(n).references;
      if (refs.length && refs.every(r => { const w = inside(r.identifier.start, lazy); return w && w !== n; })) { lazy.add(n); changed = true; } } }
  // no moved function may use this/arguments (the stub forwards plain calls)
  for (const n of lazy) { const d = decls.get(n); let bad = false;
    (function walk(x, top){ if (!x || typeof x.type !== "string") return; if (!top && (x.type === "FunctionDeclaration" || x.type === "FunctionExpression")) return;
      if (x.type === "ThisExpression" || (x.type === "Identifier" && x.name === "arguments")) bad = true;
      for (const k in x) { const v = x[k]; if (Array.isArray(v)) v.forEach(y => walk(y, false)); else if (v && typeof v.type === "string") walk(v, false); } })(d.body, true);
    if (bad) throw new Error(n + " uses this/arguments — cannot move"); }
  // every reference from moved code to a closure variable → __S.<name>
  const edits = []; const getters = new Set(), setters = new Set();
  const shorthand = new Set(); (function walk(x){ if (!x || typeof x.type !== "string") return; if (x.type === "Property" && x.shorthand) shorthand.add(x.value.start);
    for (const k in x) { const v = x[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === "string") walk(v); } })(fn.body);
  for (const v of scope.variables) for (const r of v.references) {
    if (!inside(r.identifier.start, lazy)) continue;
    const id = r.identifier; getters.add(v.name);
    if (r.isWrite()) { const def = v.defs[0]; if (def.type !== "Variable" || def.parent.kind === "const") throw new Error("moved code writes " + v.name); setters.add(v.name); }
    edits.push({start: id.start, end: id.end, text: shorthand.has(id.start) ? `${v.name}: __S.${v.name}` : `__S.${v.name}`});
  }
  const apply = (from, to) => { let out = "", pos = from; for (const e of edits.filter(e => e.start >= from && e.end <= to).sort((a, b) => a.start - b.start)) { out += src.slice(pos, e.start) + e.text; pos = e.end; } return out + src.slice(pos, to); };
  // admin-more.js
  const order = [...decls.keys()].filter(n => lazy.has(n));
  let more = `// Apna Dhanda shop panel — rarely used screens (built from site/admin.js by tools/build-admin.mjs; do not edit)\nAK._adminMore = function(__S){ return {\n`;
  for (const n of order) { const d = decls.get(n); more += `${JSON.stringify(n)}: ${apply(d.start, d.end).replace(/^(async\s+)?function\s+/, (m, a) => (a || "") + "function ")},\n`; }
  more += "}; };\n";
  // admin-core.js: stubs in place of the moved functions, the loader first, the live scope object last
  const stubs = new Map(order.map(n => [n, `function ${n}(){ return __lzCall(${JSON.stringify(n)}, arguments); }`]));
  let core = ""; let pos = 0; const bodyStart = fn.body.start + 1;
  core += src.slice(0, bodyStart);
  core += `\n  // v10.16.2: loader for admin-more.js (see tools/build-admin.mjs)\n  var __S, __lzImpl = null, __lzP = null;\n` +
    `  function __lzLoad(){ if (__lzImpl) return Promise.resolve(__lzImpl); if (__lzP) return __lzP;\n` +
    `    __lzP = new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = ${JSON.stringify("/admin-more.js?v=" + version)}; sc.async = true;\n` +
    `      sc.onload = () => { if (typeof AK._adminMore === "function") { __lzImpl = AK._adminMore(__S); ok(__lzImpl); } else { sc.remove(); __lzP = null; no(new Error(AK.t("net_err"))); } };\n` +
    `      sc.onerror = () => { sc.remove(); __lzP = null; no(new Error(AK.t("net_err"))); }; document.head.appendChild(sc); });\n    return __lzP; }\n` +
    `  function __lzCall(n, a){ if (__lzImpl) return __lzImpl[n].apply(undefined, a); return __lzLoad().then(m => m[n].apply(undefined, a), e => { try { AK.toast(e.message); } catch {} }); }\n` +
    `  window.addEventListener("load", () => setTimeout(() => { (window.requestIdleCallback || (f => setTimeout(f, 1)))(() => __lzLoad().catch(() => {}), {timeout: 3000}); }, 1200));\n`;
  pos = bodyStart;
  for (const n of order) { const d = decls.get(n); core += src.slice(pos, d.start) + stubs.get(n); pos = d.end; }
  const gs = [...getters].sort().map(n => `get ${n}(){ return ${n}; }` + (setters.has(n) ? `, set ${n}(v){ ${n} = v; }` : "")).join(", ");
  core += src.slice(pos, fn.body.end - 1) + `  __S = {${gs}};\n` + src.slice(fn.body.end - 1);
  const min = code => transformSync(code, {minify: true, charset: "utf8", target: "es2020", legalComments: "none"}).code;
  return {core: min(core), more: min(more), coreSrc: core, moreSrc: more, moved: order};
}

const here = fileURLToPath(new URL("..", import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = readFileSync(here + "site/_worker.mjs", "utf8").match(/const APP_VERSION = "([^"]+)"/)[1];
  const r = build(readFileSync(here + "site/admin.js", "utf8"), version);
  writeFileSync(here + "site/admin-core.js", r.core); writeFileSync(here + "site/admin-more.js", r.more);
  if (process.env.DEBUG_SRC) { writeFileSync(process.env.DEBUG_SRC + "/core.src.js", r.coreSrc); writeFileSync(process.env.DEBUG_SRC + "/more.src.js", r.moreSrc); }
  console.log(`admin-core.js ${r.core.length} B, admin-more.js ${r.more.length} B, moved ${r.moved.length}: ${r.moved.join(" ")}`);
}
