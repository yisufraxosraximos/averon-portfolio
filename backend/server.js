/* AVERON portfolio server (Express + libSQL/Turso). Works on your PC and on Vercel. */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/* tiny .env loader (PC only) */
try {
  const f = path.join(__dirname, "..", ".env");
  if (fs.existsSync(f)) fs.readFileSync(f, "utf8").split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !l.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch {}

const express = require("express");
const db = require("./db");

const ROOT = path.join(__dirname, "..");
const onVercel = !!process.env.VERCEL;
const secureCookies = onVercel || process.env.NODE_ENV === "production";
// Never ship a known admin password or signing key as a production fallback.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SECRET = process.env.SESSION_SECRET || "";
const CH = 1024 * 1024;          // upload chunk size (1 MB)
const SLICE = 2 * 1024 * 1024;   // max bytes sent per video response (Vercel limit is 4.5 MB)
const MAX_VIDEO = 150 * 1024 * 1024;

const DEFAULT_SETTINGS = {
  ownerName: "Muhammed-Jamiu Yusuf",
  brand: "AVERON",
  tagline: "Websites · Brands · Growth",
  heroLine: "Thoughtful websites for ambitious businesses.",
  roles: "Web Designer · Front-end Developer · Website Builder",
  about: "I'm Muhammed-Jamiu Yusuf, a web designer and developer based in Lagos. Through AVERON, I create clear, responsive websites and online stores for businesses ready to grow. I handle each project personally, from the first conversation through launch.",
  city: "Open to projects worldwide",
  whatsapp: "2348034856578",
  email: "averondigital7@gmail.com",
  instagram: "", twitter: "", linkedin: "", github: "", upwork: "",
  stats: [],
  services: []
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects(
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
  tagline TEXT DEFAULT '', description TEXT DEFAULT '', category TEXT DEFAULT '', year TEXT DEFAULT '',
  link TEXT DEFAULT '', video_type TEXT DEFAULT 'none', video_url TEXT DEFAULT '', video_media INTEGER,
  poster_media INTEGER, sort INTEGER DEFAULT 0, published INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS media(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, mime TEXT, size INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chunks(media_id INTEGER NOT NULL, idx INTEGER NOT NULL, data BLOB, PRIMARY KEY(media_id, idx));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, message TEXT, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`;

let ready = null;
function init() {
  if (!ready) ready = (async () => {
    await db.exec(SCHEMA);
  })().catch(e => { ready = null; throw e; });
  return ready;
}

/* ---------- helpers ---------- */
const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
const clean = (v, n = 500) => String(v == null ? "" : v).trim().slice(0, n);
async function getSettings() {
  const rows = await db.all("SELECT key,value FROM settings");
  const s = { ...DEFAULT_SETTINGS };
  rows.forEach(r => { try { s[r.key] = JSON.parse(r.value); } catch {} });
  return s;
}
function safeUrl(u) {
  u = clean(u, 400); if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { new URL(u); return u; } catch { return ""; }
}
function embedFor(url) {
  // YouTube / Vimeo / Loom links become players; anything else is treated as a direct video file link
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) return { kind: "iframe", src: "https://www.youtube.com/embed/" + m[1] + "?rel=0" };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { kind: "iframe", src: "https://player.vimeo.com/video/" + m[1] };
  m = url.match(/loom\.com\/(?:share|embed)\/([\w]+)/i);
  if (m) return { kind: "iframe", src: "https://www.loom.com/embed/" + m[1] };
  return { kind: "file", src: url };
}
function projectOut(p, admin) {
  const o = {
    id: p.id, slug: p.slug, title: p.title, tagline: p.tagline, description: p.description,
    category: p.category, year: p.year, link: p.link, sort: p.sort,
    poster: p.poster_media ? "/media/" + p.poster_media : "",
    video: null
  };
  if (p.video_type === "upload" && p.video_media) o.video = { kind: "file", src: "/media/" + p.video_media };
  else if (p.video_type === "link" && p.video_url) {
    o.video = embedFor(p.video_url);
    const yt = p.video_url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    if (yt && !o.poster) o.poster = "https://img.youtube.com/vi/" + yt[1] + "/hqdefault.jpg";
  }
  if (admin) { o.published = !!p.published; o.video_type = p.video_type; o.video_url = p.video_url; o.video_media = p.video_media; o.poster_media = p.poster_media; }
  return o;
}

/* ---------- auth (signed cookie, no extra packages) ---------- */
const b64 = b => Buffer.from(b).toString("base64url");
const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function makeToken() { const body = b64(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })); return body + "." + sign(body); }
function okToken(t) {
  if (!t || !SECRET) return false;
  const [body, sig] = String(t).split(".");
  if (!body || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()).exp > Date.now(); } catch { return false; }
}
function cookieOf(req, name) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}
function needAdmin(req, res, next) {
  if (okToken(cookieOf(req, "av_admin"))) return next();
  res.status(401).json({ error: "Please log in again." });
}
const fails = new Map();
function throttled(ip) {
  const f = fails.get(ip); if (!f) return false;
  if (Date.now() - f.t > 15 * 60 * 1000) { fails.delete(ip); return false; }
  return f.n >= 8;
}

/* ---------- app ---------- */
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin"); next(); });
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(ROOT, "public"), { maxAge: "1h", index: false }));
app.use((req, res, next) => { init().then(() => next(), e => { console.error(e); res.status(500).json({ error: e.message || "Database problem" }); }); });

/* pages */
const page = f => (req, res) => res.sendFile(path.join(ROOT, f));
app.get("/", (req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));
app.get("/admin", page("admin.html"));
app.get("/project/:slug", page("project.html"));

/* public API */
app.get("/api/site", async (req, res, next) => {
  try {
    const [s, rows] = await Promise.all([getSettings(), db.all("SELECT * FROM projects WHERE published=1 ORDER BY sort ASC, id DESC")]);
    const projects = rows.map(p => projectOut(p));
    s.stats = (s.stats || []).map(x => x.auto === "projects" ? { ...x, value: projects.length } : x);
    res.set("Cache-Control", "no-store");
    res.json({ settings: s, projects });
  } catch (e) { next(e); }
});
app.get("/api/project/:slug", async (req, res, next) => {
  try {
    const p = await db.get("SELECT * FROM projects WHERE slug=? AND published=1", [req.params.slug]);
    if (!p) return res.status(404).json({ error: "Not found" });
    const others = await db.all("SELECT * FROM projects WHERE published=1 AND id<>? ORDER BY sort ASC, id DESC", [p.id]);
    res.set("Cache-Control", "no-store");
    res.json({ project: projectOut(p), others: others.map(x => projectOut(x)), settings: await getSettings() });
  } catch (e) { next(e); }
});
const lastMsg = new Map();
app.post("/api/contact", async (req, res, next) => {
  try {
    const { name, email, message, website } = req.body || {};
    if (website) return res.status(400).json({ error: "Please try again or contact me directly." }); // honeypot; never show a false success
    if (!clean(name) || !clean(message, 3000)) return res.status(400).json({ error: "Please add your name and a message." });
    const ip = req.ip; if (Date.now() - (lastMsg.get(ip) || 0) < 20000) return res.status(429).json({ error: "Please wait a moment before sending again." });
    lastMsg.set(ip, Date.now());
    await db.run("INSERT INTO messages(name,email,message) VALUES(?,?,?)", [clean(name, 120), clean(email, 160), clean(message, 3000)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* serve uploaded media (images and videos) with Range support, in slices under 4.5 MB */
app.get("/media/:id", async (req, res, next) => {
  try {
    const m = await db.get("SELECT * FROM media WHERE id=?", [Number(req.params.id)]);
    if (!m) return res.status(404).end();
    const size = Number(m.size);
    let start = 0, end = size - 1, partial = false;
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (r) {
      partial = true;
      if (r[1] === "" && r[2] !== "") { start = Math.max(0, size - Number(r[2])); }
      else { start = Number(r[1]); if (r[2] !== "") end = Math.min(end, Number(r[2])); }
      if (start >= size || start > end) { res.status(416).set("Content-Range", `bytes */${size}`); return res.end(); }
    }
    if (end - start + 1 > SLICE) { end = start + SLICE - 1; partial = true; }
    const first = Math.floor(start / CH), last = Math.floor(end / CH);
    const rows = await db.all("SELECT idx,data FROM chunks WHERE media_id=? AND idx BETWEEN ? AND ? ORDER BY idx", [m.id, first, last]);
    const buf = Buffer.concat(rows.map(x => Buffer.from(x.data)));
    const out = buf.subarray(start - first * CH, start - first * CH + (end - start + 1));
    res.status(partial ? 206 : 200);
    res.set({ "Content-Type": m.mime || "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": out.length, "Cache-Control": "public, max-age=86400" });
    if (partial) res.set("Content-Range", `bytes ${start}-${start + out.length - 1}/${size}`);
    res.end(out);
  } catch (e) { next(e); }
});

/* ---------- admin API ---------- */
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD || !SECRET) return res.status(500).json({ error: "ADMIN_PASSWORD and SESSION_SECRET are not set on the server yet." });
  if (throttled(req.ip)) return res.status(429).json({ error: "Too many tries. Wait 15 minutes." });
  const given = Buffer.from(String((req.body || {}).password || "")), real = Buffer.from(ADMIN_PASSWORD);
  const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
  if (!ok) { const f = fails.get(req.ip) || { n: 0, t: Date.now() }; f.n++; fails.set(req.ip, f); return res.status(401).json({ error: "Wrong password." }); }
  fails.delete(req.ip);
  res.setHeader("Set-Cookie", `av_admin=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secureCookies ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => { res.setHeader("Set-Cookie", `av_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies ? "; Secure" : ""}`); res.json({ ok: true }); });
app.get("/api/admin/me", needAdmin, (req, res) => res.json({ ok: true }));

app.get("/api/admin/projects", needAdmin, async (req, res, next) => {
  try { res.json((await db.all("SELECT * FROM projects ORDER BY sort ASC, id DESC")).map(p => projectOut(p, true))); } catch (e) { next(e); }
});
function readProject(b) {
  const vt = ["upload", "link", "none"].includes(b.video_type) ? b.video_type : "none";
  return {
    title: clean(b.title, 120), tagline: clean(b.tagline, 200), description: clean(b.description, 4000),
    category: clean(b.category, 60), year: clean(b.year, 10), link: safeUrl(b.link),
    video_type: vt, video_url: vt === "link" ? safeUrl(b.video_url) : "",
    video_media: vt === "upload" && Number(b.video_media) ? Number(b.video_media) : null,
    poster_media: Number(b.poster_media) || null, published: b.published === false || b.published === 0 ? 0 : 1
  };
}
async function dropMedia(ids) {
  ids = [...new Set(ids.filter(Boolean))];
  for (const id of ids) await db.batch([["DELETE FROM chunks WHERE media_id=?", [id]], ["DELETE FROM media WHERE id=?", [id]]]);
}
app.post("/api/admin/projects", needAdmin, async (req, res, next) => {
  try {
    const p = readProject(req.body || {});
    if (!p.title) return res.status(400).json({ error: "Please give the website a name." });
    let slug = slugify(p.title);
    while (await db.get("SELECT 1 x FROM projects WHERE slug=?", [slug])) slug += "-" + Math.floor(Math.random() * 90 + 10);
    const min = await db.get("SELECT MIN(sort) m FROM projects");
    const r = await db.run(`INSERT INTO projects(slug,title,tagline,description,category,year,link,video_type,video_url,video_media,poster_media,sort,published)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [slug, p.title, p.tagline, p.description, p.category, p.year, p.link, p.video_type, p.video_url, p.video_media, p.poster_media, (min && min.m != null ? Number(min.m) : 0) - 1, p.published]);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { next(e); }
});
app.put("/api/admin/projects/:id", needAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id), old = await db.get("SELECT * FROM projects WHERE id=?", [id]);
    if (!old) return res.status(404).json({ error: "Not found" });
    const p = readProject(req.body || {});
    if (!p.title) return res.status(400).json({ error: "Please give the website a name." });
    await db.run(`UPDATE projects SET title=?,tagline=?,description=?,category=?,year=?,link=?,video_type=?,video_url=?,video_media=?,poster_media=?,published=? WHERE id=?`,
      [p.title, p.tagline, p.description, p.category, p.year, p.link, p.video_type, p.video_url, p.video_media, p.poster_media, p.published, id]);
    const drop = [];
    if (old.video_media && old.video_media !== p.video_media) drop.push(old.video_media);
    if (old.poster_media && old.poster_media !== p.poster_media) drop.push(old.poster_media);
    await dropMedia(drop);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post("/api/admin/projects/:id/move", needAdmin, async (req, res, next) => {
  try {
    const rows = await db.all("SELECT id FROM projects ORDER BY sort ASC, id DESC");
    const i = rows.findIndex(r => r.id === Number(req.params.id)); const j = i + (req.body.dir === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= rows.length) return res.json({ ok: true });
    [rows[i], rows[j]] = [rows[j], rows[i]];
    await db.batch(rows.map((r, k) => ["UPDATE projects SET sort=? WHERE id=?", [k, r.id]]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.delete("/api/admin/projects/:id", needAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id), p = await db.get("SELECT * FROM projects WHERE id=?", [id]);
    if (!p) return res.json({ ok: true });
    await db.run("DELETE FROM projects WHERE id=?", [id]);
    await dropMedia([p.video_media, p.poster_media]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* chunked upload: start -> send chunks -> done */
app.post("/api/admin/media", needAdmin, async (req, res, next) => {
  try {
    const { name, mime, size } = req.body || {};
    const n = Number(size);
    if (!n || n < 1 || n > MAX_VIDEO) return res.status(400).json({ error: "File is too big (max 150 MB). Try a shorter video or paste a YouTube link instead." });
    if (!/^(video|image)\//.test(String(mime))) return res.status(400).json({ error: "Only videos and pictures can be uploaded." });
    const r = await db.run("INSERT INTO media(name,mime,size) VALUES(?,?,?)", [clean(name, 200), String(mime), n]);
    res.json({ id: r.lastInsertRowid, chunk: CH });
  } catch (e) { next(e); }
});
app.put("/api/admin/media/:id/:idx", needAdmin, express.raw({ type: "*/*", limit: "2mb" }), async (req, res, next) => {
  try {
    const id = Number(req.params.id), idx = Number(req.params.idx);
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Empty chunk" });
    const m = await db.get("SELECT * FROM media WHERE id=?", [id]);
    if (!m) return res.status(404).json({ error: "Upload not found" });
    await db.run("INSERT OR REPLACE INTO chunks(media_id,idx,data) VALUES(?,?,?)", [id, idx, req.body]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post("/api/admin/media/:id/done", needAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id), m = await db.get("SELECT * FROM media WHERE id=?", [id]);
    if (!m) return res.status(404).json({ error: "Upload not found" });
    const t = await db.get("SELECT COUNT(*) c, COALESCE(SUM(LENGTH(data)),0) s FROM chunks WHERE media_id=?", [id]);
    if (Number(t.s) !== Number(m.size)) { await dropMedia([id]); return res.status(400).json({ error: "Upload was incomplete. Please try again." }); }
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});
app.delete("/api/admin/media/:id", needAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const used = await db.get("SELECT 1 x FROM projects WHERE video_media=? OR poster_media=?", [id, id]);
    if (!used) await dropMedia([id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/admin/settings", needAdmin, async (req, res, next) => { try { res.json(await getSettings()); } catch (e) { next(e); } });
app.put("/api/admin/settings", needAdmin, async (req, res, next) => {
  try {
    const b = req.body || {}, out = {};
    ["ownerName", "brand", "tagline", "heroLine", "roles", "city", "email", "instagram", "twitter", "linkedin", "github", "upwork"].forEach(k => { if (k in b) out[k] = clean(b[k], 200); });
    if ("about" in b) out.about = clean(b.about, 3000);
    if ("whatsapp" in b) out.whatsapp = clean(b.whatsapp, 30).replace(/[^\d]/g, "");
    if (Array.isArray(b.stats)) out.stats = b.stats.slice(0, 4).map(x => ({ label: clean(x.label, 40), value: Math.max(0, Number(x.value) || 0), auto: x.auto === "projects" ? "projects" : undefined })).filter(x => x.label);
    if (Array.isArray(b.services)) out.services = b.services.slice(0, 8).map(x => ({ title: clean(x.title, 60), price: clean(x.price, 60), text: clean(x.text, 300) })).filter(x => x.title);
    await db.batch(Object.entries(out).map(([k, v]) => ["INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", [k, JSON.stringify(v)]]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/admin/messages", needAdmin, async (req, res, next) => { try { res.json(await db.all("SELECT * FROM messages ORDER BY id DESC LIMIT 200")); } catch (e) { next(e); } });
app.post("/api/admin/messages/:id/read", needAdmin, async (req, res, next) => { try { await db.run("UPDATE messages SET is_read=1 WHERE id=?", [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { next(e); } });
app.delete("/api/admin/messages/:id", needAdmin, async (req, res, next) => { try { await db.run("DELETE FROM messages WHERE id=?", [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { next(e); } });

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, "public", "index.html")));
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ error: err.message || "Something went wrong" }); });

module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("AVERON portfolio running on http://localhost:" + port + "  (admin: /admin)"));
}
