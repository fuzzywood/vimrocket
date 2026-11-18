import type { Buffer } from "./buffer";
import type { Pos } from "./types";

export interface MotionResult {
  pos: Pos;
  linewise?: boolean;
  inclusive?: boolean;
  keepWant?: boolean;
}

const charClass = (ch: string | undefined, big: boolean): number => {
  if (ch === undefined || ch === "\n" || ch === " " || ch === "\t") return 0;
  if (big) return 1;
  return /\w/.test(ch) ? 1 : 2;
};

const isEmptyLineStart = (t: string, i: number): boolean =>
  (i === 0 || t[i - 1] === "\n") && (i === t.length || t[i] === "\n");

export function wordForward(buf: Buffer, p: Pos, big: boolean): Pos {
  const t = buf.text;
  const o = buf.offsetOf(p);
  let i = o;
  const c = charClass(t[i], big);
  if (c !== 0) while (i < t.length && charClass(t[i], big) === c) i++;
  while (i < t.length) {
    if (i !== o && isEmptyLineStart(t, i)) return buf.posOf(i);
    if (charClass(t[i], big) !== 0) return buf.posOf(i);
    i++;
  }
  return buf.posOf(t.length);
}

export function wordEnd(buf: Buffer, p: Pos, big: boolean): Pos {
  const t = buf.text;
  let i = buf.offsetOf(p) + 1;
  while (i < t.length && charClass(t[i], big) === 0) i++;
  if (i >= t.length) return buf.posOf(Math.max(0, t.length - 1));
  const c = charClass(t[i], big);
  while (i + 1 < t.length && charClass(t[i + 1], big) === c) i++;
  return buf.posOf(i);
}

export function wordBackward(buf: Buffer, p: Pos, big: boolean): Pos {
  const t = buf.text;
  let i = buf.offsetOf(p) - 1;
  while (i > 0 && charClass(t[i], big) === 0 && !isEmptyLineStart(t, i)) i--;
  if (i <= 0) return { line: 0, col: 0 };
  if (isEmptyLineStart(t, i)) return buf.posOf(i);
  const c = charClass(t[i], big);
  while (i > 0 && charClass(t[i - 1], big) === c) i--;
  return buf.posOf(i);
}

export function wordEndBackward(buf: Buffer, p: Pos, big: boolean): Pos {
  const t = buf.text;
  let i = buf.offsetOf(p);
  const c = charClass(t[i], big);
  if (c !== 0) while (i >= 0 && charClass(t[i], big) === c) i--;
  while (i > 0 && charClass(t[i], big) === 0 && !isEmptyLineStart(t, i)) i--;
  return buf.posOf(Math.max(0, i));
}

export function paragraphForward(buf: Buffer, line: number): Pos {
  let l = line;
  while (l < buf.lineCount && buf.isBlank(l)) l++;
  while (l < buf.lineCount && !buf.isBlank(l)) l++;
  if (l >= buf.lineCount) {
    const last = buf.lineCount - 1;
    return { line: last, col: buf.line(last).length };
  }
  return { line: l, col: 0 };
}

export function paragraphBackward(buf: Buffer, line: number): Pos {
  let l = line;
  while (l > 0 && buf.isBlank(l)) l--;
  while (l > 0 && !buf.isBlank(l)) l--;
  return { line: Math.max(0, l), col: 0 };
}

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", ")": "(", "]": "[", "}": "{" };
const OPENERS = "([{";

export function matchPair(buf: Buffer, p: Pos): Pos | null {
  const text = buf.line(p.line);
  let col = p.col;
  while (col < text.length && !(text[col] in PAIRS)) col++;
  if (col >= text.length) return null;
  const t = buf.text;
  const ch = text[col];
  const other = PAIRS[ch];
  const dir = OPENERS.includes(ch) ? 1 : -1;
  let depth = 0;
  for (let i = buf.offsetOf({ line: p.line, col }); i >= 0 && i < t.length; i += dir) {
    if (t[i] === ch) depth++;
    else if (t[i] === other && --depth === 0) return buf.posOf(i);
  }
  return null;
}

export function findChar(buf: Buffer, p: Pos, cmd: string, ch: string, count: number, repeat = false): Pos | null {
  const t = buf.text;
  const forward = cmd === "f" || cmd === "t";
  const till = cmd === "t" || cmd === "T";
  const step = forward ? 1 : -1;
  let i = buf.offsetOf(p);
  for (let n = 0; n < count; n++) {
    let next = i + step;
    if (till && n === 0 && repeat && t[next] === ch) next += step;
    while (next >= 0 && next < t.length && t[next] !== ch) next += step;
    if (next < 0 || next >= t.length) return null;
    i = next;
  }
  return buf.posOf(till ? i - step : i);
}

export function buildRegex(pattern: string, ignoreCase: boolean, global = true): RegExp | null {
  let p = pattern;
  let ic = ignoreCase && !/[A-Z]/.test(pattern);
  if (p.includes("\\c")) {
    ic = true;
    p = p.replace(/\\c/g, "");
  } else if (p.includes("\\C")) {
    ic = false;
    p = p.replace(/\\C/g, "");
  }
  try {
    return new RegExp(vimToJsRegex(p), (global ? "g" : "") + (ic ? "i" : "") + "m");
  } catch {
    return null;
  }
}

export function searchText(buf: Buffer, from: Pos, pattern: string, forward: boolean, ignoreCase = false): Pos | null {
  if (!pattern) return null;
  const re = buildRegex(pattern, ignoreCase);
  if (!re) return null;
  const t = buf.text;
  const start = buf.offsetOf(from);
  const matches: number[] = [];
  for (const m of t.matchAll(re)) {
    matches.push(m.index!);
  }
  if (matches.length === 0) return null;
  const found = forward
    ? (matches.find((i) => i > start) ?? matches[0])
    : ([...matches].reverse().find((i) => i < start) ?? matches[matches.length - 1]);
  return buf.posOf(found);
}

const VIM_LITERAL = new Set(["(", ")", "{", "}", "|", "+", "?"]);

export function vimToJsRegex(pattern: string): string {
  let out = "";
  let inBrace = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (inBrace && ch === "}") {
      out += "}";
      inBrace = false;
    } else if (ch === "\\" && i + 1 < pattern.length) {
      const n = pattern[++i];
      if (n === "{") inBrace = true;
      if (n === "<" || n === ">") out += "\\b";
      else if (VIM_LITERAL.has(n)) out += n;
      else if (n === "=") out += "?";
      else out += "\\" + n;
    } else if (VIM_LITERAL.has(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

export function wordUnderCursor(buf: Buffer, p: Pos): string | null {
  const text = buf.line(p.line);
  let col = p.col;
  while (col < text.length && !/\w/.test(text[col])) col++;
  if (col >= text.length) return null;
  let s = col;
  let e = col;
  while (s > 0 && /\w/.test(text[s - 1])) s--;
  while (e < text.length && /\w/.test(text[e])) e++;
  return text.slice(s, e);
}
