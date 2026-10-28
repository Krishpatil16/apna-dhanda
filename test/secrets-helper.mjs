// Test-only: the Worker reads its operator secrets from env (Cloudflare Worker secrets), never from source.
// withSecrets() wraps a loaded worker so every fetch/scheduled call gets test values for
// SETUP_KEY_HASH, DEV_RECOVERY_HASH and DEV_SEED (same formats as production, see the top of site/_worker.mjs).
import { pbkdf2Sync } from "node:crypto";
const cache = new Map();
const SALT = "cd".repeat(16);
export function keyHash(key, salt = SALT, iter = 100000){
  const k = key + "|" + salt + "|" + iter; if (!cache.has(k)) cache.set(k, pbkdf2Sync(key, Buffer.from(salt, "hex"), iter, 32, "sha256").toString("hex"));
  return `pbkdf2-sha256$${iter}$${salt}$${cache.get(k)}`;
}
export function secretsEnv({ setupKey, devSeed, devRecovery } = {}){
  const e = {};
  if (setupKey) e.SETUP_KEY_HASH = keyHash(setupKey);
  if (devRecovery) e.DEV_RECOVERY_HASH = keyHash(devRecovery);
  if (devSeed) e.DEV_SEED = `${devSeed.username}$${devSeed.salt}$${devSeed.hash}`;
  return e;
}
export function withSecrets(worker, opts){
  const s = secretsEnv(opts);
  const fill = env => { if (env && typeof env === "object") for (const [k, v] of Object.entries(s)) if (!(k in env)) env[k] = v; return env; };
  const w = { ...worker };
  if (worker.fetch) w.fetch = (req, env, ctx) => worker.fetch(req, fill(env), ctx);
  if (worker.scheduled) w.scheduled = (ev, env, ctx) => worker.scheduled(ev, fill(env), ctx);
  return w;
}
