
// Real end-to-end Web Push test in Chrome: subscribe -> place order -> push arrives in the service worker (and shows a notification).
import { chromium } from "playwright-core";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const BASE = process.env.BASE, OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "akprof-")), { executablePath: exe, headless: !process.env.HEADFUL, args: ["--no-sandbox"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.grantPermissions(["notifications"], { origin: BASE });
const R = { steps: [] }; const step = (k, v) => { R.steps.push({ k, v, t: new Date().toISOString() }); console.log(k, JSON.stringify(v)); };
const lastPush = page => page.evaluate(async () => { const c = await caches.open("ak-push-log"); const r = await c.match("/__last-push"); return r ? r.json() : null; });
const shown = page => page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return (await reg.getNotifications()).map(n => ({ title: n.title, body: n.body, tag: n.tag })); });
async function waitPush(page, pred, ms = 60000){ const end = Date.now() + ms; while (Date.now() < end) { const p = await lastPush(page); if (p && pred(p)) return p; await page.waitForTimeout(1000); } return null; }
// 1. bhaiya enables order alerts from the admin panel
const admin = await ctx.newPage();
admin.on("pageerror", e => step("admin pageerror", e.message));
await admin.goto(BASE + "/admin", { waitUntil: "networkidle" });
if (await admin.locator("#u").count()) { await admin.fill("#u", process.env.AUSER); await admin.fill("#p", process.env.APASS); await admin.click("#f button.btn-primary"); }
await admin.waitForSelector("#alertsCard .alerts", { timeout: 20000 });
const t0 = Date.now();
if (await admin.locator("#alOn").count()) await admin.click("#alOn");
await admin.waitForSelector("#alertsCard .alerts.on", { timeout: 30000 }).catch(() => {});
step("admin alerts card", (await admin.locator("#alertsCard").innerText()).slice(0, 160));
const testPush = await waitPush(admin, p => p.tag === "test" && p.received_at > t0);
step("admin test push received in service worker", testPush ? { title: testPush.title, after_ms: testPush.received_at - t0 } : null);
await admin.screenshot({ path: `${OUT}/e2e-1-admin-alerts-on.png` });
// 2. a customer places an order (same browser profile; separate page)
const cust = await ctx.newPage(); cust.on("pageerror", e => step("cust pageerror", e.message));
await cust.goto(BASE + "/", { waitUntil: "networkidle" }); await cust.waitForSelector(".card");
const t1 = Date.now();
const placed = await cust.evaluate(async () => {
  const s = await (await fetch("/api/store")).json(); const p = s.products.find(p => p.variants.some(v => v.in_stock)); const v = p.variants.find(v => v.in_stock);
  const idem = "e2e" + crypto.randomUUID().replace(/-/g, "");
  const r = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "TEST - automated push check", phone: "9876543210", address: "Test house (automated push test)", locality: "Test", pincode: "", items: [{ variant_id: v.id, qty: 1, price_paise: v.price_paise }], payment_method: "cod", idempotency_key: idem }) });
  const j = await r.json(); if (j.token) { const mine = JSON.parse(localStorage.getItem("ak_orders") || "[]"); mine.unshift({ code: j.order.code, token: j.token, at: j.order.created_at, total: j.order.total_paise }); localStorage.setItem("ak_orders", JSON.stringify(mine)); }
  return { status: r.status, code: j.order && j.order.code, token: j.token, total: j.order && j.order.total_paise };
});
step("order placed", { status: placed.status, code: placed.code });
const newOrderPush = await waitPush(admin, p => p.tag === "new-" + placed.code);
step("bhaiya's 'new order' push received in service worker", newOrderPush ? { title: newOrderPush.title, body: newOrderPush.body, url: newOrderPush.url, after_ms: newOrderPush.received_at - t1 } : null);
step("notifications shown by the service worker", await shown(admin));
// 3. the customer turns on order updates for this order (the real UI button on the order page)
await cust.goto(`${BASE}/track#${placed.code}.${placed.token}`, { waitUntil: "networkidle" }); await cust.waitForSelector("#notifBox .nbox", { timeout: 15000 });
if (await cust.locator("#notifBox button").count()) await cust.click("#notifBox button");
await cust.waitForSelector("#notifBox .nbox.on", { timeout: 30000 }).catch(() => {});
step("customer notif box", (await cust.locator("#notifBox").innerText()).slice(0, 160));
await cust.screenshot({ path: `${OUT}/e2e-2-customer-updates-on.png` });
// 4. bhaiya moves the order through every status; each one should reach the customer's service worker
const id = await admin.evaluate(async code => { const r = await fetch(`/api/admin/orders?status=all&q=${code}`); const j = await r.json(); return j.orders[0].id; }, placed.code);
const FLOW = (process.env.FLOW || "accepted,preparing,out_for_delivery,delivered").split(",");
for (const st of FLOW) {
  const t2 = Date.now();
  const r = await admin.evaluate(async ([id, st]) => (await fetch(`/api/admin/orders/${id}/status`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "kirana" }, body: JSON.stringify({ status: st, reason: st === "cancelled" ? "Automated push test order (not real)" : "" }) })).status, [id, st]);
  const got = await waitPush(cust, p => p.tag === "order-" + placed.code && p.received_at > t2, 45000);
  step(`customer push for '${st}'`, { api: r, received: got ? { title: got.title, body: got.body, after_ms: got.received_at - t2 } : null });
}
await cust.goto(BASE + "/track", { waitUntil: "networkidle" }); await cust.waitForTimeout(800);
await cust.screenshot({ path: `${OUT}/e2e-3-my-orders-after.png` });
const log = await admin.evaluate(async () => (await (await fetch("/api/admin/push")).json()).attempts.slice(0, 8));
step("server attempt log (newest first)", log.map(a => `${a.event} ${a.outcome} ${a.http_status} ${a.push_host}`));
// clean up: remove this test browser's admin subscription
const ep = await admin.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint);
if (ep) step("cleanup admin unsubscribe", await admin.evaluate(async ep => (await fetch("/api/admin/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "kirana" }, body: JSON.stringify({ endpoint: ep }) })).json(), ep));
R.order = placed.code; writeFileSync(`${OUT}/e2e-push-log.json`, JSON.stringify(R, null, 1));
await ctx.close();
