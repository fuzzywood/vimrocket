import type { VimEngine } from "./engine";
import {
  findChar, matchPair, paragraphBackward, paragraphForward, wordBackward, wordEnd, wordEndBackward,
  wordForward, wordUnderCursor, type MotionResult,
} from "./motions";
import type { Command } from "./parser";
import { textObject } from "./textobjects";
import { comparePos, orderPos, type Pos, type Range } from "./types";

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export function computeMotion(vim: VimEngine, cmd: Command, forOperator: boolean): MotionResult | null {
  const buf = vim.buf;
  const p = vim.cursor;
  const n = cmd.count;
  const line = buf.line(p.line);
  const vertical = (target: number): MotionResult => ({
    pos: { line: target, col: buf.clampCol(target, vim.want) },
    linewise: true,
    keepWant: true,
  });
  switch (cmd.motion) {
    case "h":
    case "<Left>":
    case "<BS>":
      if (p.col === 0) return null;
      return { pos: { line: p.line, col: Math.max(0, p.col - n) } };
    case "l":
    case "<Right>":
    case "<Space>":
    case " ": {
      if (line.length === 0 || (!forOperator && p.col >= line.length - 1)) return forOperator ? null : { pos: p };
      return { pos: { line: p.line, col: Math.min(forOperator ? line.length : line.length - 1, p.col + n) } };
    }
    case "j":
    case "<Down>":
    case "gj":
      if (p.line + n > buf.lineCount - 1 && !forOperator) return p.line === buf.lineCount - 1 ? null : vertical(buf.lineCount - 1);
      return vertical(buf.clampLine(p.line + n));
    case "k":
    case "<Up>":
    case "gk":
      if (p.line === 0) return null;
      return vertical(Math.max(0, p.line - n));
    case "+":
    case "<CR>": {
      const l = buf.clampLine(p.line + n);
      return { pos: { line: l, col: buf.firstNonBlank(l) }, linewise: true };
    }
    case "-": {
      const l = buf.clampLine(p.line - n);
      return { pos: { line: l, col: buf.firstNonBlank(l) }, linewise: true };
    }
    case "_": {
      const l = buf.clampLine(p.line + n - 1);
      return { pos: { line: l, col: buf.firstNonBlank(l) }, linewise: true };
    }
    case "0":
    case "<Home>":
    case "g0":
      return { pos: { line: p.line, col: 0 } };
    case "^":
      return { pos: { line: p.line, col: buf.firstNonBlank(p.line) } };
    case "$":
    case "<End>":
    case "g$": {
      const l = buf.clampLine(p.line + n - 1);
      vim.want = Infinity;
      return { pos: { line: l, col: Math.max(0, buf.line(l).length - 1) }, inclusive: true, keepWant: true };
    }
    case "g_": {
      const l = buf.clampLine(p.line + n - 1);
      const m = /\S\s*$/.exec(buf.line(l));
      return { pos: { line: l, col: m ? m.index : 0 }, inclusive: true };
    }
    case "|":
      return { pos: { line: p.line, col: buf.clampCol(p.line, n - 1) } };
    case "w":
    case "W": {
      const big = cmd.motion === "W";
      let pos = p;
      if (forOperator && cmd.operator === "c" && /\S/.test(buf.charAt(p) || " ")) {
        for (let i = 0; i < n; i++) {
          if (i === 0 && isWordEnd(vim, pos, big)) continue;
          pos = wordEnd(buf, pos, big);
        }
        return { pos, inclusive: true };
      }
      for (let i = 0; i < n; i++) pos = wordForward(buf, pos, big);
      if (forOperator && pos.line > p.line) {
        let l = pos.line - (pos.col === 0 || /^\s*$/.test(buf.line(pos.line).slice(0, pos.col)) ? 1 : 0);
        while (l > p.line && buf.isBlank(l) && n === 1) l--;
        if (l >= p.line) pos = { line: l, col: buf.line(l).length };
      }
      return { pos };
    }
    case "e":
    case "E": {
      let pos = p;
      for (let i = 0; i < n; i++) pos = wordEnd(buf, pos, cmd.motion === "E");
      return { pos, inclusive: true };
    }
    case "b":
    case "B": {
      let pos = p;
      for (let i = 0; i < n; i++) pos = wordBackward(buf, pos, cmd.motion === "B");
      return { pos };
    }
    case "ge":
    case "gE": {
      let pos = p;
      for (let i = 0; i < n; i++) pos = wordEndBackward(buf, pos, cmd.motion === "gE");
      return { pos, inclusive: true };
    }
    case "G":
    case "gg": {
      const l = cmd.hasCount ? buf.clampLine(n - 1) : cmd.motion === "G" ? buf.lineCount - 1 : 0;
      vim.setMark("'");
      return { pos: { line: l, col: buf.firstNonBlank(l) }, linewise: true };
    }
    case "f":
    case "F":
    case "t":
    case "T": {
      vim.lastFind = { cmd: cmd.motion, ch: cmd.motionArg! };
      const pos = findChar(buf, p, cmd.motion, cmd.motionArg!, n);
      return pos ? { pos, inclusive: cmd.motion === "f" || cmd.motion === "t" } : null;
    }
    case ";":
    case ",": {
      const lf = vim.lastFind;
      if (!lf) return null;
      const flip: Record<string, string> = { f: "F", F: "f", t: "T", T: "t" };
      const c = cmd.motion === "," ? flip[lf.cmd] : lf.cmd;
      const pos = findChar(buf, p, c, lf.ch, n, true);
      return pos ? { pos, inclusive: c === "f" || c === "t" } : null;
    }
    case "%": {
      if (cmd.hasCount) {
        const l = buf.clampLine(Math.ceil((n * buf.lineCount) / 100) - 1);
        return { pos: { line: l, col: buf.firstNonBlank(l) }, linewise: true };
      }
      const pos = matchPair(buf, p);
      if (pos) vim.setMark("'");
      return pos ? { pos, inclusive: true } : null;
    }
    case "}": {
      let pos = p;
      for (let i = 0; i < n; i++) pos = paragraphForward(buf, pos.line);
      return { pos };
    }
    case "{": {
      let pos = p;
      for (let i = 0; i < n; i++) pos = paragraphBackward(buf, pos.line);
      return { pos };
    }
    case "n":
    case "N":
    case "*":
    case "#": {
      if (cmd.motion === "*" || cmd.motion === "#") {
        const word = wordUnderCursor(buf, p);
        if (!word) return null;
        vim.lastSearch = { pattern: `\\<${escapeRegex(word)}\\>`, forward: cmd.motion === "*" };
        vim.searchHighlight = true;
      }
      const saved = vim.cursor;
      if (!vim.searchNext(cmd.motion === "N", n)) return null;
      const pos = vim.cursor;
      vim.cursor = saved;
      return { pos };
    }
    case "H":
    case "M":
    case "L": {
      const v = vim.viewport;
      const bottom = Math.min(buf.lineCount - 1, v.top + v.height - 1);
      const l = cmd.motion === "H" ? Math.min(bottom, v.top + n - 1)
        : cmd.motion === "L" ? Math.max(v.top, bottom - n + 1)
        : Math.floor((v.top + bottom) / 2);
      return { pos: { line: l, col: buf.firstNonBlank(l) }, linewise: true };
    }
    case "`":
    case "'": {
      const name = cmd.motionArg === "`" ? "'" : cmd.motionArg!;
      const m = vim.marks.get(name);
      if (!m) {
        vim.setMessage("E20: Mark not set", true);
        return null;
      }
      vim.setMark("'");
      const pos = buf.clamp(m);
      return cmd.motion === "'" ? { pos: { line: pos.line, col: buf.firstNonBlank(pos.line) }, linewise: true } : { pos };
    }
    default:
      return null;
  }
}

