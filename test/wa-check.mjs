
import { chromium } from "playwright-core";
const B = process.env.BASE; const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const br = await chromium.launch({ executablePath: exe, args:["--no-sandbox"] }); const ctx = await br.newContext({viewport:{width:390,height:844}});
const a = await ctx.newPage(); await a.goto(B + "/admin"); await a.fill("#u", process.env.U); await a.fill("#p", process.env.P); await a.click("button.btn-primary"); await a.waitForSelector(".a-tabs:not([hidden])");
const api = (path, method, body) => a.evaluate(async ([path, method, body]) => { const r = await fetch(path, {method, headers:{"content-type":"application/json","x-requested-with":"kirana"}, body: body ? JSON.stringify(body) : undefined}); return r.json(); }, [path, method, body]);
// cancel the e2e test order(s) so the demo starts clean
const o = await api("/api/admin/orders?status=active", "GET");
for (const x of o.orders.filter(x => x.customer_name === "Ramesh Test")) console.log("cancel", x.code, (await api(`/api/admin/orders/${x.id}/status`, "POST", {status:"cancelled", from:x.status, reason:"Test order (demo check)"})).ok);
// WhatsApp link with a shop number set
console.log("set wa", (await api("/api/admin/settings", "PUT", {whatsapp:"9876500000"})).ok);
const c = await ctx.newPage(); await c.goto(B + "/"); await c.waitForSelector("[data-add]"); await c.locator("[data-add]").first().click(); await c.click("#cartbar"); await c.click('[data-go="checkout"]');
await c.fill("#name","WA Check"); await c.fill("#phone","9876543210"); await c.fill("#address","Gali 3"); await c.click("#placeBtn"); await c.waitForSelector("#waBtn");
const href = await c.getAttribute("#waBtn","href"); console.log("WA:", href.split("?")[0], "| label:", (await c.textContent("#waBtn")).trim());
console.log(decodeURIComponent(href.split("text=")[1]));
const o2 = await api("/api/admin/orders?status=active", "GET");
for (const x of o2.orders.filter(x => x.customer_name === "WA Check")) console.log("cancel", x.code, (await api(`/api/admin/orders/${x.id}/status`, "POST", {status:"cancelled", from:x.status, reason:"Test order (demo check)"})).ok);
console.log("reset wa", (await api("/api/admin/settings", "PUT", {whatsapp:""})).ok);
await br.close();
