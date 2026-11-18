// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapters } from "../lessons";
import { App as BaseApp } from "./app";

const apps: BaseApp[] = [];

class App extends BaseApp {
  constructor(root: HTMLElement) {
    super(root);
    apps.push(this);
  }
}

afterEach(() => {
  while (apps.length) apps.pop()!.destroy();
});

const press = (key: string, opts: KeyboardEventInit = {}): void => {
  const editor = document.querySelector<HTMLElement>(".vim-editor")!;
  editor.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
};

const type = (keys: string): void => {
  for (const k of keys) press(k);
};

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(k: string): string | null {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.items.set(k, v);
  }
  removeItem(k: string): void {
    this.items.delete(k);
  }
  clear(): void {
    this.items.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ user: null }), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("renders the home page with chapters", () => {
    location.hash = "";
    new App(document.getElementById("app")!);
    expect(document.querySelectorAll(".chapter-card").length).toBeGreaterThan(5);
    expect(document.querySelector(".sidebar")).not.toBeNull();
  });

  it("completes a lesson through keyboard events", () => {
    location.hash = "#/lesson/x-delete";
    new App(document.getElementById("app")!);
    expect(document.querySelector(".lesson h1")?.textContent).toContain("Deleting characters");
    const banner = document.querySelector<HTMLElement>(".success")!;
    expect(banner.hidden).toBe(true);
    type("lxfpxfmx");
    expect(banner.hidden).toBe(false);
    expect(banner.closest(".split-editor")).not.toBeNull();
    const targetPanel = document.querySelector<HTMLElement>(".reveal.target")!;
    expect(targetPanel.hidden).toBe(true);
    [...document.querySelectorAll<HTMLButtonElement>(".toolbar .toggle")].find((b) => b.textContent === "Target")!.click();
    expect(targetPanel.hidden).toBe(false);
    expect(targetPanel.textContent).toContain("The cow jumped over the moon.");
    const solutions = banner.querySelector<HTMLElement>(".success-solutions")!;
    expect(solutions.hidden).toBe(true);
    [...banner.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Show solution")!.click();
    expect(solutions.hidden).toBe(false);
    expect(solutions.textContent).toContain("fp");
    expect(banner.textContent).toContain("8 keystrokes");
    expect(banner.textContent).toContain("optimal 8");
    expect(JSON.parse(localStorage.getItem("learnvim.progress.v1")!).lessons["x-delete"].bestKeys).toBe(8);
    expect(document.querySelector(".lesson-list a.done")).not.toBeNull();
    banner.querySelector<HTMLButtonElement>(".success-close")!.click();
    expect(banner.hidden).toBe(true);
  });

  it("shows mode and command line", () => {
    location.hash = "#/playground";
    new App(document.getElementById("app")!);
    press("i");
    expect(document.querySelector(".vim-cmdline")?.textContent).toBe("-- INSERT --");
    press("Escape");
    type(":set rnu");
    expect(document.querySelector(".vim-cmdline")?.textContent).toContain(":set rnu");
    press("Enter");
    press("v", { ctrlKey: true });
    expect(document.querySelector(".vim-mode-pill")?.textContent).toBe("VISUAL BLOCK");
  });

  it("forwards keys typed outside the editor", () => {
    location.hash = "#/lesson/x-delete";
    new App(document.getElementById("app")!);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }));
    expect(document.querySelector(".vim-line")?.textContent).toContain("hhe cow");
    expect(document.activeElement?.classList.contains("vim-editor")).toBe(true);
  });

  it("collapses the sidebar and remembers it", () => {
    location.hash = "#/playground";
    new App(document.getElementById("app")!);
    document.querySelector<HTMLButtonElement>(".sidebar-toggle")!.click();
    expect(document.querySelector(".layout")?.classList.contains("collapsed")).toBe(true);
    expect(document.querySelectorAll(".rail-chapters a").length).toBe(chapters.length);
    expect(localStorage.getItem("learnvim.sidebar.collapsed")).toBe("1");
    document.querySelector<HTMLButtonElement>(".sidebar-toggle")!.click();
    expect(document.querySelector(".chapter-list")).not.toBeNull();
  });

  it("highlights code", () => {
    location.hash = "#/lesson/brackets";
    new App(document.getElementById("app")!);
    expect(document.querySelector(".vim-lines .tk-kw")?.textContent).toBe("function");
  });

  it("darkens the search direction while f is pending and marks matches afterwards", () => {
    location.hash = "#/lesson/dd";
    new App(document.getElementById("app")!);
    press("j");
    press("F");
    const lines = [...document.querySelectorAll(".vim-lines .vim-line")];
    expect(lines[0].querySelectorAll(".dim").length).toBeGreaterThan(0);
    expect(lines[2].querySelectorAll(".dim").length).toBe(0);
    press("Escape");
    press("f");
    const after = [...document.querySelectorAll(".vim-lines .vim-line")];
    expect(after[0].querySelectorAll(".dim").length).toBe(0);
    expect(after[1].querySelector(".cur")?.classList.contains("dim")).toBe(false);
    expect(after[2].textContent).toContain("Violets");
    expect(after[2].querySelectorAll(".dim").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".qs1, .qs2").length).toBe(0);
    press("u");
    const marked = (): string[] => [...document.querySelectorAll(".vim-lines .fm")].map((e) => e.closest(".vim-line")!.getAttribute("data-line")!);
    expect(marked()).toEqual(["1", "1", "2", "5", "7"]);
    expect(document.querySelectorAll(".vim-lines .dim").length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.vim-line[data-line="0"] .dim').length).toBe(0);
    const dimmedOnAnchorLine = document.querySelectorAll('.vim-line[data-line="1"] .dim').length;
    press(";");
    press(";");
    expect(document.querySelector(".vim-curline")?.getAttribute("data-line")).toBe("2");
    expect(marked()).toEqual(["1", "1", "2", "5", "7"]);
    expect(document.querySelectorAll('.vim-line[data-line="1"] .dim').length).toBe(dimmedOnAnchorLine);
    press("Escape");
    expect(document.querySelectorAll(".fm, .dim").length).toBe(0);
    type("fu");
    expect(marked().length).toBeGreaterThan(0);
    press("x");
    expect(document.querySelectorAll(".fm, .dim").length).toBe(0);
  });

  it("runs a chapter test task by task", () => {
    vi.useFakeTimers();
    try {
      location.hash = "#/lesson/test-first-steps";
      new App(document.getElementById("app")!);
      const label = (): string => document.querySelector(".task-counter")!.textContent!;
      expect(label()).toBe("1/3");
      type("9lxjx");
      vi.advanceTimersByTime(1000);
      expect(label()).toBe("2/3");
      expect(document.querySelector(".steps .step.done")).not.toBeNull();
      type("IThe ");
      press("Escape");
      type("7librown ");
      press("Escape");
      type("jA.");
      press("Escape");
      type("3hilazy ");
      press("Escape");
      vi.advanceTimersByTime(1000);
      expect(label()).toBe("3/3");
      type("Otop");
      press("Escape");
      type("jobottom");
      press("Escape");
      type(":wq");
      press("Enter");
      const banner = document.querySelector<HTMLElement>(".success")!;
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain("Chapter test passed!");
    } finally {
      vi.useRealTimers();
    }
  });

  it("navigates between chapter test tasks", () => {
    location.hash = "#/lesson/test-operators";
    new App(document.getElementById("app")!);
    const counter = (): string => document.querySelector(".task-counter")!.textContent!;
    const prev = document.querySelector<HTMLButtonElement>('.task-nav-btn[aria-label="Previous task"]')!;
    const next = document.querySelector<HTMLButtonElement>('.task-nav-btn[aria-label="Next task"]')!;
    expect(counter()).toBe("1/3");
    expect(prev.disabled).toBe(true);
    next.click();
    expect(counter()).toBe("2/3");
    expect(document.querySelector(".vim-line")?.textContent).toContain("first");
    document.querySelectorAll<HTMLButtonElement>(".steps .step")[2].click();
    expect(counter()).toBe("3/3");
    expect(document.querySelector<HTMLButtonElement>('.task-nav-btn[aria-label="Next task"]')!.disabled).toBe(true);
    prev.click();
    expect(counter()).toBe("2/3");
  });

  it("passes a test when all tasks are solved in any order", () => {
    vi.useFakeTimers();
    try {
      location.hash = "#/lesson/test-operators";
      new App(document.getElementById("app")!);
      document.querySelectorAll<HTMLButtonElement>(".steps .step")[2].click();
      type("gUej.j.");
      vi.advanceTimersByTime(1000);
      expect(document.querySelector(".task-counter")!.textContent).toBe("1/3");
      expect(document.querySelectorAll(".steps .step.done").length).toBe(1);
      type("wdwwwdwwwdw");
      vi.advanceTimersByTime(1000);
      expect(document.querySelector(".task-counter")!.textContent).toBe("2/3");
      type("jddpjccfourth");
      press("Escape");
      expect(document.querySelector<HTMLElement>(".success")!.hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs in through the login form and shows the account", async () => {
    const calls: string[] = [];
    let signedIn = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const route = `${init?.method ?? "GET"} ${url}`;
      calls.push(route);
      const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      if (route === "GET /api/me") return json({ user: signedIn ? { username: "ada", email: "ada@example.com", emailVerified: true } : null });
      if (route === "POST /api/login") {
        signedIn = true;
        return json({ user: { username: "ada", email: "ada@example.com", emailVerified: true } });
      }
      if (route === "GET /api/progress") return json({ progress: { lessons: { hjkl: { completedAt: 1, bestKeys: 7 } } } });
      if (route === "POST /api/logout") return json({ ok: true });
      return json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      location.hash = "#/login";
      new App(document.getElementById("app")!);
      await vi.waitFor(() => expect(calls).toContain("GET /api/me"));
      document.querySelector<HTMLInputElement>('input[name="login"]')!.value = "ada";
      document.querySelector<HTMLInputElement>('input[name="password"]')!.value = "correct horse";
      document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
      await vi.waitFor(() => expect(document.querySelector(".account-name")?.textContent).toBe("ada"));
      expect(document.querySelector('.lesson-list a[href="/lesson/hjkl"]')?.classList.contains("done")).toBe(true);
      document.querySelector<HTMLButtonElement>(".account .btn")!.click();
      await vi.waitFor(() => expect(document.querySelector(".account.guest")).not.toBeNull());
      expect(calls).toContain("POST /api/logout");
    } finally {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    }
  });

  it("toggles the floating cheat sheet from the sidebar", () => {
    location.hash = "#/lesson/hjkl";
    new App(document.getElementById("app")!);
    const win = document.querySelector<HTMLElement>(".float-window")!;
    const button = (): HTMLButtonElement =>
      [...document.querySelectorAll<HTMLButtonElement>(".nav-links button")].find((b) => b.textContent === "Cheat sheet")!;
    const initial = win.hidden;
    button().click();
    expect(win.hidden).toBe(!initial);
    expect(button().getAttribute("aria-pressed")).toBe(String(initial));
    expect(document.querySelector(".vim-editor")).not.toBeNull();
    win.querySelector<HTMLButtonElement>(".float-close")!.click();
    expect(win.hidden).toBe(true);
  });

  it("announces a new chapter when switching chapters", async () => {
    location.hash = "#/lesson/hjkl";
    new App(document.getElementById("app")!);
    expect(document.querySelector(".chapter-toast")).toBeNull();
    location.hash = "#/lesson/counts";
    await vi.waitFor(() => expect(document.querySelector(".lesson h1")?.textContent).toContain("Counts"));
    expect(document.querySelector(".chapter-toast")).toBeNull();
    location.hash = "#/lesson/word-motions";
    await vi.waitFor(() => expect(document.querySelector(".lesson h1")?.textContent).toContain("w, b and e"));
    expect(document.querySelector(".chapter-toast")?.textContent).toContain("Words and Lines");
  });

  it("requests a reset link, resets the password and confirms emails from links", async () => {
    const calls: { route: string; body: Record<string, string> }[] = [];
    const user = { username: "ada", email: "ada@example.com", emailVerified: false };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const route = `${init?.method ?? "GET"} ${url}`;
        calls.push({ route, body: init?.body ? JSON.parse(init.body as string) : {} });
        const json = (body: unknown, status = 200): Response =>
          new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
        if (route === "POST /api/password/reset") return json({ user: { ...user, emailVerified: true } });
        if (route === "POST /api/email/verify") {
          return calls.filter((c) => c.route === route).length === 1 ? json({ ok: true, user: null }) : json({ error: "This confirmation link is invalid or has expired." }, 400);
        }
        if (route === "GET /api/progress") return json({ progress: null });
        return json({ ok: true, user: null });
      }),
    );
    const submit = (): void => void document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));

    location.hash = "#/forgot";
    new App(document.getElementById("app")!);
    document.querySelector<HTMLInputElement>('input[name="email"]')!.value = "ada@example.com";
    submit();
    await vi.waitFor(() => expect(document.querySelector(".auth-notice")?.textContent).toContain("Check your inbox"));
    expect(calls.find((c) => c.route === "POST /api/password/forgot")?.body).toEqual({ email: "ada@example.com" });

    location.hash = "#/reset?token=abc123";
    await vi.waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Choose a new password"));
    document.querySelector<HTMLInputElement>('input[name="password"]')!.value = "new password";
    document.querySelector<HTMLInputElement>('input[name="confirm"]')!.value = "different";
    submit();
    expect(document.querySelector(".form-error")?.textContent).toBe("The passwords do not match.");
    document.querySelector<HTMLInputElement>('input[name="confirm"]')!.value = "new password";
    submit();
    await vi.waitFor(() => expect(document.querySelector(".account-name")?.textContent).toBe("ada"));
    expect(calls.find((c) => c.route === "POST /api/password/reset")?.body).toEqual({ token: "abc123", password: "new password" });

    location.hash = "#/verify?token=xyz";
    await vi.waitFor(() => expect(document.querySelector(".auth-notice.success")?.textContent).toContain("Email confirmed"));
    expect(calls.find((c) => c.route === "POST /api/email/verify")?.body).toEqual({ token: "xyz" });
    expect(calls.filter((c) => c.route === "POST /api/email/verify")).toHaveLength(1);
  });

  it("routes on real paths, upgrades legacy hash links and updates page metadata", async () => {
    history.replaceState(null, "", "/lesson/counts");
    new App(document.getElementById("app")!);
    expect(document.querySelector(".lesson h1")?.textContent).toContain("Counts");
    expect(document.title).toBe("Counts – First Steps | LearnVim");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toMatch(/\/lesson\/counts$/);

    document.querySelector<HTMLAnchorElement>('.lesson-list a[href="/lesson/x-delete"]')!.click();
    expect(location.pathname).toBe("/lesson/x-delete");
    expect(document.querySelector(".lesson h1")?.textContent).toContain("Deleting characters");

    history.replaceState(null, "", "/lesson/counts");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(document.querySelector(".lesson h1")?.textContent).toContain("Counts");

    location.hash = "#/lesson/f-t";
    await vi.waitFor(() => expect(location.pathname).toBe("/lesson/f-t"));
    expect(location.hash).toBe("");
    expect(document.querySelector(".lesson h1")?.textContent).toContain("f, t");

    history.replaceState(null, "", "/does-not-exist");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(document.querySelector("h1")?.textContent).toBe("Page not found");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
    history.replaceState(null, "", "/");
  });

  it("reads tokens from the fragment and upgrades old email links", () => {
    history.replaceState(null, "", "/#/reset?token=old-link");
    new App(document.getElementById("app")!);
    expect(location.pathname).toBe("/reset");
    expect(location.hash).toBe("#token=old-link");
    expect(document.querySelector("h1")?.textContent).toBe("Choose a new password");
    history.replaceState(null, "", "/");
  });
});