function isWordEnd(vim: VimEngine, p: Pos, big: boolean): boolean {
  const line = vim.buf.line(p.line);
  const next = line[p.col + 1];
  if (next === undefined || /\s/.test(next)) return true;
  if (big) return false;
  return /\w/.test(line[p.col]) !== /\w/.test(next);
}

function moveCursor(vim: VimEngine, cmd: Command): void {
  const res = computeMotion(vim, cmd, false);
  if (!res) return;
  vim.cursor = vim.buf.clamp(res.pos, vim.isVisual && vim.mode !== "visual-line");
  if (!vim.isVisual) vim.cursor = vim.buf.clamp(vim.cursor);
  if (!res.keepWant) vim.want = vim.cursor.col;
}

function operatorRange(vim: VimEngine, cmd: Command): Range | null {
  const buf = vim.buf;
  const p = vim.cursor;
  if (cmd.linewise) {
    const end = p.line + cmd.count - 1;
    if (end > buf.lineCount - 1 && cmd.count > 1 && p.line === buf.lineCount - 1) return null;
    return { start: { line: p.line, col: 0 }, end: { line: buf.clampLine(end), col: 0 }, linewise: true, inclusive: false };
  }
  if (cmd.textObject) {
    let r = textObject(buf, p, cmd.textObject.kind, cmd.textObject.key);
    for (let i = 1; r && i < cmd.count && cmd.textObject.key.toLowerCase() === "w"; i++) {
      const next = textObject(buf, buf.clamp({ line: r.end.line, col: r.end.col + 1 }), cmd.textObject.kind, cmd.textObject.key);
      if (!next || next.start.line !== r.end.line) break;
      r = { ...r, end: next.end };
    }
    return r;
  }
  const res = computeMotion(vim, cmd, true);
  if (!res) return null;
  const [start, end] = orderPos(p, res.pos);
  if (res.linewise) return { start, end, linewise: true, inclusive: false };
  const r: Range = { start, end, linewise: false, inclusive: !!res.inclusive };
  if (!r.inclusive && r.end.col === 0 && r.end.line > r.start.line && cmd.motion !== "w" && cmd.motion !== "W") {
    const prev = r.end.line - 1;
    if (r.start.col <= buf.firstNonBlank(r.start.line) && !/\S/.test(buf.line(r.start.line).slice(0, r.start.col))) {
      return { start: { line: r.start.line, col: 0 }, end: { line: prev, col: 0 }, linewise: true, inclusive: false };
    }
    r.end = { line: prev, col: buf.line(prev).length };
  }
  if (comparePos(r.start, r.end) === 0 && !r.inclusive) return null;
  return r;
}

