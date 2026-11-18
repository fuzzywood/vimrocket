import { describe, expect, it } from "vitest";
import { tokenizeKeys } from "../vim/ex";
import { VimEngine } from "../vim/engine";
import { allLessons, chapters } from "./index";
import { isComplete, isTest, tasksOf } from "./types";

describe("lessons", () => {
  it("have unique ids", () => {
    const ids = allLessons.map((r) => r.lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("end every non-practice chapter with a three-task test", () => {
    for (const chapter of chapters) {
      const last = chapter.lessons[chapter.lessons.length - 1];
      const practice = chapter.id.startsWith("practice-");
      expect(isTest(last), chapter.id).toBe(!practice);
      if (!practice) expect(tasksOf(last)).toHaveLength(3);
    }
  });

  for (const { lesson } of allLessons) {
    tasksOf(lesson).forEach((task, i) => {
      it(`${lesson.id} task ${i + 1} is solvable and not pre-solved`, () => {
        const vim = new VimEngine();
        vim.load(task.text, task.cursor);
        if (task.setup) vim.feed(tokenizeKeys(task.setup));
        expect(isComplete(task, vim)).toBe(false);
        vim.feed(tokenizeKeys(task.solution));
        expect(vim.text).toBe(task.target ?? vim.text);
        expect(isComplete(task, vim)).toBe(true);
      });
    });
  }
});
