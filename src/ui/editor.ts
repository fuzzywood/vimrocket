import type { VimEngine } from "../vim/engine";
import { buildRegex } from "../vim/motions";
import { orderPos } from "../vim/types";
import { h } from "./dom";
import { highlightLine } from "./highlight";
import { displayKeys, toVimKey } from "./keys";

export interface EditorOptions {
  filename?: string;
  onKey?: (key: string) => void;
}

type Span = [number, number];

const MODE_LABEL: Record<string, string> = {
  insert: "-- INSERT --",
  replace: "-- REPLACE --",
  visual: "-- VISUAL --",
  "visual-line": "-- VISUAL LINE --",
  "visual-block": "-- VISUAL BLOCK --",
};

export class EditorView {
  readonly el: HTMLElement;
  private readonly linesEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly cmdEl: HTMLElement;
  private readonly unsubscribe: () => void;
  private savedText: string;
  private seenWrites = 0;
  private charWidth = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly fxLayer: HTMLElement;
  private lastCursor: { line: number; col: number; x: number; y: number; generation: number } | null = null;

  constructor(private readonly vim: VimEngine, private readonly opts: EditorOptions = {}) {
    this.savedText = vim.text;
    this.linesEl = h("div", { class: "vim-lines" });
    this.statusEl = h("div", { class: "vim-status" });
    this.cmdEl = h("div", { class: "vim-cmdline" });
    this.fxLayer = h("div", { class: "vim-fx", "aria-hidden": "true" });
    this.el = h(
      "div",
      { class: "vim-editor", tabindex: 0, role: "textbox", "aria-label": "Vim editor", spellcheck: "false" },
      this.linesEl,
      this.statusEl,
      this.cmdEl,
      this.fxLayer,
    );
    this.el.addEventListener("keydown", this.onKeyDown);
    this.el.addEventListener("focusout", this.onFocusOut);
    this.linesEl.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("keydown", this.onStrayKeyDown);
    window.addEventListener("focus", this.onWindowFocus);
    this.resizeObserver = new ResizeObserver(() => this.fitRows());
    this.resizeObserver.observe(this.linesEl);
    this.unsubscribe = vim.onChange(() => this.render());
    this.render();
  }

  resetSaved(): void {
    this.savedText = this.vim.text;
    this.seenWrites = this.vim.writes;
  }

  focus(): void {
    this.el.focus({ preventScroll: true });
  }

  destroy(): void {
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.el.removeEventListener("keydown", this.onKeyDown);
    this.el.removeEventListener("focusout", this.onFocusOut);
    document.removeEventListener("keydown", this.onStrayKeyDown);
    window.removeEventListener("focus", this.onWindowFocus);
  }

  private fitRows(): void {
    const lineHeight = this.linesEl.querySelector<HTMLElement>(".vim-line")?.getBoundingClientRect().height || 24;
    const style = getComputedStyle(this.linesEl);
    const available = this.linesEl.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const rows = Math.max(3, Math.floor(available / lineHeight));
    if (rows === this.vim.viewport.height) return;
    this.vim.viewport.height = rows;
    this.vim.scrollToCursor();
    this.render();
  }

  private onFocusOut = (): void => {
    setTimeout(() => {
      if (this.el.isConnected && document.hasFocus() && document.activeElement !== this.el) this.focus();
    }, 0);
  };

  private onWindowFocus = (): void => {
    if (this.el.isConnected) this.focus();
  };

  private onStrayKeyDown = (e: KeyboardEvent): void => {
    if (!this.el.isConnected || e.defaultPrevented) return;
    this.focus();
    this.onKeyDown(e);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = toVimKey(e);
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    this.vim.handleKey(key);
    this.opts.onKey?.(key);
  };

