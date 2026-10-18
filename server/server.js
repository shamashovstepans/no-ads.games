// Likes for no-ads.games: one like per visitor per game, with counts everyone can see.
//
//   GET    /likes          -> { counts: { game: n }, liked: [games this visitor liked] }
//   PUT    /likes/:game    -> like     { game, count, liked: true }
//   DELETE /likes/:game    -> unlike   { game, count, liked: false }
//   GET    /health         -> ok
//
// The visitor is a random UUID the page keeps in localStorage, sent as the X-Visitor header.
// Only an HMAC of it is stored. IP addresses stay in memory, for rate limiting only.

import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const DB_PATH = process.env.DB_PATH || "./likes.db";
// Set in production: a random secret per start would make every visitor new after a restart.
const SECRET = process.env.VISITOR_SECRET || randomBytes(32).toString("hex");
const ORIGINS = new Set((process.env.ALLOWED_ORIGINS || "https://no-ads.games").split(",").map((o) => o.trim()));
const GAMES = ["drift-survivors", "pocket-cosmo", "pocket-metropolis"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// New likes allowed per IP per hour; shared networks (schools, offices) need some headroom
const LIKES_PER_HOUR = 40;

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
`);
const insertLike = db.prepare("INSERT OR IGNORE INTO likes (game, voter, created_at) VALUES (?, ?, ?)");
const deleteLike = db.prepare("DELETE FROM likes WHERE game = ? AND voter = ?");
const likedBy = db.prepare("SELECT game FROM likes WHERE voter = ?");

const counts = Object.fromEntries(GAMES.map((game) => [game, 0]));
for (const { game, n } of db.prepare("SELECT game, COUNT(*) AS n FROM likes GROUP BY game").all()) {
  if (game in counts) counts[game] = n;
}

const voterOf = (visitor) => createHmac("sha256", SECRET).update(visitor.toLowerCase()).digest("base64url");

const recentLikes = new Map(); // ip -> timestamps of new likes in the last hour
function allowLike(ip) {
  const now = Date.now();
  const times = (recentLikes.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (times.length >= LIKES_PER_HOUR) return false;
  times.push(now);
  recentLikes.set(ip, times);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of recentLikes) if (times.every((t) => now - t >= 3_600_000)) recentLikes.delete(ip);
}, 600_000).unref();

// Railway's edge puts the caller's address in X-Real-IP
const clientIp = (req) =>
  req.headers["x-real-ip"] || (req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress;

function send(req, res, status, body) {
  const origin = req.headers.origin;
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "X-Visitor";
    headers["Access-Control-Max-Age"] = "86400";
  }
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") return send(req, res, 204);
  if (pathname === "/health") return send(req, res, 200, { ok: true });

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
});

server.listen(PORT, () => console.log(`likes listening on ${PORT}, db ${DB_PATH}`));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => (db.close(), process.exit(0))));
}
