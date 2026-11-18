import { describe, expect, it } from "vitest";
import { VimEngine } from "./engine";
import { tokenizeKeys } from "./ex";

function run(text: string, keys: string, cursor = { line: 0, col: 0 }): VimEngine {
  const vim = new VimEngine();
  vim.load(text, cursor);
  vim.feed(tokenizeKeys(keys));
  return vim;
}

describe("motions", () => {
  it("moves by words", () => {
    expect(run("foo bar.baz qux", "w").cursor.col).toBe(4);
    expect(run("foo bar.baz qux", "ww").cursor.col).toBe(7);
    expect(run("foo bar.baz qux", "W").cursor.col).toBe(4);
    expect(run("foo bar.baz qux", "WW").cursor.col).toBe(12);
    expect(run("foo bar", "e").cursor.col).toBe(2);
    expect(run("foo bar", "$b").cursor.col).toBe(4);
    expect(run("foo\n\nbar", "w").cursor).toEqual({ line: 1, col: 0 });
  });

  it("handles counts and lines", () => {
    expect(run("a\nb\nc\nd", "2j").cursor.line).toBe(2);
    expect(run("a\nb\nc\nd", "G").cursor.line).toBe(3);
    expect(run("a\nb\nc\nd", "Ggg").cursor.line).toBe(0);
    expect(run("a\nb\nc\nd", "3G").cursor.line).toBe(2);
  });

  it("keeps desired column", () => {
    const vim = run("hello world\nhi\nhello world", "$jj");
    expect(vim.cursor).toEqual({ line: 2, col: 10 });
  });

  it("finds characters", () => {
    expect(run("a,b,c,d", "f,").cursor.col).toBe(1);
    expect(run("a,b,c,d", "f,;;").cursor.col).toBe(5);
    expect(run("a,b,c,d", "t,").cursor.col).toBe(0);
    expect(run("a,b,c,d", "2f,").cursor.col).toBe(3);
    expect(run("abc\nxyz", "fy").cursor).toEqual({ line: 1, col: 1 });
    expect(run("abc\nxyz", "Gfy0Fb").cursor).toEqual({ line: 0, col: 1 });
    expect(run("a,b\nc,d", "f,;").cursor).toEqual({ line: 1, col: 1 });
    expect(run("a,b\nc,d", "Gf,,").cursor).toEqual({ line: 0, col: 1 });
    expect(run("ab\ncd", "tc").cursor).toEqual({ line: 0, col: 1 });
    expect(run("ab\ncd", "dfc").text).toBe("d");
  });

  it("matches brackets", () => {
    expect(run("if (a(b)) x", "%").cursor.col).toBe(8);
  });

  it("searches", () => {
    const vim = run("foo bar foo baz foo", "/foo<CR>");
    expect(vim.cursor.col).toBe(8);
    vim.feed(["n"]);
    expect(vim.cursor.col).toBe(16);
    vim.feed(["N"]);
    expect(vim.cursor.col).toBe(8);
    expect(run("cat dog cat", "*").cursor.col).toBe(8);
    const star = run("cat dog cat", "*");
    expect(star.searchHighlight).toBe(true);
    star.feed(["<Esc>"]);
    expect(star.searchHighlight).toBe(false);
    star.feed(["n"]);
    expect(star.searchHighlight).toBe(true);
  });
});

describe("operators", () => {
  it("deletes words and lines", () => {
    expect(run("one two three", "dw").text).toBe("two three");
    expect(run("one two three", "d2w").text).toBe("three");
    expect(run("one two\nthree", "wdw").text).toBe("one \nthree");
    expect(run("a\nb\nc", "dd").text).toBe("b\nc");
    expect(run("a\nb\nc", "2dd").text).toBe("c");
    expect(run("a\nb\nc", "dj").text).toBe("c");
    expect(run("hello world", "wD").text).toBe("hello ");
    expect(run("hello", "x").text).toBe("ello");
    expect(run("hello", "3x").text).toBe("lo");
  });

  it("changes text", () => {
    expect(run("one two", "cwuno<Esc>").text).toBe("uno two");
    expect(run("one two", "ciwX<Esc>").text).toBe("X two");
    expect(run('say "hello" now', 'ci"bye<Esc>').text).toBe('say "bye" now');
    expect(run("call(a, b)", "f(ci(x<Esc>").text).toBe("call(x)");
    expect(run("call(a, b)", "f(da(").text).toBe("call");
    expect(run("call(a, b)", "ci(x<Esc>").text).toBe("call(x)");
    expect(run("call(a, (b))", "fbci(x<Esc>").text).toBe("call(a, (x))");
    expect(run("f(a,\n  b)", "jci(x<Esc>").text).toBe("f(x)");
    expect(run("if (a) {\n  b();\n}", "ci{x<Esc>").text).toBe("if (a) {\n  x\n}");
    expect(run("  foo bar", "ccbaz<Esc>").text).toBe("  baz");
    expect(run("one two three", "wdaw").text).toBe("one three");
  });

  it("yanks and puts", () => {
    expect(run("a\nb", "yyp").text).toBe("a\na\nb");
    expect(run("a\nb", "yyP").text).toBe("a\na\nb");
    expect(run("ab", "xp").text).toBe("ba");
    expect(run("one two", "yiwwviwp").text).toBe("one one");
    expect(run("a\nb\nc", "ddp").text).toBe("b\na\nc");
    expect(run("x", '"ayy"Ayy"ap').text).toBe("x\nx\nx");
  });

  it("indents and changes case", () => {
    expect(run("foo", ">>").text).toBe("    foo");
    expect(run("    foo", "<<").text).toBe("foo");
    expect(run("hello", "gUiw").text).toBe("HELLO");
    expect(run("Hello", "g~~").text).toBe("hELLO");
    expect(run("hello", "~~").text).toBe("HEllo");
  });

  it("joins lines", () => {
    expect(run("foo\n   bar", "J").text).toBe("foo bar");
    expect(run("a\nb\nc", "3J").text).toBe("a b c");
  });
});

