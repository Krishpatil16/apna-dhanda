// v10.12.4 tests: 📢 Notify is its own /dev BOTTOM tab (Krish 8:57 PM: "Notification ka alag section banao niche me"), no Notify at the top;
// /health "build" is the real build time (version metadata, else the stamped constant), never a stale hard-coded value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const S = f => readFileSync(join(here, "..", "site", f), "utf8");
async function loadWorker(){
  const dir = mkdtempSync(join(tmpdir(), "kirana-1024-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, S("_worker.mjs")); return (await import(f)).default;
}
const ASSETS = { fetch: async () => new Response("<html></html>", {headers: {"content-type": "text/html"}}) };

test("v10.12.4 /dev bottom nav has 6 tabs incl. 📢 Notify; the top has no Notify (and no lone 'All shops' pill row)", () => {
  const h = S("dev.html");
  const bottom = h.slice(h.indexOf('<nav class="tabs" id="tabs"'), h.indexOf("</nav>", h.indexOf('<nav class="tabs" id="tabs"')));
  const secs = [...bottom.matchAll(/data-sec="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(secs, ["home", "shops", "notify", "payments", "settings", "logs"]);
  assert.ok(bottom.includes("<em>Notify</em>") && bottom.includes("📢"));
  const top = h.slice(h.indexOf('<div class="wrap">'), h.indexOf('<main id="app">')).replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/notify/i.test(top), "no Notify in the top pill rows");
  assert.ok(!top.includes('data-for="shops"') && !top.includes("All shops"), "the lone All shops pill row is gone");
  const js = S("dev.js");
  assert.match(js, /notify:"notify"/, "Notify is its own section");
  assert.match(js, /notify: notifyView/, "the existing notify view is kept");
  for (const k of ["/api/dev/notices", "/api/dev/notices/reminders", "/resolve", 'data-go="notify"']) assert.ok(js.includes(k), k);
  const css = S("dev.css");
  assert.ok(css.includes(".tabs{grid-template-columns:repeat(6,minmax(0,1fr))"), "6 equal columns fit at 360px");
});

test("v10.12.4 /health build = the running version's real upload time (version metadata), else the stamped BUILD_TIME", async () => {
  const w = await loadWorker();
  const r1 = await w.fetch(new Request("https://k.test/health"), { DB: makeD1(), ASSETS, CF_VERSION_METADATA: { id: "v1", tag: "", timestamp: "2026-10-26T16:01:02.345Z" } });
  const j1 = await r1.json(); assert.equal(j1.version, "10.16.2"); assert.equal(j1.build, "2026-10-26T16:01:02.345Z");
  const w2 = await loadWorker();
  const j2 = await (await w2.fetch(new Request("https://k.test/health"), { DB: makeD1(), ASSETS })).json();
  const stamped = S("_worker.mjs").match(/const BUILD_TIME = "([^"]+)"/)[1];
  assert.equal(j2.build, stamped);
  const toml = readFileSync(join(here, "..", "wrangler.apnadhanda.toml"), "utf8");
  assert.match(toml, /\[version_metadata\]\s*binding = "CF_VERSION_METADATA"/); assert.match(toml, /crons = \["30 3 \* \* \*"\]/);
  assert.ok(readFileSync(join(here, "..", "tools", "stamp-build.mjs"), "utf8").includes("BUILD_TIME"));
});
