import type { Buffer } from "./buffer";
import type { Pos, Range } from "./types";

const cls = (ch: string | undefined, big: boolean): number => {
  if (ch === undefined) return -1;
  if (ch === " " || ch === "\t") return 0;
  if (big) return 1;
  return /\w/.test(ch) ? 1 : 2;
};

function wordObject(buf: Buffer, p: Pos, around: boolean, big: boolean): Range | null {
  const text = buf.line(p.line);
  if (text.length === 0) return null;
  const c = cls(text[p.col], big);
  let s = p.col;
  let e = p.col;
  while (s > 0 && cls(text[s - 1], big) === c) s--;
  while (e + 1 < text.length && cls(text[e + 1], big) === c) e++;
  if (around) {
    if (c === 0) {
      const c2 = cls(text[e + 1], big);
      while (e + 1 < text.length && cls(text[e + 1], big) === c2) e++;
    } else if (e + 1 < text.length && cls(text[e + 1], big) === 0) {
      while (e + 1 < text.length && cls(text[e + 1], big) === 0) e++;
    } else {
      while (s > 0 && cls(text[s - 1], big) === 0) s--;
    }
  }
  return { start: { line: p.line, col: s }, end: { line: p.line, col: e }, linewise: false, inclusive: true };
}

function quoteObject(buf: Buffer, p: Pos, q: string, around: boolean): Range | null {
  const text = buf.line(p.line);
  const idx: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === q && text[i - 1] !== "\\") idx.push(i);
  let open = -1;
  let close = -1;
  for (let k = 0; k + 1 < idx.length; k += 2) {
    if (p.col >= idx[k] && p.col <= idx[k + 1]) {
      open = idx[k];
      close = idx[k + 1];
      break;
    }
  }
  if (open < 0) {
    const k = idx.findIndex((i) => i > p.col);
    if (k < 0 || k + 1 >= idx.length) return null;
    open = idx[k];
    close = idx[k + 1];
  }
  if (around) {
    let e = close;
    while (text[e + 1] === " ") e++;
    return { start: { line: p.line, col: open }, end: { line: p.line, col: e }, linewise: false, inclusive: true };
  }
  if (close - open === 1) {
    return { start: { line: p.line, col: open + 1 }, end: { line: p.line, col: open + 1 }, linewise: false, inclusive: false };
  }
  return { start: { line: p.line, col: open + 1 }, end: { line: p.line, col: close - 1 }, linewise: false, inclusive: true };
}

function bracketObject(buf: Buffer, p: Pos, open: string, close: string, around: boolean): Range | null {
  const t = buf.text;
  const cur = buf.offsetOf(p);
  let depth = 0;
  let o = -1;
  for (let i = cur; i >= 0; i--) {
    if (t[i] === close && i !== cur) depth++;
    else if (t[i] === open) {
      if (depth === 0) {
        o = i;
        break;
      }
      depth--;
    }
  }
  if (o < 0) {
    const next = buf.line(p.line).indexOf(open, p.col);
    if (next < 0) return null;
    o = cur + (next - p.col);
  }
  depth = 0;
  let c = -1;
  for (let i = o; i < t.length; i++) {
    if (t[i] === open) depth++;
    else if (t[i] === close && --depth === 0) {
      c = i;
      break;
    }
  }
  if (c < 0) return null;
  if (around) return { start: buf.posOf(o), end: buf.posOf(c), linewise: false, inclusive: true };
  const open_ = buf.posOf(o);
  const close_ = buf.posOf(c);
  const afterOpen = buf.line(open_.line).slice(open_.col + 1);
  const beforeClose = buf.line(close_.line).slice(0, close_.col);
  if (close_.line - open_.line >= 2 && afterOpen.trim() === "" && beforeClose.trim() === "") {
    return { start: { line: open_.line + 1, col: 0 }, end: { line: close_.line - 1, col: 0 }, linewise: true, inclusive: false };
  }
  return { start: buf.posOf(o + 1), end: buf.posOf(c), linewise: false, inclusive: false };
}

function paragraphObject(buf: Buffer, p: Pos, around: boolean): Range {
  const blank = buf.isBlank(p.line);
  let s = p.line;
  let e = p.line;
  while (s > 0 && buf.isBlank(s - 1) === blank) s--;
  while (e + 1 < buf.lineCount && buf.isBlank(e + 1) === blank) e++;
  if (around) {
    if (e + 1 < buf.lineCount) {
      e++;
      while (e + 1 < buf.lineCount && buf.isBlank(e + 1) !== blank) e++;
    } else {
      while (s > 0 && buf.isBlank(s - 1) !== blank) s--;
    }
  }
  return { start: { line: s, col: 0 }, end: { line: e, col: 0 }, linewise: true, inclusive: false };
}

export function textObject(buf: Buffer, p: Pos, kind: "i" | "a", key: string): Range | null {
  const around = kind === "a";
  switch (key) {
    case "w":
      return wordObject(buf, p, around, false);
    case "W":
      return wordObject(buf, p, around, true);
    case '"':
    case "'":
    case "`":
      return quoteObject(buf, p, key, around);
    case "(":
    case ")":
    case "b":
      return bracketObject(buf, p, "(", ")", around);
    case "{":
    case "}":
    case "B":
      return bracketObject(buf, p, "{", "}", around);
    case "[":
    case "]":
      return bracketObject(buf, p, "[", "]", around);
    case "<":
    case ">":
      return bracketObject(buf, p, "<", ">", around);
    case "p":
      return paragraphObject(buf, p, around);
    default:
      return null;
  }
}
