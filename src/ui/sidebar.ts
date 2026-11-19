import { allLessons, chapters } from "../lessons";
import { isTest } from "../lessons/types";
import { h } from "./dom";
import type { Progress } from "./progress";

export interface SidebarState {
  collapsed: boolean;
  onToggle: () => void;
  user: string | null;
  emailUnconfirmed: boolean;
  onLogout: () => void;
  cheatsheetOpen: boolean;
  onCheatsheet: () => void;
}

const SYNC_LABEL: Record<string, string> = {
  saved: "Progress saved",
  saving: "Saving…",
  error: "Not saved — will retry",
  local: "",
};

function renderAccount(progress: Progress, state: SidebarState): HTMLElement {
  if (!state.user) {
    return h(
      "div",
      { class: "account guest" },
      h("p", { class: "account-note" }, "Sign in to save your progress across devices."),
      h("div", { class: "account-actions" }, h("a", { class: "btn small primary", href: "/login" }, "Sign in"), h("a", { class: "btn small", href: "/register" }, "Register")),
    );
  }
  return h(
    "div",
    { class: "account" },
    h("a", { class: "avatar", href: "/account", title: "Account" }, state.user[0].toUpperCase()),
    h(
      "div",
      { class: "account-info" },
      h("a", { class: "account-name", href: "/account" }, state.user),
      state.emailUnconfirmed
        ? h("a", { class: "sync sync-error", href: "/account" }, "Confirm your email")
        : h("span", { class: `sync sync-${progress.syncState}` }, SYNC_LABEL[progress.syncState]),
    ),
    h("button", { class: "btn small", onclick: state.onLogout }, "Sign out"),
  );
}

function toggleButton(state: SidebarState): HTMLElement {
  return h(
    "button",
    {
      class: "sidebar-toggle",
      title: state.collapsed ? "Expand sidebar" : "Collapse sidebar",
      "aria-label": state.collapsed ? "Expand sidebar" : "Collapse sidebar",
      "aria-expanded": String(!state.collapsed),
      onclick: state.onToggle,
    },
    state.collapsed ? "»" : "«",
  );
}

function renderRail(progress: Progress, activeId: string | null, state: SidebarState): HTMLElement {
  return h(
    "nav",
    { class: "sidebar rail", "aria-label": "Chapters" },
    toggleButton(state),
    h("a", { class: "brand-mark", href: "/", title: "Home" }, ":v"),
    h(
      "ol",
      { class: "rail-chapters" },
      chapters.map((chapter, ci) => {
        const ids = chapter.lessons.map((l) => l.id);
        const done = progress.count(ids);
        const target = chapter.lessons.find((l) => !progress.isDone(l.id)) ?? chapter.lessons[0];
        const cls = [ids.includes(activeId ?? "") ? "active" : "", done === ids.length ? "complete" : ""].join(" ").trim();
        return h(
          "li",
          {},
          h("a", { href: `/lesson/${target.id}`, class: cls || undefined, title: `${chapter.title} (${done}/${ids.length})` }, String(ci + 1)),
        );
      }),
    ),
    h(
      "div",
      { class: "rail-links" },
      h("a", { href: "/playground", title: "Playground", class: activeId === "playground" ? "active" : undefined }, "✎"),
      h("button", { title: "Cheat sheet", class: state.cheatsheetOpen ? "active" : undefined, "aria-pressed": String(state.cheatsheetOpen), onclick: state.onCheatsheet }, "≡"),
      h(
        "a",
        { href: state.user ? "/account" : "/login", title: state.user ? `Signed in as ${state.user}` : "Sign in", class: `rail-account${activeId === "account" ? " active" : ""}` },
        state.user ? state.user[0].toUpperCase() : "→",
      ),
      h("a", { href: "/impressum", title: "Impressum & Datenschutz", class: "rail-legal" }, "§"),
    ),
  );
}

export const legalLinks = (cls = "legal-links"): HTMLElement =>
  h("nav", { class: cls, "aria-label": "Legal" }, h("a", { href: "/impressum" }, "Impressum"), h("a", { href: "/datenschutz" }, "Datenschutz"));

export function renderSidebar(progress: Progress, activeId: string | null, state: SidebarState): HTMLElement {
  if (state.collapsed) return renderRail(progress, activeId, state);
  const total = allLessons.length;
  const done = progress.count(allLessons.map((r) => r.lesson.id));
  const pct = Math.round((done / total) * 100);

  return h(
    "nav",
    { class: "sidebar", "aria-label": "Chapters" },
    h(
      "div",
      { class: "sidebar-top" },
      h("a", { class: "brand", href: "/" }, h("span", { class: "brand-mark" }, ":v"), h("span", {}, "LearnVim")),
      toggleButton(state),
    ),
    h(
      "div",
      { class: "overall" },
      h("div", { class: "overall-label" }, h("span", {}, "Progress"), h("span", {}, `${done}/${total}`)),
      h("div", { class: "bar" }, h("div", { class: "bar-fill", style: `width:${pct}%` })),
    ),
    renderAccount(progress, state),
    h(
      "div",
      { class: "nav-links" },
      h("a", { href: "/playground", class: activeId === "playground" ? "active" : undefined }, "Playground"),
      h("button", { class: state.cheatsheetOpen ? "active" : undefined, "aria-pressed": String(state.cheatsheetOpen), onclick: state.onCheatsheet }, "Cheat sheet"),
    ),
    h(
      "ol",
      { class: "chapter-list" },
      chapters.map((chapter, ci) => {
        const ids = chapter.lessons.map((l) => l.id);
        const chapterDone = progress.count(ids);
        const open = ids.includes(activeId ?? "") || (activeId === null && ci === 0);
        return h(
          "li",
          { class: "chapter" },
          h(
            "details",
            { open },
            h(
              "summary",
              {},
              h("span", { class: "chapter-num" }, String(ci + 1)),
              h("span", { class: "chapter-title" }, chapter.title),
              h("span", { class: `chapter-count${chapterDone === ids.length ? " complete" : ""}` }, `${chapterDone}/${ids.length}`),
            ),
            h(
              "ol",
              { class: "lesson-list" },
              chapter.lessons.map((lesson) =>
                h(
                  "li",
                  {},
                  h(
                    "a",
                    {
                      href: `/lesson/${lesson.id}`,
                      class:
                        [lesson.id === activeId ? "active" : "", progress.isDone(lesson.id) ? "done" : "", isTest(lesson) ? "test" : ""]
                          .join(" ")
                          .trim() || undefined,
                    },
                    h("span", { class: "check", "aria-hidden": "true" }, progress.isDone(lesson.id) ? "✓" : isTest(lesson) ? "◆" : "•"),
                    lesson.title,
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    ),
    legalLinks("legal-links sidebar-legal"),
  );
}
