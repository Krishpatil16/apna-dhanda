// End-to-end check in a real browser (mobile viewport). Usage:
// BASE=https://... ADMIN_USER=.. ADMIN_PASS=.. [SETUP_KEY=..] OUT=dir node test/e2e-browser.mjs
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8787"; const OUT = process.env.OUT || "/tmp/kirana-e2e"; mkdirSync(OUT, {recursive:true});
const exe = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: {width:390, height:844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "hi-IN" });
const log = []; const errors = [];
const page = await ctx.newPage(); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); }); page.on("pageerror", e => errors.push(String(e)));
const step = (s, extra="") => { log.push(s + (extra ? " — " + extra : "")); console.log("✔", s, extra); };
const shot = async (p, name, full=false) => { const f = `${OUT}/${name}.png`; await p.screenshot({ path: f, fullPage: full }); step("screenshot " + name); return f; };

// 1. home
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".card");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
step("home loaded", `${await page.locator(".card").count()} product cards, horizontal overflow: ${overflow}`);
await page.waitForTimeout(600);
await shot(page, "1-home");

// 2. admin: setup or login, add an item
const admin = await ctx.newPage(); admin.on("pageerror", e => errors.push("admin: " + e));
await admin.goto(BASE + "/admin", { waitUntil: "networkidle" });
if (await admin.locator("#k").count() && process.env.SETUP_KEY) {
  await admin.fill("#k", process.env.SETUP_KEY); await admin.fill("#u", process.env.ADMIN_USER); await admin.fill("#p", process.env.ADMIN_PASS); await admin.click("button.btn-primary"); step("admin setup");
} else if (await admin.locator("#u").count()) {
  await admin.fill("#u", process.env.ADMIN_USER); await admin.fill("#p", process.env.ADMIN_PASS); await admin.click("button.btn-primary"); step("admin login");
}
await admin.waitForSelector(".a-tabs:not([hidden])");
await admin.click('[data-tab="products"]'); await admin.waitForSelector("#addP");
const NAME = "सूजी " + Date.now().toString().slice(-4);
await admin.click("#addP"); await admin.fill("#nh", NAME); await admin.fill("#ne", "Suji (Rava) TEST");
await admin.fill('#vrows [name=label]', "500 g"); await admin.fill('#vrows [name=price]', "32"); await admin.fill('#vrows [name=stock]', "12");
await admin.click('#icons [data-ic="🥣"]'); await admin.check('input[name=featured]');
await admin.click('#pf2 button[type=submit]'); await admin.waitForSelector("#sheet[hidden]", { state: "attached" });
step("admin added item", NAME);

// 3. customer sees it, adds to cart
await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector(".card");
const newCard = page.locator(".card", { hasText: NAME }); await newCard.first().waitFor();
step("new item visible to customer", NAME);
await newCard.first().locator("[data-add]").click();
await page.locator(".card", { hasText: "Wheat Atta" }).first().locator("[data-open]").first().click().catch(()=>{});
if (await page.locator("#sheet:not([hidden]) [data-add]").count()) { await page.locator("#sheet:not([hidden]) [data-add]").first().click(); await page.click("#sheetClose"); }
const eggs = page.locator(".card", { hasText: /अंडे|Eggs/ }).first(); await eggs.locator("[data-open]").first().click(); await page.locator("#sheet [data-add]").first().click(); await page.locator("#sheet [data-inc]").first().click(); await page.click("#sheetClose");
await page.waitForTimeout(700);
await shot(page, "2-home-with-cart");
await page.click("#cartbar"); await page.waitForSelector("#sheet .line");
step("cart lines", String(await page.locator("#sheet .line").count()));
await page.waitForTimeout(400); await shot(page, "3-cart");
await page.click('[data-go="checkout"]'); await page.waitForSelector("#coForm");
await page.fill("#name", "Ramesh Test"); await page.fill("#phone", "9876543210"); await page.fill("#address", "Makan 12, Gali 3"); await page.fill("#locality", "Shanti Nagar");
await shot(page, "4-checkout");
await page.click("#placeBtn"); await page.waitForSelector(".done .code");
const code = await page.textContent(".done .code"); const wa = await page.getAttribute("#waBtn", "href");
step("order placed", code); step("whatsapp link", wa.slice(0, 160) + "…");
writeFileSync(`${OUT}/whatsapp-link.txt`, decodeURIComponent(wa));
await page.waitForTimeout(500); await shot(page, "5-order-sent");
const trackHref = await page.getAttribute('a[href^="/track#"]', "href");

// 4. admin sees order, accepts it
await admin.click('[data-tab="orders"]'); await admin.waitForSelector(".order");
const card = admin.locator(".order", { hasText: code }); await card.waitFor(); step("order visible in admin", code);
await admin.waitForTimeout(300); await shot(admin, "6-admin-orders");
await card.locator('[data-st="accepted"]').click(); await admin.waitForTimeout(1200);
step("admin accepted order", await admin.locator(".order", { hasText: code }).locator(".badge").textContent());
await admin.click('[data-tab="products"]'); await admin.waitForSelector(".p-row"); await shot(admin, "7-admin-items");

// 5. tracking page reflects status
await page.goto(BASE + trackHref, { waitUntil: "networkidle" }); await page.waitForSelector(".timeline");
step("tracking shows", await page.locator(".timeline li.now b").textContent());
await shot(page, "8-track");

// cleanup: delete test item (keeps demo tidy)
await admin.locator(".p-row", { hasText: NAME }).locator("[data-edit]").click(); admin.once("dialog", d => d.accept()); await admin.click("#delP"); await admin.waitForTimeout(800); step("test item deleted");
step("console errors", errors.length ? errors.join(" | ") : "none");
writeFileSync(`${OUT}/e2e-log.json`, JSON.stringify({ base: BASE, code, log, errors }, null, 1));
await browser.close();
