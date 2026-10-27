
// v10.8.1: the decorative 3D layer (shop3d.js) must never make the page taller than its content.
// Bug: layout() sized the absolute .s3d layer to documentElement.scrollHeight, which already included the layer → it could only grow;
// after a tall tab (Settings) every shorter tab (Stock, Items…) scrolled into a huge empty tail.
import test from "node:test"; import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import vm from "node:vm";
const SRC = readFileSync(new URL("../site/shop3d.js", import.meta.url), "utf8");
function page(path, { auth = false } = {}) {
  let content = 4000; const timers = [], on = {}; const layer = { style: { height: "0px", setProperty() {} }, classList: { toggle() {} }, setAttribute() {}, appendChild() {}, set innerHTML(v) {}, className: "" };
  const px = v => parseFloat(v) || 0;
  const docEl = { get scrollHeight() { return Math.max(content, px(layer.style.height)); }, clientWidth: 360 };
  const emptyEl = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
  const document = { querySelector: () => emptyEl, querySelectorAll: () => [], getElementById: () => null, createElement: () => layer, documentElement: docEl,
    body: { appendChild() {}, classList: { contains: c => c === "auth-mode" && auth } }, addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }), createRange: () => ({}), hidden: false };
  const ctx = { document, location: { pathname: path }, matchMedia: () => ({ matches: true }), setTimeout: f => (timers.push(f), timers.length), clearTimeout() {}, addEventListener: (ev, f) => { on[ev] = f; }, innerHeight: 780, innerWidth: 360, scrollY: 0, NodeFilter: { SHOW_TEXT: 4 } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { layer, setContent(h) { content = h; }, relayout() { if (on.resize) on.resize(); timers.splice(0).forEach(f => f()); }, layouts: () => timers.length, docEl };
}
test("v10.8.1: logged-in /admin — the 3D layer takes no height, so the page ends at the content after a tall tab", () => {
  const p = page("/admin"); p.relayout(); assert.equal(p.layer.style.height, "0px");
  p.setContent(4211); p.relayout(); p.setContent(1904); p.relayout();          // Settings (tall) → Stock (short)
  assert.equal(p.layer.style.height, "0px"); assert.equal(p.docEl.scrollHeight, 1904);
});
test("v10.8.1: login screen / landing — the layer follows the page and shrinks again when the page gets shorter", () => {
  for (const p of [page("/admin", { auth: true }), page("/")]) {
    p.setContent(3000); p.relayout(); assert.equal(p.layer.style.height, "3000px");
    p.setContent(1200); p.relayout(); assert.equal(p.layer.style.height, "1200px"); assert.equal(p.docEl.scrollHeight, 1200);
  }
});
test("v10.8.1: no view keeps a min-height:100vh tail and the admin bottom padding stays just above the tab bar", () => {
  const css = ["styles.css", "admin.css", "shop3d.css"].map(f => readFileSync(new URL("../site/" + f, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(css, /min-height:\s*100d?vh/);
  assert.match(css, /body\.admin\{padding-bottom:calc\(86px \+ env\(safe-area-inset-bottom\)\)/);
});
