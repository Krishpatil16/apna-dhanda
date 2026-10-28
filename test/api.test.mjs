import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";
import { withSecrets } from "./secrets-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, "..", "site");
const TEST_KEY = "test-setup-key-123456";
// Load the real worker with the setup-key hash swapped for a test key's hash.
async function loadWorker(){
  const src = readFileSync(join(SITE, "_worker.mjs"), "utf8").replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${createHash("sha256").update("kirana-setup:"+TEST_KEY).digest("hex")}"`);
  const dir = mkdtempSync(join(tmpdir(), "kirana-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, src); return withSecrets((await import(f)).default, {setupKey: TEST_KEY});
}
async function env(){
  const worker = await loadWorker(); const DB = makeD1();
  const e = { DB, ASSETS: { fetch: async () => new Response("asset") } };
  let cookie = "";
  const call = async (method, path, body, headers={}) => {
    const h = { "cf-connecting-ip": headers.ip || "1.1.1.1", ...headers };
    if (body !== undefined) h["content-type"] = "application/json";
    if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
    if (cookie && !headers.nocookie) h.cookie = cookie;
    const r = await worker.fetch(new Request("https://k.test" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
    const sc = r.headers.get("set-cookie"); if (sc && !headers.nocookie) cookie = sc.split(";")[0].replace(/=$/, "");
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text(), headers: r.headers };
  };
  return { call, DB, setCookie: c => cookie = c, getCookie: () => cookie };
}
const idem = () => "k" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
async function adminEnv(){
  const t = await env();
  const r = await t.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await t.call("PUT", "/api/admin/settings", { open_time: "00:00", close_time: "00:00" }); // always open for tests
  return t;
}
const customer = { name: "Ramesh", phone: "98765 43210", address: "House 12, Gali 3", locality: "Shanti Nagar", pincode: "452001" };

test("storefront serves seeded demo catalogue, labelled demo, prices in paise, no MRP claims", async () => {
  const t = await env();
  const r = await t.call("GET", "/api/store");
  assert.equal(r.status, 200);
  assert.ok(r.body.products.length >= 30);
  assert.ok(r.body.categories.length >= 7);
  assert.ok(r.body.products.every(p => p.is_demo));
  assert.equal(r.body.settings.demo_mode, false);
  const atta = r.body.products.find(p => p.name_en === "Wheat Atta");
  assert.equal(atta.variants[0].price_paise, 24500);
  assert.ok(r.body.products.every(p => p.variants.every(v => v.mrp_paise === null)));
  assert.equal(r.body.settings.upi_id, "");
});

test("admin APIs need a session; setup needs the setup key and works only once", async () => {
  const t = await env();
  assert.equal((await t.call("GET", "/api/admin/dashboard")).status, 401);
  assert.equal((await t.call("GET", "/api/admin/state")).body.needs_setup, true);
  assert.equal((await t.call("POST", "/api/admin/setup", { setup_key: "wrong-key-xxxx", username: "x1x", password: "strongpass1" })).status, 403);
  assert.equal((await t.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "short" })).status, 400);
  assert.equal((await t.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  assert.equal((await t.call("GET", "/api/admin/dashboard")).status, 200);
  assert.equal((await t.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "evil", password: "strongpass1" })).status, 409);
  const row = t.DB._sql.prepare("SELECT pass_hash FROM admins").get();
  assert.ok(!row.pass_hash.includes("strongpass1") && row.pass_hash.length === 64);
  // CSRF header required on writes
  const c = t.getCookie();
  const w = await (await loadWorker()).fetch(new Request("https://k.test/api/admin/logout", { method: "POST", headers: { cookie: c, "content-type": "application/json" }, body: "{}" }), { DB: t.DB });
  assert.equal(w.status, 403);
});

test("login: wrong password rejected, rate-limited after repeated failures, logout ends session", async () => {
  const t = await adminEnv();
  assert.equal((await t.call("POST", "/api/admin/logout", {})).status, 200);
  assert.equal((await t.call("GET", "/api/admin/dashboard")).status, 401);
  for (let i = 0; i < 8; i++) assert.equal((await t.call("POST", "/api/admin/login", { username: "bhaiya", password: "nope" + i }, { ip: "9.9.9.9" })).status, 401);
  assert.equal((await t.call("POST", "/api/admin/login", { username: "bhaiya", password: "strongpass1" }, { ip: "9.9.9.9" })).status, 429);
  const ok = await t.call("POST", "/api/admin/login", { username: "bhaiya", password: "strongpass1" }, { ip: "8.8.8.8" });
  // per-username limit also trips after 8 failures, which protects against distributed guessing
  assert.equal(ok.status, 429);
});

test("product CRUD with variants; new product appears in storefront; inactive hides it", async () => {
  const t = await adminEnv();
  const cats = (await t.call("GET", "/api/admin/catalog")).body.categories;
  const r = await t.call("POST", "/api/admin/products", { name_hi: "मैगी मसाला", name_en: "Test Masala", category_id: cats[2].id, icon: "🫙", variants: [{ label: "50 g", price: "12.50", mrp: "15", stock: 5 }, { label: "100 g", price: "24", stock: 0 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  let store = (await t.call("GET", "/api/store")).body;
  let p = store.products.find(x => x.id === r.body.id);
  assert.equal(p.variants[0].price_paise, 1250);
  assert.equal(p.variants[0].mrp_paise, 1500);
  assert.equal(p.variants[1].in_stock, false);
  assert.equal(p.is_demo, false);
  assert.equal((await t.call("POST", "/api/admin/products", { name_hi: "x", variants: [{ label: "1", price: "10", mrp: "5" }] })).status, 400, "MRP below price rejected");
  assert.equal((await t.call("POST", "/api/admin/products", { name_hi: "x", variants: [{ label: "1", price: "abc" }] })).status, 400, "bad price rejected");
  await t.call("PATCH", `/api/admin/products/${r.body.id}`, { active: false });
  store = (await t.call("GET", "/api/store")).body;
  assert.ok(!store.products.some(x => x.id === r.body.id));
  assert.equal((await t.call("DELETE", `/api/admin/products/${r.body.id}`)).status, 200);
});

test("order: server recomputes totals, deducts stock, idempotent, tracking needs token", async () => {
  const t = await adminEnv();
  await t.call("PUT", "/api/admin/settings", { delivery_charge: "20", free_delivery_above: "500" });
  const store = (await t.call("GET", "/api/store")).body;
  const atta = store.products.find(p => p.name_en === "Wheat Atta").variants[0];
  const eggs = store.products.find(p => p.name_en === "Eggs").variants[0];
  const key = idem();
  const body = { ...customer, idempotency_key: key, items: [{ variant_id: atta.id, qty: 1, price_paise: 24500 }, { variant_id: eggs.id, qty: 2, price_paise: 4500 }] };
  const r = await t.call("POST", "/api/orders", body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.order.subtotal_paise, 24500 + 9000);
  assert.equal(r.body.order.delivery_paise, 2000);
  assert.equal(r.body.order.total_paise, 35500);
  assert.equal(r.body.order.status, "pending");
  assert.match(r.body.order.code, /^AK-[A-Z0-9]{6}$/);
  assert.equal(r.body.order.phone_masked, "XXXXXX3210");
  const stock = t.DB._sql.prepare("SELECT stock FROM variants WHERE id=?").get(atta.id).stock;
  assert.equal(stock, 19);
  const again = await t.call("POST", "/api/orders", body);
  assert.equal(again.status, 200); assert.equal(again.body.duplicate, true); assert.equal(again.body.order.code, r.body.order.code);
  assert.equal(t.DB._sql.prepare("SELECT COUNT(*) n FROM orders").get().n, 1);
  assert.equal((await t.call("GET", `/api/orders/${r.body.order.code}`)).status, 404);
  assert.equal((await t.call("GET", `/api/orders/${r.body.order.code}`, undefined, { "x-order-token": "0".repeat(48) })).status, 404);
  const tr = await t.call("GET", `/api/orders/${r.body.order.code}`, undefined, { "x-order-token": r.body.token });
  assert.equal(tr.status, 200); assert.equal(tr.body.order.items.length, 2); assert.equal(tr.body.order.address, undefined);
  // admin sees it
  const list = (await t.call("GET", "/api/admin/orders?status=pending")).body.orders;
  assert.equal(list.length, 1); assert.equal(list[0].phone, "9876543210"); assert.equal(list[0].items.length, 2);
});

test("order: stale price, out of stock, inactive item, invalid phone, closed store, area and minimum are enforced", async () => {
  const t = await adminEnv();
  const store = (await t.call("GET", "/api/store")).body;
  const ghee = store.products.find(p => p.name_en === "Desi Ghee").variants[1]; // 1 L, stock 5
  let r = await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 1, price_paise: 50000 }] });
  assert.equal(r.status, 409); assert.equal(r.body.code, "cart_changed"); assert.equal(r.body.problems[0].problem, "price_changed"); assert.equal(r.body.problems[0].price_paise, 59000);
  r = await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 6 }] });
  assert.equal(r.status, 409); assert.equal(r.body.problems[0].problem, "stock"); assert.equal(r.body.problems[0].available, 5);
  r = await t.call("POST", "/api/orders", { ...customer, phone: "12345", idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 1 }] });
  assert.equal(r.status, 400); assert.equal(r.body.code, "invalid_phone");
  await t.call("PUT", "/api/admin/settings", { delivery_pincodes: "452002, 452003" });
  r = await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 1 }] });
  assert.equal(r.status, 409); assert.equal(r.body.code, "outside_area");
  await t.call("PUT", "/api/admin/settings", { delivery_pincodes: "", min_order: "1000" });
  r = await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 1 }] });
  assert.equal(r.status, 409); assert.equal(r.body.code, "below_minimum");
  await t.call("PUT", "/api/admin/settings", { min_order: "", force_closed: true });
  r = await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 1 }] });
  assert.equal(r.status, 409); assert.equal(r.body.code, "store_closed");
  await t.call("PUT", "/api/admin/settings", { force_closed: false });
  const pid = store.products.find(p => p.name_en === "Desi Ghee").id;
  await t.call("PATCH", `/api/admin/products/${pid}`, { active: false });
  r = await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 1 }] });
  assert.equal(r.status, 409); assert.equal(r.body.problems[0].problem, "unavailable");
  assert.equal(t.DB._sql.prepare("SELECT stock FROM variants WHERE id=?").get(ghee.id).stock, 5, "no stock moved by failed orders");
});

