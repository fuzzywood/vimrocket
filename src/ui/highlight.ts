export type Token = "kw" | "str" | "num" | "com" | "fn" | "type" | "const" | "op" | "head" | "list" | "punc";

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break",
  "continue", "new", "class", "extends", "import", "export", "from", "default", "async", "await", "try", "catch",
  "finally", "throw", "typeof", "instanceof", "in", "of", "void", "delete", "yield", "static", "interface", "type",
  "enum", "public", "private", "protected", "readonly", "def", "elif", "pass", "lambda", "fn", "pub", "impl", "use",
]);
const CONSTANTS = new Set(["true", "false", "null", "undefined", "this", "None", "True", "False", "self", "NaN"]);
const BUILTINS = new Set(["console", "Math", "JSON", "Object", "Array", "String", "Number", "Promise", "Map", "Set", "Date", "Error", "window", "document"]);

const CODE_HINT = /[;{}()=[\]]|^\s*(const|let|var|function|return|import|export|if|for|while|class|def|async)\b/;

interface Rule {
  re: RegExp;
  token: Token | ((match: string, text: string, end: number) => Token | null);
  codeOnly?: boolean;
}

const RULES: Rule[] = [
  { re: /\/\/.*/y, token: "com", codeOnly: true },
  { re: /\/\*.*?(\*\/|$)/y, token: "com", codeOnly: true },
  { re: /"(?:\\.|[^"\\])*"?/y, token: "str" },
  { re: /'(?:\\.|[^'\\])*'(?!\w)/y, token: "str", codeOnly: true },
  { re: /`(?:\\.|[^`\\])*`?/y, token: "str" },
  { re: /\b\d+(?:\.\d+)?\b/y, token: "num" },
  {
    re: /[A-Za-z_$][\w$]*/y,
    codeOnly: true,
    token: (word, text, end) => {
      if (KEYWORDS.has(word)) return "kw";
      if (CONSTANTS.has(word)) return "const";
      if (BUILTINS.has(word)) return "type";
      if (/^\s*\(/.test(text.slice(end))) return "fn";
      return null;
    },
  },
  { re: /[A-Za-z_$][\w$]*/y, token: () => null },
  { re: /=>|[=+\-*/%<>!&|?:]+/y, token: "op", codeOnly: true },
  { re: /[{}()[\];,.]/y, token: "punc", codeOnly: true },
];

export function highlightLine(text: string): (Token | null)[] {
  const out: (Token | null)[] = new Array(text.length).fill(null);
  const heading = /^#{1,6}\s.*/.exec(text);
  if (heading) return out.fill("head");
  const list = /^\s*(?:[-*+]|\d+\.)\s/.exec(text);
  const isCode = CODE_HINT.test(text);
  let i = 0;
  if (list) {
    const marker = list[0].trimEnd();
    out.fill("list", marker.length - marker.trimStart().length, marker.length);
    i = list[0].length;
  }
  if (!isCode && /^\s*#\s/.test(text)) return out.fill("com");
  while (i < text.length) {
    let matched = false;
    for (const rule of RULES) {
      if (rule.codeOnly && !isCode) continue;
      rule.re.lastIndex = i;
      const m = rule.re.exec(text);
      if (!m || m[0].length === 0) continue;
      const end = i + m[0].length;
      const token = typeof rule.token === "function" ? rule.token(m[0], text, end) : rule.token;
      if (token) out.fill(token, i, end);
      i = end;
      matched = true;
      break;
    }
    if (!matched) i++;
  }
  return out;
}
