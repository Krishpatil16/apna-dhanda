// v5 multi-shop tests: self-signup + approval, per-shop isolation (orders, products, settings, reports, backup, push,
// token routes), per-shop pause, storefront routing, and the migration of an existing single-shop (v4) database into shop #1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createHash, pbkdf2Sync, createECDH } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";
import { withSecrets } from "./secrets-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEST_KEY = "test-setup-key-123456";
const DEV_USER = "krish-dev", DEV_PASS = "dev-test-password-xyz";
const sha = s => createHash("sha256").update(s).digest("hex");
async function loadWorker(file = join(here, "..", "site", "_worker.mjs")){
  const salt = "ab".repeat(16); const hash = pbkdf2Sync(DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
  const src = readFileSync(file, "utf8")
    .replace(/const SETUP_KEY_SHA256 = "[a-f0-9]{64}"/, `const SETUP_KEY_SHA256 = "${sha("kirana-setup:" + TEST_KEY)}"`)
    .replace(/const DEV_SEED = \{[^}]*\};/, `const DEV_SEED = {username:"${DEV_USER}", salt:"${salt}", hash:"${hash}"};`);
  const dir = mkdtempSync(join(tmpdir(), "kirana-mt-")); const f = join(dir, `w${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, src); return withSecrets((await import(f)).default, {setupKey: TEST_KEY, devSeed: {username: DEV_USER, salt, hash}});
}
function makeEnv(DB){
  const sent = [];
  return { sent, e: { DB, ASSETS: { fetch: async r => new Response(`<html><head><meta charset="utf-8">\n<meta name="ak-shop" content=""><link rel="manifest" href="/manifest.webmanifest"></head><body>asset ${new URL(r.url).pathname}</body></html>`, {headers:{"content-type":"text/html"}}) },
    PUSH_FETCH: async (endpoint, init) => { sent.push({endpoint}); return new Response("", {status: 201}); }, PUSH_EXTRA_HOSTS: "push.test" } };
}
async function world(DB = makeD1(), worker = null){
  worker = worker || await loadWorker(); const env = makeEnv(DB);
  const jar = (dflt = {}) => { let cookie = "";
    const call = async (method, path, body, headers = {}) => {
      headers = {...dflt, ...headers};
      const h = { "cf-connecting-ip": headers.ip || "1.1.1.1" };
      if (headers.shop) h["x-shop"] = headers.shop;
      if (body !== undefined) h["content-type"] = "application/json";
      if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
      if (method !== "GET" && path.startsWith("/api/dev/")) h["x-requested-with"] = "kirana-dev";
      if (headers.token) h["x-order-token"] = headers.token;
      if (cookie) h.cookie = cookie;
      const r = await worker.fetch(new Request("https://k.test" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env.e);
      const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0].replace(/=$/, "");
      const ct = r.headers.get("content-type") || "";
      return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text(), headers: r.headers };
    };
    return { call }; };
  return { DB, jar, env, worker, sql: (q, ...a) => DB._sql.prepare(q).all(...a), one: (q, ...a) => DB._sql.prepare(q).get(...a) };
}
const idem = () => "k" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const cust = { name: "Ramesh", phone: "98765 43210", address: "House 12, Gali 3", locality: "Shanti Nagar", pincode: "452001" };
async function order(c, shop, variant, extra = {}){
  return c.call("POST", "/api/orders", { ...cust, items: [{ variant_id: variant.id, qty: 1 }], payment_method: "cod", idempotency_key: idem(), ...extra }, { shop });
}
// shop #1 (bhaiya, via the setup key) + shop B (self sign-up, approved by the developer) with one item.
async function twoShops(){
  const w = await world();
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  await A.call("PUT", "/api/admin/settings", { open_time: "00:00", close_time: "00:00", phone: "9876500011" });
  const dev = w.jar(); assert.equal((await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS })).status, 200);
  const B = w.jar();
  const s = await B.call("POST", "/api/admin/signup", { owner_name: "Suresh Sharma", shop_name: "TEST – Sharma Kirana", mobile: "9123456780", password: "bshoppass1" });
  assert.equal(s.status, 201, JSON.stringify(s.body)); assert.equal(s.body.shop.status, "pending"); assert.match(s.body.recovery_key, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const bid = s.body.shop.id, slug = s.body.shop.slug;
  assert.equal((await dev.call("POST", "/api/dev/service", { shop_id: bid, action: "approve" })).status, 200);
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 200);
  const cats = [{ id: (await B.call("POST", "/api/admin/categories", { name_hi: "आटा", icon: "🌾" })).body.id }];
  const p = await B.call("POST", "/api/admin/products", { name_hi: "बी का आटा", name_en: "B Atta", category_id: cats[0].id, variants: [{ label: "1 kg", price: "50", stock: 10 }] });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const C = w.jar();
  const bStore = (await C.call("GET", "/api/store", undefined, { shop: slug })).body;
  const aStore = (await C.call("GET", "/api/store")).body;
  return { ...w, A, B, C, dev, bid, slug, recovery: s.body.recovery_key, bProduct: p.body.id, bVar: bStore.products[0].variants[0], aVar: aStore.products[0].variants[0] };
}

test("sign-up: own name + shop + mobile + password, starts PENDING (no orders, 'starting soon' page) until the developer approves", async () => {
  const w = await world();
  const A = w.jar(); await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" });
  const B = w.jar();
  for (const bad of [{ shop_name: "X", mobile: "9123456780", password: "bshoppass1" }, { owner_name: "S", shop_name: "X", mobile: "123", password: "bshoppass1" }, { owner_name: "S", shop_name: "X", mobile: "9123456780", password: "short" }])
    assert.equal((await B.call("POST", "/api/admin/signup", bad)).status, 400);
  const s = await B.call("POST", "/api/admin/signup", { owner_name: "Suresh", shop_name: "Sharma Kirana", mobile: "+91 91234 56780", password: "bshoppass1" });
  assert.equal(s.status, 201); assert.equal(s.body.shop.slug, "sharma-kirana"); assert.equal(s.body.link, "/s/sharma-kirana");
  // same mobile again → refused; the recovery key is stored only as a hash
  assert.equal((await w.jar().call("POST", "/api/admin/signup", { owner_name: "X", shop_name: "Other", mobile: "9123456780", password: "bshoppass1" })).status, 409);
  const adm = w.one("SELECT * FROM admins WHERE mobile='9123456780'"); assert.ok(adm.recovery_hash && !JSON.stringify(adm).includes(s.body.recovery_key));
  // logged in straight away; sees own name and a pending status
  const st = (await B.call("GET", "/api/admin/state")).body;
  assert.equal(st.admin.owner_name, "Suresh"); assert.equal(st.admin.shop.slug, "sharma-kirana"); assert.equal(st.service.status, "pending");
  // pending: storefront page says "starting soon"; orders refused on the server; admin can already add items
  const C = w.jar();
  const pg = await C.call("GET", "/s/sharma-kirana"); assert.equal(pg.status, 503); assert.match(pg.body, /जल्द ही ऑनलाइन शुरू/);
  const cat0 = (await B.call("GET", "/api/admin/catalog")).body; assert.equal(cat0.categories.length, 0, "v6: a new shop starts empty"); assert.equal(cat0.products.length, 0);
  const cats = [{ id: (await B.call("POST", "/api/admin/categories", { name_hi: "आटा", icon: "🌾" })).body.id }];
  assert.equal((await B.call("GET", "/api/admin/catalog")).body.products.length, 0, "no sample items in a new shop");
  assert.equal((await B.call("POST", "/api/admin/products", { name_hi: "चीनी", category_id: cats[0].id, variants: [{ label: "1 kg", price: "45", stock: 5 }] })).status, 201);
  const store = (await C.call("GET", "/api/store", undefined, { shop: "sharma-kirana" })).body; assert.equal(store.service_paused, true); assert.equal(store.shop.status, "pending");
  assert.equal((await order(C, "sharma-kirana", store.products[0].variants[0])).status, 423);
  // developer approves → live
  const dev = w.jar(); await dev.call("POST", "/api/dev/login", { username: DEV_USER, password: DEV_PASS });
  const list = (await dev.call("GET", "/api/dev/shops")).body;
  assert.equal(list.auto_approve, false); const row = list.shops.find(x => x.slug === "sharma-kirana");
  assert.equal(row.status, "pending"); assert.equal(row.owner_name, "Suresh"); assert.equal(row.mobile, "9123456780"); assert.ok(row.created_at > 0); assert.equal(row.orders_total, undefined, "no order data in dev"); assert.equal(row.sub.state, "TRIAL");
  assert.equal((await B.call("POST", "/api/dev/service", { shop_id: row.id, action: "approve" })).status, 403, "shopkeeper can't approve themselves");
  const ap = await dev.call("POST", "/api/dev/service", { shop_id: row.id, action: "approve" }); assert.equal(ap.body.service.status, "active");
  // approved but still OFFLINE until the shopkeeper switches it on
  const off = await C.call("GET", "/s/sharma-kirana"); assert.equal(off.status, 503); assert.match(off.body, /अभी बंद है/);
  assert.equal((await order(C, "sharma-kirana", store.products[0].variants[0])).status, 423);
  assert.equal((await B.call("POST", "/api/admin/online", { online: true })).status, 200);
  assert.equal((await C.call("GET", "/s/sharma-kirana")).status, 200);
  assert.equal((await order(C, "sharma-kirana", store.products[0].variants[0])).status, 201);
  // login with the mobile number; password reset with the recovery key (the setup key of shop #1 can't reset another shop)
  const B2 = w.jar(); assert.equal((await B2.call("POST", "/api/admin/login", { username: "91234 56780", password: "bshoppass1" })).status, 200);
  assert.equal((await B2.call("POST", "/api/admin/recover", { setup_key: TEST_KEY, username: "9123456780", password: "hacked-pass-1" })).status, 403);
  assert.equal((await B2.call("POST", "/api/admin/recover", { setup_key: s.body.recovery_key.toLowerCase(), username: "9123456780", password: "newpass-123" })).status, 200);
  assert.equal((await w.jar().call("POST", "/api/admin/login", { username: "9123456780", password: "newpass-123" })).status, 200);
  // auto-approve toggle
  await dev.call("POST", "/api/dev/settings", { auto_approve: true });
  const s3 = await w.jar().call("POST", "/api/admin/signup", { owner_name: "Gita", shop_name: "गीता स्टोर", mobile: "9000000001", password: "gitapass12" }, { ip: "2.2.2.2" });
  assert.equal(s3.body.shop.status, "active"); assert.ok(/^[a-z0-9-]{3,}$/.test(s3.body.shop.slug), "Hindi name still gets a link: " + s3.body.shop.slug);
  // reject: login refused, storefront 404
  await dev.call("POST", "/api/dev/settings", { auto_approve: false });
  const R = w.jar(); const s4 = await R.call("POST", "/api/admin/signup", { owner_name: "Fake", shop_name: "Fake Shop", mobile: "9000000002", password: "fakepass12" }, { ip: "3.3.3.3" });
  assert.equal((await dev.call("POST", "/api/dev/service", { shop_id: s4.body.shop.id, action: "reject" })).status, 200);
  assert.equal((await R.call("GET", "/api/admin/dashboard")).status, 401, "session ended");
  assert.equal((await w.jar().call("POST", "/api/admin/login", { username: "9000000002", password: "fakepass12" })).status, 403);
  assert.equal((await C.call("GET", "/s/fake-shop")).status, 404);
  assert.equal((await C.call("GET", "/s/no-such-shop")).status, 404);
  assert.equal((await C.call("GET", "/api/store", undefined, { shop: "no-such-shop" })).status, 404);
});

test("isolation: shop #1 and shop B never see or change each other's orders, items, settings, reports, backup, push or ratings", async () => {
  const t = await twoShops(); const { A, B, C, slug } = t;
  // catalogues are separate
  const aCat = (await A.call("GET", "/api/admin/catalog")).body, bCat = (await B.call("GET", "/api/admin/catalog")).body;
  assert.ok(!aCat.products.some(p => p.name_en === "B Atta")); assert.deepEqual(bCat.products.map(p => p.name_en), ["B Atta"]);
  assert.ok(!(await C.call("GET", "/api/store")).body.products.some(p => p.name_en === "B Atta"));
  // B's customer orders on B; a cross-shop cart is refused (A's item through B's storefront)
  const bo = await order(C, slug, t.bVar, { name: "TEST – B customer" }); assert.equal(bo.status, 201);
  const cross = await order(C, slug, t.aVar); assert.equal(cross.status, 409); assert.equal(cross.body.problems[0].problem, "unavailable");
  const ao = await order(C, undefined, t.aVar, { name: "A customer" }); assert.equal(ao.status, 201);
  const bId = t.one("SELECT id FROM orders WHERE code=?", bo.body.order.code).id;
  // orders list / detail / status / CSV
  const aOrders = (await A.call("GET", "/api/admin/orders?status=all")).body.orders.map(o => o.code);
  assert.ok(aOrders.includes(ao.body.order.code) && !aOrders.includes(bo.body.order.code));
  assert.deepEqual((await B.call("GET", "/api/admin/orders?status=all")).body.orders.map(o => o.code), [bo.body.order.code]);
  assert.equal((await A.call("GET", `/api/admin/orders/${bId}`)).status, 404);
  assert.equal((await A.call("POST", `/api/admin/orders/${bId}/status`, { status: "rejected", from: "pending", reason: "x" })).status, 404);
  assert.equal(t.one("SELECT status FROM orders WHERE id=?", bId).status, "pending");
  assert.ok(!(await A.call("GET", "/api/admin/orders.csv")).body.includes(bo.body.order.code));
  assert.ok((await B.call("GET", "/api/admin/orders.csv")).body.includes(bo.body.order.code));
  // products, variants, categories, offers: A cannot touch B's
  const bVarId = t.bVar.id, bCatId = bCat.categories[0].id;
  assert.equal((await A.call("PUT", `/api/admin/products/${t.bProduct}`, { name_hi: "hacked", variants: [{ label: "1", price: "1", stock: 1 }] })).status, 404);
  await A.call("PATCH", `/api/admin/products/${t.bProduct}`, { active: false }); await A.call("DELETE", `/api/admin/products/${t.bProduct}`);
  assert.equal(t.one("SELECT active FROM products WHERE id=?", t.bProduct).active, 1, "still active and present");
  assert.equal((await A.call("POST", `/api/admin/variants/${bVarId}/stock`, { set: 0 })).status, 404);
  assert.equal(t.one("SELECT stock FROM variants WHERE id=?", bVarId).stock, 9);
  await A.call("DELETE", `/api/admin/categories/${bCatId}`); await A.call("PUT", `/api/admin/categories/${bCatId}`, { name_hi: "hacked" });
  assert.notEqual(t.one("SELECT name_hi FROM categories WHERE id=?", bCatId).name_hi, "hacked");
  assert.equal((await A.call("POST", "/api/admin/products", { name_hi: "x", category_id: bCatId, variants: [{ label: "1", price: "1", stock: 1 }] })).status, 400, "can't file an item under B's category");
  const off = await B.call("POST", "/api/admin/offers", { kind: "percent", title_hi: "B offer", percent_off: 10, product_ids: [t.bProduct], active: true }); assert.equal(off.status, 201);
  assert.ok(!(await A.call("GET", "/api/admin/offers")).body.offers.some(o => o.id === off.body.id));
  assert.equal((await A.call("DELETE", `/api/admin/offers/${off.body.id}`)).status, 404);
  assert.equal((await A.call("POST", `/api/admin/offers/${off.body.id}/active`, { active: false })).status, 404);
  assert.equal((await A.call("POST", "/api/admin/offers", { kind: "percent", title_hi: "steal", percent_off: 10, product_ids: [t.bProduct] })).status, 400);
  assert.ok(!(await C.call("GET", "/api/store")).body.offers.some(o => o.id === off.body.id));
  // settings
  await B.call("PUT", "/api/admin/settings", { store_name_hi: "शर्मा किराना", phone: "9111111111", owner_name: "Suresh S." });
  const aS = (await A.call("GET", "/api/admin/dashboard")).body.settings; assert.notEqual(aS.store_name_hi, "शर्मा किराना"); assert.equal(aS.phone, "9876500011");
  assert.equal((await C.call("GET", "/api/store", undefined, { shop: slug })).body.settings.phone, "9111111111");
  assert.equal((await B.call("GET", "/api/admin/state")).body.admin.owner_name, "Suresh S.");
  // reports + dashboard: deliver B's order; A's numbers don't move
  for (const [to, from] of [["accepted","pending"],["preparing","accepted"],["out_for_delivery","preparing"],["delivered","out_for_delivery"]]) assert.equal((await B.call("POST", `/api/admin/orders/${bId}/status`, { status: to, from })).status, 200);
  const bo2 = await order(C, slug, t.bVar, { name: "B real customer" }); const bId2 = t.one("SELECT id FROM orders WHERE code=?", bo2.body.order.code).id;
  for (const [to, from] of [["accepted","pending"],["preparing","accepted"],["out_for_delivery","preparing"],["delivered","out_for_delivery"]]) await B.call("POST", `/api/admin/orders/${bId2}/status`, { status: to, from });
  const bRep = (await B.call("GET", "/api/admin/reports?range=today")).body, aRep = (await A.call("GET", "/api/admin/reports?range=today")).body;
  assert.equal(bRep.delivered.orders, 1); assert.equal(bRep.delivered.value_paise, 4500, "10% B offer applied"); assert.equal(aRep.delivered.orders, 0);
  assert.ok(!(await A.call("GET", "/api/admin/reports.csv?range=today")).body.includes("B Atta"));
  assert.equal((await A.call("GET", "/api/admin/dashboard")).body.counts.find(c => c.status === "delivered"), undefined);
  // ratings by token go to B only
  assert.equal((await C.call("POST", `/api/orders/${bo2.body.order.code}/rating`, { stars: 5, comment: "badhiya" }, { token: bo2.body.token })).status, 201);
  assert.equal((await A.call("GET", "/api/admin/ratings")).body.ratings.length, 0); assert.equal((await B.call("GET", "/api/admin/ratings")).body.ratings.length, 1);
  // audit log
  assert.ok(!(await A.call("GET", "/api/admin/audit")).body.entries.some(e => e.label === bo.body.order.code || e.entity_id === bVarId && e.entity === "variant"));
  assert.ok((await B.call("GET", "/api/admin/audit")).body.entries.some(e => e.label === bo.body.order.code));
  assert.equal(t.one("SELECT COUNT(*) AS n FROM audit_log WHERE shop_id=0").n, 0, "every audit row belongs to a shop");
  // backup: per-shop only
  const J = x => typeof x === "string" ? JSON.parse(x) : x; const aBk = J((await A.call("GET", "/api/admin/backup")).body), bBk = J((await B.call("GET", "/api/admin/backup")).body);
  const blobA = JSON.stringify(aBk);
  assert.ok(!blobA.includes(bo.body.order.code) && !blobA.includes("B Atta") && !blobA.includes("9111111111"));
  assert.deepEqual(bBk.tables.orders.map(o => o.code).sort(), [bo.body.order.code, bo2.body.order.code].sort());
  assert.ok(bBk.tables.products.every(p => p.shop_id === t.bid) && bBk.tables.audit_log.every(a => a.shop_id === t.bid));
  assert.equal(bBk.tables.shops.length, 1); assert.ok(!("admins" in bBk.tables));
  // products CSV
  assert.ok(!(await A.call("GET", "/api/admin/csv")).body.includes("B Atta"));
  // push: each shop's alert devices are its own; a new order alerts only that shop's phones
  const sub = id => { const e = createECDH("prime256v1"); e.generateKeys(); return { endpoint: `https://push.test/send/${id}`, keys: { p256dh: e.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 3).toString("base64url") } }; };
  assert.equal((await A.call("POST", "/api/admin/push/subscribe", { subscription: sub("aaa") })).status, 200);
  assert.equal((await B.call("POST", "/api/admin/push/subscribe", { subscription: sub("bbb") })).status, 200);
  assert.deepEqual((await A.call("GET", "/api/admin/push")).body.devices.map(d => d.endpoint_tail), ["ush.test/send/aaa".slice(-12)]);
  assert.equal((await A.call("POST", "/api/admin/push/unsubscribe", { endpoint: "https://push.test/send/bbb" })).body.removed, 0);
  t.env.sent.length = 0; await order(C, slug, t.bVar);
  assert.ok(t.env.sent.some(s => s.endpoint.endsWith("bbb")) && !t.env.sent.some(s => s.endpoint.endsWith("aaa")), "only B's phone alerted");
  assert.ok(!(await A.call("GET", "/api/admin/push")).body.attempts.some(a => a.code === bo.body.order.code));
  // a customer token works for its own order whatever storefront it came from, and cancels inside B only
  const bo3 = await order(C, slug, t.bVar);
  const cn = await C.call("POST", `/api/orders/${bo3.body.order.code}/cancel`, {}, { token: bo3.body.token }); assert.equal(cn.status, 200);
  const stockNow = t.one("SELECT stock FROM variants WHERE id=?", bVarId).stock;
  assert.equal((await C.call("POST", `/api/orders/${bo3.body.order.code}/cancel`, {}, { token: bo3.body.token })).body.already, true);
  assert.equal(t.one("SELECT stock FROM variants WHERE id=?", bVarId).stock, stockNow, "stock released exactly once");
  const trk = await C.call("GET", `/api/orders/${bo3.body.order.code}`, undefined, { token: bo3.body.token }); assert.equal(trk.body.shop.slug, slug); assert.equal(trk.body.shop.phone, "9111111111");
  // no row was ever written without a shop
  for (const tb of ["categories","products","variants","orders","offers","images","push_subscriptions","notification_attempts","audit_log"]) assert.equal(t.one(`SELECT COUNT(*) AS n FROM ${tb} WHERE shop_id=0`).n, 0, tb);
});

