
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const BASE = process.env.BASE, OUT = process.env.OUT, USER = process.env.AUSER, PASS = process.env.APASS;
mkdirSync(OUT, { recursive: true });
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "hi-IN",
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36" });
const errors = []; const log = {};
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push("pageerror: " + e.message));
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".card");
log.offersVisible = await page.locator("#offers").isVisible();
log.offerCards = await page.locator(".offer-card").count();
log.offerTags = await page.locator(".card .offer-tag").count();
await page.screenshot({ path: `${OUT}/1-home-offers.png` });
// tap first offer -> filtered items
if (log.offerCards) { await page.locator(".offer-card").first().click(); await page.waitForTimeout(500); log.offerFilterItems = await page.locator(".offer-filter + .grid .card").count(); await page.screenshot({ path: `${OUT}/1b-offer-items.png` }); await page.locator("[data-offer-clear]").click(); }
// add an offer item + place order through the real UI
const tagged = page.locator(".card:has(.offer-tag) [data-add]").first();
if (await tagged.count()) await tagged.click(); else await page.locator(".card [data-add]").first().click();
await page.locator(".card [data-add]").nth(2).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/2-home-cart.png` });
await page.locator("#cartbar").click(); await page.waitForTimeout(300);
await page.locator("[data-go=checkout]").click(); await page.waitForTimeout(300);
const fill = async (id, v) => { const el = page.locator("#" + id); if (await el.count()) await el.fill(v); };
await fill("c_name", "TEST - screenshot order"); await fill("c_phone", "9876543210"); await fill("c_address", "House 7, Gali 2"); await fill("c_locality", "Shanti Nagar"); await fill("c_pincode", "452001");
const ids = await page.$$eval("#sheetBody input, #sheetBody textarea", els => els.map(e => e.id)); log.checkoutFields = ids;
for (const id of ids) { const v = await page.inputValue("#" + id).catch(() => ""); if (!v) { if (/name/.test(id)) await fill(id, "TEST - screenshot order"); else if (/phone|mobile/.test(id)) await fill(id, "9876543210"); else if (/addr/.test(id)) await fill(id, "House 7, Gali 2"); else if (/local/.test(id)) await fill(id, "Shanti Nagar"); else if (/pin/.test(id)) await fill(id, "452001"); } }
await page.screenshot({ path: `${OUT}/3-checkout.png` });
await page.locator("#sheetBody form button[type=submit], #sheetBody [type=submit]").first().click();
await page.waitForSelector(".done", { timeout: 15000 });
await page.waitForTimeout(800);
log.doneHasNotif = await page.locator("#notifBox .nbox").count();
log.doneNotifText = (await page.locator("#notifBox").innerText()).slice(0, 200);
await page.screenshot({ path: `${OUT}/4-order-sent.png` });
log.orders = await page.evaluate(() => JSON.parse(localStorage.getItem("ak_orders")));
await page.goto(BASE + "/", { waitUntil: "networkidle" }); await page.waitForTimeout(800);
log.liveOrderStrip = await page.locator("#liveOrder").isVisible();
log.ordersBadge = await page.locator(".myord-btn .nbadge").innerText().catch(() => "");
await page.screenshot({ path: `${OUT}/5-home-live-order.png` });
await page.goto(BASE + "/track", { waitUntil: "networkidle" }); await page.waitForSelector(".mo-card");
log.myOrdersCards = await page.locator(".mo-card").count();
await page.screenshot({ path: `${OUT}/6-my-orders.png` });
await page.locator(".mo-card").first().click(); await page.waitForSelector(".timeline, .notice"); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/7-order-detail.png`, fullPage: true });
// admin
const ap = await ctx.newPage(); ap.on("pageerror", e => errors.push("admin pageerror: " + e.message)); ap.on("console", m => { if (m.type() === "error") errors.push("admin: " + m.text()); });
await ap.goto(BASE + "/admin", { waitUntil: "networkidle" });
if (await ap.locator("input[type=password]").count()) {
  await ap.fill("#u", USER); await ap.fill("#p", PASS); await ap.click("#f button.btn-primary"); }
await ap.waitForSelector(".order", { timeout: 15000 }); await ap.waitForTimeout(1200);
log.alertsCard = (await ap.locator("#alertsCard").innerText()).slice(0, 300);
await ap.screenshot({ path: `${OUT}/8-admin-orders-alerts.png` });
await ap.locator("[data-tab=offers]").click(); await ap.waitForSelector(".of-row, .a-card.empty"); await ap.waitForTimeout(400);
log.adminOfferRows = await ap.locator(".of-row").count();
await ap.screenshot({ path: `${OUT}/9-admin-offers.png`, fullPage: true });
await ap.locator("#addO").click(); await ap.waitForTimeout(400);
await ap.locator("#okind").selectOption("price"); await ap.locator("#opq").fill("आटा"); await ap.waitForTimeout(200);
await ap.screenshot({ path: `${OUT}/10-admin-offer-editor.png` });
await ap.locator("#sheetClose").click();
await ap.locator("[data-tab=settings]").click(); await ap.waitForSelector("#alertsFull .alerts"); await ap.waitForTimeout(400);
await ap.locator("#alertsFull").scrollIntoViewIfNeeded();
await ap.screenshot({ path: `${OUT}/11-admin-settings-alerts.png` });
log.errors = errors;
writeFileSync(`${OUT}/smoke-log.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
await b.close();
