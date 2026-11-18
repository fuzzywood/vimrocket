import { describe, expect, it } from "vitest";
import { highlightLine } from "./highlight";

const tokensOf = (text: string): string[] => {
  const t = highlightLine(text);
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && t[j] === t[i]) j++;
    if (t[i]) out.push(`${t[i]}:${text.slice(i, j)}`);
    i = j;
  }
  return out;
};

describe("highlightLine", () => {
  it("highlights code", () => {
    expect(tokensOf('const x = log("hi", 42); // done')).toEqual([
      "kw:const", "op:=", "fn:log", "punc:(", 'str:"hi"', "punc:,", "num:42", "punc:);", "com:// done",
    ]);
  });

  it("keeps prose mostly plain", () => {
    expect(tokensOf("Roses are red in 2 colors")).toEqual(["num:2"]);
    expect(tokensOf("## Things to try")).toEqual(["head:## Things to try"]);
    expect(tokensOf("   - apples")).toEqual(["list:-"]);
  });
});