describe("insert mode", () => {
  it("inserts and appends", () => {
    expect(run("bc", "ia<Esc>").text).toBe("abc");
    expect(run("ab", "ax<Esc>").text).toBe("axb");
    expect(run("ab", "A!<Esc>").text).toBe("ab!");
    expect(run("  ab", "$I-<Esc>").text).toBe("  -ab");
    expect(run("a", "onew<Esc>").text).toBe("a\nnew");
    expect(run("a", "Onew<Esc>").text).toBe("new\na");
    expect(run("", "3ihi <Esc>").text).toBe("hi hi hi ");
    expect(run("ab", "ax<BS>y<Esc>").text).toBe("ayb");
  });

  it("moves cursor left on escape", () => {
    expect(run("abc", "A<Esc>").cursor.col).toBe(2);
  });

  it("replaces characters", () => {
    expect(run("abc", "rx").text).toBe("xbc");
    expect(run("abcd", "Rxy<Esc>").text).toBe("xycd");
  });
});

describe("undo, redo, repeat", () => {
  it("undoes and redoes", () => {
    const vim = run("a b c", "dwdw");
    expect(vim.text).toBe("c");
    vim.feed(["u"]);
    expect(vim.text).toBe("b c");
    vim.feed(["u"]);
    expect(vim.text).toBe("a b c");
    vim.feed(["<C-r>"]);
    expect(vim.text).toBe("b c");
  });

  it("treats insert session as one change", () => {
    expect(run("x", "ahello<Esc>u").text).toBe("x");
  });

  it("repeats with dot", () => {
    expect(run("a b c d", "dw..").text).toBe("d");
    expect(run("x\nx\nx", "A;<Esc>j.j.").text).toBe("x;\nx;\nx;");
    expect(run("foo foo foo", "cwbar<Esc>w.w.").text).toBe("bar bar bar");
    expect(run("a b c d e", "dw2.").text).toBe("d e");
  });
});

describe("visual mode", () => {
  it("deletes selections", () => {
    expect(run("hello world", "vlld").text).toBe("lo world");
    expect(run("a\nb\nc", "Vjd").text).toBe("c");
    expect(run("one two", "viwy$p").text).toBe("one twoone");
  });

  it("supports block insert", () => {
    expect(run("a\nb\nc", "<C-v>jjI- <Esc>").text).toBe("- a\n- b\n- c");
    expect(run("ab\ncd", "<C-v>jx").text).toBe("b\nd");
    expect(run("a\nbb", "<C-v>j$A;<Esc>").text).toBe("a;\nbb;");
  });

  it("shifts and cases selections", () => {
    expect(run("a\nb", "Vj>").text).toBe("    a\n    b");
    expect(run("abc", "vlU").text).toBe("ABc");
  });
});

describe("ex commands", () => {
  it("substitutes", () => {
    expect(run("foo foo\nfoo", ":s/foo/bar/<CR>").text).toBe("bar foo\nfoo");
    expect(run("foo foo\nfoo", ":%s/foo/bar/g<CR>").text).toBe("bar bar\nbar");
    expect(run("a-b", ":s/\\(a\\)-\\(b\\)/\\2-\\1/<CR>").text).toBe("b-a");
    expect(run("a\nb\nc", "Vj:s/$/!/<CR>").text).toBe("a!\nb!\nc");
  });

  it("deletes, moves and goes to lines", () => {
    expect(run("a\nb\nc", ":2d<CR>").text).toBe("a\nc");
    expect(run("a\nb\nc", ":3<CR>").cursor.line).toBe(2);
    expect(run("a\nb\nc", ":1m$<CR>").text).toBe("b\nc\na");
    expect(run("a\nb\nc", ":1t.<CR>").text).toBe("a\na\nb\nc");
    expect(run("a1\nb\na2", ":g/a/d<CR>").text).toBe("b");
    expect(run("a1\nb\na2", ":v/a/d<CR>").text).toBe("a1\na2");
    expect(run("c\na\nb", ":sort<CR>").text).toBe("a\nb\nc");
  });

  it("runs normal commands", () => {
    expect(run("a\nb", ":%norm A;<CR>").text).toBe("a;\nb;");
  });

  it("reports unknown commands", () => {
    expect(run("a", ":foo<CR>").messageIsError).toBe(true);
  });
});

describe("macros", () => {
  it("records and replays", () => {
    expect(run("1\n2\n3", "qaA.<Esc>jq2@a").text).toBe("1.\n2.\n3.");
    expect(run("a\nb\nc", "qqI* <Esc>jq@q@@").text).toBe("* a\n* b\n* c");
  });
});

describe("misc", () => {
  it("increments numbers", () => {
    expect(run("x 41 y", "<C-a>").text).toBe("x 42 y");
    expect(run("x 41 y", "5<C-x>").text).toBe("x 36 y");
  });

  it("uses marks", () => {
    const vim = run("a\nb\nc", "majjd'a");
    expect(vim.text).toBe("");
  });

  it("deletes paragraphs", () => {
    expect(run("a\nb\n\nc", "dap").text).toBe("c");
    expect(run("a\nb\n\nc", "d}").text).toBe("\nc");
    expect(run("a\n\nb\n\nc", "}").cursor.line).toBe(1);
    expect(run("a\n\nb\n\nc", "}}").cursor.line).toBe(3);
    expect(run("a\n\nb\n\nc", "G{").cursor.line).toBe(3);
    expect(run("a\n\nb\n\nc", "G{{").cursor.line).toBe(1);
  });
});
