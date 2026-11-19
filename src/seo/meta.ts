import { allLessons, chapters, findLesson, type LessonRef } from "../lessons";
import { isTest } from "../lessons/types";

export const SITE_NAME = "VimRocket";
export const SITE_TAGLINE = "Learn Vim interactively in your browser";
export const SITE_DESCRIPTION = `A free, interactive Vim course: ${chapters.length} chapters and ${allLessons.length} hands-on lessons with a real Vim editor in your browser. Learn motions, operators, text objects, visual mode, registers, macros and Ex commands by doing.`;

export const SERVER_PAGES = ["/impressum", "/datenschutz"] as const;

export const APP_PATHS = [
  "/login",
  "/register",
  "/forgot",
  "/reset",
  "/verify",
  "/account",
] as const;

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  index: boolean;
  type: "website" | "article";
}

export const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export function truncate(text: string, max = 158): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

export const lessonPath = (id: string): string => `/lesson/${id}`;

export function lessonTitle(ref: LessonRef): string {
  return isTest(ref.lesson)
    ? `Chapter test: ${ref.chapter.title}`
    : `${ref.lesson.title} – ${ref.chapter.title}`;
}

export function lessonDescription(ref: LessonRef): string {
  const { lesson, chapter, chapterIndex } = ref;
  if (isTest(lesson)) {
    return truncate(
      `Test your Vim skills from chapter ${chapterIndex + 1} (${chapter.title}) with three hands-on tasks in an interactive Vim editor.`,
    );
  }
  return truncate(
    `${stripHtml(lesson.intro)} Practice it right away in an interactive Vim editor.`,
  );
}

export const INDEXABLE_PATHS: string[] = [
  "/",
  "/playground",
  ...allLessons.map((r) => lessonPath(r.lesson.id)),
];

export function metaFor(path: string): PageMeta | null {
  if (path === "/") {
    return {
      path,
      title: `${SITE_NAME} – ${SITE_TAGLINE}`,
      description: truncate(SITE_DESCRIPTION),
      index: true,
      type: "website",
    };
  }
  if (path === "/playground") {
    return {
      path,
      title: `Vim playground – try Vim online | ${SITE_NAME}`,
      description:
        "A free Vim editor in your browser. Practice motions, operators, macros and Ex commands without installing anything.",
      index: true,
      type: "website",
    };
  }
  const lesson = /^\/lesson\/([\w-]+)$/.exec(path);
  if (lesson) {
    const ref = findLesson(lesson[1]);
    if (!ref) return null;
    return {
      path,
      title: `${lessonTitle(ref)} | ${SITE_NAME}`,
      description: lessonDescription(ref),
      index: true,
      type: "article",
    };
  }
  if ((APP_PATHS as readonly string[]).includes(path)) {
    const names: Record<string, string> = {
      "/login": "Sign in",
      "/register": "Create an account",
      "/forgot": "Forgot password",
      "/reset": "Reset password",
      "/verify": "Confirm email",
      "/account": "Your account",
    };
    return {
      path,
      title: `${names[path]} | ${SITE_NAME}`,
      description: SITE_DESCRIPTION,
      index: false,
      type: "website",
    };
  }
  return null;
}

export const NOT_FOUND_META: PageMeta = {
  path: "/404",
  title: `Page not found | ${SITE_NAME}`,
  description: SITE_DESCRIPTION,
  index: false,
  type: "website",
};
