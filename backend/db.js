/* AVERON database layer (libSQL / Turso).
   - Live site: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (a free Turso database).
   - On your PC with neither set, it uses a local file: backend/data/portfolio.db  */
const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

const onVercel = !!process.env.VERCEL;
const remote = process.env.TURSO_DATABASE_URL;
let client = null;

function open() {
  if (client) return client;
  if (!remote && onVercel) throw new Error("Database is not set up. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project settings.");
  if (remote) client = createClient({ url: remote, authToken: process.env.TURSO_AUTH_TOKEN });
  else {
    const dir = path.join(__dirname, "data");
    fs.mkdirSync(dir, { recursive: true });
    client = createClient({ url: "file:" + path.join(dir, "portfolio.db").replace(/\\/g, "/") });
  }
  return client;
}

const plain = r => ({ ...r });
const arg = v => (v === undefined ? null : v);

const db = {
  async all(sql, args = []) { return (await open().execute({ sql, args: args.map(arg) })).rows.map(plain); },
  async get(sql, args = []) { return (await db.all(sql, args))[0]; },
  async run(sql, args = []) { const r = await open().execute({ sql, args: args.map(arg) }); return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected }; },
  async exec(sql) { await open().executeMultiple(sql); },
  async batch(stmts) { return open().batch(stmts.map(([sql, args = []]) => ({ sql, args: args.map(arg) })), "write"); },
  /* run fn(tx) inside one all-or-nothing transaction */
  async transaction(fn) {
    const t = await open().transaction("write");
    const tx = {
      all: async (sql, args = []) => (await t.execute({ sql, args: args.map(arg) })).rows.map(plain),
      get: async (sql, args = []) => (await tx.all(sql, args))[0],
      run: async (sql, args = []) => { const r = await t.execute({ sql, args: args.map(arg) }); return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected }; }
    };
    try { const out = await fn(tx); await t.commit(); return out; }
    catch (e) { try { await t.rollback(); } catch {} throw e; }
    finally { t.close(); }
  }
};

module.exports = db;
