import { describe, expect, it } from "vitest";
import { allLessons } from "../lessons";
import { INDEXABLE_PATHS, metaFor } from "./meta";
import { prerenderSite } from "./prerender";

const template = `<!doctype html><html><head><title>x</title><!--seo:head--></head><body><div id="app"><!--seo:body--></div></body></html>`;

describe("prerender", () => {
  const pages = prerenderSite(template);
  const byFile = new Map(pages.map((p) => [p.file, p.html]));

  it("writes one page per lesson plus home, playground, app pages and 404", () => {
    expect(byFile.has("index.html")).toBe(true);
    expect(byFile.has("playground/index.html")).toBe(true);
    expect(byFile.has("404.html")).toBe(true);
    for (const { lesson } of allLessons) expect(byFile.has(`lesson/${lesson.id}/index.html`), lesson.id).toBe(true);
    expect(JSON.parse(byFile.get("sitemap-paths.json")!)).toEqual(INDEXABLE_PATHS);
  });

  it("gives every indexable page a unique title, description and canonical URL", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const path of INDEXABLE_PATHS) {
      const meta = metaFor(path)!;
      expect(meta.title.length, path).toBeLessThanOrEqual(70);
      expect(meta.description.length, path).toBeGreaterThan(50);
      expect(meta.description.length, path).toBeLessThanOrEqual(160);
      titles.add(meta.title);
      descriptions.add(meta.description);
    }
    expect(titles.size).toBe(INDEXABLE_PATHS.length);
    expect(descriptions.size).toBe(INDEXABLE_PATHS.length);
    const html = byFile.get("lesson/f-t/index.html")!;
    expect(html).toContain('<link rel="canonical" href="%SITE_URL%/lesson/f-t">');
    expect(html).toContain('<meta name="robots" content="index,follow">');
    expect(html).toContain("<h1>f, t, ; and ,</h1>");
    expect(html).not.toContain("<!--seo:");
  });

  it("marks app pages and the 404 page as noindex", () => {
    for (const file of ["login/index.html", "reset/index.html", "404.html"]) {
      expect(byFile.get(file), file).toContain('content="noindex,follow"');
      expect(byFile.get(file), file).not.toContain('rel="canonical"');
    }
  });

  it("embeds valid structured data", () => {
    for (const file of ["index.html", "lesson/hjkl/index.html", "lesson/test-macros/index.html"]) {
      const json = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(byFile.get(file)!)![1];
      const data = JSON.parse(json.replaceAll("%SITE_URL%", "https://example.com"));
      expect(data["@context"]).toBe("https://schema.org");
      expect(data["@graph"].length).toBeGreaterThan(0);
    }
  });
});
