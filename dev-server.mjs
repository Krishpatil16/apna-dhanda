// Local development server: serves ./site and runs the Worker against a local SQLite file (D1 shim).
// Usage: node dev-server.mjs [port]   (optional env: KIRANA_SETUP_KEY, KIRANA_DEV_PASS, KIRANA_DEV_RECOVERY for local secrets)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { pbkdf2Sync } from "node:crypto";
import { join, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { makeD1 } from "./test/d1-shim.mjs";
const here = dirname(fileURLToPath(import.meta.url)); const SITE = join(here, "site");
const src = readFileSync(join(SITE, "_worker.mjs"), "utf8");
// Local only: secrets come from env like the deployed Worker (Worker secrets). KIRANA_SETUP_KEY / KIRANA_DEV_PASS / KIRANA_DEV_RECOVERY
// are turned into the same PBKDF2 formats here; nothing is ever written into the source.
const LOCAL_SECRETS = {};
{ const salt = "ab".repeat(16); const kh = k => `pbkdf2-sha256$100000$${salt}$${pbkdf2Sync(k, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex")}`;
  if (process.env.KIRANA_SETUP_KEY) LOCAL_SECRETS.SETUP_KEY_HASH = kh(process.env.KIRANA_SETUP_KEY);
  if (process.env.KIRANA_DEV_RECOVERY) LOCAL_SECRETS.DEV_RECOVERY_HASH = kh(process.env.KIRANA_DEV_RECOVERY);
  if (process.env.KIRANA_DEV_PASS) LOCAL_SECRETS.DEV_SEED = `krish-dev$${salt}$${pbkdf2Sync(process.env.KIRANA_DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex")}`; }
const f = join(mkdtempSync(join(tmpdir(), "kirana-dev-")), "worker.mjs"); writeFileSync(f, src);
const worker = (await import(pathToFileURL(f))).default;
const DB = makeD1(process.env.KIRANA_DB || join(here, "local.sqlite"));
const TYPES = {".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".svg":"image/svg+xml",".png":"image/png",".json":"application/json",".webp":"image/webp"};
const ASSETS = { async fetch(req){ let p = new URL(req.url).pathname; 
  try { const b = await readFile(join(SITE, p)); return new Response(b, {headers:{"content-type": TYPES[extname(p)] || "application/octet-stream"}}); } catch { return new Response("Not found", {status:404}); } } };
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request("http://localhost" + req.url, { method: req.method, headers: req.headers, body: ["GET","HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), { DB, ASSETS, ...LOCAL_SECRETS });
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(Number(process.argv[2] || 8787), () => console.log("http://localhost:" + (process.argv[2] || 8787)));