test("concurrent orders cannot oversell the last units (transaction aborts)", async () => {
  const t = await adminEnv();
  const store = (await t.call("GET", "/api/store")).body;
  const ghee = store.products.find(p => p.name_en === "Desi Ghee").variants[1]; // stock 5
  const mk = () => t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: ghee.id, qty: 3 }] }, { ip: "2.2.2." + Math.floor(Math.random()*200) });
  const rs = await Promise.all([mk(), mk(), mk()]);
  assert.equal(rs.filter(r => r.status === 201).length, 1);
  assert.equal(t.DB._sql.prepare("SELECT stock FROM variants WHERE id=?").get(ghee.id).stock, 2);
});

test("status flow: valid transitions only, reason required, reject releases stock exactly once, history recorded", async () => {
  const t = await adminEnv();
  const store = (await t.call("GET", "/api/store")).body;
  const v = store.products.find(p => p.name_en === "Paneer").variants[0]; // stock 10
  const o = (await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: v.id, qty: 4 }] })).body;
  const id = t.DB._sql.prepare("SELECT id FROM orders WHERE code=?").get(o.order.code).id;
  const stock = () => t.DB._sql.prepare("SELECT stock FROM variants WHERE id=?").get(v.id).stock;
  assert.equal(stock(), 6);
  assert.equal((await t.call("POST", `/api/admin/orders/${id}/status`, { status: "delivered" })).status, 409, "pending -> delivered not allowed");
  assert.equal((await t.call("POST", `/api/admin/orders/${id}/status`, { status: "rejected" })).status, 400, "reason required");
  const [a, b] = await Promise.all([
    t.call("POST", `/api/admin/orders/${id}/status`, { status: "rejected", from: "pending", reason: "Item khatam" }),
    t.call("POST", `/api/admin/orders/${id}/status`, { status: "rejected", from: "pending", reason: "Item khatam" })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(stock(), 10, "released once, not twice");
  const tr = await t.call("GET", `/api/orders/${o.order.code}`, undefined, { "x-order-token": o.token });
  assert.equal(tr.body.order.status, "rejected"); assert.equal(tr.body.order.reason, "Item khatam");
  // happy path to delivered keeps stock deducted
  const o2 = (await t.call("POST", "/api/orders", { ...customer, idempotency_key: idem(), items: [{ variant_id: v.id, qty: 2 }] })).body;
  const id2 = t.DB._sql.prepare("SELECT id FROM orders WHERE code=?").get(o2.order.code).id;
  for (const s of ["accepted", "preparing", "out_for_delivery", "delivered"]) assert.equal((await t.call("POST", `/api/admin/orders/${id2}/status`, { status: s })).status, 200, s);
  assert.equal(stock(), 8);
  assert.equal((await t.call("POST", `/api/admin/orders/${id2}/status`, { status: "cancelled", reason: "x" })).status, 409, "terminal");
  const ev = (await t.call("GET", `/api/admin/orders/${id2}`)).body.order.events.map(e => e.to_status);
  assert.deepEqual(ev, ["pending", "accepted", "preparing", "out_for_delivery", "delivered"]);
  assert.equal((await t.call("GET", `/api/admin/orders/${id2}`)).body.order.payment_status, "collected_on_delivery");
});

