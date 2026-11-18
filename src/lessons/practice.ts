import type { Chapter } from "./types";

export const practice: Chapter[] = [
  {
    id: "practice-everyday",
    title: "Practice: Everyday Editing",
    summary: "Mixed exercises combining motions, operators, search and insert mode.",
    lessons: [
      {
        id: "pr-shopping-list",
        title: "The shopping list",
        intro: `Time to combine what you know. There is no single right way — pick the motions that feel natural.
          Useful here: <kbd>f</kbd> to reach a letter, <kbd>a</kbd> to append, <kbd>dd</kbd> to delete a line and
          <kbd>G</kbd> + <kbd>o</kbd> to add a line at the end.`,
        keys: [
          { keys: "f{c} a", desc: "jump to a letter and append" },
          { keys: "dd", desc: "delete a line" },
          { keys: "G o", desc: "add a line at the end" },
        ],
        task: "Fix the typo in <code>Shoping</code>, remove the duplicated <code>bread</code> and add <code>- cheese</code> at the end.",
        text: "Shoping list:\n- milk\n- bread\n- bread\n- eggs",
        target: "Shopping list:\n- milk\n- bread\n- eggs\n- cheese",
        solution: "fpap<Esc>jjddGo- cheese<Esc>",
        optimal: 20,
      },
      {
        id: "pr-config",
        title: "Tidy a config file",
        intro: `Config files are a perfect playground for <kbd>$</kbd>, <kbd>ciw</kbd> / <kbd>ciW</kbd>, <kbd>x</kbd> and <kbd>r</kbd>.
          Remember: <kbd>ciW</kbd> changes a whole WORD such as <code>localhost</code> or an IP address.`,
        keys: [
          { keys: "ciw / ciW", desc: "change word / WORD" },
          { keys: "r{c}", desc: "replace one character" },
          { keys: "0 x", desc: "go to start and delete" },
        ],
        task: "Bind to <code>0.0.0.0</code>, use port <code>8080</code>, enable the <code>debug</code> line and set <code>workers</code> to <code>4</code>.",
        text: "# server settings\nhost = localhost\nport = 8000\n# debug = true\nworkers = 2",
        target: "# server settings\nhost = 0.0.0.0\nport = 8080\ndebug = true\nworkers = 4",
        solution: "j$ciW0.0.0.0<Esc>j$ciw8080<Esc>j0xxj$r4",
        optimal: 31,
      },
      {
        id: "pr-recipe",
        title: "Fix the recipe",
        intro: `Two steps of this recipe are swapped and a step is missing. Moving a line is just <kbd>dd</kbd> followed by
          <kbd>p</kbd> or <kbd>P</kbd>. A new line between two others? <kbd>o</kbd>.`,
        keys: [
          { keys: "ddp", desc: "swap with the line below" },
          { keys: "o", desc: "open a line below" },
        ],
        task: "Put the steps in the right order and add the missing step <code>5. Remove the tea bag</code>.",
        text: "1. Boil water\n3. Pour water into cup\n2. Add tea bag\n4. Wait 3 minutes\n6. Enjoy",
        target: "1. Boil water\n2. Add tea bag\n3. Pour water into cup\n4. Wait 3 minutes\n5. Remove the tea bag\n6. Enjoy",
        solution: "jddpjo5. Remove the tea bag<Esc>",
        optimal: 28,
      },
      {
        id: "pr-sentences",
        title: "Proper sentences",
        intro: `Each line should be a proper sentence: capital first letter and a period at the end.
          <kbd>~</kbd> toggles the case of a character, <kbd>A</kbd> appends at the end of the line.`,
        keys: [
          { keys: "~", desc: "toggle case" },
          { keys: "A", desc: "append at line end" },
          { keys: "j0", desc: "start of the next line" },
        ],
        task: "Capitalize the first letter of every line and end each line with a period.",
        text: "vim is fast\nvim is fun\nvim is everywhere",
        target: "Vim is fast.\nVim is fun.\nVim is everywhere.",
        solution: "~A.<Esc>j0~A.<Esc>j0~A.<Esc>",
        optimal: 16,
      },
      {
        id: "pr-doubled-words",
        title: "Doubled words",
        intro: `Writing fast leads to doubled words and stray spaces. <kbd>daw</kbd> removes a word together with its space,
          <kbd>f␣</kbd> (f + Space) jumps to the next space and <kbd>x</kbd> removes it.`,
        keys: [
          { keys: "daw", desc: "delete a word with its space" },
          { keys: "f␣ x", desc: "find a space and delete it" },
          { keys: "w", desc: "next word" },
        ],
        task: "Remove the doubled words and the extra spaces.",
        text: "This  is is a sentence with with  doubled words.",
        target: "This is a sentence with doubled words.",
        solution: "f xwwdawfwdawf x",
        optimal: 16,
      },
      {
        id: "pr-blanks",
        title: "Fill in the blanks",
        intro: `Search is a motion too. <kbd>/___</kbd> jumps to the first blank, <kbd>n</kbd> to the next one.
          Since <kbd>_</kbd> counts as a word character, <kbd>cw</kbd> changes the whole blank.`,
        keys: [
          { keys: "/___", desc: "search for a blank" },
          { keys: "n", desc: "next blank" },
          { keys: "cw", desc: "change the blank" },
        ],
        task: "Fill the blanks so the line reads <code>The quick brown fox jumps over the lazy dog.</code>",
        text: "The ___ brown fox jumps over the ___ dog.",
        target: "The quick brown fox jumps over the lazy dog.",
        solution: "/___<CR>cwquick<Esc>ncwlazy<Esc>",
        optimal: 21,
      },
    ],
  },
  {
    id: "practice-refactoring",
    title: "Practice: Real-World Refactoring",
    summary: "Advanced drills: substitutions, block edits, text objects and Ex commands on real code.",
    lessons: [
      {
        id: "pr-rename",
        title: "Rename a variable",
        intro: `Renaming with <code>:%s</code> is risky when the name is part of other words. A neat trick: put the cursor on the word,
          press <kbd>*</kbd> (which searches for the whole word) and then use an <em>empty</em> pattern —
          <code>:%s//new/g</code> reuses the last search.`,
        keys: [
          { keys: "*", desc: "search whole word under cursor" },
          { keys: ":%s//new/g", desc: "replace the last search" },
        ],
        task: "Rename <code>cnt</code> to <code>count</code> everywhere, but leave <code>item.cntr</code> untouched.",
        text: "let cnt = 0;\nfor (const item of items) {\n    cnt += item.cntr;\n}\nconsole.log(cnt);",
        target: "let count = 0;\nfor (const item of items) {\n    count += item.cntr;\n}\nconsole.log(count);",
        solution: "w*:%s//count/g<CR>",
        optimal: 15,
      },
      {
        id: "pr-object",
        title: "Build an object",
        intro: `Combine block visual mode, opening lines and indentation. <kbd>Ctrl-v</kbd> + <kbd>$A</kbd> appends to every line,
          <kbd>O</kbd> and <kbd>o</kbd> add the braces and <kbd>&gt;</kbd> on a linewise selection indents the body.`,
        keys: [
          { keys: "Ctrl-v $ A", desc: "append to every line" },
          { keys: "O / o", desc: "open line above / below" },
          { keys: "V >", desc: "indent selected lines" },
        ],
        task: "Wrap the properties into <code>const user = { … };</code> with a trailing comma on each property and 4-space indentation.",
        text: "name: 'Ada'\nrole: 'engineer'\nyear: 1843",
        target: "const user = {\n    name: 'Ada',\n    role: 'engineer',\n    year: 1843,\n};",
        solution: "<C-v>2j$A,<Esc>Oconst user = {<Esc>Go};<Esc>ggjVjj>",
        optimal: 35,
      },
      {
        id: "pr-swap-args",
        title: "Swap arguments",
        intro: `Capture groups make <code>:s</code> incredibly powerful. In Vim's pattern syntax <code>\\(…\\)</code> is a group,
          <code>\\w\\+</code> one or more word characters, and <code>\\1</code>, <code>\\2</code> insert the groups in the replacement.`,
        keys: [
          { keys: "\\( \\)", desc: "capture group" },
          { keys: "\\w\\+", desc: "one or more word chars" },
          { keys: "\\1 \\2", desc: "use groups in replacement" },
        ],
        task: "Swap the two arguments of every <code>move</code> call.",
        text: "move(x1, y1);\nmove(x2, y2);\nmove(x3, y3);",
        target: "move(y1, x1);\nmove(y2, x2);\nmove(y3, x3);",
        solution: ":%s/(\\(\\w\\+\\), \\(\\w\\+\\))/(\\2, \\1)/<CR>",
        optimal: 35,
      },
      {
        id: "pr-table",
        title: "CSV to Markdown table",
        intro: `Several small substitutions often beat one giant one. <code>^</code> matches the start of a line and
          <code>$</code> the end, so <code>:%s/^/| /</code> prefixes every line.`,
        keys: [
          { keys: ":%s/^/x/", desc: "prefix every line" },
          { keys: ":%s/$/x/", desc: "suffix every line" },
          { keys: ":%s/,/x/g", desc: "replace every comma" },
        ],
        task: "Turn the CSV into Markdown table rows: <code>| Alice | 30 | Berlin |</code>",
        text: "name,age,city\nAlice,30,Berlin\nBob,25,Paris",
        target: "| name | age | city |\n| Alice | 30 | Berlin |\n| Bob | 25 | Paris |",
        solution: ":%s/^/| /<CR>:%s/,/ | /g<CR>:%s/$/ |/<CR>",
        optimal: 32,
      },
      {
        id: "pr-log",
        title: "Clean up a log",
        intro: `Ex commands chain nicely. <code>:v/pattern/d</code> keeps only the matching lines and <code>:sort u</code>
          sorts them while removing duplicates.`,
        keys: [
          { keys: ":v/pat/d", desc: "delete non-matching lines" },
          { keys: ":sort u", desc: "sort and remove duplicates" },
        ],
        task: "Keep only the <code>ERROR</code> lines, sorted and without duplicates.",
        text: "INFO server started\nERROR disk full\nINFO request /home\nERROR timeout\nWARN slow query\nERROR disk full\nINFO request /about",
        target: "ERROR disk full\nERROR timeout",
        solution: ":v/ERROR/d<CR>:sort u<CR>",
        optimal: 19,
      },
      {
        id: "pr-fetch",
        title: "Rewrite a request",
        intro: `Text objects work from anywhere on the line: <kbd>ci"</kbd> jumps to the next string, <kbd>ci{</kbd> changes everything
          inside the braces. Two commands rewrite the whole call.`,
        keys: [
          { keys: 'ci"', desc: "change the next string" },
          { keys: "f{ ci{", desc: "change inside braces" },
        ],
        task: 'Change the URL to <code>https://new.example.com/v2</code> and the options to <code>{ method: "POST", cache: "no-store" }</code>.',
        text: 'fetch("http://old.example.com/api", { method: "GET" });',
        target: 'fetch("https://new.example.com/v2", { method: "POST", cache: "no-store" });',
        solution: 'ci"https://new.example.com/v2<Esc>f{ci{ method: "POST", cache: "no-store" <Esc>',
        optimal: 71,
      },
    ],
  },
];
