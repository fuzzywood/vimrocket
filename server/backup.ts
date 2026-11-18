import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { Store } from "./store.ts";

const keep = Number(process.env.BACKUP_KEEP ?? 14);
const dir = resolve(process.argv[2] ?? process.env.BACKUP_DIR ?? "data/backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = join(dir, `learnvim-${stamp}.db`);

const store = new Store(loadConfig({ ...process.env, APP_URL: process.env.APP_URL ?? "http://localhost" }).databaseFile);
await store.backup(target);
store.close();

const backups = readdirSync(dir).filter((f) => /^learnvim-.*\.db$/.test(f)).sort();
for (const old of backups.slice(0, Math.max(0, backups.length - keep))) rmSync(join(dir, old));
console.log(`Backup written to ${target} (keeping the newest ${keep}).`);
