// v3 tests: developer panel auth separation, service pause/grace (manual + automatic by date), exports while paused,
// error log, metrics and /health.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createHash, pbkdf2Sync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";
import { withSecrets } from "./secrets-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, "..", "site");
const TEST_KEY = "test-setup-key-123456";
const DEV_USER = "krish-dev", DEV_PASS = "dev-test-password-xyz", DEV_REC = "dev-recovery-key-test-0001";
const sha = s => createHash("sha256").update(s).digest("hex");

async function loadWorker(){
  const salt = "ab".repeat(16); const hash = pbkdf2Sync(DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
  const src = readFileSync(join(SITE, "_worker.mjs"), "utf8")
    .replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${sha("kirana-setup:" + TEST_KEY)}"`)
    .replace(/const DEV_SEED = \{[^}]*\};/, `const DEV_SEED = {username:"${DEV_USER}", salt:"${salt}", hash:"${hash}"};`)
    .replace(/const DEV_RECOVERY_SHA256 = "[a-f0-9]{64}"/, `const DEV_RECOVERY_SHA256 = "${sha("kirana-dev-recover:" + DEV_REC)}"`);
  assert.ok(!/const DEV_SEED = \{/.test(src) || src.includes(hash), "old-format dev seed replaced");
  const dir = mkdtempSync(join(tmpdir(), "kirana-dev-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, src); return withSecrets((await import(f)).default, {setupKey: TEST_KEY, devSeed: {username: DEV_USER, salt, hash}, devRecovery: DEV_REC});
}
// Two separate cookie jars (shopkeeper's phone and developer's phone) against one database.
async function world(){
  const worker = await loadWorker(); const DB = makeD1();
  const e = { DB, ASSETS: { fetch: async (r) => new Response("asset " + new URL(r.url).pathname, {headers:{"content-type":"text/html"}}) } };
  const jar = () => {
    let cookie = "";
    const call = async (method, path, body, headers = {}) => {
      const h = { "cf-connecting-ip": headers.ip || "1.1.1.1" };
      if (body !== undefined) h["content-type"] = "application/json";
      if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
      if (method !== "GET" && path.startsWith("/api/dev/") && !headers.nocsrf) h["x-requested-with"] = headers.xrw || "kirana-dev";
      if (cookie) h.cookie = cookie;
      const r = await worker.fetch(new Request("https://k.test" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
      const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0].replace(/=$/, "");
      const ct = r.headers.get("content-type") || "";
      return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text(), headers: r.headers };
    };
    return { call, get cookie(){ return cookie; }, set cookie(v){ cookie = v; } };
  };
  const admin = jar(), dev = jar(), cust = jar();
  let r = await admin.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" });
  assert.equal(r.status, 200);
  r = await admin.call("PUT", "/api/admin/settings", { open_time: "00:00", close_time: "00:00", phone: "9876500011", store_name_en: "Test Kirana" });
  assert.equal(r.status, 200);
  r = await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { admin, dev, cust, DB, jar };
}
const idem = () => "k" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const customer = { name: "Sunita Verma", phone: "91234 56789", address: "House 77, Gali 9, Near Temple", locality: "Ram Nagar", pincode: "452001" };
async function placeOrder(cust){
  const store = (await cust.call("GET", "/api/store")).body;
  const v = store.products.find(p => p.name_en === "Salt").variants[0];
  return cust.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: v.id, qty: 2, price_paise: v.price_paise }] });
}