function shiftLines(vim: VimEngine, from: number, to: number, dir: number, times = 1): void {
  const sw = vim.options.shiftwidth * times;
  for (let l = from; l <= to; l++) {
    const text = vim.buf.line(l);
    if (text.length === 0) continue;
    const indent = vim.buf.indentOf(l).length;
    const next = dir > 0 ? indent + sw : Math.max(0, indent - sw);
    vim.buf.lines[l] = " ".repeat(next) + text.slice(indent);
  }
  vim.setCursor({ line: from, col: vim.buf.firstNonBlank(from) });
}

const caseFns: Record<string, (s: string) => string> = {
  "g~": (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(""),
  "~": (s) => caseFns["g~"](s),
  gu: (s) => s.toLowerCase(),
  u: (s) => s.toLowerCase(),
  gU: (s) => s.toUpperCase(),
  U: (s) => s.toUpperCase(),
};

function transformRange(vim: VimEngine, r: Range, fn: (s: string) => string): void {
  const buf = vim.buf;
  if (r.linewise) {
    for (let l = r.start.line; l <= r.end.line; l++) buf.lines[l] = fn(buf.line(l));
    return;
  }
  const end = r.inclusive ? { line: r.end.line, col: r.end.col + 1 } : r.end;
  const clamped = buf.clamp(end, true);
  const text = buf.deleteText(r.start, clamped);
  buf.insert(r.start, fn(text));
}

export function applyOperator(vim: VimEngine, op: string, r: Range, register?: string): void {
  const buf = vim.buf;
  switch (op) {
    case "y": {
      vim.storeRegister(register, buf.rangeText(r), "yank");
      const lines = r.end.line - r.start.line + 1;
      if (lines > 2) vim.setMessage(`${lines} lines yanked`);
      vim.setCursor(r.linewise ? { line: r.start.line, col: vim.cursor.col } : r.start);
      return;
    }
    case "d": {
      const reg = buf.deleteRange(r);
      vim.storeRegister(register, reg, "delete");
      const lines = r.end.line - r.start.line + 1;
      if (r.linewise && lines > 2) vim.setMessage(`${lines} fewer lines`);
      if (r.linewise) {
        const l = buf.clampLine(r.start.line);
        vim.setCursor({ line: l, col: buf.firstNonBlank(l) });
      } else {
        vim.setCursor(r.start);
      }
      return;
    }
    case "c": {
      if (r.linewise) {
        const indent = buf.indentOf(r.start.line);
        const reg = { text: buf.getLines(r.start.line, r.end.line).join("\n"), linewise: true };
        vim.storeRegister(register, reg, "delete");
        buf.lines.splice(r.start.line, r.end.line - r.start.line + 1, indent);
        vim.cursor = { line: r.start.line, col: indent.length };
      } else {
        vim.storeRegister(register, buf.deleteRange(r), "delete");
        vim.cursor = r.start;
      }
      vim.enterInsert("c", 1);
      return;
    }
    case ">":
    case "<":
      shiftLines(vim, r.start.line, r.end.line, op === ">" ? 1 : -1);
      return;
    case "=":
      vim.setCursor({ line: r.start.line, col: buf.firstNonBlank(r.start.line) });
      return;
    default: {
      const fn = caseFns[op];
      if (!fn) return;
      transformRange(vim, r, fn);
      vim.setCursor(r.start);
    }
  }
}

function put(vim: VimEngine, cmd: Command, before: boolean, moveAfter: boolean): void {
  const reg = vim.getRegister(cmd.register);
  if (!reg) {
    vim.setMessage(`E353: Nothing in register ${cmd.register ?? '"'}`, true);
    return;
  }
  const buf = vim.buf;
  const c = vim.cursor;
  if (reg.linewise) {
    const lines = Array.from({ length: cmd.count }, () => reg.text.split("\n")).flat();
    const at = before ? c.line : c.line + 1;
    buf.insertLines(at, lines);
    if (moveAfter) vim.setCursor({ line: buf.clampLine(at + lines.length), col: 0 });
    else vim.setCursor({ line: at, col: buf.firstNonBlank(at) });
    return;
  }
  const text = reg.text.repeat(cmd.count);
  const pos = before || buf.line(c.line).length === 0 ? c : { line: c.line, col: c.col + 1 };
  const end = buf.insert(pos, text);
  if (moveAfter) vim.cursor = buf.clamp(end, true);
  else if (text.includes("\n")) vim.setCursor(pos);
  else vim.setCursor({ line: end.line, col: end.col - 1 });
}

function joinLines(vim: VimEngine, from: number, count: number, spaces: boolean): void {
  const buf = vim.buf;
  const to = Math.min(buf.lineCount - 1, from + Math.max(1, count - 1));
  if (to === from) return;
  let col = 0;
  for (let l = from + 1; l <= to; l++) {
    const cur = buf.line(from);
    let next = buf.line(from + 1);
    if (spaces) {
      next = next.replace(/^\s+/, "");
      const trimmed = cur.replace(/\s+$/, "");
      const sep = next === "" || next.startsWith(")") || trimmed === "" ? "" : " ";
      col = trimmed.length;
      buf.lines[from] = trimmed + sep + next;
    } else {
      col = cur.length;
      buf.lines[from] = cur + next;
    }
    buf.lines.splice(from + 1, 1);
  }
  vim.setCursor({ line: from, col });
}

function incrementNumber(vim: VimEngine, delta: number): void {
  const line = vim.buf.line(vim.cursor.line);
  const re = /-?\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const end = m.index + m[0].length;
    if (end > vim.cursor.col) {
      const value = (parseInt(m[0], 10) + delta).toString();
      vim.buf.lines[vim.cursor.line] = line.slice(0, m.index) + value + line.slice(end);
      vim.setCursor({ line: vim.cursor.line, col: m.index + value.length - 1 });
      return;
    }
  }
}

