import type { VimEngine } from "./engine";
import { buildRegex } from "./motions";

interface LineRange {
  from: number;
  to: number;
  given: boolean;
}

class ExError extends Error {}

function parseAddress(vim: VimEngine, src: string, i: number): { line: number; next: number } | null {
  const buf = vim.buf;
  let line: number | null = null;
  const ch = src[i];
  if (ch === ".") {
    line = vim.cursor.line;
    i++;
  } else if (ch === "$") {
    line = buf.lineCount - 1;
    i++;
  } else if (ch !== undefined && /\d/.test(ch)) {
    const m = /^\d+/.exec(src.slice(i))!;
    line = parseInt(m[0], 10) - 1;
    i += m[0].length;
  } else if (ch === "'") {
    const mark = vim.marks.get(src[i + 1]);
    if (!mark) throw new ExError("E20: Mark not set");
    line = mark.line;
    i += 2;
  } else if (ch === "/" || ch === "?") {
    const end = src.indexOf(ch, i + 1);
    const pat = src.slice(i + 1, end < 0 ? undefined : end);
    const re = buildRegex(pat, vim.options.ignorecase, false);
    if (!re) throw new ExError("E486: Pattern not found");
    const total = buf.lineCount;
    for (let k = 1; k <= total; k++) {
      const l = ch === "/" ? (vim.cursor.line + k) % total : (vim.cursor.line - k + total) % total;
      if (re.test(buf.line(l))) {
        line = l;
        break;
      }
    }
    if (line === null) throw new ExError(`E486: Pattern not found: ${pat}`);
    i = end < 0 ? src.length : end + 1;
  }
  while (src[i] === "+" || src[i] === "-") {
    const sign = src[i] === "+" ? 1 : -1;
    const m = /^\d+/.exec(src.slice(i + 1));
    const n = m ? parseInt(m[0], 10) : 1;
    line = (line ?? vim.cursor.line) + sign * n;
    i += 1 + (m ? m[0].length : 0);
  }
  return line === null ? null : { line, next: i };
}

function parseRange(vim: VimEngine, src: string): { range: LineRange; rest: string } {
  const cur = vim.cursor.line;
  if (src.startsWith("%")) {
    return { range: { from: 0, to: vim.buf.lineCount - 1, given: true }, rest: src.slice(1) };
  }
  const first = parseAddress(vim, src, 0);
  if (!first) return { range: { from: cur, to: cur, given: false }, rest: src };
  let i = first.next;
  let to = first.line;
  if (src[i] === "," || src[i] === ";") {
    const second = parseAddress(vim, src, i + 1);
    if (second) {
      to = second.line;
      i = second.next;
    }
  }
  const from = Math.min(first.line, to);
  return { range: { from, to: Math.max(first.line, to), given: true }, rest: src.slice(i) };
}

function checkRange(vim: VimEngine, r: LineRange): void {
  if (r.from < 0 || r.to >= vim.buf.lineCount) throw new ExError("E16: Invalid range");
}

function splitDelimited(src: string): string[] {
  const delim = src[0];
  const parts: string[] = [];
  let cur = "";
  for (let i = 1; i < src.length; i++) {
    if (src[i] === "\\" && src[i + 1] === delim) {
      cur += delim;
      i++;
    } else if (src[i] === delim && parts.length < 2) {
      parts.push(cur);
      cur = "";
    } else {
      cur += src[i];
    }
  }
  parts.push(cur);
  return parts;
}

function convertReplacement(rep: string): string {
  let out = "";
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i];
    if (c === "\\" && i + 1 < rep.length) {
      const n = rep[++i];
      if (/\d/.test(n)) out += "$" + n;
      else if (n === "n" || n === "r") out += "\n";
      else if (n === "t") out += "\t";
      else out += n === "$" ? "$$" : n;
    } else if (c === "&") {
      out += "$&";
    } else if (c === "$") {
      out += "$$";
    } else {
      out += c;
    }
  }
  return out;
}