test("dev auth is separate: admin session can't reach dev routes, dev session can't reach admin routes, CSRF + hashing + rate limit", async () => {
  const { admin, dev, DB, jar } = await world();
  // Admin cookie on dev routes → 403 (v7: a shopkeeper session is refused outright); dev cookie on admin routes → 401.
  for (const path of ["/api/dev/health", "/api/dev/service", "/api/dev/errors"]) assert.equal((await admin.call("GET", path)).status, 403, path);
  assert.equal((await admin.call("POST", "/api/dev/service", { action: "resume" }, { xrw: "kirana-dev" })).status, 403);
  assert.equal((await dev.call("GET", "/api/admin/dashboard")).status, 401);
  assert.equal((await dev.call("GET", "/api/admin/orders")).status, 401);
  assert.equal((await dev.call("GET", "/api/admin/csv")).status, 401);
  // Shopkeeper's password does not open the dev panel, and the dev password does not open the admin panel.
  const x = jar();
  assert.equal((await x.call("POST", "/api/dev/login", { username: "bhaiya", password: "strongpass1" })).status, 401);
  assert.equal((await x.call("POST", "/api/admin/login", { username: DEV_USER, password: DEV_PASS })).status, 401);
  // Dev state works; dev writes need the dev CSRF header (the admin's header is not enough).
  assert.equal((await dev.call("GET", "/api/dev/state")).body.dev.username, DEV_USER);
  assert.equal((await dev.call("POST", "/api/dev/service", { action: "pause" }, { nocsrf: true })).status, 403);
  assert.equal((await dev.call("POST", "/api/dev/service", { action: "pause" }, { xrw: "kirana" })).status, 403);
  assert.equal((await dev.call("GET", "/api/dev/service")).body.service.status, "active");
  // Stored hashed, in its own table; the admin settings API cannot touch service state.
  const row = DB._sql.prepare("SELECT pass_hash FROM dev_accounts").get();
  assert.ok(row.pass_hash.length === 64 && !row.pass_hash.includes(DEV_PASS));
  assert.equal(DB._sql.prepare("SELECT COUNT(*) AS n FROM admins WHERE username=?").get(DEV_USER).n, 0);
  await admin.call("PUT", "/api/admin/settings", { status: "active", paid_until: "", service: "active", grace_days: 99 });
  await dev.call("POST", "/api/dev/service", { action: "pause" });
  assert.equal((await admin.call("PUT", "/api/admin/settings", { status: "active" })).status, 423);
  assert.equal((await dev.call("GET", "/api/dev/service")).body.service.status, "paused");
  await dev.call("POST", "/api/dev/service", { action: "resume" });
  // Admin state shows a service banner field but no dev details.
  const st = (await admin.call("GET", "/api/admin/state")).body;
  assert.deepEqual(Object.keys(st.service).sort(), ["dev_contact", "pauses_at", "paid_until", "paused_reason", "status", "sub"].sort());
  // Cookie flags: HttpOnly, Secure, SameSite=Strict, __Secure- prefix, Path=/api/dev (v10.5).
  const y = jar(); const r = await y.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS });
  const sc = r.headers.get("set-cookie");
  assert.match(sc, /^__Secure-ks_dev=[a-f0-9]{64}; Path=\/api\/dev; Secure; HttpOnly; SameSite=Strict/); // v10.5: path-scoped
  // Logout ends the dev session.
  assert.equal((await y.call("POST", "/api/dev/logout", {})).status, 200);
  assert.equal((await y.call("GET", "/api/dev/health")).status, 401);
  // Rate limit: 5 wrong passwords, then 429 even with the right one.
  const z = jar();
  for (let i = 0; i < 5; i++) assert.equal((await z.call("POST", "/api/dev/login", { username: DEV_USER, password: "wrong" + i }, { ip: "7.7.7.7" })).status, 401);
  assert.equal((await z.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS }, { ip: "7.7.7.7" })).status, 429);
  // Recovery key resets the dev password (min 12 chars) and ends sessions.
  const w = jar();
  assert.equal((await w.call("POST", "/api/dev/recover", { recovery_key: "nope-nope-nope", password: "another-long-pass" }, { ip: "8.8.8.8" })).status, 403);
  assert.equal((await w.call("POST", "/api/dev/recover", { recovery_key: DEV_REC, password: "short" }, { ip: "8.8.8.8" })).status, 400);
  assert.equal((await w.call("POST", "/api/dev/recover", { recovery_key: DEV_REC, password: "another-long-pass" }, { ip: "8.8.8.8" })).status, 200);
  assert.equal((await dev.call("GET", "/api/dev/health")).status, 401);
  assert.equal((await w.call("POST", "/api/dev/login", { username: DEV_USER, password: "another-long-pass" }, { ip: "8.8.8.8" })).status, 200);
});

test("dev health dashboard: aggregates only — no customer names, phones or addresses", async () => {
  const { dev, cust, admin } = await world();
  assert.equal((await placeOrder(cust)).status, 201);
  assert.equal((await placeOrder(cust)).status, 201);
  const h = (await dev.call("GET", "/api/dev/health?stale=0")).body;
  assert.equal(h.ok, true);
  assert.equal(h.server.ok, true); assert.ok(h.server.db_ms >= 0); assert.match(h.server.version, /^\d+\.\d+\.\d+$/);
  assert.equal(h.orders.total, 2); assert.equal(h.orders.today, 2); assert.equal(h.orders.last_7_days, 2); assert.equal(h.orders.by_status.pending, 2);
  assert.ok(h.orders.last_order_at > 0);
  assert.ok(h.products.total >= 30); assert.equal(typeof h.products.out_of_stock, "number");
  assert.equal(h.push.shop_alerts_enabled, false);
  assert.ok(h.db.rows.orders === 2 && h.db.size_bytes > 0);
  assert.ok(h.traffic.hours.length === 24 && h.traffic.last_24h.api > 0);
  const text = JSON.stringify(h);
  for (const pii of ["Sunita", "Verma", "9123456789", "91234", "House 77", "Gali 9", "Ram Nagar", "Temple"]) assert.ok(!text.includes(pii), "leaked " + pii);
  // Stale pending orders: listed by code + age only.
  const h2 = (await dev.call("GET", "/api/dev/health?stale=1")).body;
  assert.equal(h2.orders.stale_minutes, 1); assert.equal(h2.orders.stale_pending_count, 0);
  // Rate-limit hits are counted (admin login brute force → 429).
  for (let i = 0; i < 9; i++) await cust.call("POST", "/api/admin/login", { username: "bhaiya", password: "x" + i }, { ip: "5.5.5.5" });
  const h3 = (await dev.call("GET", "/api/dev/health")).body;
  assert.ok(h3.traffic.last_24h.rate_limited >= 1, JSON.stringify(h3.traffic.last_24h));
  void admin;
});

