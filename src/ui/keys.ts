const NAMED: Record<string, string> = {
  Escape: "<Esc>",
  Enter: "<CR>",
  Backspace: "<BS>",
  Tab: "<Tab>",
  Delete: "<Del>",
  ArrowLeft: "<Left>",
  ArrowRight: "<Right>",
  ArrowUp: "<Up>",
  ArrowDown: "<Down>",
  Home: "<Home>",
  End: "<End>",
  Insert: "<Insert>",
};

const IGNORED = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph", "Dead", "Unidentified"]);

export function toVimKey(e: KeyboardEvent): string | null {
  if (e.isComposing || IGNORED.has(e.key) || e.metaKey) return null;
  if (e.ctrlKey && !e.altKey) {
    if (e.key === "[") return "<Esc>";
    if (/^[a-z]$/i.test(e.key)) return `<C-${e.key.toLowerCase()}>`;
    return null;
  }
  if (NAMED[e.key]) return NAMED[e.key];
  return [...e.key].length === 1 ? e.key : null;
}

export function displayKeys(keys: string[]): string {
  return keys
    .map((k) => {
      if (k === " ") return "␣";
      const ctrl = /^<C-(.)>$/.exec(k);
      if (ctrl) return `^${ctrl[1].toUpperCase()}`;
      return k;
    })
    .join("");
}

export function splitKeySequence(src: string): string[] {
  return src.match(/<[^<>\s]+>|[\s\S]/g) ?? [];
}
