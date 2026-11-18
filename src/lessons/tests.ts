import type { Chapter, Task, TestLesson } from "./types";

const TESTS: Record<string, Task[]> = {
  "first-steps": [
    {
      task: "Delete the extra <code>m</code> and the extra <code>l</code> using only counts, <kbd>h j k l</kbd> and <kbd>x</kbd>.",
      text: "Hello, Vimm!\nThis is lline two.",
      target: "Hello, Vim!\nThis is line two.",
      solution: "9lxjx",
      optimal: 5,
    },
    {
      task: "Complete the text to <code>The quick brown fox</code> / <code>jumps over the lazy dog.</code>",
      text: "quick fox\njumps over the dog",
      target: "The quick brown fox\njumps over the lazy dog.",
      solution: "IThe <Esc>7librown <Esc>jA.<Esc>3hilazy <Esc>",
      optimal: 29,
    },
    {
      task: "Add <code>top</code> above and <code>bottom</code> below, then save and quit with <code>:wq</code>.",
      text: "middle",
      target: "top\nmiddle\nbottom",
      check: (vim) => vim.writes > 0 && vim.quitRequested,
      solution: "Otop<Esc>jobottom<Esc>:wq<CR>",
      optimal: 18,
    },
  ],
  "words-lines": [
    {
      task: "Change <code>let</code> to <code>const</code> and add a third argument <code>gamma</code>.",
      text: "    let result = compute(alpha, beta);",
      target: "    const result = compute(alpha, beta, gamma);",
      solution: "^xxxiconst<Esc>$hi, gamma<Esc>",
      optimal: 22,
    },
    {
      task: "Add <code># START</code> as the first and <code># END</code> as the last line.",
      text: "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8",
      cursor: { line: 4, col: 0 },
      target: "# START\nline 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\n# END",
      solution: "ggO# START<Esc>Go# END<Esc>",
      optimal: 19,
    },
    {
      task: "Starting at the bottom, replace both blank lines with <code>---</code> using paragraph jumps.",
      text: "intro\ntext\n\nmiddle\ntext\n\nend",
      cursor: { line: 6, col: 0 },
      target: "intro\ntext\n---\nmiddle\ntext\n---\nend",
      solution: "{i---<Esc>{i---<Esc>",
      optimal: 12,
    },
  ],
  operators: [
    {
      task: "Remove the doubled words with <kbd>dw</kbd>.",
      text: "The the cat sat on on the mat mat.",
      target: "The cat sat on the mat.",
      solution: "wdwwwdwwwdw",
      optimal: 11,
    },
    {
      task: "Swap <code>third</code> and <code>second</code>, then change the junk line to <code>fourth</code>.",
      text: "first\nthird\nsecond\nJUNK LINE",
      target: "first\nsecond\nthird\nfourth",
      solution: "jddpjccfourth<Esc>",
      optimal: 14,
    },
    {
      task: "Uppercase every <code>warning</code> — once with <kbd>gUe</kbd>, then repeat with <kbd>.</kbd>",
      text: "warning: a\nwarning: b\nwarning: c",
      target: "WARNING: a\nWARNING: b\nWARNING: c",
      solution: "gUej.j.",
      optimal: 7,
    },
  ],
  finding: [
    {
      task: "Remove all commas from the list.",
      text: "items = [1, 2, 3, 4]",
      target: "items = [1 2 3 4]",
      solution: "f,x;x;x",
      optimal: 7,
    },
    {
      task: "Delete <code>debug: </code> from the string.",
      text: 'print("debug: value is", value)',
      target: 'print("value is", value)',
      solution: 'f"ldf ',
      optimal: 6,
    },
    {
      task: "Replace the group <code>(b + c)</code> with <code>x</code> and delete the comment line.",
      text: "if (ok) {\n  run(a, (b + c));\n}\n// remove: (unused)",
      target: "if (ok) {\n  run(a, x);\n}",
      solution: "/(b<CR>d%ix<Esc>Gdd",
      optimal: 12,
    },
  ],
  "text-objects": [
    {
      task: "Change the title to <code>New Title</code> and remove the comment.",
      text: 'title = "Old Title" # comment',
      target: 'title = "New Title"',
      solution: 'ci"New Title<Esc>f D',
      optimal: 16,
    },
    {
      task: "Empty the list and set <code>debug</code> to <code>false</code>.",
      text: "values = [1, 2, 3]\nconfig = {debug: true}",
      target: "values = []\nconfig = {debug: false}",
      solution: "di[jftciwfalse<Esc>",
      optimal: 15,
    },
    {
      task: "Delete the middle paragraph and the doubled <code>extra</code>.",
      text: "Keep this paragraph.\n\nRemove this whole paragraph\nplease.\n\nLast paragraph has an extra extra word.",
      target: "Keep this paragraph.\n\nLast paragraph has an extra word.",
      solution: "jjdap/extra<CR>daw",
      optimal: 15,
    },
  ],
  visual: [
    {
      task: "Uppercase the word <code>this</code> using Visual mode.",
      text: "make this LOUD please",
      target: "make THIS LOUD please",
      solution: "wveU",
      optimal: 4,
    },
    {
      task: "Indent the first three lines and delete the two junk lines.",
      text: "a\nb\nc\nJUNK\nJUNK",
      target: "    a\n    b\n    c",
      solution: "Vjj>GVkd",
      optimal: 8,
    },
    {
      task: "Turn the assignments into <code>let x = 1;</code> statements with block edits.",
      text: "x = 1\ny = 2\nz = 3",
      target: "let x = 1;\nlet y = 2;\nlet z = 3;",
      solution: "<C-v>jjIlet <Esc><C-v>jj$A;<Esc>",
      optimal: 16,
    },
  ],
  "registers-marks": [
    {
      task: "Replace the two <code>---</code> lines with copies of <code>apple</code> and <code>banana</code> (use named registers).",
      text: "apple\nbanana\n---\n---",
      target: "apple\nbanana\napple\nbanana",
      solution: '"ayyj"byyjdd"aPjdd"bp',
      optimal: 21,
    },
    {
      task: "Set a mark, add <code>// end</code> at the bottom, jump back to the mark and append <code>!</code> to <code>header</code>.",
      text: "header\nbody\nfooter",
      target: "header!\nbody\nfooter\n// end",
      solution: "maGo// end<Esc>'aA!<Esc>",
      optimal: 16,
    },
    {
      task: "Yank <code>Bob</code>, delete <code>XXX</code> and put the yank with <kbd>\"0p</kbd>.",
      text: "name: Bob\nuser: XXX",
      target: "name: Bob\nuser: Bob",
      solution: '$yiwjdiw"0p',
      optimal: 11,
    },
  ],
  "command-line": [
    {
      task: "Replace every <code>foo</code> — in any case — with <code>bar</code>.",
      text: "Foo foo FOO",
      target: "bar bar bar",
      solution: ":s/foo/bar/gi<CR>",
      optimal: 14,
    },
    {
      task: "Move line 5 directly below line 1 with <code>:m</code>.",
      text: "1\n2\n3\n4\n5",
      target: "1\n5\n2\n3\n4",
      solution: ":5m1<CR>",
      optimal: 5,
    },
    {
      task: "Append <code>!</code> to every <code>todo</code> line using <code>:g</code> and <code>:normal</code>.",
      text: "todo: a\ndone: b\ntodo: c",
      target: "todo: a!\ndone: b\ntodo: c!",
      solution: ":g/todo/norm A!<CR>",
      optimal: 16,
    },
  ],
  macros: [
    {
      task: "Turn every line into a checkbox item <code>- [ ] one</code> with a macro.",
      text: "one\ntwo\nthree",
      target: "- [ ] one\n- [ ] two\n- [ ] three",
      solution: "qaI- [ ] <Esc>jq2@a",
      optimal: 15,
    },
    {
      task: "Generate <code>step 1</code> to <code>step 4</code> with a macro and <kbd>Ctrl-a</kbd>.",
      text: "step 1",
      target: "step 1\nstep 2\nstep 3\nstep 4",
      solution: "qayyp<C-a>q2@a",
      optimal: 10,
    },
    {
      task: "Strip the trailing comments from every line with a macro.",
      text: "a = 1 # x\nb = 2 # y\nc = 3 # z",
      target: "a = 1\nb = 2\nc = 3",
      solution: "qa0f#hDjq2@a",
      optimal: 12,
    },
  ],
};

export function withTests(chapters: Chapter[]): Chapter[] {
  return chapters.map((chapter) => {
    const tasks = TESTS[chapter.id];
    if (!tasks) return chapter;
    const seen = new Set<string>();
    const keys = chapter.lessons
      .flatMap((l) => l.keys)
      .filter((k) => !seen.has(k.keys) && seen.add(k.keys));
    const test: TestLesson = {
      id: `test-${chapter.id}`,
      title: "Chapter test",
      intro: `Show what you learned in <strong>${chapter.title}</strong>. Solve three small tasks — the next one loads
        automatically when you finish one, and <kbd>‹</kbd> <kbd>›</kbd> or the dots switch between them in any order.
        Commands from earlier chapters are allowed too.`,
      keys,
      tasks,
    };
    return { ...chapter, lessons: [...chapter.lessons, test] };
  });
}
