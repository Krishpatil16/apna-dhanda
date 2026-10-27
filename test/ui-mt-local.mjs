// v5 multi-shop check in a real browser at 390px against the local server (node dev-server.mjs).
// BASE=http://localhost:8799 OUT=/dir DEV_PASS=.. ADMIN_PASS=.. node test/ui-mt-local.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE, OUT = process.env.OUT;
const exe = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const mk = () => b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "hi-IN" });
const errors = []; const log = {};
const watch = (p, n) => { p.on("pageerror", e => errors.push(n + ": " + e.message)); p.on("console", m => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push(n + ": " + m.text()); }); return p; };
// 1. new shopkeeper signs up
const sk = watch(await (await mk()).newPage(), "signup");
await sk.goto(BASE + "/admin", { waitUntil: "networkidle" });
await sk.click("#signup"); await sk.waitForSelector("#on");
await sk.fill("#on", "Ravi Test"); await sk.fill("#sn", "TEST – दुकान"); await sk.fill("#sl", "test-dukan"); await sk.fill("#mo", "9000011111"); await sk.fill("#p", "testpass123");
await sk.screenshot({ path: `${OUT}/mt-signup.png` });
await sk.click("#f button.btn-primary"); await sk.waitForSelector("#rk");
log.recovery_shown = /^[A-Z0-9-]{14}$/.test((await sk.textContent("#rk")).trim()); log.link = await sk.locator(".auth a[target]").first().textContent();
await sk.screenshot({ path: `${OUT}/mt-signup-done.png` });
await sk.click("#go"); await sk.waitForSelector(".a-tabs:not([hidden])");
log.greeting = await sk.textContent("#aUser"); log.banner = (await sk.locator("#svcBanner").innerText()).split("\n")[0];
// 2. Krish approves in /dev
const dv = watch(await (await mk()).newPage(), "dev");
await dv.goto(BASE + "/dev", { waitUntil: "networkidle" });
await dv.fill("#u", "krish-dev"); await dv.fill("#p", process.env.DEV_PASS); await dv.click("button[type=submit], form button");
await dv.waitForSelector("#tabs:not([hidden])"); await dv.click('[data-tab="shops"]'); await dv.waitForSelector(".shop-card");
await dv.waitForTimeout(300); await dv.screenshot({ path: `${OUT}/mt-dev-shops.png`, fullPage: true });
log.dev_cards = await dv.locator(".shop-card").count();
await dv.locator(".shop-card", { hasText: "TEST – दुकान" }).locator('[data-a="approve"]').click(); await dv.waitForTimeout(800);
log.dev_after = await dv.locator(".shop-card", { hasText: "TEST – दुकान" }).locator(".pill").textContent();
await dv.screenshot({ path: `${OUT}/mt-dev-shops-approved.png`, fullPage: true });
// 3. the new shop adds an item (through its own panel)
await sk.reload({ waitUntil: "networkidle" }); await sk.waitForSelector(".a-tabs:not([hidden])");
log.banner_after = await sk.locator("#svcBanner").isVisible();
await sk.click('[data-tab="settings"]'); await sk.waitForSelector("#s_phone"); await sk.fill("#s_phone", "9000011111"); await sk.click("#sf button.btn-primary"); await sk.waitForTimeout(800);
await sk.click('[data-tab="products"]'); await sk.waitForSelector("#addP");
await sk.click("#addP"); await sk.fill("#nh", "TEST चावल"); await sk.fill("#ne", "TEST Rice");
await sk.fill('#vrows [name=label]', "1 kg"); await sk.fill('#vrows [name=price]', "60"); await sk.fill('#vrows [name=stock]', "20");
await sk.click('#pf2 button[type=submit]'); await sk.waitForTimeout(900);
// 4. customer orders on the new shop's own link
const cu = watch(await (await mk()).newPage(), "customer");
await cu.goto(BASE + "/s/test-dukan", { waitUntil: "networkidle" }); await cu.waitForSelector(".card");
log.store_cards = await cu.locator(".card").count(); log.store_title = await cu.title();
await cu.waitForTimeout(600); await cu.screenshot({ path: `${OUT}/mt-storefront.png` });
await cu.locator(".card", { hasText: "TEST" }).first().locator("[data-add]").click();
await cu.click("#cartbar"); await cu.waitForSelector("#sheet .line"); await cu.click('[data-go="checkout"]'); await cu.waitForSelector("#coForm");
await cu.fill("#name", "TEST – customer"); await cu.fill("#phone", "9876543210"); await cu.fill("#address", "TEST address, Gali 1"); if (await cu.locator("#locality").count()) await cu.fill("#locality", "Test Nagar");
await cu.click("#placeBtn"); await cu.waitForSelector(".done .code");
const code = (await cu.textContent(".done .code")).trim(); log.order = code;
log.cart_key_scoped = await cu.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("ak_")).join(","));
// 5. it shows in the TEST shop's admin…
await sk.click('[data-tab="orders"]'); await sk.waitForSelector(".order"); await sk.waitForTimeout(400);
log.in_own_admin = await sk.locator(".order", { hasText: code }).count();
await sk.screenshot({ path: `${OUT}/mt-admin-own-orders.png` });
// …and NOT in Mahesh's (shop #1)
const ma = watch(await (await mk()).newPage(), "mahesh");
await ma.goto(BASE + "/admin", { waitUntil: "networkidle" }); await ma.fill("#u", "bhaiya"); await ma.fill("#p", process.env.ADMIN_PASS); await ma.click("#f button.btn-primary");
await ma.waitForSelector(".a-tabs:not([hidden])"); await ma.click('[data-tab="orders"]'); await ma.waitForTimeout(800);
log.mahesh_greeting = await ma.textContent("#aUser");
log.in_mahesh_admin = await ma.getByText(code).count();
await ma.click('[data-filter="all"]').catch(() => {}); await ma.waitForTimeout(500); log.in_mahesh_admin_all = await ma.getByText(code).count();
await ma.screenshot({ path: `${OUT}/mt-admin-mahesh-orders.png` });
// 6. QR poster from the TEST shop's settings
await sk.click('[data-tab="settings"]'); await sk.waitForSelector("#qrPoster");
const [dl] = await Promise.all([sk.waitForEvent("download"), sk.click("#qrPoster")]);
await dl.saveAs(`${OUT}/mt-qr-poster-test.png`); log.poster = dl.suggestedFilename();
await sk.screenshot({ path: `${OUT}/mt-admin-settings.png` });
// root still opens shop #1 and moves the address bar to its own link
await cu.goto(BASE + "/", { waitUntil: "networkidle" }); await cu.waitForSelector(".card"); log.root_url = cu.url();
console.log(JSON.stringify({ log, errors }, null, 1));
await b.close();
