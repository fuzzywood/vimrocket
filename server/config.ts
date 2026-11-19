import { resolve } from "node:path";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

export interface Config {
  production: boolean;
  host: string;
  port: number;
  databaseFile: string;
  legalDir: string;
  appUrl: string;
  trustProxy: boolean;
  secureCookies: boolean;
  mailFrom: string;
  smtp: SmtpConfig | null;
}

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value === "" ? fallback : ["1", "true", "yes", "on"].includes(value.toLowerCase());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const appUrl = (env.APP_URL ?? (production ? "" : "http://localhost:5173")).replace(/\/+$/, "");
  if (!appUrl) throw new Error("APP_URL must be set in production (e.g. https://vimrocket.com).");
  const smtpPort = Number(env.SMTP_PORT ?? 587);
  return {
    production,
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 3001),
    databaseFile: resolve(env.DATABASE_FILE ?? "data/learnvim.db"),
    legalDir: resolve(env.LEGAL_DIR ?? "legal"),
    appUrl,
    trustProxy: bool(env.TRUST_PROXY, false),
    secureCookies: bool(env.SECURE_COOKIES, appUrl.startsWith("https://")),
    mailFrom: env.MAIL_FROM ?? `LearnVim <no-reply@${new URL(appUrl).hostname}>`,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: smtpPort,
          secure: bool(env.SMTP_SECURE, smtpPort === 465),
          user: env.SMTP_USER || undefined,
          pass: env.SMTP_PASS || undefined,
        }
      : null,
  };
}