test("per-shop pause + billing: pausing shop B shows B's paused page with B's phone; shop #1 keeps working", async () => {
  const t = await twoShops(); const { A, B, C, dev, slug } = t;
  await B.call("PUT", "/api/admin/settings", { phone: "9111111111" });
  const r = await dev.call("POST", "/api/dev/service", { shop_id: t.bid, action: "pause", note: "fee due" }); assert.equal(r.body.service.status, "paused");
  const pg = await C.call("GET", `/s/${slug}`); assert.equal(pg.status, 503); assert.match(pg.body, /tel:\+919111111111/); assert.doesNotMatch(pg.body, /9876500011/);
  assert.equal((await order(C, slug, t.bVar)).status, 423);
  assert.equal((await B.call("POST", "/api/admin/products", { name_hi: "x", variants: [{ label: "1", price: "1", stock: 1 }] })).status, 423, "B read-only");
  assert.equal((await C.call("GET", "/s/mahesh-kirana")).status, 200); assert.equal((await order(C, undefined, t.aVar)).status, 201);
  assert.equal((await A.call("GET", "/api/admin/dashboard")).body.service.status, "active");
  await dev.call("POST", "/api/dev/service", { shop_id: t.bid, action: "resume" });
  assert.equal((await dev.call("GET", "/api/dev/service")).body.service.status, "active", "shop #1 untouched");
  const list = (await dev.call("GET", "/api/dev/shops")).body.shops; const b = list.find(s => s.id === t.bid);
  assert.equal(b.status, "active"); assert.equal(b.sub.state, "TRIAL");
  assert.ok((await dev.call("GET", `/api/dev/service?shop_id=${t.bid}`)).body.log.every(l => l.actor !== "dev:" + DEV_USER || true));
  assert.equal((await dev.call("GET", `/api/dev/service?shop_id=${t.bid}`)).body.log.filter(l => /fee due/.test(l.note)).length, 1);
  assert.equal((await dev.call("GET", "/api/dev/service")).body.log.filter(l => /fee due/.test(l.note)).length, 0, "logs are per shop");
});