function replaceChars(vim: VimEngine, ch: string, count: number): void {
  const buf = vim.buf;
  const c = vim.cursor;
  const line = buf.line(c.line);
  if (c.col + count > line.length) return;
  if (ch === "<CR>") {
    buf.lines[c.line] = line.slice(0, c.col) + line.slice(c.col + count);
    buf.insert(c, "\n");
    vim.setCursor({ line: c.line + 1, col: 0 });
    return;
  }
  const r = ch === "<Space>" ? " " : ch;
  if ([...r].length !== 1) return;
  buf.lines[c.line] = line.slice(0, c.col) + r.repeat(count) + line.slice(c.col + count);
  vim.setCursor({ line: c.line, col: c.col + count - 1 });
}

export function execCommand(vim: VimEngine, cmd: Command): void {
  if (vim.isVisual) {
    execVisual(vim, cmd);
    return;
  }
  if (cmd.operator) {
    const r = operatorRange(vim, cmd);
    if (r) applyOperator(vim, cmd.operator, r, cmd.register);
    return;
  }
  if (cmd.motion) {
    moveCursor(vim, cmd);
    return;
  }
  execAction(vim, cmd);
}

function withOperator(vim: VimEngine, cmd: Command, operator: string, motion?: string, linewise = false): void {
  execCommand(vim, { ...cmd, operator, motion, linewise, action: undefined });
}

