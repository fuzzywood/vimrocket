import type { Pos, Range, Register } from "./types";

export class Buffer {
  lines: string[];

  constructor(text: string) {
    this.lines = text.split("\n");
    if (this.lines.length === 0) this.lines = [""];
  }

  get text(): string {
    return this.lines.join("\n");
  }

  get lineCount(): number {
    return this.lines.length;
  }

  line(n: number): string {
    return this.lines[n] ?? "";
  }

  charAt(p: Pos): string {
    return this.line(p.line)[p.col] ?? "";
  }

  clampLine(n: number): number {
    return Math.max(0, Math.min(this.lines.length - 1, n));
  }

  clampCol(line: number, col: number, allowEnd = false): number {
    const len = this.line(line).length;
    const max = allowEnd ? len : Math.max(0, len - 1);
    return Math.max(0, Math.min(max, col));
  }

  clamp(p: Pos, allowEnd = false): Pos {
    const line = this.clampLine(p.line);
    return { line, col: this.clampCol(line, p.col, allowEnd) };
  }

  insert(p: Pos, text: string): Pos {
    const cur = this.line(p.line);
    const before = cur.slice(0, p.col);
    const after = cur.slice(p.col);
    const parts = text.split("\n");
    if (parts.length === 1) {
      this.lines[p.line] = before + text + after;
      return { line: p.line, col: p.col + text.length };
    }
    const newLines = [before + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + after];
    this.lines.splice(p.line, 1, ...newLines);
    return { line: p.line + parts.length - 1, col: parts[parts.length - 1].length };
  }

  getText(start: Pos, end: Pos): string {
    if (start.line === end.line) return this.line(start.line).slice(start.col, end.col);
    const out = [this.line(start.line).slice(start.col)];
    for (let i = start.line + 1; i < end.line; i++) out.push(this.line(i));
    out.push(this.line(end.line).slice(0, end.col));
    return out.join("\n");
  }

  deleteText(start: Pos, end: Pos): string {
    const removed = this.getText(start, end);
    const head = this.line(start.line).slice(0, start.col);
    const tail = this.line(end.line).slice(end.col);
    this.lines.splice(start.line, end.line - start.line + 1, head + tail);
    return removed;
  }

  getLines(from: number, to: number): string[] {
    return this.lines.slice(from, to + 1);
  }

  deleteLines(from: number, to: number): string[] {
    const removed = this.lines.splice(from, to - from + 1);
    if (this.lines.length === 0) this.lines = [""];
    return removed;
  }

  insertLines(at: number, lines: string[]): void {
    this.lines.splice(at, 0, ...lines);
  }

  rangeText(r: Range): Register {
    if (r.linewise) return { text: this.getLines(r.start.line, r.end.line).join("\n"), linewise: true };
    const end = r.inclusive ? { line: r.end.line, col: r.end.col + 1 } : r.end;
    return { text: this.getText(r.start, this.clamp(end, true)), linewise: false };
  }

  deleteRange(r: Range): Register {
    if (r.linewise) {
      return { text: this.deleteLines(r.start.line, r.end.line).join("\n"), linewise: true };
    }
    const end = r.inclusive ? { line: r.end.line, col: r.end.col + 1 } : r.end;
    return { text: this.deleteText(r.start, this.clamp(end, true)), linewise: false };
  }

  offsetOf(p: Pos): number {
    let off = 0;
    for (let i = 0; i < p.line; i++) off += this.lines[i].length + 1;
    return off + p.col;
  }

  posOf(offset: number): Pos {
    let rest = Math.max(0, offset);
    for (let i = 0; i < this.lines.length; i++) {
      if (rest <= this.lines[i].length) return { line: i, col: rest };
      rest -= this.lines[i].length + 1;
    }
    const last = this.lines.length - 1;
    return { line: last, col: this.lines[last].length };
  }

  isBlank(line: number): boolean {
    return this.line(line).trim() === "";
  }

  firstNonBlank(line: number): number {
    const m = /\S/.exec(this.line(line));
    return m ? m.index : Math.max(0, this.line(line).length - 1);
  }

  indentOf(line: number): string {
    return /^\s*/.exec(this.line(line))![0];
  }
}