test("pause blocks new orders on the server, shows the polite page, and makes the shopkeeper panel read-only; resume restores", async () => {
  const { dev, cust, admin, DB } = await world();
  assert.equal((await placeOrder(cust)).status, 201);
  const r = await dev.call("POST", "/api/dev/service", { action: "pause", note: "maintenance unpaid" });
  assert.equal(r.status, 200); assert.equal(r.body.service.status, "paused");
  assert.equal(r.body.log[0].to_status, "paused"); assert.equal(r.body.log[0].actor, "dev:" + DEV_USER); assert.match(r.body.log[0].note, /maintenance unpaid/);
  // Server-side block, even if a client bypasses the page.
  const before = DB._sql.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const o = await placeOrder(cust);
  assert.equal(o.status, 423); assert.equal(o.body.code, "service_paused"); assert.equal(o.body.phone, "9876500011");
  assert.equal(DB._sql.prepare("SELECT COUNT(*) AS n FROM orders").get().n, before);
  assert.equal((await cust.call("GET", "/api/store")).body.service_paused, true);
  // Customer pages show the paused page with the shop phone; admin and dev pages still load.
  for (const path of ["/s/mahesh-kirana", "/track", "/info"]) {
    const pg = await cust.call("GET", path);
    assert.equal(pg.status, 503, path); assert.match(pg.body, /दुकान अभी बंद है/); assert.match(pg.body, /tel:\+919876500011/);
  }
  assert.equal((await cust.call("GET", "/admin")).status, 200);
  assert.equal((await cust.call("GET", "/dev")).status, 200);
  // Shopkeeper panel: reads work, writes are refused.
  assert.equal((await admin.call("GET", "/api/admin/dashboard")).body.service.status, "paused");
  assert.equal((await admin.call("GET", "/api/admin/orders")).status, 200);
  const id = (await admin.call("GET", "/api/admin/orders")).body.orders[0].id;
  assert.equal((await admin.call("POST", `/api/admin/orders/${id}/status`, { status: "accepted", from: "pending" })).status, 423);
  assert.equal((await admin.call("POST", "/api/admin/products", { name_hi: "नया", category_id: 1, variants: [{ label: "1", price: "10", stock: 1 }] })).status, 423);
  assert.equal((await admin.call("POST", "/api/admin/demo/remove", {})).status, 423);
  assert.ok(DB._sql.prepare("SELECT COUNT(*) AS n FROM products").get().n >= 30, "no data deleted");
  // Resume → everything back.
  const rs = await dev.call("POST", "/api/dev/service", { action: "resume" });
  assert.equal(rs.body.service.status, "active");
  assert.equal((await placeOrder(cust)).status, 201);
  assert.equal((await cust.call("GET", "/s/mahesh-kirana")).status, 200);
  assert.equal((await admin.call("POST", `/api/admin/orders/${id}/status`, { status: "accepted", from: "pending" })).status, 200);
  const log = (await dev.call("GET", "/api/dev/service")).body.log.map(l => `${l.from_status}>${l.to_status}`);
  assert.deepEqual(log.slice(0, 2), ["paused>active", "active>paused"]);
});

test("exports keep working while paused: products CSV and orders CSV", async () => {
  const { dev, cust, admin } = await world();
  const o = await placeOrder(cust); assert.equal(o.status, 201);
  await dev.call("POST", "/api/dev/service", { action: "pause" });
  const p = await admin.call("GET", "/api/admin/csv");
  assert.equal(p.status, 200); assert.match(p.headers.get("content-type"), /text\/csv/); assert.match(p.body, /Wheat Atta/);
  const oc = await admin.call("GET", "/api/admin/orders.csv");
  assert.equal(oc.status, 200); assert.match(oc.headers.get("content-disposition"), /kirana-orders\.csv/);
  assert.ok(oc.body.includes(o.body.order.code)); assert.ok(oc.body.includes("Sunita Verma")); assert.match(oc.body, /x2/);
  // Exports stay admin-only.
  assert.equal((await cust.call("GET", "/api/admin/orders.csv")).status, 401);
  assert.equal((await dev.call("GET", "/api/admin/orders.csv")).status, 401);
});

