
import { chromium } from "playwright-core";
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "hi-IN" });
const p = await ctx.newPage(); await p.goto(process.env.BASE + "/?v=" + Date.now(), { waitUntil: "networkidle" }); await p.waitForSelector(".offer-card"); await p.waitForTimeout(500);
await p.screenshot({ path: process.env.OUT + "/home-offers-strip.png" });
await p.evaluate(() => document.querySelector(".card:has(.offer-tag)").scrollIntoView({ block: "center" })); await p.waitForTimeout(300);
await p.screenshot({ path: process.env.OUT + "/home-offer-tag-on-card.png" });
await b.close();
