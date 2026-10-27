// v10.12.5: writes the current UTC time into BUILD_TIME in site/_worker.mjs (run right before a deploy).
import { readFileSync, writeFileSync } from "node:fs";
const f = new URL("../site/_worker.mjs", import.meta.url);
const now = new Date().toISOString().slice(0, 16) + "Z";
const s = readFileSync(f, "utf8"), out = s.replace(/const BUILD_TIME = "[^"]*";/, `const BUILD_TIME = "${now}";`);
if (out === s && !s.includes(`"${now}"`)) { console.error("BUILD_TIME line not found"); process.exit(1); }
writeFileSync(f, out); console.log("BUILD_TIME =", now);