  private onMouseDown = (e: MouseEvent): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".vim-line");
    if (!row?.dataset.line) return;
    e.preventDefault();
    this.focus();
    const content = row.querySelector<HTMLElement>(".vim-text");
    if (!content) return;
    if (!this.charWidth) this.charWidth = this.measureChar(content);
    const x = e.clientX - content.getBoundingClientRect().left;
    const vim = this.vim;
    if (vim.mode === "command" || vim.mode === "insert" || vim.mode === "replace") return;
    vim.setCursor({ line: Number(row.dataset.line), col: Math.max(0, Math.floor(x / this.charWidth)) });
    this.render();
  };

  private measureChar(ref: HTMLElement): number {
    const probe = h("span", { class: "vim-probe" }, "MMMMMMMMMM");
    ref.append(probe);
    const w = probe.getBoundingClientRect().width / 10;
    probe.remove();
    return w || 8;
  }

  render(): void {
    const vim = this.vim;
    if (vim.writes !== this.seenWrites) {
      this.seenWrites = vim.writes;
      this.savedText = vim.text;
    }
    const { top, height } = vim.viewport;
    const searchRe = this.searchRegex();
    const rows: HTMLElement[] = [];
    for (let i = 0; i < height; i++) {
      const line = top + i;
      if (line >= vim.buf.lineCount) {
        rows.push(h("div", { class: "vim-line vim-empty" }, h("span", { class: "vim-gutter" }, "~"), h("span", { class: "vim-text" })));
        continue;
      }
      rows.push(this.renderLine(line, searchRe));
    }
    this.linesEl.replaceChildren(...rows);
    this.renderStatus();
    this.renderCmdline();
    this.el.dataset.mode = vim.mode;
    this.animateJump();
  }

  private searchRegex(): RegExp | null {
    const vim = this.vim;
    if (vim.mode === "command" && vim.cmdType !== ":" && vim.cmdline) {
      return buildRegex(vim.cmdline, vim.options.ignorecase);
    }
    if (!vim.options.hlsearch || !vim.searchHighlight || !vim.lastSearch) return null;
    return buildRegex(vim.lastSearch.pattern, vim.options.ignorecase);
  }

  private gutterText(line: number): string {
    const { number, relativenumber } = this.vim.options;
    const cur = this.vim.cursor.line;
    if (relativenumber) {
      if (line === cur) return String(number ? line + 1 : 0);
      return String(Math.abs(line - cur));
    }
    return number ? String(line + 1) : "";
  }

  private selection(line: number, len: number): Span | null {
    const vim = this.vim;
    if (!vim.isVisual) return null;
    const [s, e] = orderPos(vim.anchor, vim.cursor);
    if (line < s.line || line > e.line) return null;
    if (vim.mode === "visual-line") return [0, len + 1];
    if (vim.mode === "visual-block") {
      const left = Math.min(vim.anchor.col, vim.cursor.col);
      const right = vim.want === Infinity ? len : Math.max(vim.anchor.col, vim.cursor.col);
      return [left, Math.min(right + 1, len + 1)];
    }
    const from = line === s.line ? s.col : 0;
    const to = line === e.line ? Math.min(e.col + 1, len + (len === 0 ? 1 : 0)) : len + 1;
    return [from, Math.max(from + 1, to)];
  }

  private renderLine(line: number, searchRe: RegExp | null): HTMLElement {
    const vim = this.vim;
    const text = vim.buf.line(line).replace(/\t/g, " ");
    const len = text.length;
    const cells = len + 1;
    const tokens = highlightLine(text);
    const classes: string[][] = Array.from({ length: cells }, (_, c) => (tokens[c] ? [`tk-${tokens[c]}`] : []));
    const sel = this.selection(line, len);
    if (sel) for (let c = sel[0]; c < Math.min(sel[1], cells); c++) classes[c].push("sel");
    if (searchRe) {
      searchRe.lastIndex = 0;
      for (const m of text.matchAll(searchRe)) {
        const end = Math.max(m.index! + m[0].length, m.index! + 1);
        for (let c = m.index!; c < Math.min(end, len); c++) classes[c].push("hl");
      }
    }
    const isCursorLine = vim.cursor.line === line;
    this.markFind(line, text, classes);
    if (isCursorLine) {
      const col = Math.min(vim.cursor.col, len);
      classes[col].push(vim.mode === "insert" ? "cur-bar" : vim.mode === "replace" ? "cur-under" : "cur");
    }
    const content = h("span", { class: "vim-text" });
    let runStart = 0;
    for (let c = 1; c <= cells; c++) {
      if (c < cells && classes[c].join(" ") === classes[runStart].join(" ")) continue;
      const body = text.slice(runStart, Math.min(c, len));
      const cls = classes[runStart].join(" ");
      if (cls) content.append(h("span", { class: cls }, body + (c > len ? " " : "")));
      else if (body) content.append(body);
      runStart = c;
    }
    return h(
      "div",
      { class: `vim-line${isCursorLine ? " vim-curline" : ""}`, "data-line": line },
      h("span", { class: "vim-gutter" }, this.gutterText(line)),
      content,
    );
  }

  private animateJump(): void {
    const vim = this.vim;
    const cursorEl = this.linesEl.querySelector<HTMLElement>(".cur, .cur-bar, .cur-under");
    if (!cursorEl) return;
    const box = this.el.getBoundingClientRect();
    const rect = cursorEl.getBoundingClientRect();
    const now = { line: vim.cursor.line, col: vim.cursor.col, x: rect.left - box.left, y: rect.top - box.top, generation: vim.generation };
    const prev = this.lastCursor;
    this.lastCursor = now;
    if (!prev || prev.generation !== now.generation || vim.mode === "insert" || vim.mode === "replace") return;
    const far = Math.abs(now.line - prev.line) >= 2 || Math.abs(now.col - prev.col) >= 4;
    if (!far || !rect.width) return;
    const size = { width: `${rect.width}px`, height: `${rect.height}px` };
    const trail = h("div", { class: "jump-trail" });
    Object.assign(trail.style, size, { left: `${prev.x}px`, top: `${prev.y}px` });
    trail.style.setProperty("--dx", `${now.x - prev.x}px`);
    trail.style.setProperty("--dy", `${now.y - prev.y}px`);
    const pulse = h("div", { class: "jump-pulse" });
    Object.assign(pulse.style, size, { left: `${now.x}px`, top: `${now.y}px` });
    for (const fx of [trail, pulse]) {
      fx.addEventListener("animationend", () => fx.remove());
      this.fxLayer.append(fx);
    }
    while (this.fxLayer.childElementCount > 8) this.fxLayer.firstElementChild?.remove();
  }

  private markFind(line: number, text: string, classes: string[][]): void {
    const vim = this.vim;
    const pending = vim.pendingFind;
    const anchor = pending ? vim.cursor : vim.findAnchor;
    if (!anchor || (!pending && (!vim.lastFind || !(vim.mode === "normal" || vim.isVisual)))) return;
    const cmd = pending ?? vim.lastFind!.cmd;
    const forward = cmd === "f" || cmd === "t";
    if (forward ? line < anchor.line : line > anchor.line) return;
    const from = line === anchor.line && forward ? anchor.col + 1 : 0;
    const to = line === anchor.line && !forward ? anchor.col : text.length;
    const ch = pending ? null : vim.lastFind!.ch;
    for (let c = from; c < to; c++) classes[c].push(text[c] === ch ? "fm" : "dim");
  }

  private renderStatus(): void {
    const vim = this.vim;
    const modified = vim.text !== this.savedText;
    const total = vim.buf.lineCount;
    const { top, height } = vim.viewport;
    const pct = total <= height ? "All" : top === 0 ? "Top" : top + height >= total ? "Bot" : `${Math.round((top / (total - height)) * 100)}%`;
    const parts = [
      h("span", { class: "vim-mode-pill", "data-mode": vim.mode }, vim.mode === "command" ? "COMMAND" : vim.mode.replace("-", " ").toUpperCase()),
      h("span", { class: "vim-file" }, `${this.opts.filename ?? "practice.txt"}${modified ? " [+]" : ""}`),
      h("span", { class: "vim-spacer" }),
      vim.recording ? h("span", { class: "vim-rec" }, `recording @${vim.recording}`) : null,
      h("span", { class: "vim-showcmd" }, displayKeys(vim.pending)),
      h("span", { class: "vim-pos" }, `${vim.cursor.line + 1},${vim.cursor.col + 1}`),
      h("span", { class: "vim-pct" }, pct),
    ].filter((n): n is HTMLSpanElement => n !== null);
    this.statusEl.replaceChildren(...parts);
  }

  private renderCmdline(): void {
    const vim = this.vim;
    if (vim.mode === "command") {
      this.cmdEl.className = "vim-cmdline active";
      this.cmdEl.replaceChildren(vim.cmdType + vim.cmdline, h("span", { class: "cur-bar" }, " "));
      return;
    }
    if (vim.message) {
      this.cmdEl.className = `vim-cmdline${vim.messageIsError ? " error" : ""}`;
      this.cmdEl.textContent = vim.message;
    } else {
      this.cmdEl.className = "vim-cmdline mode";
      this.cmdEl.textContent = MODE_LABEL[vim.mode] ?? "";
    }
  }
}