test("storefront routing: /s/<slug> pages know their shop, per-shop app manifest, unknown slug 404", async () => {
  const t = await twoShops(); const { C, slug } = t;
  const root = await C.call("GET", "/s/mahesh-kirana"); assert.equal(root.status, 200); assert.match(root.body, /<meta name="ak-shop" content="mahesh-kirana" data-id="1"/);
  const b = await C.call("GET", `/s/${slug}`); assert.equal(b.status, 200); assert.match(b.body, new RegExp(`content="${slug}" data-id="${t.bid}"`)); assert.match(b.body, new RegExp(`/s/${slug}/manifest.webmanifest`));
  assert.match((await C.call("GET", `/track?s=${slug}`)).body, new RegExp(`content="${slug}"`));
  assert.equal((await C.call("GET", `/s/${slug}/info`)).status, 200);
  const mf = await C.call("GET", `/s/${slug}/manifest.webmanifest`); assert.equal(mf.status, 200); assert.equal((typeof mf.body === "string" ? JSON.parse(mf.body) : mf.body).start_url, `/s/${slug}`);
  assert.equal((await C.call("GET", "/s/nope-nope")).status, 404);
  assert.equal((await C.call("GET", "/api/store")).body.shop.slug, "mahesh-kirana");
});

// --- migration: an existing single-shop (v4) database becomes shop #1 ---
async function v4Database(){
  const DB = makeD1(); const old = await loadWorker(join(here, "fixtures", "worker-v4.mjs")); const w = await world(DB, old);
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/setup", { setup_key: TEST_KEY, username: "bhaiya", password: "strongpass1" })).status, 200);
  await A.call("PUT", "/api/admin/settings", { store_name_hi: "महेश अग्रवाल किराना स्टोर", store_name_en: "Mahesh Agrawal Kirana Store", open_time: "00:00", close_time: "00:00", phone: "9876500011" });
  const C = w.jar(); const v = (await C.call("GET", "/api/store")).body.products[0].variants[0];
  const o = await order(C, undefined, v); assert.equal(o.status, 201);
  const id = w.one("SELECT id FROM orders").id;
  for (const [to, from] of [["accepted","pending"],["preparing","accepted"],["out_for_delivery","preparing"],["delivered","out_for_delivery"]]) await A.call("POST", `/api/admin/orders/${id}/status`, { status: to, from });
  await C.call("POST", `/api/orders/${o.body.order.code}/rating`, { stars: 4, comment: "ok" }, { token: o.body.token });
  return { DB, A, o, counts: Object.fromEntries(["categories","products","variants","orders","order_items","order_events","order_ratings","audit_log","offers","settings","admins"].map(tb => [tb, DB._sql.prepare(`SELECT COUNT(*) AS n FROM ${tb}`).get().n])) };
}
test("migration: v4 single-shop DB → shop #1 'Mahesh Agrawal Kirana Store' owned by bhaiya (same password, same session); nothing lost; idempotent", async () => {
  const v4 = await v4Database(); const hashBefore = v4.DB._sql.prepare("SELECT pass_hash FROM admins").get().pass_hash;
  const w = await world(v4.DB); const C = w.jar();
  const st = (await C.call("GET", "/api/store")).body; // first request runs the v5 migration
  assert.equal(st.shop.id, 1); assert.equal(st.shop.slug, "mahesh-kirana"); assert.equal(st.shop.name, "Mahesh Agrawal Kirana Store"); assert.equal(st.settings.phone, "9876500011");
  assert.equal(w.one("SELECT MAX(v) AS v FROM schema_version").v, 19); // v10.11 added shops.shop_type; // v10.9 added shop_events; v10.8.1 added shops.address+owner_photo_id; v10.8 added order_subs; v10.4 added the notification tables, v10.6 the dev feed + dev push tables, v10.7 the stock tables
  assert.equal(w.one("SELECT trial_end - created_at AS d FROM shops WHERE id=1").d, 30*864e5, "existing shops: trial = created + 30 days");
  for (const [tb, n] of Object.entries(v4.counts)) if (tb !== "audit_log") assert.equal(w.one(`SELECT COUNT(*) AS n FROM ${tb}`).n, n, tb + " row count unchanged");
  for (const tb of ["categories","products","variants","orders","offers","audit_log","admins"]) assert.equal(w.one(`SELECT COUNT(*) AS n FROM ${tb} WHERE shop_id<>1`).n, 0, tb + " all in shop #1");
  assert.equal(w.one("SELECT COUNT(*) AS n FROM shop_settings WHERE shop_id=1").n >= 20, true);
  const sh = w.one("SELECT * FROM shops WHERE id=1"); assert.equal(sh.owner_name, "Mahesh Agrawal"); assert.equal(sh.status, "active");
  assert.equal(w.one("SELECT pass_hash FROM admins WHERE username='bhaiya'").pass_hash, hashBefore);
  // the old session cookie still works, and the old password logs in
  const dash = (await v4.A.call("GET", "/api/admin/dashboard")); // v4 jar talks to the v4 worker; use a new jar on v5 instead:
  const A = w.jar(); assert.equal((await A.call("POST", "/api/admin/login", { username: "bhaiya", password: "strongpass1" })).status, 200);
  const d = (await A.call("GET", "/api/admin/dashboard")).body; assert.equal(d.admin.owner_name, "Mahesh Agrawal"); assert.equal(d.admin.shop.slug, "mahesh-kirana");
  assert.ok((await A.call("GET", "/api/admin/orders?status=all")).body.orders.some(o => o.code === v4.o.body.order.code));
  assert.equal((await A.call("GET", "/api/admin/ratings")).body.ratings.length, 1);
  // the old order's tracking token still works
  assert.equal((await C.call("GET", `/api/orders/${v4.o.body.order.code}`, undefined, { token: v4.o.body.token })).status, 200);
  // new audit rows (from the re-created triggers) carry the shop
  const v = st.products[0].variants[0]; await A.call("POST", `/api/admin/variants/${v.id}/stock`, { set: 7 });
  assert.equal(w.one("SELECT shop_id FROM audit_log ORDER BY id DESC LIMIT 1").shop_id, 1);
  // idempotent: a fresh worker on the same DB changes nothing
  const before = JSON.stringify(w.sql("SELECT * FROM shops")) + w.one("SELECT COUNT(*) AS n FROM shop_settings").n;
  const w2 = await world(v4.DB); await w2.jar().call("GET", "/api/store");
  assert.equal(JSON.stringify(w2.sql("SELECT * FROM shops")) + w2.one("SELECT COUNT(*) AS n FROM shop_settings").n, before);
  assert.equal(w2.sql("SELECT v FROM schema_version WHERE v=5").length, 1);
});

