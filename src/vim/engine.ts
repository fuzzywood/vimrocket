import { Buffer } from "./buffer";
import { runEx } from "./ex";
import { searchText } from "./motions";
import { execCommand } from "./normal";
import { parseCommand, type Command } from "./parser";
import type { Mode, Pos, Register, Snapshot } from "./types";

export interface Options {
  number: boolean;
  relativenumber: boolean;
  hlsearch: boolean;
  ignorecase: boolean;
  shiftwidth: number;
}

interface InsertSession {
  kind: string;
  count: number;
  keys: string[];
  block?: { from: number; to: number; col: number; append: boolean; toEnd: boolean; lineLength: number };
  replaced: (string | null)[];
}

interface LastChange {
  cmd: Command;
  insertKeys: string[];
}

export type Listener = () => void;

const SCROLL_OFF = 3;

export class VimEngine {
  buf: Buffer;
  cursor: Pos = { line: 0, col: 0 };
  mode: Mode = "normal";
  want = 0;
  anchor: Pos = { line: 0, col: 0 };
  lastVisual: { anchor: Pos; cursor: Pos; mode: Mode } | null = null;
  pending: string[] = [];
  cmdline = "";
  cmdType: ":" | "/" | "?" = ":";
  cmdReturnMode: Mode = "normal";
  cmdHistory: string[] = [];
  private historyIndex = -1;
  message = "";
  messageIsError = false;
  registers = new Map<string, Register>();
  macros = new Map<string, string[]>();
  recording: string | null = null;
  private recordBuffer: string[] = [];
  lastMacro: string | null = null;
  marks = new Map<string, Pos>();
  undoStack: Snapshot[] = [];
  redoStack: Snapshot[] = [];
  private changeStart: Snapshot | null = null;
  private groupDepth = 0;
  lastSearch: { pattern: string; forward: boolean } | null = null;
  searchHighlight = true;
  lastFind: { cmd: string; ch: string } | null = null;
  findAnchor: Pos | null = null;
  generation = 0;
  lastSubstitute: { pattern: string; replacement: string; flags: string } | null = null;
  lastEx: string | null = null;
  lastChange: LastChange | null = null;
  private dotCommand: Command | null = null;
  private replaying = 0;
  insert: InsertSession | null = null;
  private insertCtrlR = false;
  options: Options = { number: true, relativenumber: false, hlsearch: true, ignorecase: false, shiftwidth: 4 };
  viewport = { top: 0, height: 18 };
  keyCount = 0;
  writes = 0;
  quitRequested = false;
  pendingCount = 0;
  private listeners = new Set<Listener>();

  constructor(text = "") {
    this.buf = new Buffer(text);
  }

  get text(): string {
    return this.buf.text;
  }

  get pendingFind(): "f" | "F" | "t" | "T" | null {
    const last = this.pending[this.pending.length - 1];
    if (last !== "f" && last !== "F" && last !== "t" && last !== "T") return null;
    return this.pending[this.pending.length - 2] === '"' ? null : last;
  }

