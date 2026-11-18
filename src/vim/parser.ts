export interface Command {
  register?: string;
  count: number;
  hasCount: boolean;
  operator?: string;
  motion?: string;
  motionArg?: string;
  textObject?: { kind: "i" | "a"; key: string };
  linewise?: boolean;
  action?: string;
  actionArg?: string;
}

export type ParseResult =
  | { status: "incomplete" }
  | { status: "invalid" }
  | { status: "done"; cmd: Command; length: number };

const SIMPLE_MOTIONS = new Set([
  "h", "j", "k", "l", "w", "W", "b", "B", "e", "E", "0", "^", "$", "G", ";", ",", "%", "{", "}",
  "n", "N", "*", "#", "H", "M", "L", "_", "+", "-", "|", "<CR>", "<BS>", "<Space>", " ",
  "<Left>", "<Right>", "<Up>", "<Down>", "<Home>", "<End>",
]);
const G_MOTIONS = new Set(["g", "e", "E", "_", "j", "k", "0", "$"]);
const ARG_MOTIONS = new Set(["f", "F", "t", "T", "`", "'"]);
const OPERATORS = new Set(["d", "c", "y", ">", "<", "="]);
const G_OPERATORS = new Set(["~", "u", "U"]);

const NORMAL_ACTIONS = new Set([
  "x", "X", "s", "S", "i", "I", "a", "A", "o", "O", "p", "P", "u", ".", "J", "~", "D", "C", "Y",
  "v", "V", ":", "/", "?", "R", "&", "<C-r>", "<C-v>", "<C-d>", "<C-u>", "<C-e>", "<C-y>", "<C-f>", "<C-b>",
  "<Del>", "<C-a>", "<C-x>", "<C-o>", "<C-i>", "<Insert>",
]);
const NORMAL_ARG_ACTIONS = new Set(["r", "m", "q", "@"]);
const NORMAL_G_ACTIONS = new Set(["J", "i", "v", "p", "P", "&"]);
const NORMAL_Z_ACTIONS = new Set(["z", "t", "b", "<CR>", "."]);

const VISUAL_ACTIONS = new Set([
  "d", "x", "X", "D", "y", "Y", "c", "s", "C", "S", "R", "o", "O", "I", "A", "J", "~", "u", "U", ">", "<", "=",
  "p", "P", ":", "v", "V", "<C-v>", "<Del>", "/", "?",
]);
const VISUAL_G_ACTIONS = new Set(["J", "v", "~", "u", "U"]);

type MotionParse = { status: "incomplete" | "invalid" } | { status: "ok"; motion: string; arg?: string; len: number };

function parseMotion(keys: string[], i: number): MotionParse {
  const k = keys[i];
  if (k === undefined) return { status: "incomplete" };
  if (SIMPLE_MOTIONS.has(k)) return { status: "ok", motion: k, len: 1 };
  if (ARG_MOTIONS.has(k)) {
    const arg = keys[i + 1];
    if (arg === undefined) return { status: "incomplete" };
    if (arg === "<Esc>") return { status: "invalid" };
    return { status: "ok", motion: k, arg, len: 2 };
  }
  if (k === "g") {
    const n = keys[i + 1];
    if (n === undefined) return { status: "incomplete" };
    if (G_MOTIONS.has(n)) return { status: "ok", motion: "g" + n, len: 2 };
  }
  return { status: "invalid" };
}

function parseCount(keys: string[], i: number): { value: number; len: number } {
  let s = "";
  let j = i;
  while (j < keys.length && /^[0-9]$/.test(keys[j]) && !(s === "" && keys[j] === "0")) s += keys[j++];
  return { value: s ? parseInt(s, 10) : 0, len: j - i };
}

