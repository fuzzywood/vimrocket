import { h, kbd } from "./dom";

const STORAGE_KEY = "learnvim.cheatsheet.v2";

const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Movement",
    rows: [
      ["h j k l", "left, down, up, right"],
      ["w b e ge", "word forward / back / end / end back"],
      ["W B E gE", "same for WORDs"],
      ["0 ^ $ g_", "line start / first char / end / last char"],
      ["gg G {n}G", "first / last / n-th line"],
      ["{ }", "paragraph back / forward"],
      ["%", "matching bracket"],
      ["f t F T ; ,", "find / till a character"],
      ["H M L", "top / middle / bottom of screen"],
      ["Ctrl-d Ctrl-u", "half page down / up"],
      ["zz zt zb", "scroll cursor to center / top / bottom"],
    ],
  },
  {
    title: "Insert mode",
    rows: [
      ["i a", "insert before / after cursor"],
      ["I A", "insert at line start / end"],
      ["o O", "open line below / above"],
      ["s S", "substitute char / line"],
      ["R", "replace mode"],
      ["gi", "insert where you left off"],
      ["Esc Ctrl-[", "back to Normal mode"],
      ["Ctrl-h Ctrl-u", "delete char / to line start (insert)"],
      ["Ctrl-r {reg}", "insert register (insert)"],
      ["Ctrl-t Ctrl-d", "indent / dedent line (insert)"],
    ],
  },
  {
    title: "Editing",
    rows: [
      ["x X", "delete char under / before cursor"],
      ["r{c}", "replace character"],
      ["d{motion} dd D", "delete"],
      ["c{motion} cc C", "change"],
      ["y{motion} yy Y", "yank (copy)"],
      ["p P gp gP", "put after / before"],
      ["J gJ", "join lines with / without space"],
      ["~ g~ gu gU", "toggle / lower / upper case"],
      ["> < >> <<", "indent / dedent"],
      ["Ctrl-a Ctrl-x", "increment / decrement number"],
      ["u Ctrl-r .", "undo / redo / repeat"],
    ],
  },
  {
    title: "Text objects",
    rows: [
      ["iw aw iW aW", "word / WORD"],
      ['i" a" i\' a\'', "quoted string"],
      ["i( a( ib ab", "parentheses"],
      ["i{ a{ iB aB", "braces"],
      ["i[ a[ i< a<", "brackets / angle brackets"],
      ["ip ap", "paragraph"],
    ],
  },
  {
    title: "Visual mode",
    rows: [
      ["v V Ctrl-v", "character / line / block"],
      ["o", "go to other end"],
      ["gv", "reselect last selection"],
      ["I A", "insert / append on every line (block)"],
      ["u U ~", "change case"],
      [":", "ex command on selection"],
    ],
  },
  {
    title: "Search & command line",
    rows: [
      ["/pat ?pat", "search forward / backward"],
      ["n N * #", "next / previous / word under cursor"],
      [":s/a/b/g", "substitute in line"],
      [":%s/a/b/gi", "substitute in file, ignore case"],
      [":g/pat/d :v/pat/d", "delete matching / non-matching lines"],
      [":m :t", "move / copy lines"],
      [":norm {keys}", "run normal commands on range"],
      [":sort :noh :reg", "sort / clear highlight / registers"],
      [":set nu rnu ic", "options"],
      [":w :q :wq :x", "write / quit"],
    ],
  },
  {
    title: "Registers, marks & macros",
    rows: [
      ['"{a-z}', "use named register"],
      ['"{A-Z}', "append to register"],
      ['"0 "- "_', "last yank / small delete / black hole"],
      ["m{a-z}", "set mark"],
      ["'{a} `{a}", "jump to mark line / position"],
      ["''", "jump back"],
      ["q{a-z} q", "record macro"],
      ["@{a} @@", "play macro / repeat last"],
      ["@:", "repeat last ex command"],
    ],
  },
];

