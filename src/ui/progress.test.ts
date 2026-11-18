// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mergeProgress, Progress, type ProgressData } from "./progress";

describe("mergeProgress", () => {
  it("unions lessons and keeps the best results", () => {
    const a: ProgressData = { lessons: { x: { completedAt: 5, bestKeys: 10 }, y: { completedAt: 1, bestKeys: 3 } }, last: "x" };
    const b: ProgressData = { lessons: { x: { completedAt: 2, bestKeys: 12 }, z: { completedAt: 9, bestKeys: 4 } }, last: "z" };
    expect(mergeProgress(a, b)).toEqual({
      lessons: { x: { completedAt: 2, bestKeys: 10 }, y: { completedAt: 1, bestKeys: 3 }, z: { completedAt: 9, bestKeys: 4 } },
      last: "z",
    });
  });
});

describe("Progress sync", () => {
  it("merges guest progress into the account and saves remotely", async () => {
    vi.useFakeTimers();
    try {
      const progress = new Progress();
      progress.complete("guest-lesson", 5);
      const save = vi.fn().mockResolvedValue({ ok: true });
      progress.connect({ save }, { lessons: { "server-lesson": { completedAt: 1, bestKeys: 9 } } });
      expect(progress.isDone("guest-lesson")).toBe(true);
      expect(progress.isDone("server-lesson")).toBe(true);
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledTimes(1);
      expect(Object.keys(save.mock.calls[0][0].lessons).sort()).toEqual(["guest-lesson", "server-lesson"]);
      expect(progress.syncState).toBe("saved");

      progress.complete("another", 7);
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledTimes(2);

      progress.disconnect();
      expect(progress.isDone("server-lesson")).toBe(false);
      expect(progress.isDone("guest-lesson")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports failed saves", async () => {
    vi.useFakeTimers();
    try {
      const progress = new Progress();
      progress.connect({ save: vi.fn().mockRejectedValue(new Error("offline")) }, null);
      await vi.advanceTimersByTimeAsync(500);
      expect(progress.syncState).toBe("error");
    } finally {
      vi.useRealTimers();
    }
  });
});
