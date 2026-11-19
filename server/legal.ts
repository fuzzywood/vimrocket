import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const LEGAL_PAGES: Record<string, { file: string; title: string }> = {
  "/impressum": { file: "impressum.html", title: "Impressum" },
  "/datenschutz": { file: "datenschutz.html", title: "Datenschutzerklärung" },
};

const STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; background: #0f1115; color: #e6e8ee; font: 17px/1.65 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
  a { color: #56d4dd; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 24px 0 20px; }
  h2 { font-size: 1.25rem; margin: 36px 0 10px; }
  h3 { font-size: 1.05rem; margin: 24px 0 8px; }
  p, li { color: #cdd2dd; }
  address { font-style: normal; }
  .back { display: inline-block; font-size: 0.95rem; text-decoration: none; }
  .legal-nav { margin-top: 48px; padding-top: 16px; border-top: 1px solid #2b3140; font-size: 0.9rem; display: flex; gap: 16px; }
`;

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function legalDocument(title: string, content: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<main>
<a class="back" href="/">← Zurück zum Kurs</a>
${content}
<nav class="legal-nav"><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></nav>
</main>
</body>
</html>
`;
}

export async function readLegalPage(dir: string, path: string): Promise<{ status: number; html: string } | null> {
  const page = LEGAL_PAGES[path];
  if (!page) return null;
  const content = await readFile(join(dir, page.file), "utf8").catch(() => null);
  if (content === null) {
    return {
      status: 404,
      html: legalDocument(page.title, `<h1>${escapeHtml(page.title)}</h1><p>Diese Seite wurde noch nicht eingerichtet.</p>`),
    };
  }
  return { status: 200, html: legalDocument(page.title, content) };
}