function execAction(vim: VimEngine, cmd: Command): void {
  const buf = vim.buf;
  const c = vim.cursor;
  const n = cmd.count;
  switch (cmd.action) {
    case "x":
    case "<Del>":
      if (buf.line(c.line).length) withOperator(vim, cmd, "d", "l");
      return;
    case "X":
      if (c.col > 0) withOperator(vim, cmd, "d", "h");
      return;
    case "D":
      withOperator(vim, cmd, "d", "$");
      return;
    case "C":
      if (buf.line(c.line).length === 0) {
        vim.enterInsert("C", 1);
        return;
      }
      withOperator(vim, cmd, "c", "$");
      return;
    case "s":
      if (buf.line(c.line).length === 0) {
        vim.enterInsert("s", 1);
        return;
      }
      withOperator(vim, cmd, "c", "l");
      return;
    case "S":
      withOperator(vim, cmd, "c", undefined, true);
      return;
    case "Y":
      withOperator(vim, cmd, "y", undefined, true);
      return;
    case "i":
    case "<Insert>":
      vim.enterInsert("i", n);
      return;
    case "a":
      vim.cursor = { line: c.line, col: buf.line(c.line).length ? c.col + 1 : 0 };
      vim.enterInsert("a", n);
      return;
    case "I":
      vim.cursor = { line: c.line, col: buf.firstNonBlank(c.line) };
      if (/^\s*$/.test(buf.line(c.line))) vim.cursor.col = buf.line(c.line).length;
      vim.enterInsert("I", n);
      return;
    case "A":
      vim.cursor = { line: c.line, col: buf.line(c.line).length };
      vim.enterInsert("A", n);
      return;
    case "gi": {
      const m = vim.marks.get("^");
      if (m) vim.cursor = buf.clamp(m, true);
      vim.enterInsert("i", n);
      return;
    }
    case "o":
    case "O": {
      const indent = buf.indentOf(c.line);
      const at = cmd.action === "o" ? c.line + 1 : c.line;
      buf.insertLines(at, [indent]);
      vim.cursor = { line: at, col: indent.length };
      vim.enterInsert(cmd.action, n);
      return;
    }
    case "R":
      vim.enterInsert("R", 1);
      return;
    case "r":
      replaceChars(vim, cmd.actionArg!, n);
      return;
    case "p":
    case "P":
    case "gp":
    case "gP":
      put(vim, cmd, cmd.action.endsWith("P"), cmd.action.startsWith("g"));
      return;
    case "J":
    case "gJ":
      joinLines(vim, c.line, n, cmd.action === "J");
      return;
    case "~": {
      const line = buf.line(c.line);
      if (!line.length) return;
      const end = Math.min(line.length, c.col + n);
      buf.lines[c.line] = line.slice(0, c.col) + caseFns["~"](line.slice(c.col, end)) + line.slice(end);
      vim.setCursor({ line: c.line, col: Math.min(end, line.length - 1) });
      return;
    }
    case "u":
      vim.undo(n);
      return;
    case "<C-r>":
      vim.redo(n);
      return;
    case ".":
      vim.repeatLastChange(n, cmd.hasCount);
      return;
    case "v":
      vim.enterVisual("visual");
      return;
    case "V":
      vim.enterVisual("visual-line");
      return;
    case "<C-v>":
      vim.enterVisual("visual-block");
      return;
    case "gv": {
      const lv = vim.lastVisual;
      if (!lv) return;
      vim.anchor = buf.clamp(lv.anchor);
      vim.cursor = buf.clamp(lv.cursor);
      vim.mode = lv.mode;
      return;
    }
    case ":":
      vim.enterCommandLine(":", cmd.hasCount ? `.,.+${n - 1}` : "");
      return;
    case "/":
    case "?":
      vim.pendingCount = n;
      vim.enterCommandLine(cmd.action);
      return;
    case "m":
      vim.setMark(cmd.actionArg!);
      return;
    case "q":
      if (vim.recording) vim.stopRecording();
      else if (/^[a-zA-Z0-9]$/.test(cmd.actionArg!)) vim.startRecording(cmd.actionArg!);
      return;
    case "@":
      vim.playMacro(cmd.actionArg!, n);
      return;
    case "<C-d>":
    case "<C-u>": {
      const half = Math.max(1, Math.floor(vim.viewport.height / 2));
      vim.scrollBy(cmd.action === "<C-d>" ? half : -half, true);
      return;
    }
    case "<C-f>":
    case "<C-b>": {
      const page = Math.max(1, vim.viewport.height - 2) * n;
      vim.scrollBy(cmd.action === "<C-f>" ? page : -page, true);
      return;
    }
    case "<C-e>":
      vim.scrollBy(n, false);
      return;
    case "<C-y>":
      vim.scrollBy(-n, false);
      return;
    case "zz":
    case "z.":
      vim.viewport.top = Math.max(0, c.line - Math.floor(vim.viewport.height / 2));
      return;
    case "zt":
    case "z<CR>":
      vim.viewport.top = c.line;
      return;
    case "zb":
      vim.viewport.top = Math.max(0, c.line - vim.viewport.height + 1);
      return;
    case "ZZ":
      vim.executeEx("x");
      return;
    case "ZQ":
      vim.executeEx("q!");
      return;
    case "<C-a>":
      incrementNumber(vim, n);
      return;
    case "<C-x>":
      incrementNumber(vim, -n);
      return;
    case "&":
    case "g&":
      vim.executeEx(cmd.action === "&" ? "s" : "%s//~/&");
      return;
    case "<C-o>": {
      const m = vim.marks.get("'");
      if (!m) return;
      vim.setMark("'");
      vim.setCursor(buf.clamp(m));
      return;
    }
    default:
      return;
  }
}