test("error log captures a forced error (route, time, message), is dev-only, scrubbed and pruned to 500 rows; /health is minimal", async () => {
  const { dev, admin, DB } = await world();
  const e = await dev.call("POST", "/api/dev/test-error", {});
  assert.equal(e.status, 500); assert.equal(e.body.code, "server_error"); assert.ok(!JSON.stringify(e.body).includes("Forced"), "no internals to the client");
  const list = (await dev.call("GET", "/api/dev/errors")).body.errors;
  assert.equal(list.length, 1);
  assert.equal(list[0].route, "/api/dev/test-error"); assert.equal(list[0].status, 500); assert.equal(list[0].method, "POST");
  assert.match(list[0].message, /Forced test error/); assert.ok(Math.abs(list[0].at - Date.now()) < 60000);
  const h = (await dev.call("GET", "/api/dev/health")).body;
  assert.equal(h.errors.last_24h, 1); assert.ok(h.traffic.last_24h.e5xx >= 1);
  assert.equal((await admin.call("GET", "/api/dev/errors")).status, 403);
  // Pruning: fill past 500 and log one more.
  const ins = DB._sql.prepare("INSERT INTO error_log (at,method,route,status,kind,message) VALUES (?,?,?,?,?,?)");
  DB._sql.transaction(() => { for (let i = 0; i < 600; i++) ins.run(Date.now(), "GET", "/x", 500, "5xx", "filler " + i); })();
  await dev.call("POST", "/api/dev/test-error", {});
  const n = DB._sql.prepare("SELECT COUNT(*) AS n FROM error_log").get().n;
  assert.ok(n <= 501 && n >= 499, "pruned to ~500, got " + n);
  assert.match(DB._sql.prepare("SELECT message FROM error_log ORDER BY id DESC LIMIT 1").get().message, /Forced/);
  // /health: ok + db status, no secrets, CORS-open for uptime monitors.
  const hr = await dev.call("GET", "/health");
  assert.equal(hr.status, 200); assert.equal(hr.body.ok, true); assert.equal(hr.body.db, "ok");
  assert.deepEqual(Object.keys(hr.body).sort(), ["build", "db", "db_ms", "ok", "time", "version"]);
});

test("error log scrubs customer-like data from messages; DB failure makes /health answer 503", async () => {
  const worker = await loadWorker(); const DB = makeD1();
  const e = { DB, ASSETS: { fetch: async () => new Response("asset") } };
  // Force an exception whose message carries a phone, an email and a token: break one table the store reads.
  await worker.fetch(new Request("https://k.test/api/store"), e);
  DB._sql.exec("DROP TABLE offers; CREATE TABLE offers (x INTEGER)");
  const origPrepare = DB.prepare;
  DB.prepare = q => { if (/FROM categories/.test(q) && !/COUNT/.test(q)) throw new Error("boom for 9876543210 ramesh@example.com token " + "a".repeat(48)); return origPrepare(q); };
  const r = await worker.fetch(new Request("https://k.test/api/store"), e);
  assert.equal(r.status, 500);
  DB.prepare = origPrepare;
  const row = DB._sql.prepare("SELECT * FROM error_log ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.route, "/api/store");
  assert.ok(!/9876543210|ramesh@example\.com|aaaaaaaaaaaaaaaaaaaaaaaa/.test(row.message), row.message);
  assert.match(row.message, /\[num\].*\[email\].*\[hex\]/);
  // Route normalisation keeps ids/codes out.
  DB.prepare = q => { if (/FROM orders WHERE code/.test(q)) throw new Error("x"); return origPrepare(q); };
  await worker.fetch(new Request("https://k.test/api/orders/AK-ABC234", { headers: { "x-order-token": "b".repeat(48) } }), e);
  DB.prepare = origPrepare;
  assert.equal(DB._sql.prepare("SELECT route FROM error_log ORDER BY id DESC LIMIT 1").get().route, "/api/orders/:code");
  // Health with a broken DB → 503.
  const bad = { DB: { prepare: () => { throw new Error("db down"); } }, ASSETS: e.ASSETS };
  const h = await worker.fetch(new Request("https://k.test/health"), bad);
  assert.equal(h.status, 503); const hb = await h.json(); assert.equal(hb.ok, false); assert.equal(hb.db, "error");
});
