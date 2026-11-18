import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";

const sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type TokenPurpose = "verify" | "reset";

export interface UserRow {
  id: number;
  username: string;
  email: string | null;
  email_verified_at: number | null;
  password_hash: string;
}

export interface SessionUser {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS progress (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  `ALTER TABLE users ADD COLUMN email TEXT;
   ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
   CREATE UNIQUE INDEX users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE email_tokens (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     purpose TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose);`,
];

const USER_COLUMNS = "id, username, email, email_verified_at, password_hash";

const toSessionUser = (row: UserRow): SessionUser => ({
  id: row.id,
  username: row.username,
  email: row.email,
  emailVerified: row.email_verified_at !== null,
});

export class Store {
  private readonly db: Database;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new sqlite.DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  private migrate(): void {
    const { user_version: version } = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }

  ping(): boolean {
    return (this.db.prepare("SELECT 1 AS ok").get() as { ok: number }).ok === 1;
  }

  createUser(username: string, email: string, passwordHash: string): number | "username" | "email" {
    if (this.findUserByEmail(email)) return "email";
    try {
      const result = this.db
        .prepare("INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .run(username, email, passwordHash, Date.now());
      return Number(result.lastInsertRowid);
    } catch (e) {
      if (e instanceof Error && /UNIQUE/.test(e.message)) return /email/.test(e.message) ? "email" : "username";
      throw e;
    }
  }

  findUserByLogin(login: string): UserRow | undefined {
    return this.db
      .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ? OR email = ? COLLATE NOCASE LIMIT 1`)
      .get(login, login) as UserRow | undefined;
  }

  findUserByEmail(email: string): UserRow | undefined {
    return this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ? COLLATE NOCASE`).get(email) as UserRow | undefined;
  }

  findUserById(id: number): UserRow | undefined {
    return this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  }

  setPassword(userId: number, passwordHash: string): void {
    this.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  }

  markEmailVerified(userId: number): void {
    this.db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(Date.now(), userId);
  }

  createSession(tokenHash: string, userId: number, expiresAt: number): void {
    this.db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
  }

  findSessionUser(tokenHash: string, now: number): SessionUser | undefined {
    const row = this.db
      .prepare(
        `SELECT users.id AS id, username, email, email_verified_at, password_hash FROM sessions
         JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`,
      )
      .get(tokenHash, now) as UserRow | undefined;
    return row ? toSessionUser(row) : undefined;
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteUserSessions(userId: number): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  purgeExpired(now: number): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    this.db.prepare("DELETE FROM email_tokens WHERE expires_at <= ?").run(now);
  }

  createEmailToken(tokenHash: string, userId: number, purpose: TokenPurpose, expiresAt: number): void {
    this.db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?").run(userId, purpose);
    this.db
      .prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)")
      .run(tokenHash, userId, purpose, expiresAt);
  }

  consumeEmailToken(tokenHash: string, purpose: TokenPurpose, now: number): number | undefined {
    const row = this.db
      .prepare("SELECT user_id FROM email_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?")
      .get(tokenHash, purpose, now) as { user_id: number } | undefined;
    if (!row) return undefined;
    this.db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?").run(row.user_id, purpose);
    return row.user_id;
  }

  getProgress(userId: number): string | undefined {
    const row = this.db.prepare("SELECT data FROM progress WHERE user_id = ?").get(userId) as { data: string } | undefined;
    return row?.data;
  }

  saveProgress(userId: number, data: string): void {
    this.db
      .prepare(
        "INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
      )
      .run(userId, data, Date.now());
  }

  async backup(destination: string): Promise<void> {
    mkdirSync(dirname(destination), { recursive: true });
    await sqlite.backup(this.db, destination);
  }

  close(): void {
    this.db.close();
  }
}

export { toSessionUser };