export function parseCommand(keys: string[], visual: boolean, recording: boolean): ParseResult {
  let i = 0;
  const cmd: Command = { count: 1, hasCount: false };
  if (keys[0] === '"') {
    if (keys[1] === undefined) return { status: "incomplete" };
    if (!/^[a-zA-Z0-9"\-_+*.:/]$/.test(keys[1])) return { status: "invalid" };
    cmd.register = keys[1];
    i = 2;
  }
  const c1 = parseCount(keys, i);
  i += c1.len;
  let count = c1.value;
  const k = keys[i];
  if (k === undefined) return { status: "incomplete" };

  const finish = (len: number): ParseResult => {
    cmd.hasCount = count > 0;
    cmd.count = Math.max(1, count);
    return { status: "done", cmd, length: len };
  };

  if (visual) {
    if (k === "i" || k === "a") {
      const key = keys[i + 1];
      if (key === undefined) return { status: "incomplete" };
      cmd.textObject = { kind: k, key };
      return finish(i + 2);
    }
    if (k === "r") {
      const arg = keys[i + 1];
      if (arg === undefined) return { status: "incomplete" };
      cmd.action = "r";
      cmd.actionArg = arg;
      return finish(i + 2);
    }
    if (VISUAL_ACTIONS.has(k)) {
      cmd.action = k;
      return finish(i + 1);
    }
    if (k === "g" && keys[i + 1] !== undefined && VISUAL_G_ACTIONS.has(keys[i + 1])) {
      cmd.action = "g" + keys[i + 1];
      return finish(i + 2);
    }
    const m = parseMotion(keys, i);
    if (m.status !== "ok") return m;
    cmd.motion = m.motion;
    cmd.motionArg = m.arg;
    return finish(i + m.len);
  }

  let op: string | undefined;
  if (OPERATORS.has(k)) op = k;
  else if (k === "g") {
    if (keys[i + 1] === undefined) return { status: "incomplete" };
    if (G_OPERATORS.has(keys[i + 1])) op = "g" + keys[i + 1];
  }

  if (op) {
    cmd.operator = op;
    i += op.length;
    const c2 = parseCount(keys, i);
    i += c2.len;
    if (c2.value) count = (count || 1) * c2.value;
    const n = keys[i];
    if (n === undefined) return { status: "incomplete" };
    if (n === "<Esc>") return { status: "invalid" };
    const opChar = op[op.length - 1];
    if (n === opChar || (op.length === 2 && n === "g" && keys[i + 1] === opChar)) {
      if (n === "g" && keys[i + 1] === undefined) return { status: "incomplete" };
      cmd.linewise = true;
      return finish(i + (n === "g" ? 2 : 1));
    }
    if (op.length === 2 && n === "g" && keys[i + 1] === undefined) return { status: "incomplete" };
    if (n === "i" || n === "a") {
      const key = keys[i + 1];
      if (key === undefined) return { status: "incomplete" };
      cmd.textObject = { kind: n, key };
      return finish(i + 2);
    }
    const m = parseMotion(keys, i);
    if (m.status !== "ok") return m;
    cmd.motion = m.motion;
    cmd.motionArg = m.arg;
    return finish(i + m.len);
  }

  if (k === "q" && recording) {
    cmd.action = "q";
    return finish(i + 1);
  }
  if (NORMAL_ARG_ACTIONS.has(k)) {
    const arg = keys[i + 1];
    if (arg === undefined) return { status: "incomplete" };
    if (arg === "<Esc>") return { status: "invalid" };
    cmd.action = k;
    cmd.actionArg = arg;
    return finish(i + 2);
  }
  if (NORMAL_ACTIONS.has(k)) {
    cmd.action = k;
    return finish(i + 1);
  }
  if (k === "g" && NORMAL_G_ACTIONS.has(keys[i + 1])) {
    cmd.action = "g" + keys[i + 1];
    return finish(i + 2);
  }
  if (k === "z" || k === "Z") {
    const n = keys[i + 1];
    if (n === undefined) return { status: "incomplete" };
    if (k === "z" && NORMAL_Z_ACTIONS.has(n)) {
      cmd.action = "z" + n;
      return finish(i + 2);
    }
    if (k === "Z" && (n === "Z" || n === "Q")) {
      cmd.action = "Z" + n;
      return finish(i + 2);
    }
    return { status: "invalid" };
  }
  const m = parseMotion(keys, i);
  if (m.status !== "ok") return m;
  cmd.motion = m.motion;
  cmd.motionArg = m.arg;
  return finish(i + m.len);
}
