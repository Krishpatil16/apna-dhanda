// Makes NEW operator secrets for the live Worker (setup key, God Mode recovery key, God Mode password).
// Usage:  node tools/make-secrets.mjs            (prints new plain keys for YOU to save, and the 3 hashes to store)
// Then, for each hash line:  npx wrangler secret put <NAME> --config wrangler.apnadhanda.toml   (paste the value when asked)
// The plain keys are shown once — keep them in your password manager. Never commit them, never put them in code.
// Note: DEV_SEED is only used on an EMPTY database. To change the password of an existing God Mode account,
// use Dev → Platform → "Your account", or the /dev "Forgot password?" screen with the recovery key.
import { pbkdf2Sync, randomBytes, randomInt } from "node:crypto";
const ITER = 100000; // same as the Worker (Cloudflare's PBKDF2 limit)
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O, 1/l/I
const rand = n => Array.from({length: n}, () => ALPHA[randomInt(ALPHA.length)]).join("");
const group = (s, k) => s.match(new RegExp(`.{1,${k}}`, "g")).join("-");
const pb = (pw, salt) => pbkdf2Sync(pw, Buffer.from(salt, "hex"), ITER, 32, "sha256").toString("hex");
const keyHash = k => { const salt = randomBytes(16).toString("hex"); return `pbkdf2-sha256$${ITER}$${salt}$${pb(k, salt)}`; };
const setupKey = group(rand(36), 6), recoveryKey = group(rand(36), 6), password = group(rand(24), 4);
const seedSalt = randomBytes(16).toString("hex");
console.log("\nSAVE THESE (shown once):");
console.log("  setup key     :", setupKey);
console.log("  recovery key  :", recoveryKey);
console.log("  God Mode user : krish-dev");
console.log("  God Mode pass :", password);
console.log("\nWorker secrets (wrangler secret put NAME --config wrangler.apnadhanda.toml):");
console.log("  SETUP_KEY_HASH    =", keyHash(setupKey));
console.log("  DEV_RECOVERY_HASH =", keyHash(recoveryKey));
console.log("  DEV_SEED          =", `krish-dev$${seedSalt}$${pb(password, seedSalt)}`);
console.log("");
