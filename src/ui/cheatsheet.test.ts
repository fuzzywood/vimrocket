// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { CheatSheetWindow } from "./cheatsheet";

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(k: string): string | null {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.items.set(k, v);
  }
  removeItem(k: string): void {
    this.items.delete(k);
  }
  clear(): void {
    this.items.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });

const saved = (): { x: number; y: number; open: boolean } => JSON.parse(localStorage.getItem("learnvim.cheatsheet.v2")!);

function pointer(target: Element, type: string, x: number, y: number, init: PointerEventInit = {}): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, ...init }));
}

describe("CheatSheetWindow dragging", () => {
  let win: CheatSheetWindow;
  let head: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    win = new CheatSheetWindow();
    document.body.append(win.el);
    win.setOpen(true);
    head = win.el.querySelector(".float-head")!;
  });

  it("moves with the pointer and saves the position on release", () => {
    const start = saved();
    pointer(head, "pointerdown", 400, 100);
    expect(win.el.classList.contains("dragging")).toBe(true);
    pointer(head, "pointermove", 300, 160);
    pointer(head, "pointerup", 300, 160);
    expect(win.el.classList.contains("dragging")).toBe(false);
    expect(saved().x).toBe(start.x - 100);
    expect(saved().y).toBe(start.y + 60);
  });

  it("stops following the pointer when the gesture is cancelled", () => {
    pointer(head, "pointerdown", 400, 100);
    pointer(head, "pointermove", 380, 110);
    pointer(head, "pointercancel", 380, 110);
    const after = saved();
    pointer(head, "pointermove", 100, 300);
    expect(win.el.classList.contains("dragging")).toBe(false);
    pointer(head, "pointerup", 100, 300);
    expect(saved()).toEqual(after);
  });

  it("ignores other mouse buttons and the close button", () => {
    pointer(head, "pointerdown", 400, 100, { button: 2 });
    expect(win.el.classList.contains("dragging")).toBe(false);
    pointer(head.querySelector(".float-close")!, "pointerdown", 400, 100);
    expect(win.el.classList.contains("dragging")).toBe(false);
  });

  it("keeps the title bar reachable and resets on double-click", () => {
    const start = saved();
    pointer(head, "pointerdown", 400, 100);
    pointer(head, "pointerup", -5000, -5000);
    pointer(head, "pointerdown", 400, 100);
    pointer(head, "pointermove", -5000, -5000);
    pointer(head, "pointerup", -5000, -5000);
    expect(saved().y).toBe(0);
    expect(saved().x).toBeGreaterThan(-5000);
    head.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(saved().x).toBe(start.x);
    expect(saved().y).toBe(start.y);
  });
});
