// Minimal D1-compatible shim over better-sqlite3, for local tests and local development.
import Database from "better-sqlite3";
export function makeD1(file = ":memory:"){
  const sql = new Database(file); sql.pragma("foreign_keys = ON");
  const conv = a => a.map(x => typeof x === "boolean" ? (x?1:0) : x === undefined ? null : x);
  class Stmt {
    constructor(q, args=[]){ this.q = q; this.args = args; }
    bind(...a){ return new Stmt(this.q, conv(a)); }
    _s(){ return sql.prepare(this.q); }
    async first(col){ const s = this._s(); const r = s.reader ? s.get(...this.args) : (s.run(...this.args), undefined); return r == null ? null : col ? r[col] : r; }
    async all(){ const s = this._s(); if (s.reader) return {results: s.all(...this.args), success:true, meta:{}}; const i = s.run(...this.args); return {results:[], success:true, meta:{changes:i.changes, last_row_id:i.lastInsertRowid}}; }
    async run(){ return this._runSync(); }
    _runSync(){ const s = this._s(); if (s.reader) { const rows = s.all(...this.args); return {results:rows, success:true, meta:{changes:0}}; } const i = s.run(...this.args); return {results:[], success:true, meta:{changes:i.changes, last_row_id:Number(i.lastInsertRowid)}}; }
  }
  return {
    prepare: q => new Stmt(q),
    batch: async stmts => sql.transaction(() => stmts.map(s => s._runSync()))(),
    exec: async q => sql.exec(q),
    _sql: sql
  };
}