test("CSV export/import round-trip with validation and formula-injection guard", async () => {
  const t = await adminEnv();
  const csv = (await t.call("GET", "/api/admin/csv")).body;
  assert.ok(csv.includes("name_hi") && csv.includes("गेहूं आटा"));
  const bad = await t.call("POST", "/api/admin/csv", { csv: "name_hi,pack_size,price\nचावल,1 kg,abc\n", dry_run: true });
  assert.equal(bad.body.ok, false); assert.equal(bad.body.errors[0].row, 2);
  const good = await t.call("POST", "/api/admin/csv", { csv: "category_hi,name_hi,name_en,pack_size,sku,price,stock\nनया,=HYPERLINK(1),Evil,1 pc,EV1,10,3\nनया,सूजी,Suji,500 g,SJ1,30.50,7\n" });
  assert.equal(good.body.ok, true, JSON.stringify(good.body)); assert.equal(good.body.created, 2);
  const out = (await t.call("GET", "/api/admin/csv")).body;
  assert.ok(out.includes("'=HYPERLINK(1)"), "formula cells are escaped on export");
  assert.ok(out.includes("30.50"));
});

test("v6: demo option is gone — no demo endpoint, demo mode can't be switched on", async () => {
  const t = await adminEnv();
  assert.equal((await t.call("POST", "/api/admin/demo/remove", {})).status, 404);
  await t.call("PUT", "/api/admin/settings", { demo_mode: true });
  assert.equal((await t.call("GET", "/api/store")).body.settings.demo_mode, false);
});
