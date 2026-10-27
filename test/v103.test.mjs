// v10.3 tests: dev panel simplified into 5 sections (Home, Dukaanein, Payments, Settings, Logs); every old tab still reachable; no browser confirm(); brand look.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const rd = f => readFileSync(join(here, "..", "site", f), "utf8");

test("v10.3: 5 sections in the nav, Settings/Logs sub-tabs carry every old tab, all views still wired", () => {
  const html = rd("dev.html"), js = rd("dev.js");
  const secs = [...html.matchAll(/<nav class="tabs"[\s\S]*?<\/nav>/g)][0][0].match(/data-sec="(\w+)"/g).map(s => s.slice(10, -1));
  assert.deepEqual(secs, ["home", "shops", "notify", "payments", "settings", "logs"]); // v10.12.4: 📢 Notify got its own bottom tab
  for (const t of ["platform", "landing", "cloud"]) assert.match(html, new RegExp(`data-for="settings"[\\s\\S]*data-tab="${t}"`));
  for (const t of ["health", "audit", "errors"]) assert.match(html, new RegExp(`data-for="logs"[\\s\\S]*data-tab="${t}"`));
  for (const v of ["home: homeView", "shops: shopsView", "payments: paymentsView", "cloud: cloudView", "audit: auditView", "platform: platformView", "landing: landingView", "errors: errorsView", "health: healthView"]) assert.ok(js.includes(v), v);
  assert.ok(!/\bconfirm\s*\(/.test(js), "no browser confirm() in dev.js");
  assert.ok(!/\bprompt\s*\(/.test(js));
  assert.match(js, /function ask\(/); assert.match(js, /Hi \$\{esc\(firstName\(\)\)\}/);
  for (const a of ['data-a="approve"', 'data-a="reject"', 'data-a="pause"', 'data-a="resume"', 'data-a="delete"', 'data-a="bill"', 'data-a="app"', 'data-a="sub"', 'id="sendDue"', 'id="auto"']) assert.ok(js.includes(a), a);
  assert.ok(!/<script>/.test(html) && !/ on\w+=/.test(html), "strict CSP: no inline script or handlers");
});

test("v10.3: dev look uses the landing palette (green/orange/cream), bottom nav on phone, sidebar on desktop, reduced motion", () => {
  const css = rd("dev.css"), land = rd("landing.css");
  for (const v of ["--g:#1f6b3a", "--o:#f97316", "--cream:#fffaf0"]) assert.ok(css.includes(v), v); // v10.12.5: "/" moved to the glass palette; /dev keeps green/orange/cream
  assert.match(land, /#ffe2c6 0%,#ffe8d6 42%,#fde4ee 70%,#ece6ff 100%/, "landing = peach → pink → lavender glass");
  assert.match(css, /\.tabs\{position:fixed;top:auto;bottom:0/);
  assert.match(css, /@media\(min-width:900px\)\{[\s\S]*?\.tabs\{top:0;bottom:0;right:auto;width:232px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.ok(!/0b1220|121a2b/.test(css), "old dark theme gone");
});

test("v10.3: Platform form gets the developer phone from GET /api/dev/platform, so Save keeps it (shop #1 deleted)", async () => {
  const js = rd("dev.js"), w = rd("_worker.mjs");
  assert.match(w, /\/api\/dev\/platform" && m === "GET"\) return json\(\{ok:true, platform: await platformView\(\), dev_contact:/);
  const blk = js.slice(js.indexOf("async function platformView"), js.indexOf("drawBrand();", js.indexOf("async function platformView")));
  assert.ok(!blk.includes('api("/api/dev/service")'), "no longer depends on the per-shop service read");
  assert.match(blk, /svc = \{dev_contact: x\.dev_contact/);
});
