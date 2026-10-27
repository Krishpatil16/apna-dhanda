// Local development server: serves ./site and runs the Worker against a local SQLite file (D1 shim).
// Usage: node dev-server.mjs [port]   (set KIRANA_SETUP_KEY to use a local setup key)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { makeD1 } from "./test/d1-shim.mjs";
const here = dirname(fileURLToPath(import.meta.url)); const SITE = join(here, "site");
let src = readFileSync(join(SITE, "_worker.mjs"), "utf8");
if (process.env.KIRANA_SETUP_KEY) src = src.replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${createHash("sha256").update("kirana-setup:" + process.env.KIRANA_SETUP_KEY).digest("hex")}"`);
// Local only: KIRANA_DEV_PASS sets the developer (krish-dev) password for /dev on this machine.
if (process.env.KIRANA_DEV_PASS) { const { pbkdf2Sync } = await import("node:crypto"); const salt = "ab".repeat(16);
  src = src.replace(/const DEV_SEED = \{[^}]*\};/, `const DEV_SEED = {username:"krish-dev", salt:"${salt}", hash:"${pbkdf2Sync(process.env.KIRANA_DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex")}"};`); }
const f = join(mkdtempSync(join(tmpdir(), "kirana-dev-")), "worker.mjs"); writeFileSync(f, src);
const worker = (await import(pathToFileURL(f))).default;
const DB = makeD1(process.env.KIRANA_DB || join(here, "local.sqlite"));
const TYPES = {".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".svg":"image/svg+xml",".png":"image/png",".json":"application/json",".webp":"image/webp"};
const ASSETS = { async fetch(req){ let p = new URL(req.url).pathname; 
  try { const b = await readFile(join(SITE, p)); return new Response(b, {headers:{"content-type": TYPES[extname(p)] || "application/octet-stream"}}); } catch { return new Response("Not found", {status:404}); } } };
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request("http://localhost" + req.url, { method: req.method, headers: req.headers, body: ["GET","HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), { DB, ASSETS });
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(Number(process.argv[2] || 8787), () => console.log("http://localhost:" + (process.argv[2] || 8787)));