  get isVisual(): boolean {
    return this.mode === "visual" || this.mode === "visual-line" || this.mode === "visual-block";
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  load(text: string, cursor: Pos = { line: 0, col: 0 }): void {
    this.generation++;
    this.buf = new Buffer(text);
    this.cursor = this.buf.clamp(cursor);
    this.want = this.cursor.col;
    this.mode = "normal";
    this.pending = [];
    this.undoStack = [];
    this.redoStack = [];
    this.marks.clear();
    this.insert = null;
    this.findAnchor = null;
    this.message = "";
    this.keyCount = 0;
    this.writes = 0;
    this.quitRequested = false;
    this.viewport.top = 0;
    this.emit();
  }

  feed(keys: string[]): void {
    for (const k of keys) this.handleKey(k);
  }

  handleKey(key: string): void {
    if (this.replaying === 0) {
      this.keyCount++;
      if (this.recording) this.recordBuffer.push(key);
    }
    if (this.mode !== "command" && this.replaying === 0 && this.pending.length === 0) this.message = "";
    switch (this.mode) {
      case "insert":
        this.handleInsertKey(key);
        break;
      case "replace":
        this.handleReplaceKey(key);
        break;
      case "command":
        this.handleCmdlineKey(key);
        break;
      default:
        this.handleNormalKey(key);
    }
    if (this.replaying === 0) {
      this.scrollToCursor();
      this.emit();
    }
  }

  setMessage(msg: string, error = false): void {
    this.message = msg;
    this.messageIsError = error;
  }

  snapshot(): Snapshot {
    return { lines: [...this.buf.lines], cursor: { ...this.cursor } };
  }

  restore(s: Snapshot): void {
    this.buf.lines = [...s.lines];
    this.cursor = this.buf.clamp(s.cursor);
    this.want = this.cursor.col;
  }

  beginChange(): void {
    if (!this.changeStart) this.changeStart = this.snapshot();
  }

  endChange(): void {
    if (this.groupDepth > 0) return;
    const start = this.changeStart;
    this.changeStart = null;
    if (!start) return;
    if (start.lines.join("\n") === this.buf.text) return;
    this.undoStack.push(start);
    this.redoStack = [];
    if (this.undoStack.length > 500) this.undoStack.shift();
  }

  undo(count = 1): void {
    for (let i = 0; i < count; i++) {
      const s = this.undoStack.pop();
      if (!s) {
        this.setMessage("Already at oldest change");
        return;
      }
      this.redoStack.push(this.snapshot());
      this.restore(s);
    }
    this.setMessage(`${count} change${count > 1 ? "s" : ""}; before #${this.undoStack.length + 1}`);
  }

  redo(count = 1): void {
    for (let i = 0; i < count; i++) {
      const s = this.redoStack.pop();
      if (!s) {
        this.setMessage("Already at newest change");
        return;
      }
      this.undoStack.push(this.snapshot());
      this.restore(s);
    }
    this.setMessage(`${count} change${count > 1 ? "s" : ""}; after #${this.undoStack.length}`);
  }

  getRegister(name = '"'): Register | undefined {
    const n = name === "+" || name === "*" ? '"' : name.toLowerCase();
    if (n === "/") return this.lastSearch ? { text: this.lastSearch.pattern, linewise: false } : undefined;
    if (n === ":") return this.lastEx ? { text: this.lastEx, linewise: false } : undefined;
    return this.registers.get(n);
  }

  storeRegister(name: string | undefined, value: Register, kind: "yank" | "delete"): void {
    if (name === "_") return;
    if (name && /^[A-Z]$/.test(name)) {
      const key = name.toLowerCase();
      const prev = this.registers.get(key);
      const merged: Register = prev
        ? {
            text: prev.text + (prev.linewise || value.linewise ? "\n" : "") + value.text,
            linewise: prev.linewise || value.linewise,
          }
        : value;
      this.registers.set(key, merged);
      this.registers.set('"', merged);
      return;
    }
    if (name && /^[a-z]$/.test(name)) {
      this.registers.set(name, value);
    } else if (kind === "yank") {
      this.registers.set("0", value);
    } else if (value.linewise || value.text.includes("\n")) {
      for (let i = 9; i > 1; i--) {
        const r = this.registers.get(String(i - 1));
        if (r) this.registers.set(String(i), r);
      }
      this.registers.set("1", value);
    } else {
      this.registers.set("-", value);
    }
    this.registers.set('"', value);
  }

  setMark(name: string, pos: Pos = this.cursor): void {
    this.marks.set(name, { ...pos });
  }

  setCursor(p: Pos, updateWant = true): void {
    this.cursor = this.buf.clamp(p, this.mode === "insert" || this.mode === "replace");
    if (updateWant) this.want = this.cursor.col;
  }

  private handleNormalKey(key: string): void {
    if ((key === "<Esc>" || key === "<C-c>") && this.pending.length === 0) {
      this.findAnchor = null;
      this.searchHighlight = false;
    } else if (key === "<Esc>" || key === "<C-c>") {
      this.findAnchor = null;
    }
    if ((key === "<Esc>" || key === "<C-c>") && this.pending.length === 0) {
      if (this.isVisual) this.exitVisual();
      return;
    }
    this.pending.push(key);
    const res = parseCommand(this.pending, this.isVisual, this.recording !== null);
    if (res.status === "incomplete") return;
    this.pending = [];
    if (res.status === "invalid") return;
    this.runCommand(res.cmd);
  }

  runCommand(cmd: Command): void {
    const isFind = !cmd.operator && !!cmd.motion && FIND_MOTIONS.has(cmd.motion);
    const isRepeat = cmd.motion === ";" || cmd.motion === ",";
    this.findAnchor = !isFind ? null : isRepeat && this.findAnchor ? this.findAnchor : { ...this.cursor };
    const wasVisual = this.isVisual;
    const changing = isChangeCommand(cmd, wasVisual);
    if (changing) {
      this.beginChange();
      this.dotCommand = wasVisual ? null : cmd;
    }
    execCommand(this, cmd);
    if (this.mode === "insert" || this.mode === "replace") return;
    if (changing) {
      this.endChange();
      if (this.dotCommand && this.replaying === 0) this.lastChange = { cmd: this.dotCommand, insertKeys: [] };
      this.dotCommand = null;
    }
    if (!this.isVisual && this.mode !== "command") this.setCursor(this.cursor, false);
  }

  repeatLastChange(count: number, hasCount: boolean): void {
    const lc = this.lastChange;
    if (!lc) return;
    const cmd: Command = hasCount ? { ...lc.cmd, count, hasCount: true } : lc.cmd;
    this.replaying++;
    try {
      this.runCommand(cmd);
      if (this.mode === "insert" || this.mode === "replace") {
        for (const k of lc.insertKeys) this.handleKey(k);
        if (this.mode === "insert" || this.mode === "replace") this.handleKey("<Esc>");
      }
    } finally {
      this.replaying--;
    }
    this.lastChange = lc.cmd === cmd ? lc : { cmd, insertKeys: lc.insertKeys };
  }

  startRecording(reg: string): void {
    this.recording = reg;
    this.recordBuffer = [];
  }

  stopRecording(): void {
    if (!this.recording) return;
    const keys = this.recordBuffer.slice(0, -1);
    const reg = this.recording;
    if (/^[A-Z]$/.test(reg)) {
      const key = reg.toLowerCase();
      this.macros.set(key, [...(this.macros.get(key) ?? []), ...keys]);
    } else {
      this.macros.set(reg, keys);
    }
    this.registers.set(reg.toLowerCase(), { text: keys.join(""), linewise: false });
    this.recording = null;
  }

  playMacro(reg: string, count: number): void {
    const name = reg === "@" ? this.lastMacro : reg.toLowerCase();
    if (reg === ":") {
      if (this.lastEx) for (let i = 0; i < count; i++) this.executeEx(this.lastEx);
      return;
    }
    if (!name) return;
    const keys = this.macros.get(name) ?? this.registers.get(name)?.text.split("");
    if (!keys) return;
    this.lastMacro = name;
    this.replaying++;
    try {
      for (let i = 0; i < count; i++) for (const k of keys) this.handleKey(k);
    } finally {
      this.replaying--;
    }
  }

  runNormalKeys(keys: string[]): void {
    const savedMode = this.mode;
    this.mode = "normal" as Mode;
    this.pending = [];
    this.replaying++;
    try {
      for (const k of keys) this.handleKey(k);
      if (this.mode === "insert" || this.mode === "replace") this.handleKey("<Esc>");
      if (this.mode === "command") this.handleKey("<Esc>");
      if (this.isVisual) this.exitVisual();
    } finally {
      this.replaying--;
      this.pending = [];
    }
    if (savedMode !== "command") this.mode = "normal";
  }

  enterVisual(mode: Mode): void {
    if (!this.isVisual) this.anchor = { ...this.cursor };
    this.mode = mode;
  }

  exitVisual(): void {
    if (!this.isVisual) return;
    this.lastVisual = { anchor: { ...this.anchor }, cursor: { ...this.cursor }, mode: this.mode };
    const [s, e] = this.anchor.line < this.cursor.line ||
      (this.anchor.line === this.cursor.line && this.anchor.col <= this.cursor.col)
      ? [this.anchor, this.cursor]
      : [this.cursor, this.anchor];
    this.setMark("<", s);
    this.setMark(">", e);
    this.mode = "normal";
    this.setCursor(this.cursor, false);
  }

  enterInsert(kind: string, count: number, block?: InsertSession["block"]): void {
    this.mode = kind === "R" ? "replace" : "insert";
    this.insert = { kind, count, keys: [], block, replaced: [] };
    this.cursor = this.buf.clamp(this.cursor, true);
  }

  private handleInsertKey(key: string): void {
    const session = this.insert;
    if (session && key !== "<Esc>" && key !== "<C-c>" && key !== "<C-[>") session.keys.push(key);
    if (this.insertCtrlR) {
      this.insertCtrlR = false;
      const r = this.getRegister(key);
      if (r) this.cursor = this.buf.insert(this.cursor, r.text + (r.linewise ? "\n" : ""));
      return;
    }
    if (key === "<Esc>" || key === "<C-c>" || key === "<C-[>") {
      this.finishInsert();
      return;
    }
    this.insertKey(key);
  }

  insertKey(key: string): void {
    const buf = this.buf;
    const c = this.cursor;
    switch (key) {
      case "<CR>": {
        const indent = buf.indentOf(c.line).slice(0, c.col);
        this.cursor = buf.insert(c, "\n" + indent);
        break;
      }
      case "<BS>":
      case "<C-h>":
        if (c.col > 0) {
          buf.deleteText({ line: c.line, col: c.col - 1 }, c);
          this.cursor = { line: c.line, col: c.col - 1 };
        } else if (c.line > 0) {
          const col = buf.line(c.line - 1).length;
          buf.deleteText({ line: c.line - 1, col }, c);
          this.cursor = { line: c.line - 1, col };
        }
        break;
      case "<Del>":
        if (c.col < buf.line(c.line).length) buf.deleteText(c, { line: c.line, col: c.col + 1 });
        else if (c.line + 1 < buf.lineCount) buf.deleteText(c, { line: c.line + 1, col: 0 });
        break;
      case "<Tab>": {
        const sw = this.options.shiftwidth;
        this.cursor = buf.insert(c, " ".repeat(sw - (c.col % sw)));
        break;
      }
      case "<C-w>": {
        const before = buf.line(c.line).slice(0, c.col);
        const m = /(\w+|[^\w\s]+)?\s*$/.exec(before)!;
        const len = m[0].length || (c.col > 0 ? 1 : 0);
        buf.deleteText({ line: c.line, col: c.col - len }, c);
        this.cursor = { line: c.line, col: c.col - len };
        break;
      }
      case "<C-u>":
        buf.deleteText({ line: c.line, col: 0 }, c);
        this.cursor = { line: c.line, col: 0 };
        break;
      case "<C-t>":
      case "<C-d>": {
        const indent = buf.indentOf(c.line).length;
        const sw = this.options.shiftwidth;
        const next = key === "<C-t>" ? indent + sw : Math.max(0, indent - sw);
        buf.lines[c.line] = " ".repeat(next) + buf.line(c.line).slice(indent);
        this.cursor = { line: c.line, col: Math.max(0, c.col + next - indent) };
        break;
      }
      case "<C-r>":
        this.insertCtrlR = true;
        break;
      case "<Left>":
        this.cursor = { line: c.line, col: Math.max(0, c.col - 1) };
        break;
      case "<Right>":
        this.cursor = buf.clamp({ line: c.line, col: c.col + 1 }, true);
        break;
      case "<Up>":
        this.cursor = buf.clamp({ line: c.line - 1, col: c.col }, true);
        break;
      case "<Down>":
        this.cursor = buf.clamp({ line: c.line + 1, col: c.col }, true);
        break;
      case "<Home>":
        this.cursor = { line: c.line, col: 0 };
        break;
      case "<End>":
        this.cursor = { line: c.line, col: buf.line(c.line).length };
        break;
      default:
        if (key === "<Space>") key = " ";
        if ([...key].length === 1) this.cursor = buf.insert(c, key);
    }
  }

  private finishInsert(): void {
    const session = this.insert;
    this.insertCtrlR = false;
    if (session) {
      this.replaying++;
      try {
        this.repeatInsert(session);
      } finally {
        this.replaying--;
      }
      this.registers.set(".", { text: keysToText(session.keys), linewise: false });
      if (this.dotCommand && this.replaying === 0) {
        this.lastChange = { cmd: this.dotCommand, insertKeys: session.keys };
      }
    }
    this.dotCommand = null;
    this.insert = null;
    this.setMark("^");
    this.mode = "normal";
    this.endChange();
    this.setCursor({ line: this.cursor.line, col: this.cursor.col - 1 });
  }

  private repeatInsert(session: InsertSession): void {
    const typed = session.keys;
    if (session.block) {
      const b = session.block;
      const firstLine = this.buf.line(b.from);
      const insertedLen = firstLine.length - b.lineLength;
      if (insertedLen <= 0 || typed.includes("<CR>")) return;
      const text = firstLine.slice(b.col, b.col + insertedLen);
      for (let l = b.from + 1; l <= b.to; l++) {
        const line = this.buf.line(l);
        if (b.toEnd) {
          this.buf.lines[l] = line + text;
        } else if (line.length >= b.col) {
          this.buf.lines[l] = line.slice(0, b.col) + text + line.slice(b.col);
        } else if (b.append) {
          this.buf.lines[l] = line.padEnd(b.col) + text;
        }
      }
      this.cursor = { line: b.from, col: b.col + 1 };
      return;
    }
    for (let i = 1; i < session.count; i++) {
      if (session.kind === "o" || session.kind === "O") {
        const indent = this.buf.indentOf(this.cursor.line);
        this.buf.insertLines(this.cursor.line + 1, [indent]);
        this.cursor = { line: this.cursor.line + 1, col: indent.length };
      }
      for (const k of typed) this.insertKey(k);
    }
  }

  private handleReplaceKey(key: string): void {
    const session = this.insert!;
    if (key === "<Esc>" || key === "<C-c>" || key === "<C-[>") {
      this.finishInsert();
      return;
    }
    session.keys.push(key);
    const c = this.cursor;
    const line = this.buf.line(c.line);
    if (key === "<BS>") {
      if (c.col === 0 || session.replaced.length === 0) {
        this.cursor = { line: c.line, col: Math.max(0, c.col - 1) };
        return;
      }
      const orig = session.replaced.pop()!;
      const col = c.col - 1;
      this.buf.lines[c.line] = orig === null ? line.slice(0, col) + line.slice(col + 1) : line.slice(0, col) + orig + line.slice(col + 1);
      this.cursor = { line: c.line, col };
      return;
    }
    if (key === "<CR>") {
      this.cursor = this.buf.insert(c, "\n");
      return;
    }
    const ch = key === "<Space>" ? " " : key;
    if ([...ch].length !== 1) return;
    session.replaced.push(c.col < line.length ? line[c.col] : null);
    this.buf.lines[c.line] = line.slice(0, c.col) + ch + line.slice(c.col + 1);
    this.cursor = { line: c.line, col: c.col + 1 };
  }

  enterCommandLine(type: ":" | "/" | "?", initial = ""): void {
    this.cmdReturnMode = this.mode;
    this.mode = "command";
    this.cmdType = type;
    this.cmdline = initial;
    this.historyIndex = -1;
  }

  private leaveCommandLine(): void {
    this.mode = this.cmdReturnMode === "command" ? "normal" : this.cmdReturnMode;
  }

  private handleCmdlineKey(key: string): void {
    switch (key) {
      case "<Esc>":
      case "<C-c>":
        this.leaveCommandLine();
        if (this.isVisual && this.cmdType === ":") this.exitVisual();
        return;
      case "<CR>":
        this.submitCommandLine();
        return;
      case "<BS>":
        if (this.cmdline === "") this.leaveCommandLine();
        else this.cmdline = this.cmdline.slice(0, -1);
        return;
      case "<C-u>":
        this.cmdline = "";
        return;
      case "<C-w>":
        this.cmdline = this.cmdline.replace(/(\w+|[^\w\s]+)?\s*$/, "");
        return;
      case "<Up>":
      case "<Down>": {
        const hist = this.cmdHistory.filter((h) => h[0] === this.cmdType).map((h) => h.slice(1));
        if (!hist.length) return;
        const i = this.historyIndex < 0 ? hist.length : this.historyIndex;
        const next = Math.max(0, Math.min(hist.length, i + (key === "<Up>" ? -1 : 1)));
        this.historyIndex = next;
        this.cmdline = hist[next] ?? "";
        return;
      }
      default:
        if (key === "<Space>") key = " ";
        if ([...key].length === 1) this.cmdline += key;
    }
  }

  private submitCommandLine(): void {
    const line = this.cmdline;
    const type = this.cmdType;
    this.cmdHistory.push(type + line);
    this.leaveCommandLine();
    if (type === ":") {
      const wasVisual = this.isVisual;
      if (wasVisual) this.exitVisual();
      this.executeEx(line);
      return;
    }
    const pattern = line || this.lastSearch?.pattern || "";
    if (!pattern) return;
    this.lastSearch = { pattern, forward: type === "/" };
    this.searchHighlight = true;
    this.searchNext(false, this.pendingCount || 1);
    this.pendingCount = 0;
  }

  executeEx(line: string): void {
    const trimmed = line.trimStart();
    if (!trimmed.trim()) return;
    this.lastEx = trimmed;
    this.beginChange();
    this.groupDepth++;
    try {
      runEx(this, trimmed);
    } catch (e) {
      this.setMessage(e instanceof Error ? e.message : String(e), true);
    } finally {
      this.groupDepth--;
    }
    this.endChange();
    if (!this.isVisual) this.setCursor(this.cursor);
  }

  searchNext(reverse: boolean, count = 1): boolean {
    if (!this.lastSearch) {
      this.setMessage("E35: No previous regular expression", true);
      return false;
    }
    const forward = this.lastSearch.forward !== reverse;
    this.searchHighlight = true;
    let pos = this.cursor;
    for (let i = 0; i < count; i++) {
      const found = searchText(this.buf, pos, this.lastSearch.pattern, forward, this.options.ignorecase);
      if (!found) {
        this.setMessage(`E486: Pattern not found: ${this.lastSearch.pattern}`, true);
        return false;
      }
      pos = found;
    }
    const wrapped = forward ? pos.line < this.cursor.line || (pos.line === this.cursor.line && pos.col <= this.cursor.col)
      : pos.line > this.cursor.line || (pos.line === this.cursor.line && pos.col >= this.cursor.col);
    this.setMark("'");
    this.setCursor(pos);
    this.setMessage(wrapped ? "search hit BOTTOM, continuing at TOP" : (forward ? "/" : "?") + this.lastSearch.pattern, false);
    return true;
  }

  scrollToCursor(): void {
    const v = this.viewport;
    const maxTop = Math.max(0, this.buf.lineCount - v.height);
    const off = Math.min(SCROLL_OFF, Math.floor((v.height - 1) / 2));
    if (this.cursor.line < v.top + off) v.top = this.cursor.line - off;
    if (this.cursor.line > v.top + v.height - 1 - off) v.top = this.cursor.line - v.height + 1 + off;
    v.top = Math.max(0, Math.min(maxTop, v.top));
  }

  scrollBy(lines: number, moveCursor: boolean): void {
    const v = this.viewport;
    const maxTop = Math.max(0, this.buf.lineCount - v.height);
    v.top = Math.max(0, Math.min(maxTop, v.top + lines));
    if (moveCursor) {
      const line = this.buf.clampLine(this.cursor.line + lines);
      this.setCursor({ line, col: this.buf.firstNonBlank(line) });
    } else {
      const off = Math.min(SCROLL_OFF, Math.floor((v.height - 1) / 2));
      const min = v.top === 0 ? 0 : v.top + off;
      const max = v.top + v.height - 1 - off;
      if (this.cursor.line < min) this.setCursor({ line: min, col: this.want }, false);
      if (this.cursor.line > max) this.setCursor({ line: max, col: this.want }, false);
    }
  }
}

const FIND_MOTIONS = new Set(["f", "F", "t", "T", ";", ","]);

const CHANGE_ACTIONS = new Set([
  "x", "X", "s", "S", "i", "I", "a", "A", "o", "O", "p", "P", "J", "~", "D", "C", "r", "R", "gJ", "gp", "gP",
  "gi", "<C-a>", "<C-x>", "&", "<Del>", "<Insert>",
]);

function isChangeCommand(cmd: Command, visual: boolean): boolean {
  if (visual) return !!cmd.action && !["o", "O", "v", "V", "<C-v>", ":", "y", "Y", "/", "?"].includes(cmd.action);
  if (cmd.operator) return cmd.operator !== "y";
  return !!cmd.action && CHANGE_ACTIONS.has(cmd.action);
}

function keysToText(keys: string[]): string {
  let out = "";
  for (const k of keys) {
    if (k === "<CR>") out += "\n";
    else if (k === "<Space>") out += " ";
    else if (k === "<BS>") out = out.slice(0, -1);
    else if ([...k].length === 1) out += k;
  }
  return out;
}
