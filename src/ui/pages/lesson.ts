import { allLessons, type LessonRef } from "../../lessons";
import { isComplete, isTest, tasksOf, totalOptimal, type Task } from "../../lessons/types";
import { tokenizeKeys } from "../../vim/ex";
import { VimEngine } from "../../vim/engine";
import { h, kbd } from "../dom";
import { EditorView } from "../editor";
import { splitKeySequence } from "../keys";
import type { Progress } from "../progress";

export interface Page {
  el: HTMLElement;
  mount?: () => void;
  dispose: () => void;
}

function stars(keys: number, optimal?: number): number {
  if (!optimal) return 3;
  if (keys <= optimal) return 3;
  if (keys <= optimal * 1.5) return 2;
  return 1;
}

const solutionKeys = (solution: string): HTMLElement =>
  h("span", { class: "solution-keys" }, splitKeySequence(solution).map((k) => kbd(k === " " ? "Space" : k)));

export function renderLesson(ref: LessonRef, progress: Progress, chapterChanged = false): Page {
  const { lesson, chapter, chapterIndex, lessonIndex, globalIndex } = ref;
  const tasks = tasksOf(lesson);
  const optimal = totalOptimal(lesson);
  const test = isTest(lesson);
  const vim = new VimEngine();
  const editor = new EditorView(vim);
  const prev = allLessons[globalIndex - 1];
  const next = allLessons[globalIndex + 1];
  let taskIndex = 0;
  let solvedKeys: (number | undefined)[] = tasks.map(() => undefined);
  let solved = false;
  let passed = false;
  let advanceTimer: number | undefined;

  const keysEl = h("span", { class: "keycount" });
  const banner = h("div", { class: "success", role: "dialog", "aria-live": "polite", hidden: true });
  const solutionEl = h("div", { class: "reveal solution", hidden: true });
  const targetEl = h("pre", { class: "target-text" });
  const targetPanel = h("div", { class: "reveal target", hidden: true }, h("span", { class: "solution-label" }, "Target"), targetEl);
  const taskText = h("p");
  const taskLabel = h("span", { class: "task-label" });
  const taskStatus = h("span", { class: "task-status" });
  const prevTaskButton = h("button", { class: "task-nav-btn", title: "Previous task", "aria-label": "Previous task" }, "‹");
  const nextTaskButton = h("button", { class: "task-nav-btn", title: "Next task", "aria-label": "Next task" }, "›");
  const taskCounter = h("span", { class: "task-counter" });
  const stepsEl = h("div", { class: "steps" });
  const taskNav = h("nav", { class: "task-nav", "aria-label": "Test tasks", hidden: !test }, prevTaskButton, taskCounter, nextTaskButton, stepsEl);
  const hintEl = h("p", { class: "hint" });
  const solutionButton = h("button", { class: "btn small toggle", "aria-expanded": "false" }, "Solution");
  const targetButton = h("button", { class: "btn small toggle", "aria-expanded": "false" }, "Target");

  const task = (): Task => tasks[taskIndex];

  const renderTaskInfo = (): void => {
    const t = task();
    taskLabel.textContent = test ? "Chapter test" : "Your task";
    taskCounter.textContent = `${taskIndex + 1}/${tasks.length}`;
    prevTaskButton.disabled = taskIndex === 0;
    nextTaskButton.disabled = taskIndex === tasks.length - 1;
    const done = solvedKeys[taskIndex];
    taskStatus.textContent = done === undefined ? "" : `✓ solved in ${done} keys`;
    taskText.innerHTML = t.task;
    hintEl.textContent = t.hint ?? "";
    hintEl.hidden = !t.hint;
    stepsEl.replaceChildren(
      ...tasks.map((_, i) =>
        h("button", {
          class: `step${solvedKeys[i] !== undefined ? " done" : ""}${i === taskIndex ? " current" : ""}`,
          title: `Task ${i + 1}${solvedKeys[i] !== undefined ? " (solved)" : ""}`,
          "aria-label": `Go to task ${i + 1}`,
          "aria-current": i === taskIndex ? "step" : undefined,
          onclick: () => goToTask(i),
        }),
      ),
    );
    solutionEl.replaceChildren(h("span", { class: "solution-label" }, "One possible solution:"), solutionKeys(t.solution));
  };

  const loadTask = (index: number): void => {
    window.clearTimeout(advanceTimer);
    taskIndex = index;
    const t = task();
    vim.load(t.text, t.cursor);
    if (t.setup) {
      vim.feed(tokenizeKeys(t.setup));
      vim.keyCount = 0;
      vim.message = "";
      vim.pending = [];
    }
    editor.resetSaved();
    solved = false;
    banner.hidden = true;
    renderTaskInfo();
    editor.render();
    update();
  };

  const goToTask = (index: number): void => {
    if (index < 0 || index >= tasks.length) return;
    loadTask(index);
    editor.focus();
  };

  prevTaskButton.addEventListener("click", () => goToTask(taskIndex - 1));
  nextTaskButton.addEventListener("click", () => goToTask(taskIndex + 1));

  const restart = (): void => {
    solvedKeys = tasks.map(() => undefined);
    passed = false;
    loadTask(0);
    editor.focus();
  };

  const totalKeys = (): number => solvedKeys.reduce<number>((sum, k) => sum + (k ?? 0), 0);

  const renderTarget = (): void => {
    const target = task().target;
    targetButton.hidden = target === undefined;
    if (target === undefined) {
      targetPanel.hidden = true;
      return;
    }
    const current = vim.text.split("\n");
    const lines = target.split("\n");
    const extra = current.length - lines.length;
    targetEl.replaceChildren(
      ...lines.map((line, i) => h("div", { class: current[i] === line ? "t-line ok" : "t-line" }, line || " ")),
      ...(extra > 0 ? [h("div", { class: "t-line extra" }, `(${extra} extra line${extra > 1 ? "s" : ""})`)] : []),
    );
  };

  const showSuccess = (): void => {
    const keys = totalKeys();
    const result = progress.complete(lesson.id, keys);
    const best = progress.get(lesson.id)?.bestKeys ?? keys;
    const s = stars(keys, optimal);
    const solutions = h(
      "div",
      { class: "success-solutions", hidden: true },
      tasks.map((t, i) =>
        h("div", { class: "success-solution" }, h("span", { class: "solution-label" }, test ? `Task ${i + 1}` : "One possible solution"), solutionKeys(t.solution)),
      ),
    );
    const toggle = h("button", { class: "btn" }, "Show solution");
    toggle.addEventListener("click", () => {
      solutions.hidden = !solutions.hidden;
      toggle.textContent = solutions.hidden ? "Show solution" : "Hide solution";
    });
    banner.replaceChildren(
      h("button", { class: "success-close", "aria-label": "Close", title: "Close", onclick: () => (banner.hidden = true) }, "×"),
      h("div", { class: "stars", "aria-label": `${s} of 3 stars` }, "★".repeat(s) + "☆".repeat(3 - s)),
      h(
        "div",
        { class: "success-text" },
        h("strong", {}, test ? "Chapter test passed!" : "Lesson complete!"),
        h(
          "span",
          {},
          `${keys} keystroke${keys === 1 ? "" : "s"}`,
          optimal ? ` · optimal ${optimal}` : "",
          !result.firstTime && result.improved ? " · new personal best!" : !result.firstTime ? ` · best ${best}` : "",
        ),
      ),
      solutions,
      h(
        "div",
        { class: "success-actions" },
        toggle,
        h("button", { class: "btn", onclick: restart }, "Try again"),
        next
          ? h("a", { class: "btn primary", href: `/lesson/${next.lesson.id}` }, test ? "Next chapter →" : "Next lesson →")
          : h("a", { class: "btn primary", href: "/" }, "Finish course 🎉"),
      ),
    );
    banner.hidden = false;
  };

  const onTaskSolved = (): void => {
    solved = true;
    const previous = solvedKeys[taskIndex];
    solvedKeys[taskIndex] = previous === undefined ? vim.keyCount : Math.min(previous, vim.keyCount);
    renderTaskInfo();
    const open = tasks.map((_, i) => (taskIndex + 1 + i) % tasks.length).find((i) => solvedKeys[i] === undefined);
    if (open !== undefined) {
      vim.setMessage(`✓ Task ${taskIndex + 1} solved — loading task ${open + 1}…`);
      editor.render();
      advanceTimer = window.setTimeout(() => loadTask(open), 900);
    } else if (!passed || !test) {
      passed = true;
      showSuccess();
    } else {
      vim.setMessage(`✓ Task ${taskIndex + 1} solved again`);
      editor.render();
    }
  };

  const update = (): void => {
    const keys = totalKeys() + (solved || solvedKeys[taskIndex] !== undefined ? 0 : vim.keyCount);
    keysEl.textContent = `Keystrokes: ${keys}${optimal ? ` · optimal ${optimal}` : ""}`;
    renderTarget();
    if (!solved && vim.keyCount > 0 && isComplete(task(), vim)) onTaskSolved();
  };

  const unsubscribe = vim.onChange(update);

  const bindToggle = (button: HTMLButtonElement, panel: HTMLElement): void => {
    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      editor.focus();
    });
  };
  bindToggle(targetButton, targetPanel);
  bindToggle(solutionButton, solutionEl);

  const el = h(
    "article",
    { class: "page split lesson" },
    h(
      "aside",
      { class: "split-panel" },
      h(
        "header",
        { class: "lesson-head" },
        h("p", { class: "eyebrow" }, `Chapter ${chapterIndex + 1}: ${chapter.title} · Lesson ${lessonIndex + 1} of ${chapter.lessons.length}`),
        h("h1", {}, lesson.title, progress.isDone(lesson.id) ? h("span", { class: "done-badge" }, "✓ done") : null),
      ),
      taskNav,
      h("div", { class: `task${test ? " test" : ""}` }, taskLabel, taskText, taskStatus),
      hintEl,
      h(
        "div",
        { class: "toolbar" },
        targetButton,
        solutionButton,
        h("span", { class: "spacer" }),
        h("button", { class: "btn small", onclick: () => { loadTask(taskIndex); editor.focus(); }, title: "Restore the original text" }, "↺ Reset"),
      ),
      keysEl,
      targetPanel,
      solutionEl,
      h(
        "section",
        { class: "explain" },
        h("div", { class: "intro", html: lesson.intro }),
        h(
          "table",
          { class: "keytable" },
          h("tbody", {}, lesson.keys.map((k) => h("tr", {}, h("td", {}, kbd(k.keys)), h("td", {}, k.desc)))),
        ),
      ),
      h(
        "footer",
        { class: "lesson-nav" },
        prev ? h("a", { class: "btn small", href: `/lesson/${prev.lesson.id}` }, `← ${prev.lesson.title}`) : h("span"),
        next ? h("a", { class: "btn small", href: `/lesson/${next.lesson.id}` }, `${next.lesson.title} →`) : h("span"),
      ),
    ),
    h("div", { class: "split-editor" }, editor.el, banner),
  );

  if (chapterChanged) {
    const toast = h(
      "div",
      { class: "chapter-toast", "aria-hidden": "true" },
      h("span", { class: "chapter-toast-num" }, `Chapter ${chapterIndex + 1}`),
      h("span", { class: "chapter-toast-title" }, chapter.title),
    );
    toast.addEventListener("animationend", () => toast.remove());
    el.querySelector(".split-editor")!.append(toast);
  }

  loadTask(0);
  progress.last = lesson.id;

  return {
    el,
    mount: () => editor.focus(),
    dispose: () => {
      window.clearTimeout(advanceTimer);
      unsubscribe();
      editor.destroy();
    },
  };
}
