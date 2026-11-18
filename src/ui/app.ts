import { findLesson } from "../lessons";
import { h } from "./dom";
import { CheatSheetWindow } from "./cheatsheet";
import { renderAuth, type AuthView } from "./pages/auth";
import { renderHome, renderNotFound } from "./pages/home";
import { renderLesson, type Page } from "./pages/lesson";
import { renderPlayground } from "./pages/playground";
import { Progress } from "./progress";
import { Session } from "./session";
import { metaFor } from "../seo/meta";
import { applyMeta, hashToken, Router } from "./router";
import { renderSidebar } from "./sidebar";

const COLLAPSE_KEY = "learnvim.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

type Route =
  | { name: "home" }
  | { name: "notfound" }
  | { name: "lesson"; id: string }
  | { name: "playground" }
  | { name: "auth"; view: AuthView; token: string };

const AUTH_VIEWS: AuthView[] = ["login", "register", "forgot", "reset", "verify", "account"];
const REFRESH_ON_SESSION: AuthView[] = ["login", "register", "forgot", "account"];

function parseRoute(path: string): Route {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "lesson" && parts.length === 2 && findLesson(parts[1])) return { name: "lesson", id: parts[1] };
  if (parts[0] === "playground" && parts.length === 1) return { name: "playground" };
  const view = AUTH_VIEWS.find((v) => v === parts[0]);
  if (view && parts.length === 1) return { name: "auth", view, token: hashToken() };
  return { name: "notfound" };
}

export class App {
  private readonly progress = new Progress();
  private readonly session = new Session(this.progress);
  private readonly cheatsheet = new CheatSheetWindow();
  private readonly sidebarSlot = h("div", { class: "sidebar-slot" });
  private readonly main = h("main", { class: "main", id: "main" });
  private page: Page | null = null;
  private route: Route = { name: "home" };
  private collapsed = readCollapsed();
  private lastChapterId: string | null = null;
  private readonly layout: HTMLElement;
  private readonly router: Router;

  constructor(private readonly root: HTMLElement) {
    const menuButton = h(
      "button",
      {
        class: "menu-toggle",
        "aria-label": "Toggle chapter list",
        onclick: () => this.root.classList.toggle("nav-open"),
      },
      "☰",
    );
    this.layout = h(
      "div",
      { class: "layout" },
      menuButton,
      this.sidebarSlot,
      this.main,
      this.cheatsheet.el,
    );
    this.cheatsheet.onChange(() => this.renderSidebar());
    root.replaceChildren(this.layout);
    this.router = new Router(() => this.navigate());
    this.progress.subscribe(() => {
      this.renderSidebar();
      if (this.route.name === "home") this.navigate();
    });
    this.session.subscribe(() => {
      if (this.route.name === "auth" && REFRESH_ON_SESSION.includes(this.route.view)) this.navigate();
      else this.renderSidebar();
    });
    this.navigate();
    void this.session.init();
  }

  destroy(): void {
    this.router.destroy();
    this.page?.dispose();
    this.page = null;
    this.root.replaceChildren();
  }

  private afterSignIn(): void {
    const last = this.progress.last;
    this.router.go(last && findLesson(last) ? `/lesson/${last}` : "/");
  }

  private activeId(): string | null {
    switch (this.route.name) {
      case "lesson":
        return this.route.id;
      case "playground":
        return this.route.name;
      case "auth":
        return "account";
      default:
        return null;
    }
  }

  private renderSidebar(): void {
    this.layout.classList.toggle("collapsed", this.collapsed);
    this.sidebarSlot.replaceChildren(
      renderSidebar(this.progress, this.activeId(), {
        collapsed: this.collapsed,
        onToggle: () => this.toggleSidebar(),
        user: this.session.user?.username ?? null,
        emailUnconfirmed: !!this.session.user?.email && !this.session.user.emailVerified,
        onLogout: () => void this.session.logout(),
        cheatsheetOpen: this.cheatsheet.isOpen,
        onCheatsheet: () => this.cheatsheet.toggle(),
      }),
    );
  }

  private toggleSidebar(): void {
    this.collapsed = !this.collapsed;
    try {
      localStorage.setItem(COLLAPSE_KEY, this.collapsed ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
    this.renderSidebar();
  }

  private navigate(): void {
    this.route = parseRoute(this.router.path);
    applyMeta(this.route.name === "notfound" ? null : metaFor(this.router.path));
    this.page?.dispose();
    this.root.classList.remove("nav-open");
    switch (this.route.name) {
      case "lesson": {
        const ref = findLesson(this.route.id)!;
        this.page = renderLesson(
          ref,
          this.progress,
          this.lastChapterId !== null && this.lastChapterId !== ref.chapter.id,
        );
        this.lastChapterId = ref.chapter.id;
        break;
      }
      case "playground":
        this.page = renderPlayground();
        break;
      case "auth":
        this.page = renderAuth(this.route.view, this.session, () => this.afterSignIn(), this.route.token);
        break;
      case "notfound":
        this.page = { el: renderNotFound(), dispose: () => undefined };
        break;
      default:
        this.page = { el: renderHome(this.progress), dispose: () => undefined };
    }
    this.main.classList.toggle(
      "main-split",
      this.page.el.classList.contains("split"),
    );
    this.main.replaceChildren(this.page.el);
    this.renderSidebar();
    this.main.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    this.page.mount?.();
  }
}
