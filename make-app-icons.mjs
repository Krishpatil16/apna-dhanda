import { chromium } from "playwright-core";
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
// v10.5: one icon per installable app so Dev, Dukaan and each shop's customer app look different on the home screen.
const shop = (aw1, aw2, body, door) => `
  <path d="M12 16h40l-2 9H14z" fill="${aw1}"/>
  <path d="M17 16h6l-1 9h-6zM29 16h6v9h-6zM41 16h6l2 9h-6z" fill="${aw2}"/>
  <path d="M14 25a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0z" fill="${aw1}"/>
  <rect x="15" y="27" width="34" height="22" rx="2" fill="${body}"/>
  <rect x="27" y="34" width="10" height="15" rx="1.5" fill="${door}"/>
  <rect x="18.5" y="31" width="6" height="7" rx="1" fill="#93c5fd"/><rect x="39.5" y="31" width="6" height="7" rx="1" fill="#93c5fd"/>`;
const designs = {
  dev: { bg: ["#1e1b4b", "#6d28d9"], g: `
    <g transform="translate(32 25) scale(.62) translate(-32 -32)">${shop("#ffffff", "#c4b5fd", "#ede9fe", "#7c3aed")}</g>
    <rect x="13" y="39" width="38" height="15" rx="7.5" fill="#facc15"/>
    <text x="32" y="50.5" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="11.5" fill="#1e1b4b" letter-spacing=".6">DEV</text>` },
  admin: { bg: ["#14532d", "#22a052"], g: shop("#f97316", "#ffffff", "#ffffff", "#f97316") + `
    <circle cx="48" cy="47" r="8" fill="#facc15" stroke="#14532d" stroke-width="1.6"/><text x="48" y="51" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="10" fill="#14532d">₹</text>` },
  shop: { bg: ["#f97316", "#db2777"], g: `
    <path d="M24 24v-3a8 8 0 0 1 16 0v3" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M17 24h30l-2.5 27a3 3 0 0 1-3 2.7H22.5a3 3 0 0 1-3-2.7z" fill="#ffffff"/>
    <circle cx="28" cy="39" r="5.5" fill="#ef4444"/><path d="M28 33.5c0-2 1-3.2 3-3.6" stroke="#15803d" stroke-width="1.6" fill="none"/>
    <path d="M33 40c3-6 9-6 10-1-2 4-7 5-10 1z" fill="#facc15"/><rect x="24" y="45" width="16" height="3" rx="1.5" fill="#22a052"/>` },
};
const svg = (d, round, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d.bg[0]}"/><stop offset="1" stop-color="${d.bg[1]}"/></linearGradient></defs>
  <rect width="64" height="64" rx="${round}" fill="url(#b)"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${d.g}</g></svg>`;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const p = await b.newPage();
for (const [k, d] of Object.entries(designs)) {
  const files = { [`app-${k}-192.png`]: [192, svg(d, 14)], [`app-${k}-512.png`]: [512, svg(d, 14)], [`app-${k}-maskable-512.png`]: [512, svg(d, 0, .8)], [`app-${k}-180.png`]: [180, svg(d, 0)] };
  for (const [name, [size, s]] of Object.entries(files)) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: `site/${name}`, omitBackground: true });
  }
}
await b.close(); console.log("app icons ok");
