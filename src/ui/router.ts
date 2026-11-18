import { NOT_FOUND_META, SITE_NAME, type PageMeta } from "../seo/meta";

export function upgradeLegacyHash(): boolean {
  const match = /^#\/(.*)$/.exec(location.hash);
  if (!match) return false;
  const [path, query = ""] = match[1].split("?");
  const token = new URLSearchParams(query).get("token");
  history.replaceState(history.state, "", `/${path}${token ? `#token=${encodeURIComponent(token)}` : ""}`);
  return true;
}

export function hashToken(): string {
  return new URLSearchParams(location.hash.replace(/^#/, "")).get("token") ?? "";
}

export class Router {
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    upgradeLegacyHash();
    document.addEventListener("click", this.onClick);
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("hashchange", this.onHashChange);
  }

  get path(): string {
    return location.pathname.replace(/\/+$/, "") || "/";
  }

  go(url: string, replace = false): void {
    const target = new URL(url, location.href);
    const current = location.pathname + location.search + location.hash;
    const next = target.pathname + target.search + target.hash;
    if (next !== current) history[replace ? "replaceState" : "pushState"](null, "", next);
    this.onChange();
  }

  destroy(): void {
    document.removeEventListener("click", this.onClick);
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("hashchange", this.onHashChange);
  }

  private readonly onPopState = (): void => this.onChange();

  private readonly onHashChange = (): void => {
    if (upgradeLegacyHash()) this.onChange();
  };

  private readonly onClick = (e: MouseEvent): void => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
    e.preventDefault();
    this.go(url.pathname + url.search + url.hash);
  };
}

function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string): void {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.append(el);
  }
  el.setAttribute(attr, value);
}

export function applyMeta(meta: PageMeta | null): void {
  const m = meta ?? NOT_FOUND_META;
  document.title = m.title || SITE_NAME;
  const named = (name: string): (() => HTMLElement) => () => Object.assign(document.createElement("meta"), { name });
  setMeta('meta[name="description"]', named("description"), "content", m.description);
  setMeta('meta[name="robots"]', named("robots"), "content", m.index ? "index,follow" : "noindex,follow");
  setMeta('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), "href", location.origin + m.path);
}

