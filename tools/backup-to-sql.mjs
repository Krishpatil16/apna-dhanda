#!/usr/bin/env node
// Turn a "Download full backup" JSON into SQL you can load into a fresh D1 database.
// Usage:  node tools/backup-to-sql.mjs kirana-backup-....json > restore.sql
// See README → "Backup & restore" for the full steps.
import { readFileSync } from "node:fs";
const b = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (b.format !== "kirana-backup") { console.error("Not a kirana backup file"); process.exit(1); }
// v5: a shopkeeper's own backup holds ONE shop. Restoring it with this tool would wipe every other shop — refuse.
if (b.scope && b.scope !== "all_shops") { console.error("This is a single-shop backup (shop " + b.scope.shop_id + "). Use the developer's full backup (/dev → Download full backup) for a database restore."); process.exit(1); }
// Parents before children (foreign keys). schema_version/rate tables are left to the app's own migrations.
const ORDER = ["audit_log","shops","shop_settings","settings","categories","products","variants","images","offers","offer_items","orders","order_items","order_events","order_ratings","service_state","service_log","notification_attempts","error_log","metrics"];
const q = v => v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const out = ["PRAGMA defer_foreign_keys = on;", "DELETE FROM audit_ctx;"];
for (const t of [...ORDER].reverse()) out.push(`DELETE FROM ${t};`);
for (const t of ORDER) for (const r of (b.tables[t] || [])) { const cols = Object.keys(r); out.push(`INSERT INTO ${t} (${cols.join(",")}) VALUES (${cols.map(c => q(r[c])).join(",")});`); }
// audit_log goes in first; the audit triggers then add replay rows while variants/orders are re-inserted — drop those, keep the backed-up history.
const maxAudit = Math.max(0, ...(b.tables.audit_log || []).map(r => r.id));
out.push(`DELETE FROM audit_log WHERE id > ${maxAudit};`);
console.log(out.join("\n"));
