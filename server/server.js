// Likes and feedback for no-ads.games.
//
//   GET    /likes          -> { counts: { game: n }, liked: [games this visitor liked] }
//   PUT    /likes/:game    -> like     { game, count, liked: true }
//   DELETE /likes/:game    -> unlike   { game, count, liked: false }
//   POST   /feedback       -> { ok: true }   body { message, topic?, email?, page?, website? }
//   GET    /feedback       -> { items: [...] }   newest first; needs Authorization: Bearer <ADMIN_TOKEN>
//   DELETE /feedback/:id   -> { ok: true }   needs the same token
//   GET    /health         -> ok
//
// The visitor is a random UUID the page keeps in localStorage, sent as the X-Visitor header.
// Only an HMAC of it is stored. IP addresses stay in memory, for rate limiting only.

import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const DB_PATH = process.env.DB_PATH || "./likes.db";
// Set in production: a random secret per start would make every visitor new after a restart.
const SECRET = process.env.VISITOR_SECRET || randomBytes(32).toString("hex");
// Reading feedback is switched off until this is set
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ORIGINS = new Set((process.env.ALLOWED_ORIGINS || "https://no-ads.games").split(",").map((o) => o.trim()));
const GAMES = ["drift-survivors", "pocket-cosmo", "pocket-metropolis"];
const TOPICS = [...GAMES, "site", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS likes (
    game TEXT NOT NULL,
    voter TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (game, voter)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    topic TEXT NOT NULL,
    message TEXT NOT NULL,
    email TEXT,
    page TEXT,
    user_agent TEXT
  );
`);
const insertLike = db.prepare("INSERT OR IGNORE INTO likes (game, voter, created_at) VALUES (?, ?, ?)");
const deleteLike = db.prepare("DELETE FROM likes WHERE game = ? AND voter = ?");
const likedBy = db.prepare("SELECT game FROM likes WHERE voter = ?");
const insertFeedback = db.prepare(
  "INSERT INTO feedback (created_at, topic, message, email, page, user_agent) VALUES (?, ?, ?, ?, ?, ?)");
const listFeedback = db.prepare("SELECT * FROM feedback ORDER BY id DESC LIMIT 500");
const deleteFeedback = db.prepare("DELETE FROM feedback WHERE id = ?");

const counts = Object.fromEntries(GAMES.map((game) => [game, 0]));
for (const { game, n } of db.prepare("SELECT game, COUNT(*) AS n FROM likes GROUP BY game").all()) {
  if (game in counts) counts[game] = n;
}

const voterOf = (visitor) => createHmac("sha256", SECRET).update(visitor.toLowerCase()).digest("base64url");

// Per-IP allowance per hour, in memory only. Shared networks (schools, offices) need headroom for likes.
function hourlyLimit(max) {
  const recent = new Map(); // ip -> timestamps in the last hour
  setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of recent) if (times.every((t) => now - t >= 3_600_000)) recent.delete(ip);
  }, 600_000).unref();
  return (ip) => {
    const now = Date.now();
    const times = (recent.get(ip) || []).filter((t) => now - t < 3_600_000);
    if (times.length >= max) return false;
    times.push(now);
    recent.set(ip, times);
    return true;
  };
}
const allowLike = hourlyLimit(40);
const allowFeedback = hourlyLimit(5);

// Railway's edge puts the caller's address in X-Real-IP
const clientIp = (req) =>
  req.headers["x-real-ip"] || (req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress;

function isAdmin(req) {
  const given = Buffer.from((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(ADMIN_TOKEN);
  return ADMIN_TOKEN.length >= 16 && given.length === expected.length && timingSafeEqual(given, expected);
}

function readJson(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // Past the limit, keep draining without storing so the caller still gets a proper answer
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > limit) return reject(new Error("too large"));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

function send(req, res, status, body) {
  const origin = req.headers.origin;
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "X-Visitor, Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "86400";
  }
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function handleFeedback(req, res, pathname) {
  if (pathname === "/feedback" && req.method === "POST") {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return error.message === "too large"
        ? send(req, res, 413, { error: "Message too long" })
        : send(req, res, 400, { error: "Send the message as JSON" });
    }
    // Bots fill in the hidden "website" field; tell them it worked and keep nothing
    if (body.website) return send(req, res, 200, { ok: true });
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 2 || message.length > 2000) return send(req, res, 400, { error: "Write 2 to 2000 characters" });
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
    if (email && !EMAIL.test(email)) return send(req, res, 400, { error: "Check the email address" });
    if (!allowFeedback(clientIp(req))) return send(req, res, 429, { error: "Too many messages from this network, try later" });
    insertFeedback.run(
      Date.now(),
      TOPICS.includes(body.topic) ? body.topic : "other",
      message,
      email || null,
      typeof body.page === "string" ? body.page.slice(0, 200) : null,
      (req.headers["user-agent"] || "").slice(0, 300) || null,
    );
    return send(req, res, 201, { ok: true });
  }
  if (!isAdmin(req)) return send(req, res, 401, { error: "Needs the inbox key" });
  if (pathname === "/feedback" && req.method === "GET") return send(req, res, 200, { items: listFeedback.all() });
  const match = pathname.match(/^\/feedback\/(\d+)$/);
  if (match && req.method === "DELETE") {
    deleteFeedback.run(Number(match[1]));
    return send(req, res, 200, { ok: true });
  }
  return send(req, res, 404, { error: "Not found" });
}

function handleLikes(req, res, pathname) {
  const visitor = req.headers["x-visitor"];
  const validVisitor = typeof visitor === "string" && UUID.test(visitor);

  if (pathname === "/likes" && req.method === "GET") {
    const liked = validVisitor ? likedBy.all(voterOf(visitor)).map((row) => row.game) : [];
    return send(req, res, 200, { counts, liked });
  }

  const match = pathname.match(/^\/likes\/([a-z-]+)$/);
  if (!match) return send(req, res, 404, { error: "Not found" });
  const game = match[1];
  if (!GAMES.includes(game)) return send(req, res, 404, { error: "Unknown game" });
  if (!validVisitor) return send(req, res, 400, { error: "X-Visitor must be a UUID" });
  const voter = voterOf(visitor);

  if (req.method === "PUT") {
    const exists = likedBy.all(voter).some((row) => row.game === game);
    if (!exists) {
      if (!allowLike(clientIp(req))) return send(req, res, 429, { error: "Too many likes from this network, try later" });
      if (insertLike.run(game, voter, Date.now()).changes) counts[game]++;
    }
    return send(req, res, 200, { game, count: counts[game], liked: true });
  }
  if (req.method === "DELETE") {
    if (deleteLike.run(game, voter).changes) counts[game]--;
    return send(req, res, 200, { game, count: counts[game], liked: false });
  }
  return send(req, res, 405, { error: "Method not allowed" });
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") return send(req, res, 204);
  if (pathname === "/health") return send(req, res, 200, { ok: true });
  if (pathname === "/feedback" || pathname.startsWith("/feedback/")) {
    return handleFeedback(req, res, pathname).catch(() => send(req, res, 500, { error: "Something went wrong" }));
  }
  return handleLikes(req, res, pathname);
});

server.listen(PORT, () => console.log(`likes listening on ${PORT}, db ${DB_PATH}`));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => (db.close(), process.exit(0))));
}
