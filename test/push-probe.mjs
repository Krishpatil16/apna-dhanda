
import { chromium } from "playwright-core";
const BASE = process.env.BASE;
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const headless = process.env.HEADFUL ? false : true;
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "akprof-")), { executablePath: exe, headless, args: ["--no-sandbox"], viewport: { width: 390, height: 844 } });
const b = ctx;
await ctx.grantPermissions(["notifications"], { origin: BASE });
const p = await ctx.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle" });
const res = await p.evaluate(async () => {
  try {
    const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
    const { public_key } = await (await fetch("/api/push/key")).json();
    const k = public_key.replace(/-/g, "+").replace(/_/g, "/"); const key = Uint8Array.from(atob(k + "=".repeat((4 - k.length % 4) % 4)), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return { ok: true, endpoint: sub.endpoint.slice(0, 60) };
  } catch (e) { return { ok: false, err: String(e) }; }
});
console.log(JSON.stringify(res));
await b.close();
