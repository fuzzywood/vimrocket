import { allLessons, chapters } from "../../lessons";
import { h } from "../dom";
import { legalLinks } from "../sidebar";
import type { Progress } from "../progress";

export function renderHome(progress: Progress): HTMLElement {
  const next = allLessons.find((r) => !progress.isDone(r.lesson.id)) ?? allLessons[0];
  const resume = progress.last && allLessons.some((r) => r.lesson.id === progress.last) ? progress.last : next.lesson.id;
  const started = progress.count(allLessons.map((r) => r.lesson.id)) > 0;

  return h(
    "div",
    { class: "page home" },
    h(
      "header",
      { class: "hero" },
      h("p", { class: "eyebrow" }, "Interactive Vim course"),
      h("h1", {}, "Learn Vim by ", h("em", {}, "doing"), "."),
      h(
        "p",
        { class: "lead" },
        "Every lesson comes with a real, working Vim editor right in your browser. Read a short explanation, then solve the task with the keys you just learned. Your progress is saved automatically.",
      ),
      h(
        "div",
        { class: "hero-actions" },
        h("a", { class: "btn primary", href: `/lesson/${resume}` }, started ? "Continue learning" : "Start the first lesson"),
        h("a", { class: "btn", href: "/playground" }, "Open the playground"),
      ),
    ),
    h(
      "section",
      { class: "chapter-grid" },
      chapters.map((chapter, i) => {
        const ids = chapter.lessons.map((l) => l.id);
        const done = progress.count(ids);
        const first = chapter.lessons.find((l) => !progress.isDone(l.id)) ?? chapter.lessons[0];
        return h(
          "a",
          { class: `chapter-card${done === ids.length ? " complete" : ""}`, href: `/lesson/${first.id}` },
          h("span", { class: "card-num" }, `Chapter ${i + 1}`),
          h("h2", {}, chapter.title),
          h("p", {}, chapter.summary),
          h(
            "div",
            { class: "card-foot" },
            h("div", { class: "bar" }, h("div", { class: "bar-fill", style: `width:${(done / ids.length) * 100}%` })),
            h("span", {}, `${done}/${ids.length}`),
          ),
        );
      }),
    ),
    h(
      "footer",
      { class: "home-foot" },
      legalLinks(),
      started
        ? h(
            "button",
            {
              class: "btn small",
              onclick: () => {
                if (confirm("Reset all lesson progress?")) progress.reset();
              },
            },
            "Reset progress",
          )
        : null,
    ),
  );
}

export function renderNotFound(): HTMLElement {
  return h(
    "div",
    { class: "page auth" },
    h(
      "div",
      { class: "auth-card" },
      h("p", { class: "eyebrow" }, "404"),
      h("h1", {}, "Page not found"),
      h("p", { class: "lead" }, "This page does not exist (anymore). Maybe it was moved — the course is just one click away."),
      h("div", { class: "hero-actions" }, h("a", { class: "btn primary", href: "/" }, "Go to the course"), h("a", { class: "btn", href: "/playground" }, "Open the playground")),
    ),
  );
}