export function visualRange(vim: VimEngine): Range {
  const buf = vim.buf;
  const [s, e] = orderPos(vim.anchor, vim.cursor);
  if (vim.mode === "visual-line") {
    return { start: { line: s.line, col: 0 }, end: { line: e.line, col: 0 }, linewise: true, inclusive: false };
  }
  if (e.col >= buf.line(e.line).length && e.line < buf.lineCount - 1) {
    return { start: s, end: { line: e.line + 1, col: 0 }, linewise: false, inclusive: false };
  }
  return { start: s, end: buf.clamp(e), linewise: false, inclusive: buf.line(e.line).length > 0 };
}

interface Block {
  top: number;
  bottom: number;
  left: number;
  right: number;
  toEnd: boolean;
}

export function blockBounds(vim: VimEngine): Block {
  const top = Math.min(vim.anchor.line, vim.cursor.line);
  const bottom = Math.max(vim.anchor.line, vim.cursor.line);
  const left = Math.min(vim.anchor.col, vim.cursor.col);
  const right = Math.max(vim.anchor.col, vim.cursor.col);
  return { top, bottom, left, right, toEnd: vim.want === Infinity };
}

function blockDelete(vim: VimEngine, b: Block, register?: string, store = true): void {
  const parts: string[] = [];
  for (let l = b.top; l <= b.bottom; l++) {
    const line = vim.buf.line(l);
    const end = b.toEnd ? line.length : b.right + 1;
    parts.push(line.slice(b.left, end));
    vim.buf.lines[l] = line.slice(0, b.left) + line.slice(end);
  }
  if (store) vim.storeRegister(register, { text: parts.join("\n"), linewise: false }, "delete");
  vim.mode = "normal";
  vim.setCursor({ line: b.top, col: b.left });
}

