// v6 "Apna Dhanda" check at 390px. BASE=.. OUT=.. DEV_PASS=.. SLUG=test-ad-dukan MOBILE=9000011111 LOGO=/path.png node test/ui-ad.mjs
import { chromium } from "playwright-core";
const { BASE, OUT, DEV_PASS, LOGO } = process.env; const SLUG = process.env.SLUG || "test-ad-dukan", MOBILE = process.env.MOBILE || "9000011111";
const exe = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const mk = () => b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "hi-IN" });
const errors = [], log = {};
const watch = (p, n) => { p.on("pageerror", e => errors.push(n + ": " + e.message)); p.on("console", m => { if (m.type() === "error" && !/favicon|404|503/.test(m.text())) errors.push(n + ": " + m.text()); }); return p; };
try {
// 1. landing
const lp = watch(await (await mk()).newPage(), "landing");
await lp.goto(BASE + "/", { waitUntil: "networkidle" }); await lp.screenshot({ path: `${OUT}/ad-landing.png` });
log.landing = { reg: await lp.isVisible("#reg"), login: await lp.isVisible("#login"), shopLeak: /\/s\/|mahesh/i.test(await lp.content()), title: await lp.title() };
await lp.click("#reg"); await lp.waitForSelector("#on");
// 2. signup → pending
await lp.fill("#on", "Ravi Test"); await lp.fill("#sn", "TEST – Apna Dukan"); await lp.fill("#sl", SLUG); await lp.fill("#mo", MOBILE); await lp.fill("#p", "testpass123");
await lp.click("#f button.btn-primary"); await lp.waitForSelector("#rk"); await lp.click("#go"); await lp.waitForSelector("#shopBar:not([hidden]) #onSw");
log.pending = { switchDisabled: await lp.isDisabled("#onSw"), bar: (await lp.innerText("#shopBar")).split("\n").slice(0, 3).join(" | ") };
// 3. developer approves
const dv = watch(await (await mk()).newPage(), "dev");
await dv.goto(BASE + "/dev", { waitUntil: "networkidle" }); await dv.fill("#u", "krish-dev"); await dv.fill("#p", DEV_PASS); await dv.click("form button");
await dv.waitForSelector("#tabs:not([hidden])"); await dv.click('[data-tab="shops"]'); await dv.waitForSelector(".shop-card"); await dv.waitForSelector("#brandCard #ieName");
await dv.locator(".shop-card", { hasText: "TEST – Apna Dukan" }).locator('[data-a="approve"]').click(); await dv.waitForTimeout(3200);
await dv.screenshot({ path: `${OUT}/ad-dev-brand.png` });
log.dev = { brandName: await dv.inputValue("#brandCard #ieName"), cards: await dv.locator(".shop-card").count() };
// 4. storefront offline until the switch
const cu = watch(await (await mk()).newPage(), "customer");
let r = await cu.goto(`${BASE}/s/${SLUG}`, { waitUntil: "networkidle" }); log.offline = { status: r.status(), closed: (await cu.content()).includes("अभी बंद है") };
await lp.reload({ waitUntil: "networkidle" }); await lp.waitForSelector("#onSw:not([disabled])");
await lp.click(".sb-sw"); await lp.waitForSelector(".sb-st.on"); await lp.waitForTimeout(400);
log.online = { bar: (await lp.innerText("#shopBar")).split("\n").slice(0, 4).join(" | "), link: await lp.textContent("#custUrl"), wa: await lp.getAttribute(".sb-wa", "href") };
await lp.evaluate(() => window.scrollTo(0, 0)); await lp.screenshot({ path: `${OUT}/ad-admin-online-link.png` });
// 5. home-screen app: logo + name with live preview
await lp.click("#sbApp"); await lp.waitForSelector("#hsName");
await lp.fill("#hsName", "Apna Dukan"); if (LOGO) await lp.setInputFiles("#hsFile", LOGO); await lp.waitForTimeout(700);
await lp.screenshot({ path: `${OUT}/ad-homescreen-settings.png` });
log.preview = { name: await lp.textContent("#hsNm"), img: await lp.locator("#hsIc img").count() };
await lp.click("#hsF button[type=submit]"); await lp.waitForSelector("#sheet[hidden]", { state: "attached" }); await lp.waitForTimeout(500);
// 6. sticker picker → item
await lp.waitForTimeout(2600); await lp.click('[data-tab="products"]'); await lp.waitForSelector("#addP"); await lp.click("#addP"); await lp.waitForSelector("#stkGrid .stk");
await lp.locator("#stkTabs button").nth(2).click(); await lp.locator("#stkGrid .stk").first().click(); await lp.waitForTimeout(300);
log.sticker = { name_hi: await lp.inputValue("#nh"), name_en: await lp.inputValue("#ne"), cat: await lp.locator("#cat option:checked").textContent(), count: await lp.evaluate(() => window.AK_STICKERS.flatMap(g => g.items).length) };
await lp.screenshot({ path: `${OUT}/ad-sticker-picker.png` });
await lp.fill("#vrows [name=label]", "1 kg"); await lp.fill("#vrows [name=price]", "20"); await lp.fill("#vrows [name=stock]", "10"); await lp.click("#pf2 button[type=submit]"); await lp.waitForTimeout(1200); log.saveErr = await lp.locator("#perr2").count() ? await lp.textContent("#perr2") : "";
// 7. storefront live with the item + its own manifest
r = await cu.goto(`${BASE}/s/${SLUG}`, { waitUntil: "networkidle" }); await cu.waitForTimeout(800);
log.store = { status: r.status(), hasItem: (await cu.content()).includes(log.sticker.name_hi), manifest: await cu.getAttribute('link[rel="manifest"]', "href"), apple: await cu.getAttribute('link[rel="apple-touch-icon"]', "href") };
const mf = await (await cu.request.get(`${BASE}/s/${SLUG}/manifest.webmanifest`)).json();
log.manifest = { name: mf.name, short_name: mf.short_name, start_url: mf.start_url, scope: mf.scope, icons: mf.icons.map(i => i.src + " " + (i.purpose || "")) };
await cu.screenshot({ path: `${OUT}/ad-storefront.png` });
} catch (e) { errors.push("FATAL " + e.message); }
console.log(JSON.stringify({ log, errors }, null, 1)); await b.close();
