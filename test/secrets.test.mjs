// Security: operator secrets come only from Worker secrets (env), stored as PBKDF2 — never in source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { pbkdf2Sync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./d1-shim.mjs";
import { keyHash, secretsEnv } from "./secrets-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "..", "site", "_worker.mjs"), "utf8");
const DEV_PASS = "secret-test-password-123", DEV_REC = "secret-test-recovery-key-0001", SETUP = "secret-test-setup-key-0001";
const salt = "ef".repeat(16), hash = pbkdf2Sync(DEV_PASS, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
async function load(){ const f = join(mkdtempSync(join(tmpdir(), "kirana-sec-")), "w.mjs"); writeFileSync(f, SRC); return (await import(f)).default; }
function caller(worker, env){
  return async (method, path, body, ip = "9.9.9.9") => {
    const h = {"cf-connecting-ip": ip}; if (body !== undefined) h["content-type"] = "application/json";
    if (method !== "GET" && path.startsWith("/api/dev/")) h["x-requested-with"] = "kirana-dev";
    if (method !== "GET" && path.startsWith("/api/admin/")) h["x-requested-with"] = "kirana";
    const r = await worker.fetch(new Request("https://k.test" + path, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)}), env);
    return {status: r.status, body: (r.headers.get("content-type") || "").includes("json") ? await r.json() : await r.text()};
  };
}
const ASSETS = {fetch: async r => new Response("asset " + new URL(r.url).pathname, {headers: {"content-type": "text/html"}})};

test("secrets: no secret, secret hash or dev seed is hardcoded in the worker source", () => {
  assert.ok(!/SETUP_KEY_SHA256|DEV_RECOVERY_SHA256|const DEV_SEED/.test(SRC));
  assert.ok(!/["'][0-9a-f]{64}["']/.test(SRC), "no 64-hex constant in source");
  assert.ok(SRC.includes("env.SETUP_KEY_HASH") || SRC.includes("e.SETUP_KEY_HASH"));
});

test("secrets: with no Worker secrets the app still works, no dev account is seeded, recovery and setup refuse", async () => {
  const DB = makeD1(); const call = caller(await load(), {DB, ASSETS});
  assert.equal((await call("GET", "/health")).status, 200);
  assert.equal((await call("POST", "/api/dev/login", {username: "krish-dev", password: DEV_PASS})).status, 401);
  assert.equal((await call("POST", "/api/dev/recover", {recovery_key: DEV_REC, password: "another-long-pass"})).status, 403);
  const s = await call("POST", "/api/admin/setup", {setup_key: SETUP, username: "owner1", password: "owner-pass-123"});
  assert.ok([403, 409].includes(s.status), "setup refused: " + s.status);
});

test("secrets: PBKDF2 secrets accept the right keys and reject wrong / malformed ones", async () => {
  const env = {DB: makeD1(), ASSETS, ...secretsEnv({setupKey: SETUP, devRecovery: DEV_REC, devSeed: {username: "krish-dev", salt, hash}})};
  assert.match(env.SETUP_KEY_HASH, /^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  const call = caller(await load(), env);
  assert.equal((await call("POST", "/api/dev/login", {username: "krish-dev", password: DEV_PASS})).status, 200);
  assert.equal((await call("POST", "/api/dev/recover", {recovery_key: DEV_REC + "x", password: "another-long-pass"})).status, 403);
  assert.equal((await call("POST", "/api/dev/recover", {recovery_key: DEV_REC, password: "short"})).status, 400, "right key reaches the password check");
  assert.equal((await call("POST", "/api/dev/recover", {recovery_key: DEV_REC, password: "brand-new-pass-1"})).status, 200);
  assert.equal((await call("POST", "/api/dev/login", {username: "krish-dev", password: DEV_PASS}, "9.9.9.8")).status, 401, "old password stops working");
  assert.equal((await call("POST", "/api/dev/login", {username: "krish-dev", password: "brand-new-pass-1"}, "9.9.9.8")).status, 200);
  assert.equal((await call("POST", "/api/admin/setup", {setup_key: SETUP + "x", username: "owner1", password: "owner-pass-123"})).status, 403);
  assert.equal((await call("POST", "/api/admin/setup", {setup_key: SETUP, username: "owner1", password: "owner-pass-123"})).status, 200);
  // malformed secret → refuse, never crash
  const bad = caller(await load(), {DB: makeD1(), ASSETS, DEV_SEED: "krish-dev$" + salt + "$" + hash, DEV_RECOVERY_HASH: "sha256$" + "0".repeat(64), SETUP_KEY_HASH: keyHash(SETUP, salt, 200000)});
  assert.equal((await bad("POST", "/api/dev/recover", {recovery_key: DEV_REC, password: "another-long-pass"})).status, 403);
  const st = await bad("POST", "/api/admin/setup", {setup_key: SETUP, username: "owner1", password: "owner-pass-123"});
  assert.equal(st.status, 403, "over-limit iterations refused: " + st.status);
});
