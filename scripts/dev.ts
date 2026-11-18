import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [
  spawn(process.execPath, ["--watch", "server/index.ts"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];

const stop = (): void => {
  for (const child of children) child.kill("SIGTERM");
};

for (const child of children) {
  child.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
