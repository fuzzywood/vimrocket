export interface Pos {
  line: number;
  col: number;
}

export type Mode = "normal" | "insert" | "replace" | "visual" | "visual-line" | "visual-block" | "command";

export interface Range {
  start: Pos;
  end: Pos;
  linewise: boolean;
  inclusive: boolean;
}

export interface Register {
  text: string;
  linewise: boolean;
}

export interface Snapshot {
  lines: string[];
  cursor: Pos;
}

export const comparePos = (a: Pos, b: Pos): number => a.line - b.line || a.col - b.col;

export const orderPos = (a: Pos, b: Pos): [Pos, Pos] => (comparePos(a, b) <= 0 ? [a, b] : [b, a]);