function blockMap(vim: VimEngine, b: Block, fn: (s: string) => string): void {
  for (let l = b.top; l <= b.bottom; l++) {
    const line = vim.buf.line(l);
    const end = b.toEnd ? line.length : b.right + 1;
    vim.buf.lines[l] = line.slice(0, b.left) + fn(line.slice(b.left, end)) + line.slice(end);
  }
  vim.mode = "normal";
  vim.setCursor({ line: b.top, col: b.left });
}

function execVisual(vim: VimEngine, cmd: Command): void {
  const buf = vim.buf;
  if (cmd.motion) {
    moveCursor(vim, cmd);
    return;
  }
  if (cmd.textObject) {
    const r = textObject(buf, vim.cursor, cmd.textObject.kind, cmd.textObject.key);
    if (!r) return;
    const end = r.inclusive || r.linewise ? r.end : buf.clamp({ line: r.end.line, col: r.end.col - 1 });
    if (comparePos(vim.anchor, vim.cursor) === 0 || comparePos(r.start, vim.anchor) < 0) vim.anchor = r.start;
    vim.cursor = r.linewise ? { line: r.end.line, col: 0 } : end;
    if (r.linewise && vim.mode === "visual") vim.mode = "visual-line";
    vim.want = vim.cursor.col;
    return;
  }
  const action = cmd.action!;
  const block = vim.mode === "visual-block";
  const linewiseAction = ["X", "D", "Y", "C", "S", "R"].includes(action) && !block;
  const r = linewiseAction ? { ...visualRange(vim), linewise: true } : visualRange(vim);
  const b = blockBounds(vim);
  const finish = (): void => {
    vim.exitVisual();
  };

  switch (action) {
    case "o":
    case "O": {
      const a = vim.anchor;
      vim.anchor = vim.cursor;
      vim.cursor = a;
      vim.want = a.col;
      return;
    }
    case "v":
    case "V":
    case "<C-v>": {
      const target = action === "v" ? "visual" : action === "V" ? "visual-line" : "visual-block";
      if (vim.mode === target) finish();
      else vim.mode = target;
      return;
    }
    case ":":
      vim.enterCommandLine(":", "'<,'>");
      return;
    case "/":
    case "?":
      vim.enterCommandLine(action);
      return;
  }

  finish();

  if (block) {
    switch (action) {
      case "d":
      case "x":
      case "<Del>":
      case "D":
      case "X":
        blockDelete(vim, action === "D" ? { ...b, toEnd: true } : b, cmd.register);
        return;
      case "y":
      case "Y": {
        const parts: string[] = [];
        for (let l = b.top; l <= b.bottom; l++) parts.push(buf.line(l).slice(b.left, b.toEnd ? undefined : b.right + 1));
        vim.storeRegister(cmd.register, { text: parts.join("\n"), linewise: false }, "yank");
        vim.setCursor({ line: b.top, col: b.left });
        return;
      }
      case "c":
      case "s":
        blockDelete(vim, b, cmd.register);
        vim.cursor = { line: b.top, col: b.left };
        vim.enterInsert("I", 1, { from: b.top, to: b.bottom, col: b.left, append: false, toEnd: false, lineLength: buf.line(b.top).length });
        return;
      case "I":
        vim.cursor = { line: b.top, col: b.left };
        vim.enterInsert("I", 1, { from: b.top, to: b.bottom, col: b.left, append: false, toEnd: false, lineLength: buf.line(b.top).length });
        return;
      case "A": {
        const col = b.toEnd ? buf.line(b.top).length : Math.min(b.right + 1, buf.line(b.top).length);
        if (!b.toEnd && buf.line(b.top).length < b.right + 1) buf.lines[b.top] = buf.line(b.top).padEnd(b.right + 1);
        vim.cursor = { line: b.top, col: b.toEnd ? col : b.right + 1 };
        vim.enterInsert("A", 1, { from: b.top, to: b.bottom, col: b.toEnd ? col : b.right + 1, append: true, toEnd: b.toEnd, lineLength: buf.line(b.top).length });
        return;
      }
      case "r":
        blockMap(vim, b, (s) => (cmd.actionArg === "<Space>" ? " " : cmd.actionArg!).repeat(s.length));
        return;
      case "~":
      case "u":
      case "U":
      case "g~":
      case "gu":
      case "gU":
        blockMap(vim, b, caseFns[action]);
        return;
      case ">":
      case "<":
        shiftLines(vim, b.top, b.bottom, action === ">" ? 1 : -1, cmd.count);
        return;
      case "J":
      case "gJ":
        joinLines(vim, b.top, b.bottom - b.top + 1, action === "J");
        return;
    }
    return;
  }

  switch (action) {
    case "d":
    case "x":
    case "<Del>":
    case "X":
    case "D":
      applyOperator(vim, "d", r, cmd.register);
      return;
    case "y":
    case "Y":
      applyOperator(vim, "y", r, cmd.register);
      return;
    case "c":
    case "s":
    case "C":
    case "S":
    case "R":
      applyOperator(vim, "c", r, cmd.register);
      return;
    case "r": {
      const ch = cmd.actionArg === "<Space>" ? " " : cmd.actionArg!;
      if ([...ch].length !== 1) return;
      transformRange(vim, r, (s) => s.replace(/[^\n]/g, ch));
      vim.setCursor(r.start);
      return;
    }
    case "~":
    case "u":
    case "U":
    case "g~":
    case "gu":
    case "gU":
      transformRange(vim, r, caseFns[action]);
      vim.setCursor(r.start);
      return;
    case ">":
    case "<":
      shiftLines(vim, r.start.line, r.end.line, action === ">" ? 1 : -1, cmd.count);
      return;
    case "=":
      vim.setCursor({ line: r.start.line, col: buf.firstNonBlank(r.start.line) });
      return;
    case "J":
    case "gJ":
      joinLines(vim, r.start.line, Math.max(2, r.end.line - r.start.line + 1), action === "J");
      return;
    case "I":
      vim.cursor = r.linewise ? { line: r.start.line, col: buf.firstNonBlank(r.start.line) } : r.start;
      vim.enterInsert("i", 1);
      return;
    case "A":
      vim.cursor = r.linewise
        ? { line: r.end.line, col: buf.line(r.end.line).length }
        : buf.clamp({ line: r.end.line, col: r.end.col + (r.inclusive ? 1 : 0) }, true);
      vim.enterInsert("a", 1);
      return;
    case "p":
    case "P": {
      const reg = vim.getRegister(cmd.register);
      if (!reg) return;
      const saved = { ...reg };
      const deleted = buf.deleteRange(r);
      if (action === "p") vim.storeRegister(undefined, deleted, "delete");
      vim.cursor = r.linewise ? { line: r.start.line, col: 0 } : r.start;
      if (r.linewise) {
        if (saved.linewise) buf.insertLines(r.start.line, saved.text.split("\n"));
        else buf.insertLines(r.start.line, [saved.text]);
        vim.setCursor({ line: r.start.line, col: 0 });
      } else if (saved.linewise) {
        buf.insert(r.start, "\n" + saved.text + "\n");
        vim.setCursor({ line: r.start.line + 1, col: 0 });
      } else {
        const end = buf.insert(r.start, saved.text);
        vim.setCursor({ line: end.line, col: Math.max(0, end.col - 1) });
      }
      return;
    }
  }
}
