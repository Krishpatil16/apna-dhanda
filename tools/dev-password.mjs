// Emergency reset of the /dev (developer) password, for when you forgot it AND lost the recovery key.
// Usage:  node tools/dev-password.mjs "my-new-strong-password"
// It prints one wrangler command. Run that command (it changes the password in the live D1 database "kirana-db").
// Normal way (no command needed): Dev → Platform → "Your account" → Change password, or on the /dev login screen
// tap "Forgot password? Use the recovery key".
import { pbkdf2Sync, randomBytes } from "node:crypto";
const pw = process.argv[2] || "";
if (pw.length < 12) { console.error('Password must be 12+ characters. Example: node tools/dev-password.mjs "Mera-Naya-Password-2026"'); process.exit(1); }
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(pw, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"); // same as the Worker (PBKDF2-SHA256, 100k)
const sql = `UPDATE dev_accounts SET pass_hash='${hash}', salt='${salt}' WHERE id=(SELECT id FROM dev_accounts ORDER BY id LIMIT 1); DELETE FROM dev_sessions;`;
console.log("\nRun this (one line) in the VS Code terminal:\n");
console.log(`npx wrangler d1 execute kirana-db --remote --config wrangler.apnadhanda.toml --command "${sql}"\n`);
console.log("Then log in at /dev with username krish-dev and the new password.\n");
