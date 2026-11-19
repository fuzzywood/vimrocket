import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import {
  hashPassword,
  hashToken,
  newSessionToken,
  RateLimiter,
  validateEmail,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "./auth.ts";
import { readLegalPage } from "./legal.ts";
import { passwordResetEmail, verificationEmail, type Mailer, type MailMessage } from "./mailer.ts";
import { toSessionUser, type SessionUser, type Store, type TokenPurpose } from "./store.ts";

export interface AppOptions {
  store: Store;
  mailer: Mailer;
  appUrl: string;
  staticDir?: string;
  legalDir?: string;
  secureCookies?: boolean;
  trustProxy?: boolean;
}

const COOKIE = "lv_session";
const SITE_URL_PLACEHOLDER = "%SITE_URL%";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;
const MAX_LESSONS = 1000;
const HOUR = 60 * 60 * 1000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ProgressData {
  lessons: Record<string, { completedAt: number; bestKeys: number }>;
  last?: string;
}

function parseProgress(input: unknown): ProgressData {
  if (!input || typeof input !== "object") throw new HttpError(400, "Invalid progress data.");
  const { lessons, last } = input as Record<string, unknown>;
  if (!lessons || typeof lessons !== "object" || Array.isArray(lessons)) throw new HttpError(400, "Invalid progress data.");
  const entries = Object.entries(lessons as Record<string, unknown>);
  if (entries.length > MAX_LESSONS) throw new HttpError(400, "Too many lessons.");
  const clean: ProgressData = { lessons: {} };
  for (const [id, value] of entries) {
    const v = value as Record<string, unknown> | null;
    if (id.length > 100 || !v || !Number.isFinite(v.completedAt) || !Number.isFinite(v.bestKeys)) {
      throw new HttpError(400, "Invalid progress entry.");
    }
    clean.lessons[id] = { completedAt: Number(v.completedAt), bestKeys: Math.max(0, Math.floor(Number(v.bestKeys))) };
  }
  if (typeof last === "string" && last.length <= 100) clean.last = last;
  return clean;
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
    throw new HttpError(415, "Expected application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Request body too large.");
    chunks.push(chunk as Buffer);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
  } catch {
    throw new HttpError(400, "Malformed JSON.");
  }
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

const publicUser = (user: SessionUser) => ({ username: user.username, email: user.email, emailVerified: user.emailVerified });

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function createApp({ store, mailer, appUrl, staticDir, legalDir, secureCookies = false, trustProxy = false }: AppOptions): RequestListener {
  const authLimiter = new RateLimiter(20, 15 * 60 * 1000);
  const mailIpLimiter = new RateLimiter(10, HOUR);
  const mailTargetLimiter = new RateLimiter(3, HOUR);
  const dummyHash = hashPassword(newSessionToken());

  const clientIp = (req: IncomingMessage): string => {
    if (trustProxy) {
      const real = req.headers["x-real-ip"];
      if (typeof real === "string" && real) return real.trim();
      const forwarded = req.headers["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded) return forwarded.split(",").at(-1)!.trim();
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  const sessionCookie = (token: string, maxAgeSeconds: number): string =>
    [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`, secureCookies ? "Secure" : ""]
      .filter(Boolean)
      .join("; ");

  const currentUser = (req: IncomingMessage): SessionUser | undefined => {
    const token = readCookie(req, COOKIE);
    return token ? store.findSessionUser(hashToken(token), Date.now()) : undefined;
  };

  const requireUser = (req: IncomingMessage): SessionUser => {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, "Not signed in.");
    return user;
  };

  const startSession = (res: ServerResponse, user: SessionUser): void => {
    const token = newSessionToken();
    store.purgeExpired(Date.now());
    store.createSession(hashToken(token), user.id, Date.now() + SESSION_TTL_MS);
    sendJson(res, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS / 1000) });
  };

  const limit = (limiter: RateLimiter, key: string): void => {
    if (!limiter.allow(key)) throw new HttpError(429, "Too many attempts. Please try again later.");
  };

  const deliver = (message: MailMessage): void => {
    mailer.send(message).catch((err: unknown) => console.error(`[mail] failed to send "${message.subject}" to ${message.to}:`, err));
  };

  const issueToken = (userId: number, purpose: TokenPurpose, ttl: number): string => {
    const token = newSessionToken();
    store.createEmailToken(hashToken(token), userId, purpose, Date.now() + ttl);
    return token;
  };

  const sendVerification = (user: { id: number; username: string; email: string | null }): void => {
    if (!user.email) return;
    const token = issueToken(user.id, "verify", VERIFY_TTL_MS);
    deliver(verificationEmail(user.email, user.username, `${appUrl}/verify#token=${token}`));
  };

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    switch (`${req.method} ${path}`) {
      case "POST /api/register": {
        limit(authLimiter, clientIp(req));
        const body = await readJson(req);
        const username = str(body.username);
        const email = str(body.email).toLowerCase();
        const error = validateUsername(username) ?? validateEmail(email) ?? validatePassword(body.password);
        if (error) throw new HttpError(400, error);
        const result = store.createUser(username, email, await hashPassword(body.password as string));
        if (result === "username") throw new HttpError(409, "That username is already taken.");
        if (result === "email") throw new HttpError(409, "An account with that email already exists. Try signing in or resetting your password.");
        const user: SessionUser = { id: result, username, email, emailVerified: false };
        sendVerification(user);
        return startSession(res, user);
      }
      case "POST /api/login": {
        limit(authLimiter, clientIp(req));
        const body = await readJson(req);
        const login = str(body.login ?? body.username);
        const password = typeof body.password === "string" ? body.password : "";
        const row = login ? store.findUserByLogin(login) : undefined;
        const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
        if (!row || !ok) throw new HttpError(401, "Wrong username, email or password.");
        return startSession(res, toSessionUser(row));
      }
      case "POST /api/logout": {
        const token = readCookie(req, COOKIE);
        if (token) store.deleteSession(hashToken(token));
        return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
      }
      case "GET /api/me": {
        const user = currentUser(req);
        return sendJson(res, 200, { user: user ? publicUser(user) : null });
      }
      case "POST /api/email/verify": {
        limit(authLimiter, clientIp(req));
        const body = await readJson(req);
        const userId = store.consumeEmailToken(hashToken(str(body.token)), "verify", Date.now());
        if (userId === undefined) throw new HttpError(400, "This confirmation link is invalid or has expired.");
        store.markEmailVerified(userId);
        const current = currentUser(req);
        return sendJson(res, 200, { ok: true, user: current ? publicUser(current) : null });
      }
      case "POST /api/email/resend": {
        const user = requireUser(req);
        if (user.emailVerified) return sendJson(res, 200, { ok: true, alreadyVerified: true });
        limit(mailIpLimiter, clientIp(req));
        limit(mailTargetLimiter, `user:${user.id}`);
        sendVerification(user);
        return sendJson(res, 200, { ok: true });
      }
      case "POST /api/password/forgot": {
        limit(mailIpLimiter, clientIp(req));
        const body = await readJson(req);
        const email = str(body.email).toLowerCase();
        const error = validateEmail(email);
        if (error) throw new HttpError(400, error);
        const row = store.findUserByEmail(email);
        if (row?.email && mailTargetLimiter.allow(`email:${row.email}`)) {
          const token = issueToken(row.id, "reset", RESET_TTL_MS);
          deliver(passwordResetEmail(row.email, row.username, `${appUrl}/reset#token=${token}`));
        }
        return sendJson(res, 200, { ok: true });
      }
      case "POST /api/password/reset": {
        limit(authLimiter, clientIp(req));
        const body = await readJson(req);
        const error = validatePassword(body.password);
        if (error) throw new HttpError(400, error);
        const userId = store.consumeEmailToken(hashToken(str(body.token)), "reset", Date.now());
        const row = userId === undefined ? undefined : store.findUserById(userId);
        if (!row) throw new HttpError(400, "This reset link is invalid or has expired. Please request a new one.");
        store.setPassword(row.id, await hashPassword(body.password as string));
        store.markEmailVerified(row.id);
        store.deleteUserSessions(row.id);
        return startSession(res, toSessionUser(store.findUserById(row.id)!));
      }
      case "GET /api/progress": {
        const user = requireUser(req);
        const data = store.getProgress(user.id);
        return sendJson(res, 200, { progress: data ? JSON.parse(data) : null });
      }
      case "PUT /api/progress": {
        const user = requireUser(req);
        const progress = parseProgress(await readJson(req));
        store.saveProgress(user.id, JSON.stringify(progress));
        return sendJson(res, 200, { ok: true });
      }
      default:
        throw new HttpError(404, "Not found.");
    }
  }

  function health(res: ServerResponse): void {
    let healthy = false;
    try {
      healthy = store.ping();
    } catch {
      healthy = false;
    }
    sendJson(res, healthy ? 200 : 503, { status: healthy ? "ok" : "error", database: healthy ? "ok" : "unavailable" });
  }

  const htmlCache = new Map<string, Buffer>();

  async function readStatic(file: string): Promise<Buffer | null> {
    if (extname(file) !== ".html") return readFile(file).catch(() => null);
    const cached = htmlCache.get(file);
    if (cached) return cached;
    const raw = await readFile(file, "utf8").catch(() => null);
    if (raw === null) return null;
    const html = Buffer.from(raw.replaceAll(SITE_URL_PLACEHOLDER, appUrl));
    htmlCache.set(file, html);
    return html;
  }

  async function resolveStatic(root: string, path: string): Promise<string | null> {
    let file: string;
    try {
      file = resolve(join(root, normalize(decodeURIComponent(path))));
    } catch {
      return null;
    }
    if (file !== root && !file.startsWith(root + sep)) return null;
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) return file;
    if (info?.isDirectory()) {
      const index = join(file, "index.html");
      if ((await stat(index).catch(() => null))?.isFile()) return index;
    }
    return null;
  }

  async function sitemap(root: string): Promise<string> {
    const paths = JSON.parse(await readFile(join(root, "sitemap-paths.json"), "utf8")) as string[];
    const urls = paths
      .map((p) => `  <url><loc>${appUrl}${p}</loc><priority>${p === "/" ? "1.0" : p.startsWith("/lesson/") ? "0.8" : "0.6"}</priority></url>`)
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (!staticDir || (req.method !== "GET" && req.method !== "HEAD")) throw new HttpError(404, "Not found.");
    const root = resolve(staticDir);
    if (path === "/robots.txt") {
      res.writeHead(200, { "Content-Type": MIME[".txt"], "Cache-Control": "public, max-age=3600" });
      res.end(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${appUrl}/sitemap.xml\n`);
      return;
    }
    if (path === "/sitemap.xml") {
      res.writeHead(200, { "Content-Type": MIME[".xml"], "Cache-Control": "public, max-age=3600" });
      res.end(await sitemap(root));
      return;
    }
    if (path.length > 1 && path.endsWith("/")) {
      res.writeHead(301, { Location: path.replace(/\/+$/, "") || "/" });
      res.end();
      return;
    }
    if (path === "/sitemap-paths.json" || path === "/index.html") {
      res.writeHead(301, { Location: "/" });
      res.end();
      return;
    }
    const file = await resolveStatic(root, path);
    const status = file ? 200 : 404;
    const body = await readStatic(file ?? join(root, "404.html"));
    if (!body) throw new HttpError(404, "Not found.");
    const target = file ?? "404.html";
    const immutable = target.includes(`${sep}assets${sep}`);
    res.writeHead(status, {
      "Content-Type": MIME[extname(target)] ?? "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : extname(target) === ".html" ? "no-cache" : "public, max-age=86400",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  }

  async function serveLegal(req: IncomingMessage, res: ServerResponse, dir: string, path: string): Promise<void> {
    const page = await readLegalPage(dir, path);
    if (!page) throw new HttpError(404, "Not found.");
    res.writeHead(page.status, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : page.html);
  }

  return (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    if (secureCookies) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/healthz" && (req.method === "GET" || req.method === "HEAD")) {
      health(res);
      return;
    }
    const handler = path.startsWith("/api/")
      ? handleApi(req, res, path)
      : legalDir && (req.method === "GET" || req.method === "HEAD") && (path === "/impressum" || path === "/datenschutz")
        ? serveLegal(req, res, legalDir, path)
        : serveStatic(req, res, path);
    handler.catch((err: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: "Internal server error." });
      }
    });
  };
}