function substitute(vim: VimEngine, range: LineRange, args: string): void {
  let pattern: string;
  let replacement: string;
  let flags: string;
  if (args === "" || /^[&cgiIn]*$/.test(args)) {
    const last = vim.lastSubstitute;
    if (!last) throw new ExError("E35: No previous regular expression");
    pattern = last.pattern;
    replacement = last.replacement;
    flags = args.startsWith("&") ? last.flags + args.slice(1) : args;
  } else {
    const parts = splitDelimited(args);
    pattern = parts[0] || vim.lastSearch?.pattern || "";
    replacement = parts[1] ?? "";
    if (replacement === "~") replacement = vim.lastSubstitute?.replacement ?? "";
    flags = parts[2] ?? "";
  }
  vim.lastSubstitute = { pattern, replacement, flags };
  vim.lastSearch = { pattern, forward: true };
  const ic = flags.includes("i") || (vim.options.ignorecase && !flags.includes("I"));
  const re = buildRegex(pattern, ic, flags.includes("g"));
  if (!re) throw new ExError(`E486: Pattern not found: ${pattern}`);
  const rep = convertReplacement(replacement);
  let count = 0;
  let lastLine = -1;
  const out: string[] = [];
  for (let l = 0; l < vim.buf.lineCount; l++) {
    const line = vim.buf.line(l);
    if (l < range.from || l > range.to) {
      out.push(line);
      continue;
    }
    re.lastIndex = 0;
    const matches = line.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
    const hits = matches ? (flags.includes("g") ? matches.length : 1) : 0;
    if (hits > 0) {
      count += hits;
      if (flags.includes("n")) {
        out.push(line);
      } else {
        const replaced = line.replace(re, rep);
        out.push(...replaced.split("\n"));
        lastLine = out.length - 1;
      }
    } else {
      out.push(line);
    }
  }
  if (count === 0) throw new ExError(`E486: Pattern not found: ${pattern}`);
  if (flags.includes("n")) {
    vim.setMessage(`${count} match${count > 1 ? "es" : ""}`);
    return;
  }
  vim.buf.lines = out;
  vim.cursor = { line: lastLine, col: vim.buf.firstNonBlank(lastLine) };
  if (count > 1) vim.setMessage(`${count} substitutions`);
}

function globalCommand(vim: VimEngine, range: LineRange, args: string, invert: boolean): void {
  const parts = splitDelimited(args);
  const re = buildRegex(parts[0] || vim.lastSearch?.pattern || "", vim.options.ignorecase, false);
  if (!re) throw new ExError("E476: Invalid command");
  const cmd = parts[1]?.trim() || "p";
  const from = range.given ? range.from : 0;
  const to = range.given ? range.to : vim.buf.lineCount - 1;
  const marked: string[] = [];
  const markLines: number[] = [];
  for (let l = from; l <= to; l++) {
    if (re.test(vim.buf.line(l)) !== invert) {
      const name = `\u0000g${markLines.length}`;
      vim.setMark(name, { line: l, col: 0 });
      marked.push(name);
      markLines.push(l);
    }
  }
  const tracker = markLines.map((l) => ({ line: l, alive: true }));
  for (let k = 0; k < tracker.length; k++) {
    const t = tracker[k];
    if (!t.alive) continue;
    const before = vim.buf.lineCount;
    vim.cursor = { line: t.line, col: 0 };
    runEx(vim, cmd);
    const delta = vim.buf.lineCount - before;
    if (delta !== 0) {
      for (let j = k + 1; j < tracker.length; j++) {
        if (delta < 0 && tracker[j].line <= t.line - delta - 1 && tracker[j].line >= t.line) tracker[j].alive = false;
        else if (tracker[j].line > t.line) tracker[j].line += delta;
      }
    }
  }
  marked.forEach((m) => vim.marks.delete(m));
}

function setOption(vim: VimEngine, arg: string): void {
  const opts = vim.options;
  for (const raw of arg.split(/\s+/).filter(Boolean)) {
    const m = /^(no)?(\w+)(!)?(?:=(\d+))?$/.exec(raw);
    if (!m) throw new ExError(`E518: Unknown option: ${raw}`);
    const [, no, name, bang, value] = m;
    const alias: Record<string, keyof typeof opts> = {
      nu: "number", number: "number", rnu: "relativenumber", relativenumber: "relativenumber",
      hls: "hlsearch", hlsearch: "hlsearch", ic: "ignorecase", ignorecase: "ignorecase",
      sw: "shiftwidth", shiftwidth: "shiftwidth",
    };
    const key = alias[name];
    if (!key) throw new ExError(`E518: Unknown option: ${name}`);
    if (key === "shiftwidth") {
      if (value) opts.shiftwidth = Math.max(1, parseInt(value, 10));
      else vim.setMessage(`  shiftwidth=${opts.shiftwidth}`);
      continue;
    }
    opts[key] = bang ? !opts[key] : !no;
  }
}

