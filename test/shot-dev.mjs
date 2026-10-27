// Phone-viewport screenshots + checks of the developer panel, admin grace banner and customer paused page.
// BASE=… AUSER=… APASS=… DUSER=… DPASS=… OUT=… [SETUP_KEY=… for a fresh local DB] node test/shot-dev.mjs
import { chromium } from "playwright-core";
const exe = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const { BASE, AUSER, APASS, DUSER, DPASS, OUT } = process.env;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const devCtx = await b.newContext({ ...phone, locale: "en-IN" });
const adminCtx = await b.newContext({ ...phone, locale: "hi-IN" });
const custCtx = await b.newContext({ ...phone, locale: "hi-IN" });
const log = (...a) => console.log(...a);
const H = { "x-requested-with": "kirana-dev", "content-type": "application/json" };
const devPost = async (body) => { const r = await devCtx.request.post(BASE + "/api/dev/service", { headers: H, data: body }); const j = await r.json(); if (!r.ok()) throw new Error(JSON.stringify(j)); return j; };
try {
  if (process.env.SETUP_KEY) {
    const r = await adminCtx.request.post(BASE + "/api/admin/setup", { headers: { "x-requested-with": "kirana", "content-type": "application/json" }, data: { setup_key: process.env.SETUP_KEY, username: AUSER, password: APASS } });
    log("setup", r.status());
    await adminCtx.request.put(BASE + "/api/admin/settings", { headers: { "x-requested-with": "kirana", "content-type": "application/json" }, data: { open_time: "00:00", close_time: "00:00", phone: "9876500011" } });
  }
  // --- developer logs in through the real form
  const d = await devCtx.newPage();
  await d.goto(BASE + "/dev", { waitUntil: "networkidle" });
  await d.fill("#u", DUSER); await d.fill("#p", DPASS); await d.click("#f button");
  await d.waitForSelector("#hv", { timeout: 20000 }); await d.waitForTimeout(400);
  await d.screenshot({ path: OUT + "/dev-dashboard.png" });
  await d.screenshot({ path: OUT + "/dev-dashboard-full.png", fullPage: true });
  log("dashboard ok:", await d.textContent(".status-line b"));
  // overflow check
  log("dev overflow px:", await d.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  // --- service tab
  await d.click('[data-tab="service"]'); await d.waitForSelector(".svc-hero"); await d.waitForTimeout(300);
  const before = await devCtx.request.get(BASE + "/api/dev/service").then(r => r.json());
  log("service before:", before.service.status, before.service.paid_until);
  // --- grace: admin banner
  await devPost({ action: "grace", note: "screenshot check: grace banner" });
  const a = await adminCtx.newPage();
  await a.goto(BASE + "/admin", { waitUntil: "networkidle" });
  if (await a.$("#f #u")) { await a.fill("#u", AUSER); await a.fill("#p", APASS); await a.click("#f button"); }
  await a.waitForSelector("#svcBanner.grace", { timeout: 20000 }); await a.waitForTimeout(500);
  await a.screenshot({ path: OUT + "/admin-grace-banner.png" });
  log("grace banner:", (await a.textContent("#svcBanner")).replace(/\s+/g, " ").trim());
  // customer site still works in grace
  const c = await custCtx.newPage();
  let resp = await c.goto(BASE + "/?v=" + Date.now(), { waitUntil: "networkidle" });
  log("customer in grace:", resp.status());
  // --- pause
  await devPost({ action: "pause", note: "screenshot check: pause" });
  resp = await c.goto(BASE + "/?v=" + Date.now(), { waitUntil: "networkidle" });
  log("customer paused status:", resp.status());
  await c.waitForTimeout(300);
  await c.screenshot({ path: OUT + "/customer-paused-page.png" });
  // server-side block: try an order directly
  const store = await custCtx.request.get(BASE + "/api/store").then(r => r.json());
  log("store.service_paused:", store.service_paused);
  const v = store.products.find(p => p.variants.some(x => x.in_stock)).variants.find(x => x.in_stock);
  const o = await custCtx.request.post(BASE + "/api/orders", { headers: { "content-type": "application/json" }, data: { name: "Paused Check", phone: "9000000001", address: "test", locality: "", pincode: "", idempotency_key: "pausecheck" + Date.now(), items: [{ variant_id: v.id, qty: 1, price_paise: v.price_paise }] } });
  log("order while paused:", o.status(), (await o.json()).code);
  // admin read-only + export
  await a.goto(BASE + "/admin", { waitUntil: "networkidle" }); await a.waitForSelector("#svcBanner.paused"); await a.waitForTimeout(400);
  await a.screenshot({ path: OUT + "/admin-paused-readonly.png" });
  const csv = await adminCtx.request.get(BASE + "/api/admin/csv"); const ocsv = await adminCtx.request.get(BASE + "/api/admin/orders.csv");
  log("exports while paused:", csv.status(), (await csv.text()).split("\n").length - 1, "item rows;", ocsv.status(), (await ocsv.text()).split("\n").length - 1, "order rows");
  const w = await adminCtx.request.put(BASE + "/api/admin/settings", { headers: { "x-requested-with": "kirana", "content-type": "application/json" }, data: { announcement_en: "x" } });
  log("admin write while paused:", w.status());
  // dev service screenshot showing the log
  await d.click('[data-tab="health"]'); await d.waitForTimeout(300); await d.click('[data-tab="service"]'); await d.waitForSelector(".svc-hero.paused"); await d.waitForTimeout(300);
  await d.screenshot({ path: OUT + "/dev-service-paused.png" });
} finally {
  // --- always resume to the previous state
  try {
    const r = await devPost({ action: "resume", note: "screenshot check done — back to active" });
    log("resumed:", r.service.status);
    const d2 = await devCtx.newPage(); await d2.goto(BASE + "/dev", { waitUntil: "networkidle" });
    await d2.click('[data-tab="service"]'); await d2.waitForSelector(".svc-hero.active"); await d2.waitForTimeout(400);
    await d2.screenshot({ path: OUT + "/dev-service-control.png" });
    await d2.screenshot({ path: OUT + "/dev-service-control-full.png", fullPage: true });
    const c2 = await custCtx.newPage(); const rr = await c2.goto(BASE + "/?v=" + Date.now(), { waitUntil: "networkidle" }); log("customer after resume:", rr.status());
  } catch (e) { console.error("RESUME FAILED", e); process.exitCode = 1; }
  await b.close();
}