interface WindowState {
  open: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

const HEADER_HEIGHT = 46;
const MIN_VISIBLE = 140;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

function defaultState(open = false): WindowState {
  const width = Math.min(760, window.innerWidth - 32);
  const height = Math.min(680, window.innerHeight - 64);
  return { open, x: window.innerWidth - width - 24, y: 40, width, height };
}

function readState(): WindowState {
  const fallback = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<WindowState>) : {};
    const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
    return {
      open: parsed.open === true,
      x: valid(parsed.x) ? parsed.x : fallback.x,
      y: valid(parsed.y) ? parsed.y : fallback.y,
      width: valid(parsed.width) ? parsed.width : fallback.width,
      height: valid(parsed.height) ? parsed.height : fallback.height,
    };
  } catch {
    return fallback;
  }
}

interface Drag {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

export class CheatSheetWindow {
  readonly el: HTMLElement;
  private readonly header: HTMLElement;
  private state = readState();
  private drag: Drag | null = null;
  private frame = 0;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.header = h(
      "header",
      { class: "float-head", title: "Drag to move · double-click to reset" },
      h("span", { class: "float-title" }, "Cheat sheet"),
      h("button", { class: "float-close", "aria-label": "Close cheat sheet", title: "Close", onclick: () => this.setOpen(false) }, "×"),
    );
    const body = h(
      "div",
      { class: "float-body" },
      SECTIONS.map((section) =>
        h(
          "section",
          { class: "sheet" },
          h("h2", {}, section.title),
          h(
            "table",
            { class: "keytable" },
            h("tbody", {}, section.rows.map(([keys, desc]) => h("tr", {}, h("td", {}, keys.split(" ").map((k) => kbd(k))), h("td", {}, desc)))),
          ),
        ),
      ),
    );
    this.el = h("aside", { class: "float-window", role: "dialog", "aria-label": "Cheat sheet" }, this.header, body);

    this.header.addEventListener("pointerdown", this.onPointerDown);
    this.header.addEventListener("pointermove", this.onPointerMove);
    this.header.addEventListener("pointerup", this.endDrag);
    this.header.addEventListener("pointercancel", this.endDrag);
    this.header.addEventListener("lostpointercapture", this.endDrag);
    this.header.addEventListener("dblclick", this.resetPosition);
    new ResizeObserver(this.onResize).observe(this.el);
    window.addEventListener("resize", () => {
      this.applySize();
      this.applyPosition();
    });

    this.el.hidden = !this.state.open;
    this.applySize();
    this.applyPosition();
  }

  get isOpen(): boolean {
    return this.state.open;
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  toggle(): void {
    this.setOpen(!this.state.open);
  }

  setOpen(open: boolean): void {
    this.state.open = open;
    this.el.hidden = !open;
    if (open) {
      this.applySize();
      this.applyPosition();
    }
    this.save();
    this.listeners.forEach((fn) => fn());
  }

  private applySize(): void {
    const width = Math.min(this.state.width, window.innerWidth);
    const height = Math.min(this.state.height, window.innerHeight - 16);
    this.el.style.width = `${Math.round(width)}px`;
    this.el.style.height = `${Math.round(height)}px`;
  }

  private applyPosition(): void {
    const width = this.el.offsetWidth || this.state.width;
    this.state.x = clamp(this.state.x, MIN_VISIBLE - width, window.innerWidth - MIN_VISIBLE);
    this.state.y = clamp(this.state.y, 0, window.innerHeight - HEADER_HEIGHT);
    this.el.style.translate = `${Math.round(this.state.x)}px ${Math.round(this.state.y)}px`;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    this.drag = { pointerId: e.pointerId, offsetX: e.clientX - this.state.x, offsetY: e.clientY - this.state.y };
    try {
      this.header.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported: moves still arrive while over the header */
    }
    this.el.classList.add("dragging");
  };

  private onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.state.x = e.clientX - drag.offsetX;
    this.state.y = e.clientY - drag.offsetY;
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.applyPosition();
      });
    }
  };

  private endDrag = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.el.classList.remove("dragging");
    this.applyPosition();
    this.save();
  };

  private resetPosition = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest("button")) return;
    this.state = defaultState(this.state.open);
    this.applySize();
    this.applyPosition();
    this.save();
  };

  private onResize = (): void => {
    if (this.drag || !this.state.open || !this.el.offsetWidth) return;
    this.state.width = this.el.offsetWidth;
    this.state.height = this.el.offsetHeight;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 200);
  };

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage unavailable */
    }
  }
}
