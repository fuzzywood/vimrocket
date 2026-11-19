import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createConsoleMailer, createSmtpMailer } from "./mailer.ts";
import { Store } from "./store.ts";

const config = loadConfig();
const distDir = resolve("dist");
const store = new Store(config.databaseFile);

const mailer = config.smtp ? createSmtpMailer(config.smtp, config.mailFrom) : createConsoleMailer();
if (config.smtp) {
  mailer.verify?.().then(
    () => console.log(`[mail] SMTP connection to ${config.smtp!.host}:${config.smtp!.port} verified`),
    (err: unknown) => console.error(`[mail] SMTP check failed for ${config.smtp!.host}:${config.smtp!.port}:`, err),
  );
} else {
  console.warn("[mail] SMTP_HOST is not set — emails are printed to the console instead of being sent.");
}

for (const file of ["impressum.html", "datenschutz.html"]) {
  if (!existsSync(resolve(config.legalDir, file))) console.warn(`[legal] ${resolve(config.legalDir, file)} is missing — the page shows a placeholder.`);
}

const server = createServer(
  createApp({
    store,
    mailer,
    appUrl: config.appUrl,
    staticDir: config.production && existsSync(distDir) ? distDir : undefined,
    legalDir: config.legalDir,
    secureCookies: config.secureCookies,
    trustProxy: config.trustProxy,
  }),
);

server.listen(config.port, config.host, () => {
  console.log(`LearnVim listening on http://${config.host}:${config.port} (app url: ${config.appUrl}, database: ${config.databaseFile})`);
});

const shutdown = (): void => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
