
import { makeD1 } from "./d1-shim.mjs"; import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const load = async p => { const dir = mkdtempSync(join(tmpdir(), "mg-")); const f = join(dir, "w.mjs"); writeFileSync(f, readFileSync(p, "utf8")); return (await import(f)).default; };
const v3 = await load(process.env.V3); const DB = makeD1(); const E = { DB, ASSETS: { fetch: async () => new Response("") } };
const s = await (await v3.fetch(new Request("https://x.test/api/store"), E)).json(); const v = s.products[0].variants[0];
const o = await (await v3.fetch(new Request("https://x.test/api/orders", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({name:"TEST – old", phone:"9876543210", address:"x", payment_method:"cod", idempotency_key:"abcdefghijklmnopqrst", items:[{variant_id:v.id, qty:1, price_paise:v.price_paise}]})}), E)).json();
const v4 = await load("site/_worker.mjs");
const s4 = await (await v4.fetch(new Request("https://x.test/api/store"), E)).json();
console.log(JSON.stringify({v3order: o.order.code, products: s4.products.length, schema: DB._sql.prepare("SELECT MAX(v) v FROM schema_version").get().v, is_test: DB._sql.prepare("SELECT is_test FROM orders").get().is_test, trig: DB._sql.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n}));
