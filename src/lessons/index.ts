import { advanced } from "./advanced";
import { basics } from "./basics";
import { practice } from "./practice";
import { withTests } from "./tests";
import type { Chapter, Lesson } from "./types";

export const chapters: Chapter[] = withTests([...basics, ...advanced, ...practice]);

export interface LessonRef {
  chapter: Chapter;
  lesson: Lesson;
  chapterIndex: number;
  lessonIndex: number;
  globalIndex: number;
}

export const allLessons: LessonRef[] = chapters.flatMap((chapter, chapterIndex) =>
  chapter.lessons.map((lesson, lessonIndex) => ({ chapter, lesson, chapterIndex, lessonIndex, globalIndex: 0 })),
).map((ref, i) => ({ ...ref, globalIndex: i }));

export const findLesson = (id: string): LessonRef | undefined => allLessons.find((r) => r.lesson.id === id);
