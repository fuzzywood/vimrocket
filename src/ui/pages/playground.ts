import { VimEngine } from "../../vim/engine";
import { h } from "../dom";
import { EditorView } from "../editor";
import type { Page } from "./lesson";

const STORAGE_KEY = "learnvim.playground";

const SAMPLE = `# Welcome to the LearnVim playground!

This is a free-form editor: everything you learned in the lessons works here.
Your text is kept in this browser, so feel free to experiment.

## Things to try

1. Jump around with w, b, e, f{char}, %, gg and G.
2. Change text inside the quotes below with ci"
   const greeting = "hello world";
3. Select the list below with Vjj and indent it with >
   - apples
   - pears
   - plums
4. Rename every "item" with :%s/item/thing/g
   item one, item two, item three
5. Record a macro with qa ... q and run it with @a

function sum(values) {
    let total = 0;
    for (const v of values) {
        total += v;
    }
    return total;
}
`;

function loadText(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function saveText(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    /* storage unavailable */
  }
}

export function renderPlayground(): Page {
  const vim = new VimEngine();
  vim.load(loadText());
  const editor = new EditorView(vim, { filename: "playground.md" });
  let lastWrites = 0;
  const unsubscribe = vim.onChange(() => {
    if (vim.writes !== lastWrites) {
      lastWrites = vim.writes;
      saveText(vim.text);
    }
  });

  const restore = (): void => {
    vim.load(SAMPLE);
    saveText(SAMPLE);
    editor.resetSaved();
    editor.focus();
  };

  const el = h(
    "div",
    { class: "page split playground" },
    h(
      "aside",
      { class: "split-panel" },
      h(
        "header",
        { class: "lesson-head" },
        h("p", { class: "eyebrow" }, "Free practice"),
        h("h1", {}, "Playground"),
        h("p", { class: "lead" }, "An open Vim buffer. Use ", h("code", {}, ":w"), " to save your text in this browser. Try ", h("code", {}, ":set rnu"), " for relative line numbers."),
      ),
      h("p", { class: "muted" }, "Some browser shortcuts like Ctrl-w cannot be captured — use the alternatives from the cheat sheet."),
      h("div", { class: "toolbar" }, h("button", { class: "btn small", onclick: restore }, "Restore sample text")),
    ),
    h("div", { class: "split-editor" }, editor.el),
  );

  return {
    el,
    mount: () => editor.focus(),
    dispose: () => {
      unsubscribe();
      editor.destroy();
    },
  };
}
