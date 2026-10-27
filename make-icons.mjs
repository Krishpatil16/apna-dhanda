
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const svg = readFileSync("site/icon.svg", "utf8");
const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "").replace(/<rect[^>]*\/>/, "");
const variants = {
  "icon-192.png": [192, svg], "icon-512.png": [512, svg], "apple-touch-icon.png": [180, svg.replace('rx="15"', 'rx="0"')],
  "icon-maskable-512.png": [512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1f6b3a"/><g transform="translate(9.6 9.6) scale(.7)">${inner}</g></svg>`],
  "badge-96.png": [96, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="9" y="11" width="46" height="13" rx="3" fill="#fff"/><path d="M13 29.5h38v22H13z" fill="#fff"/></svg>`]
};
const p = await b.newPage();
for (const [name, [size, s]] of Object.entries(variants)) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${s.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: `site/${name}`, omitBackground: true });
}
await b.close(); console.log("icons ok");
