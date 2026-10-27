
import { makeD1 } from "./d1-shim.mjs"; import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "rs-")); const f = join(dir, "w.mjs"); writeFileSync(f, readFileSync("site/_worker.mjs", "utf8"));
const w = (await import(f)).default; const DB = makeD1();
await w.fetch(new Request("https://x.test/api/store"), { DB, ASSETS: { fetch: async () => new Response("") } });
DB._sql.exec(readFileSync("/tmp/restore.sql", "utf8"));
const b = JSON.parse(readFileSync("/tmp/bk.json", "utf8")); const res = {};
for (const t of Object.keys(b.tables)) { if (t === "schema_version") continue; res[t] = [b.tables[t].length, DB._sql.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]; }
const r = await w.fetch(new Request("https://x.test/api/store"), { DB, ASSETS: { fetch: async () => new Response("") } });
const s = await r.json(); console.log(JSON.stringify({res, products: s.products.length, fk: DB._sql.prepare("PRAGMA foreign_key_check").all().length}));