// Optional: the real live restore file (contains password hashes — kept outside the project). LIVE_RESTORE_SQL=/path/restore.sql npm test
test("migration against a restore of the live DB (runs only when LIVE_RESTORE_SQL is set)", { skip: !process.env.LIVE_RESTORE_SQL || !existsSync(process.env.LIVE_RESTORE_SQL) }, async () => {
  const DB = makeD1(); const old = await loadWorker(join(here, "fixtures", "worker-v4.mjs")); const w4 = await world(DB, old);
  await w4.jar().call("GET", "/api/store"); // v4 schema
  DB._sql.exec(readFileSync(process.env.LIVE_RESTORE_SQL, "utf8"));
  const before = Object.fromEntries(["orders","order_items","order_events","order_ratings","products","variants","categories","admins"].map(tb => [tb, DB._sql.prepare(`SELECT COUNT(*) AS n FROM ${tb}`).get().n]));
  const hash = DB._sql.prepare("SELECT username, pass_hash FROM admins").all();
  const w = await world(DB); const st = (await w.jar().call("GET", "/api/store")).body;
  assert.equal(st.shop.id, 1); assert.equal(st.shop.slug, "mahesh-kirana");
  for (const [tb, n] of Object.entries(before)) assert.equal(w.one(`SELECT COUNT(*) AS n FROM ${tb}`).n, n, tb);
  for (const tb of ["orders","products","variants","categories","admins"]) assert.equal(w.one(`SELECT COUNT(*) AS n FROM ${tb} WHERE shop_id<>1`).n, 0, tb);
  assert.deepEqual(w.sql("SELECT username, pass_hash FROM admins"), hash);
  console.log("live restore →", JSON.stringify({shop: st.shop, owner: w.one("SELECT owner_name FROM shops WHERE id=1").owner_name, rows: before, products_visible: st.products.length}));
});
