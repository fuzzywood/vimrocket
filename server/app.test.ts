import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { MailMessage } from "./mailer.ts";
import { Store } from "./store.ts";

let server: Server;
let store: Store;
let base: string;
let outbox: MailMessage[];

async function start(options: { trustProxy?: boolean; secureCookies?: boolean; staticDir?: string } = {}): Promise<void> {
  store = new Store(":memory:");
  outbox = [];
  server = createServer(
    createApp({ store, mailer: { send: async (m) => void outbox.push(m) }, appUrl: "https://vimrocket.test", ...options }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => start());

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
});

class Client {
  cookie = "";
  headers: Record<string, string> = {};

  async call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, any>; res: Response }> {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...this.headers,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return { status: res.status, json: (await res.json()) as Record<string, any>, res };
  }
}

const ada = { username: "ada", email: "Ada@Example.com", password: "correct horse" };
const tokenFrom = (mail: MailMessage): string => /token=([\w-]+)/.exec(mail.text)![1];

async function registered(): Promise<Client> {
  const c = new Client();
  expect((await c.call("POST", "/api/register", ada)).status).toBe(200);
  return c;
}

describe("registration and login", () => {
  it("registers with an email, sends a verification mail and keeps the session", async () => {
    const c = new Client();
    expect((await c.call("GET", "/api/me")).json.user).toBeNull();
    const reg = await c.call("POST", "/api/register", ada);
    expect(reg.json.user).toEqual({ username: "ada", email: "ada@example.com", emailVerified: false });
    expect(c.cookie).toMatch(/^lv_session=.+/);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("ada@example.com");
    expect(outbox[0].text).toContain("https://vimrocket.test/verify#token=");
    expect((await c.call("GET", "/api/me")).json.user.username).toBe("ada");
    await c.call("POST", "/api/logout", {});
    expect((await c.call("GET", "/api/me")).json.user).toBeNull();
  });

  it("rejects duplicate usernames and emails case-insensitively", async () => {
    await registered();
    expect((await new Client().call("POST", "/api/register", { ...ada, email: "other@example.com", username: "ADA" })).status).toBe(409);
    expect((await new Client().call("POST", "/api/register", { ...ada, username: "ada2", email: "ADA@example.COM" })).status).toBe(409);
  });

  it("validates input", async () => {
    const c = new Client();
    expect((await c.call("POST", "/api/register", { ...ada, username: "a" })).status).toBe(400);
    expect((await c.call("POST", "/api/register", { ...ada, email: "not-an-email" })).status).toBe(400);
    expect((await c.call("POST", "/api/register", { ...ada, password: "short" })).status).toBe(400);
  });

  it("logs in with username or email and the right password only", async () => {
    await registered();
    const c = new Client();
    expect((await c.call("POST", "/api/login", { login: "ada", password: "wrong password" })).status).toBe(401);
    expect((await c.call("POST", "/api/login", { login: "nobody", password: "correct horse" })).status).toBe(401);
    expect((await c.call("POST", "/api/login", { login: "ADA@example.com", password: "correct horse" })).status).toBe(200);
    expect((await c.call("POST", "/api/login", { username: "ada", password: "correct horse" })).status).toBe(200);
  });

  it("requires JSON for mutating requests", async () => {
    const res = await fetch(`${base}/api/login`, { method: "POST", body: "login=ada" });
    expect(res.status).toBe(415);
  });
});