export function runEx(vim: VimEngine, input: string): void {
  const src = input.replace(/^[:\s]+/, "");
  const { range, rest } = parseRange(vim, src);
  const m = /^([a-zA-Z]+|[&<>!=#~]+)?\s*(!)?\s*(.*)$/s.exec(rest.trimStart())!;
  const name = m[1] ?? "";
  const bang = !!m[2];
  const args = m[3] ?? "";
  const buf = vim.buf;

  if (!name && !args) {
    if (range.given) {
      const line = Math.max(0, Math.min(buf.lineCount - 1, range.to));
      vim.setMark("'");
      vim.cursor = { line, col: buf.firstNonBlank(line) };
    }
    return;
  }

  const is = (...names: string[]): boolean => names.includes(name);
  checkRange(vim, range);

  if (is("s", "su", "substitute")) return substitute(vim, range, args);
  if (name.startsWith("s") && /^s[gciIn&]+$/.test(name)) return substitute(vim, range, name.slice(1));
  if (is("&")) return substitute(vim, range, "&" + args);
  if (is("g", "global", "v", "vglobal")) return globalCommand(vim, range, args, bang || name.startsWith("v"));

  if (is("w", "write", "up", "update")) {
    vim.writes++;
    vim.setMessage(`"practice.txt" ${buf.lineCount}L, ${buf.text.length}B written`);
    return;
  }
  if (is("q", "quit", "qa", "qall", "quita", "quitall")) {
    vim.quitRequested = true;
    vim.setMessage(bang ? "Quit without saving" : "Quit — in a real vim, the window would close now");
    return;
  }
  if (is("wq", "x", "xit", "exi", "exit", "wqa", "xa")) {
    vim.writes++;
    vim.quitRequested = true;
    vim.setMessage(`"practice.txt" written — in a real vim, the window would close now`);
    return;
  }
  if (is("d", "de", "del", "delete")) {
    const reg = /^[a-zA-Z"]/.test(args) ? args[0] : undefined;
    const lines = buf.deleteLines(range.from, range.to);
    vim.storeRegister(reg, { text: lines.join("\n"), linewise: true }, "delete");
    const l = buf.clampLine(range.from);
    vim.cursor = { line: l, col: buf.firstNonBlank(l) };
    return;
  }
  if (is("y", "ya", "yank")) {
    const reg = /^[a-zA-Z"]/.test(args) ? args[0] : undefined;
    vim.storeRegister(reg, { text: buf.getLines(range.from, range.to).join("\n"), linewise: true }, "yank");
    return;
  }
  if (is("m", "mo", "move", "t", "co", "copy")) {
    const target = parseAddress(vim, args.trim() || ".", 0);
    if (!target) throw new ExError("E14: Invalid address");
    const dest = target.line;
    const lines = buf.getLines(range.from, range.to);
    if (is("m", "mo", "move")) {
      if (dest >= range.from && dest < range.to) throw new ExError("E134: Cannot move a range of lines into itself");
      if (dest === range.to) return;
      buf.deleteLines(range.from, range.to);
      const at = dest > range.to ? dest - lines.length + 1 : dest + 1;
      buf.insertLines(at, lines);
      vim.cursor = { line: at + lines.length - 1, col: 0 };
    } else {
      buf.insertLines(dest + 1, lines);
      vim.cursor = { line: dest + lines.length, col: 0 };
    }
    return;
  }
  if (is("j", "join")) {
    const to = range.given && range.to > range.from ? range.to : Math.min(buf.lineCount - 1, range.from + 1);
    const joined = buf.getLines(range.from, to).map((l, i) => (i ? l.trim() : l.replace(/\s+$/, ""))).filter((l, i) => i === 0 || l).join(" ");
    buf.lines.splice(range.from, to - range.from + 1, joined);
    vim.cursor = { line: range.from, col: 0 };
    return;
  }
  if (is(">", "<", ">>", "<<", ">>>", "<<<")) {
    const sw = vim.options.shiftwidth * name.length;
    for (let l = range.from; l <= range.to; l++) {
      const text = buf.line(l);
      if (!text) continue;
      const indent = buf.indentOf(l).length;
      const next = name[0] === ">" ? indent + sw : Math.max(0, indent - sw);
      buf.lines[l] = " ".repeat(next) + text.slice(indent);
    }
    vim.cursor = { line: range.to, col: buf.firstNonBlank(range.to) };
    return;
  }
  if (is("norm", "normal")) {
    const keys = tokenizeKeys(args);
    for (let l = range.from; l <= range.to; l++) {
      vim.cursor = { line: l, col: 0 };
      vim.runNormalKeys(keys);
    }
    return;
  }
  if (is("sor", "sort")) {
    const lines = buf.getLines(range.given ? range.from : 0, range.given ? range.to : buf.lineCount - 1);
    const numeric = args.includes("n");
    const ic = args.includes("i");
    lines.sort((a, b) => {
      if (numeric) return (parseFloat(/-?\d+(\.\d+)?/.exec(a)?.[0] ?? "0") - parseFloat(/-?\d+(\.\d+)?/.exec(b)?.[0] ?? "0"));
      const x = ic ? a.toLowerCase() : a;
      const y = ic ? b.toLowerCase() : b;
      return x < y ? -1 : x > y ? 1 : 0;
    });
    if (bang) lines.reverse();
    const result = args.includes("u") ? lines.filter((l, i) => i === 0 || l !== lines[i - 1]) : lines;
    const from = range.given ? range.from : 0;
    const to = range.given ? range.to : buf.lineCount - 1;
    buf.lines.splice(from, to - from + 1, ...result);
    return;
  }
  if (is("pu", "put")) {
    const reg = vim.getRegister(args.trim() || '"');
    if (!reg) throw new ExError("E353: Nothing in register");
    const lines = reg.text.split("\n");
    const at = bang ? range.to : range.to + 1;
    buf.insertLines(at, lines);
    vim.cursor = { line: at + lines.length - 1, col: 0 };
    return;
  }
  if (is("u", "un", "undo")) return vim.undo();
  if (is("red", "redo")) return vim.redo();
  if (is("noh", "nohl", "nohlsearch")) {
    vim.searchHighlight = false;
    return;
  }
  if (is("se", "set")) return setOption(vim, args);
  if (is("k", "ma", "mark")) {
    vim.setMark(args.trim(), { line: range.to, col: 0 });
    return;
  }
  if (is("reg", "registers", "di", "display")) {
    const entries = [...vim.registers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `"${k} ${v.text.replace(/\n/g, "^J").slice(0, 40)}`);
    vim.setMessage(entries.length ? entries.join("   ") : "No registers yet");
    return;
  }
  if (is("marks")) {
    const entries = [...vim.marks.entries()].filter(([k]) => !k.startsWith("\u0000")).map(([k, p]) => `${k}:${p.line + 1}`);
    vim.setMessage(entries.length ? entries.join("  ") : "No marks set");
    return;
  }
  if (is("p", "print", "nu", "number", "#")) {
    vim.setMessage(buf.getLines(range.from, range.to).join(" | "));
    vim.cursor = { line: range.to, col: buf.firstNonBlank(range.to) };
    return;
  }
  if (is("h", "help")) {
    vim.setMessage("This is LearnVim — the lessons on the left are your help pages!");
    return;
  }
  if (is("e", "edit")) {
    vim.setMessage(bang ? "Use the 'Reset' button to restore the lesson text" : '"practice.txt" is already open');
    return;
  }
  throw new ExError(`E492: Not an editor command: ${input}`);
}

export function tokenizeKeys(src: string): string[] {
  const keys: string[] = [];
  const re = /<(?:[CSMA]-)?[A-Za-z0-9[\]]+>|[\s\S]/gu;
  for (const m of src.matchAll(re)) {
    const k = m[0];
    if (k.length > 1) {
      const norm = normalizeSpecial(k);
      keys.push(norm);
    } else keys.push(k === " " ? " " : k);
  }
  return keys;
}

function normalizeSpecial(k: string): string {
  const inner = k.slice(1, -1);
  const map: Record<string, string> = {
    esc: "<Esc>", cr: "<CR>", enter: "<CR>", return: "<CR>", bs: "<BS>", tab: "<Tab>", space: " ",
    del: "<Del>", lt: "<", left: "<Left>", right: "<Right>", up: "<Up>", down: "<Down>",
  };
  const lower = inner.toLowerCase();
  if (map[lower]) return map[lower];
  const ctrl = /^c-(.)$/i.exec(inner);
  if (ctrl) return `<C-${ctrl[1].toLowerCase()}>`;
  return k;
}
