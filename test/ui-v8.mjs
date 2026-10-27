
import { chromium } from "playwright-core";
const exe = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const { BASE, DUSER, DPASS, OUT, SETUP_KEY, MOB } = process.env;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const dev = await b.newContext({ ...phone, locale: "en-IN" }), adm = await b.newContext({ ...phone, locale: "hi-IN" }), cus = await b.newContext({ ...phone, locale: "hi-IN" });
const log = (...a) => console.log(...a); const errs = [];
const DH = { "x-requested-with": "kirana-dev", "content-type": "application/json" }, AH = { "x-requested-with": "kirana", "content-type": "application/json" };
const dpost = async (p, data) => { const r = await dev.request.post(BASE + p, { headers: DH, data }); const j = await r.json(); if (!r.ok()) throw new Error(p + " " + JSON.stringify(j)); return j; };
const dget = async p => (await dev.request.get(BASE + p)).json();
let shopId = null; const mob = MOB || "9000044444";
try {
  if (SETUP_KEY) await adm.request.post(BASE + "/api/admin/setup", { headers: AH, data: { setup_key: SETUP_KEY, username: "bhaiya", password: "strongpass1" } }).then(r => log("setup", r.status()));
  await dpost("/api/dev/login", { username: DUSER, password: DPASS }); log("dev login ok");
  const plat0 = (await dget("/api/dev/platform")).platform; log("platform before", JSON.stringify({price: plat0.price_paise, months: plat0.months, upi: plat0.upi_id, name: plat0.upi_name, auto: plat0.auto_approve}));
  globalThis.__plat0 = plat0;
  // 1. signup TEST shop through the UI
  const ap = await adm.newPage(); ap.on("pageerror", e => errs.push("admin: " + e.message));
  await ap.goto(BASE + "/admin#signup"); await ap.waitForTimeout(1200);
  const r = await adm.request.post(BASE + "/api/admin/signup", { headers: AH, data: { owner_name: "TEST Owner", shop_name: "TEST – Subscription Dukaan", mobile: mob, password: "testpass123" } });
  const sj = await r.json(); if (r.status() !== 201) throw new Error("signup " + JSON.stringify(sj)); shopId = sj.shop.id; log("signup", shopId, sj.shop.status, sj.shop.slug);
  if (sj.shop.status === "pending") await dpost("/api/dev/service", { shop_id: shopId, action: "approve" });
  await adm.request.post(BASE + "/api/admin/online", { headers: AH, data: { online: true } });
  await ap.goto(BASE + "/admin"); await ap.waitForTimeout(1500);
  const st1 = await (await adm.request.get(BASE + "/api/admin/state")).json(); log("shopkeeper sees", st1.service.sub.state, "trial till", new Date(st1.service.sub.trial_end).toISOString());
  // 2. dev home + shop page
  const dp = await dev.newPage(); dp.on("pageerror", e => errs.push("dev: " + e.message));
  await dp.goto(BASE + "/dev#home"); await dp.waitForSelector(".kpi"); await dp.waitForTimeout(600); await dp.screenshot({ path: OUT + "/sub-dev-home.png", fullPage: true }); log("shot dev home");
  // set UPI (temporarily if live) so the pay screen has a QR
  await dpost("/api/dev/platform", { upi_id: process.env.TEST_UPI || "krishpatil@upi", upi_name: "Krish Patil" });
  // 3. force expiry via dev
  const ex = await dpost(`/api/dev/shops/${shopId}/subscription`, { action: "expire_now" }); log("after expire", ex.sub.state, ex.service.status);
  const cp = await cus.newPage(); const sres = await cp.goto(BASE + "/s/" + sj.shop.slug); log("storefront status", sres.status(), (await cp.textContent("body")).includes("दुकान अभी बंद है") ? "closed page OK" : "NO closed text");
  const stj = await (await cus.request.get(BASE + "/api/store", { headers: { "x-shop": sj.shop.slug } })).json(); log("store api while expired: service_paused", stj.service_paused, "status", stj.shop && stj.shop.status);
  // 4. send bill from dev (UI button)
  await dp.click('#tabs [data-tab="shops"]'); await dp.waitForSelector(".shop-card");
  await dp.click(`.shop-card[data-id="${shopId}"] [data-a="sub"]`); await dp.waitForSelector(".sub-hero"); await dp.click('[data-x="bill"]'); await dp.waitForSelector(".once"); await dp.waitForTimeout(300);
  const wa = await dp.getAttribute(".once a.b-green", "href"); log("WA link", wa.slice(0, 60) + "…", decodeURIComponent(wa.split("text=")[1] || "").includes("/admin#recharge") ? "has pay link" : "NO pay link");
  await dp.screenshot({ path: OUT + "/sub-dev-bill.png" }); await dp.click("#onceOk"); await dp.waitForSelector(".sub-hero"); await dp.waitForTimeout(400);
  await dp.screenshot({ path: OUT + "/sub-dev-shop.png", fullPage: true }); log("shot dev shop");
  // 5. shopkeeper: recharge screen only
  await ap.goto(BASE + "/admin"); await ap.waitForSelector(".recharge"); await ap.waitForTimeout(800);
  const tabsHidden = await ap.$eval("#tabs", e => e.hidden); const qr = await ap.$("#upiQR"); const upi = await ap.getAttribute("#upiBtn", "href"); log("recharge screen: tabs hidden", tabsHidden, "QR", !!qr, "upi", upi);
  const blocked = await adm.request.get(BASE + "/api/admin/orders"); log("admin orders api while expired", blocked.status());
  await ap.screenshot({ path: OUT + "/sub-shop-recharge.png", fullPage: true }); log("shot recharge");
  // 6. UTR submit through the UI
  const utr = String(Date.now()).slice(-12).padStart(12, "7");
  await ap.fill("#utr", utr); await ap.click("#utrBtn"); await ap.waitForSelector(".rc-ok", { timeout: 10000 }); log("UTR submitted", utr);
  const st2 = await (await adm.request.get(BASE + "/api/admin/state")).json(); log("after UTR", st2.service.sub.state, st2.service.status);
  const s2 = await cp.goto(BASE + "/s/" + sj.shop.slug); log("storefront after UTR", s2.status());
  await ap.screenshot({ path: OUT + "/sub-shop-submitted.png", fullPage: true });
  // 7. dev verify
  await dp.click('#tabs [data-tab="payments"]'); await dp.waitForSelector(".pay-card"); await dp.waitForTimeout(300);
  await dp.screenshot({ path: OUT + "/sub-dev-verify.png", fullPage: true }); log("shot verify");
  await dp.click(`.pay-card [data-a="verify"]`); await dp.waitForTimeout(1500);
  const st3 = await (await adm.request.get(BASE + "/api/admin/state")).json(); log("after verify", st3.service.sub.state, "paid till", new Date(st3.service.sub.paid_until).toISOString());
  await dp.click('#tabs [data-tab="home"]'); await dp.waitForSelector(".kpi"); await dp.waitForTimeout(500); await dp.screenshot({ path: OUT + "/sub-dev-home-after.png", fullPage: true });
  // 8. splash / app launch: open the shop's home-screen app start page + manifest
  const mf = await (await cus.request.get(BASE + `/s/${sj.shop.slug}/manifest.webmanifest`)).json(); log("shop manifest icons", JSON.stringify(mf.icons.map(i => i.src)));
  const lp = await cus.newPage(); await lp.goto(BASE + "/admin"); await lp.waitForTimeout(150); await lp.screenshot({ path: OUT + "/sub-splash.png" });
} catch (e) { log("FAIL", e.message); process.exitCode = 1; }
finally {
  try {
    if (process.env.RESTORE_UPI === "1" && globalThis.__plat0) { const p0 = globalThis.__plat0; await dpost("/api/dev/platform", { upi_id: p0.upi_id, upi_name: p0.upi_name }); log("UPI restored to", JSON.stringify(p0.upi_id)); }
    if (shopId && process.env.KEEP !== "1") { const sh = (await dget(`/api/dev/shops/${shopId}`)).shop; await dpost("/api/dev/shops/delete", { shop_id: shopId, confirm: sh.slug }); log("TEST shop deleted", sh.slug); }
  } catch (e) { log("cleanup FAIL", e.message); }
  log("page errors", JSON.stringify(errs)); await b.close();
}