describe("email verification", () => {
  it("verifies with the emailed token exactly once", async () => {
    const c = await registered();
    const token = tokenFrom(outbox[0]);
    const ok = await c.call("POST", "/api/email/verify", { token });
    expect(ok.json.user.emailVerified).toBe(true);
    expect((await c.call("GET", "/api/me")).json.user.emailVerified).toBe(true);
    expect((await c.call("POST", "/api/email/verify", { token })).status).toBe(400);
  });

  it("resends a fresh link and invalidates the old one", async () => {
    const c = await registered();
    const first = tokenFrom(outbox[0]);
    expect((await c.call("POST", "/api/email/resend", {})).status).toBe(200);
    expect(outbox).toHaveLength(2);
    expect((await c.call("POST", "/api/email/verify", { token: first })).status).toBe(400);
    expect((await c.call("POST", "/api/email/verify", { token: tokenFrom(outbox[1]) })).status).toBe(200);
    expect((await c.call("POST", "/api/email/resend", {})).json.alreadyVerified).toBe(true);
  });

  it("limits how often verification mails can be resent", async () => {
    const c = await registered();
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await c.call("POST", "/api/email/resend", {})).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe("password reset", () => {
  it("resets the password with the emailed token and signs out other sessions", async () => {
    const old = await registered();
    const c = new Client();
    expect((await c.call("POST", "/api/password/forgot", { email: "ada@EXAMPLE.com" })).status).toBe(200);
    const mail = outbox.at(-1)!;
    expect(mail.subject).toBe("Reset your password");
    expect(mail.text).toContain("https://vimrocket.test/reset#token=");
    const reset = await c.call("POST", "/api/password/reset", { token: tokenFrom(mail), password: "new password!" });
    expect(reset.status).toBe(200);
    expect(reset.json.user).toEqual({ username: "ada", email: "ada@example.com", emailVerified: true });
    expect((await c.call("GET", "/api/me")).json.user.username).toBe("ada");
    expect((await old.call("GET", "/api/me")).json.user).toBeNull();
    expect((await new Client().call("POST", "/api/login", { login: "ada", password: "correct horse" })).status).toBe(401);
    expect((await new Client().call("POST", "/api/login", { login: "ada", password: "new password!" })).status).toBe(200);
    expect((await new Client().call("POST", "/api/password/reset", { token: tokenFrom(mail), password: "another one" })).status).toBe(400);
  });

  it("does not reveal whether an email exists", async () => {
    const res = await new Client().call("POST", "/api/password/forgot", { email: "ghost@example.com" });
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(0);
  });

  it("rejects weak passwords and unknown tokens", async () => {
    const c = new Client();
    expect((await c.call("POST", "/api/password/reset", { token: "nope", password: "short" })).status).toBe(400);
    expect((await c.call("POST", "/api/password/reset", { token: "nope", password: "long enough" })).status).toBe(400);
  });
});

describe("progress api", () => {
  const progress = { lessons: { hjkl: { completedAt: 1, bestKeys: 7 } }, last: "hjkl" };

  it("stores progress per user", async () => {
    const a = await registered();
    const b = new Client();
    await b.call("POST", "/api/register", { username: "bob", email: "bob@example.com", password: "correct horse" });
    expect((await a.call("GET", "/api/progress")).json.progress).toBeNull();
    expect((await a.call("PUT", "/api/progress", progress)).status).toBe(200);
    expect((await a.call("GET", "/api/progress")).json.progress).toEqual(progress);
    expect((await b.call("GET", "/api/progress")).json.progress).toBeNull();
  });

  it("requires a session and valid data", async () => {
    expect((await new Client().call("GET", "/api/progress")).status).toBe(401);
    const c = await registered();
    expect((await c.call("PUT", "/api/progress", { lessons: { x: { bestKeys: "a" } } })).status).toBe(400);
    expect((await c.call("PUT", "/api/progress", [])).status).toBe(400);
  });
});

describe("operations", () => {
  it("reports health", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("sends security headers and HSTS only for https deployments", async () => {
    const plain = await fetch(`${base}/api/me`);
    expect(plain.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(plain.headers.get("x-frame-options")).toBe("DENY");
    expect(plain.headers.get("strict-transport-security")).toBeNull();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await start({ secureCookies: true });
    const secure = await new Client().call("POST", "/api/register", ada);
    expect(secure.res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(secure.res.headers.get("set-cookie")).toContain("Secure");
  });

  it("rate-limits per real client IP behind a trusted proxy", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await start({ trustProxy: true });
    const attacker = new Client();
    attacker.headers["X-Real-IP"] = "203.0.113.7";
    for (let i = 0; i < 20; i++) await attacker.call("POST", "/api/login", { login: "x", password: "wrong password" });
    expect((await attacker.call("POST", "/api/login", { login: "x", password: "wrong password" })).status).toBe(429);
    const visitor = new Client();
    visitor.headers["X-Real-IP"] = "198.51.100.4";
    expect((await visitor.call("POST", "/api/login", { login: "x", password: "wrong password" })).status).toBe(401);
  });
});

describe("migrations", () => {
  it("upgrades a database created by the first version", () => {
    const dir = mkdtempSync(join(tmpdir(), "learnvim-"));
    try {
      const file = join(dir, "old.db");
      const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const old = new DatabaseSync(file);
      old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE progress (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
        INSERT INTO users (username, password_hash, created_at) VALUES ('legacy', 'x', 0);`);
      old.close();
      const upgraded = new Store(file);
      expect(upgraded.findUserByLogin("legacy")?.email).toBeNull();
      expect(upgraded.createUser("fresh", "fresh@example.com", "x")).toBeTypeOf("number");
      upgraded.close();
      const reopened = new Store(file);
      expect(reopened.findUserByEmail("FRESH@example.com")?.username).toBe("fresh");
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("static site", () => {
  let dist: string;

  beforeEach(async () => {
    dist = mkdtempSync(join(tmpdir(), "learnvim-dist-"));
    const page = (title: string): string => `<html><head><title>${title}</title><link rel="canonical" href="%SITE_URL%/x"></head></html>`;
    mkdirSync(join(dist, "lesson", "hjkl"), { recursive: true });
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), page("Home"));
    writeFileSync(join(dist, "lesson", "hjkl", "index.html"), page("hjkl"));
    writeFileSync(join(dist, "404.html"), page("Not found"));
    writeFileSync(join(dist, "assets", "app-123.js"), "console.log(1)");
    writeFileSync(join(dist, "sitemap-paths.json"), JSON.stringify(["/", "/lesson/hjkl"]));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await start({ staticDir: dist });
  });

  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  it("serves prerendered pages with the site URL filled in", async () => {
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('href="https://vimrocket.test/x"');
    const lesson = await fetch(`${base}/lesson/hjkl`);
    expect(lesson.status).toBe(200);
    expect(await lesson.text()).toContain("<title>hjkl</title>");
  });

  it("redirects trailing slashes and answers unknown pages with a real 404", async () => {
    const slash = await fetch(`${base}/lesson/hjkl/`, { redirect: "manual" });
    expect(slash.status).toBe(301);
    expect(slash.headers.get("location")).toBe("/lesson/hjkl");
    const missing = await fetch(`${base}/lesson/nope`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("<title>Not found</title>");
    expect((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
  });

  it("caches hashed assets forever and HTML never", async () => {
    expect((await fetch(`${base}/assets/app-123.js`)).headers.get("cache-control")).toContain("immutable");
    expect((await fetch(`${base}/`)).headers.get("cache-control")).toBe("no-cache");
  });

  it("generates robots.txt and sitemap.xml from APP_URL", async () => {
    const robots = await (await fetch(`${base}/robots.txt`)).text();
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Sitemap: https://vimrocket.test/sitemap.xml");
    const sitemap = await fetch(`${base}/sitemap.xml`);
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    const xml = await sitemap.text();
    expect(xml).toContain("<loc>https://vimrocket.test/</loc>");
    expect(xml).toContain("<loc>https://vimrocket.test/lesson/hjkl</loc>");
  });
});
