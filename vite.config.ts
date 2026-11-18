import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { prerenderSite } from "./src/seo/prerender";

function prerender(): Plugin {
  let outDir = "dist";
  return {
    name: "learnvim-prerender",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const template = readFileSync(join(outDir, "index.html"), "utf8");
      const pages = prerenderSite(template);
      for (const page of pages) {
        const file = join(outDir, page.file);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, page.html);
      }
      this.info?.(`prerendered ${pages.length - 1} pages`);
    },
  };
}

export default defineConfig({
  plugins: [prerender()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${process.env.API_PORT ?? 3001}`,
    },
  },
});
