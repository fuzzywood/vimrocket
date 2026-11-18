import type { VimEngine } from "../vim/engine";
import type { Pos } from "../vim/types";

export interface KeyHint {
  keys: string;
  desc: string;
}

export interface Task {
  task: string;
  text: string;
  cursor?: Pos;
  setup?: string;
  target?: string;
  check?: (vim: VimEngine) => boolean;
  solution: string;
  optimal?: number;
  hint?: string;
}

interface LessonMeta {
  id: string;
  title: string;
  intro: string;
  keys: KeyHint[];
}

export type SingleLesson = LessonMeta & Task;

export interface TestLesson extends LessonMeta {
  tasks: Task[];
}

export type Lesson = SingleLesson | TestLesson;

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export const isTest = (lesson: Lesson): lesson is TestLesson => "tasks" in lesson;

export const tasksOf = (lesson: Lesson): Task[] => (isTest(lesson) ? lesson.tasks : [lesson]);

export const totalOptimal = (lesson: Lesson): number | undefined => {
  const values = tasksOf(lesson).map((t) => t.optimal);
  return values.every((v) => v !== undefined) ? values.reduce((a, b) => a! + b!, 0) : undefined;
};

export const isComplete = (task: Task, vim: VimEngine): boolean => {
  if (vim.mode !== "normal") return false;
  if (task.target !== undefined && vim.text !== task.target) return false;
  return task.check ? task.check(vim) : true;
};

export const cursorAt = (line: number, col?: number) => (vim: VimEngine): boolean =>
  vim.cursor.line === line && (col === undefined || vim.cursor.col === col);
