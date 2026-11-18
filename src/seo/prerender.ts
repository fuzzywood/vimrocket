import { allLessons, chapters, type LessonRef } from "../lessons";
import { isTest, tasksOf } from "../lessons/types";
import {
  APP_PATHS,
  INDEXABLE_PATHS,
  NOT_FOUND_META,
  SITE_DESCRIPTION,
  SITE_NAME,
  lessonPath,
  lessonTitle,
  metaFor,
  type PageMeta,
} from "./meta";

export const SITE_URL_PLACEHOLDER = "%SITE_URL%";

export interface PrerenderedPage {
  file: string;
  html: string;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const url = (path: string): string => `${SITE_URL_PLACEHOLDER}${path === "/" ? "/" : path}`;

const jsonLd = (data: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

const COURSE = {
  "@type": "Course",
  "@id": `${SITE_URL_PLACEHOLDER}/#course`,
  name: `${SITE_NAME}: interactive Vim course`,
  description: SITE_DESCRIPTION,
  url: `${SITE_URL_PLACEHOLDER}/`,
  inLanguage: "en",
  isAccessibleForFree: true,
  educationalLevel: "Beginner to advanced",
  teaches: chapters.map((c) => c.title),
  provider: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL_PLACEHOLDER}/` },
  offers: { "@type": "Offer", price: 0, priceCurrency: "EUR", category: "Free" },
  hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: "PT6H" },
};

function structuredData(meta: PageMeta, ref?: LessonRef): string {
  if (meta.path === "/") {
    return jsonLd({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL_PLACEHOLDER}/`, description: SITE_DESCRIPTION }, COURSE],
    });
  }
  if (!ref) return "";
  const firstOfChapter = lessonPath(ref.chapter.lessons[0].id);
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LearningResource",
        name: lessonTitle(ref),
        description: meta.description,
        url: url(meta.path),
        learningResourceType: isTest(ref.lesson) ? "Quiz" : "Lesson",
        educationalLevel: ref.chapterIndex < 3 ? "Beginner" : ref.chapterIndex < 8 ? "Intermediate" : "Advanced",
        inLanguage: "en",
        isAccessibleForFree: true,
        interactivityType: "active",
        isPartOf: { "@id": `${SITE_URL_PLACEHOLDER}/#course` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: url("/") },
          { "@type": "ListItem", position: 2, name: ref.chapter.title, item: url(firstOfChapter) },
          { "@type": "ListItem", position: 3, name: isTest(ref.lesson) ? "Chapter test" : ref.lesson.title },
        ],
      },
    ],
  });
}

function head(meta: PageMeta, ref?: LessonRef): string {
  const canonical = url(meta.path);
  const tags = [
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="robots" content="${meta.index ? "index,follow" : "noindex,follow"}">`,
    meta.index ? `<link rel="canonical" href="${canonical}">` : "",
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:type" content="${meta.type}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${SITE_URL_PLACEHOLDER}/og-image.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    structuredData(meta, ref),
  ];
  return tags.filter(Boolean).join("\n    ");
}

const keyTable = (ref: LessonRef): string =>
  ref.lesson.keys.length
    ? `<table class="seo-keys"><tbody>${ref.lesson.keys
        .map((k) => `<tr><td><kbd>${esc(k.keys)}</kbd></td><td>${esc(k.desc)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

function lessonBody(ref: LessonRef): string {
  const { lesson, chapter, chapterIndex, lessonIndex, globalIndex } = ref;
  const prev = allLessons[globalIndex - 1];
  const next = allLessons[globalIndex + 1];
  const tasks = tasksOf(lesson);
  return `<main class="seo-page">
  <nav class="seo-crumbs"><a href="/">${SITE_NAME}</a> › <a href="${lessonPath(chapter.lessons[0].id)}">Chapter ${chapterIndex + 1}: ${esc(chapter.title)}</a></nav>
  <article>
    <p class="seo-eyebrow">Chapter ${chapterIndex + 1} · Lesson ${lessonIndex + 1} of ${chapter.lessons.length}</p>
    <h1>${esc(isTest(lesson) ? `Chapter test: ${chapter.title}` : lesson.title)}</h1>
    <div class="seo-intro">${lesson.intro}</div>
    ${keyTable(ref)}
    <h2>${tasks.length > 1 ? "Your tasks" : "Your task"}</h2>
    <ol class="seo-tasks">${tasks.map((t) => `<li>${t.task}</li>`).join("")}</ol>
    <p class="seo-note">Solve ${tasks.length > 1 ? "the tasks" : "it"} in the interactive Vim editor — it loads with JavaScript.</p>
  </article>
  <nav class="seo-pager">${prev ? `<a href="${lessonPath(prev.lesson.id)}">← ${esc(prev.lesson.title)}</a>` : ""}${next ? `<a href="${lessonPath(next.lesson.id)}">${esc(next.lesson.title)} →</a>` : ""}</nav>
  <section><h2>More in ${esc(chapter.title)}</h2><ul>${chapter.lessons
    .map((l) => `<li><a href="${lessonPath(l.id)}">${esc(isTest(l) ? "Chapter test" : l.title)}</a></li>`)
    .join("")}</ul></section>
</main>`;
}

function homeBody(): string {
  return `<main class="seo-page">
  <h1>Learn Vim by doing</h1>
  <p>${esc(SITE_DESCRIPTION)}</p>
  <p><a href="${lessonPath(allLessons[0].lesson.id)}">Start the first lesson</a> · <a href="/playground">Open the Vim playground</a></p>
  ${chapters
    .map(
      (c, i) => `<section><h2>Chapter ${i + 1}: ${esc(c.title)}</h2><p>${esc(c.summary)}</p><ul>${c.lessons
        .map((l) => `<li><a href="${lessonPath(l.id)}">${esc(isTest(l) ? "Chapter test" : l.title)}</a></li>`)
        .join("")}</ul></section>`,
    )
    .join("\n  ")}
</main>`;
}

const simpleBody = (title: string, text: string): string =>
  `<main class="seo-page"><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a href="/">Go to the Vim course</a></p></main>`;

function render(template: string, meta: PageMeta, body: string, ref?: LessonRef): string {
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace("<!--seo:head-->", head(meta, ref))
    .replace("<!--seo:body-->", body);
}

const fileFor = (path: string): string => (path === "/" ? "index.html" : `${path.slice(1)}/index.html`);

export function prerenderSite(template: string): PrerenderedPage[] {
  if (!template.includes("<!--seo:head-->") || !template.includes("<!--seo:body-->")) {
    throw new Error("index.html is missing the <!--seo:head--> / <!--seo:body--> markers");
  }
  const pages: PrerenderedPage[] = [];
  for (const path of [...INDEXABLE_PATHS, ...APP_PATHS]) {
    const meta = metaFor(path)!;
    const ref = allLessons.find((r) => lessonPath(r.lesson.id) === path);
    const body = ref
      ? lessonBody(ref)
      : path === "/"
        ? homeBody()
        : path === "/playground"
          ? simpleBody("Vim playground", "A free Vim editor in your browser. Practice motions, operators, macros and Ex commands without installing anything.")
          : simpleBody(meta.title.split(" | ")[0], "This page needs JavaScript.");
    pages.push({ file: fileFor(path), html: render(template, meta, body, ref) });
  }
  pages.push({ file: "404.html", html: render(template, NOT_FOUND_META, simpleBody("Page not found", "This page does not exist.")) });
  pages.push({ file: "sitemap-paths.json", html: JSON.stringify(INDEXABLE_PATHS) });
  return pages;
}
