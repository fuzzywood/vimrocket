const GUEST_KEY = "learnvim.progress.v1";
const SAVE_DELAY = 400;

export interface LessonProgress {
  completedAt: number;
  bestKeys: number;
}

export interface ProgressData {
  lessons: Record<string, LessonProgress>;
  last?: string;
}

export interface RemoteStore {
  save(data: ProgressData, keepalive?: boolean): Promise<unknown>;
}

export type SyncState = "local" | "saved" | "saving" | "error";

const empty = (): ProgressData => ({ lessons: {} });

export function mergeProgress(a: ProgressData, b: ProgressData): ProgressData {
  const lessons: Record<string, LessonProgress> = { ...a.lessons };
  for (const [id, p] of Object.entries(b.lessons)) {
    const prev = lessons[id];
    lessons[id] = prev
      ? { completedAt: Math.min(prev.completedAt, p.completedAt), bestKeys: Math.min(prev.bestKeys, p.bestKeys) }
      : p;
  }
  return { lessons, last: b.last ?? a.last };
}

function readGuest(): ProgressData {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProgressData;
      if (parsed && typeof parsed.lessons === "object") return parsed;
    }
  } catch {
    /* storage unavailable */
  }
  return empty();
}

function writeGuest(data: ProgressData | null): void {
  try {
    if (data) localStorage.setItem(GUEST_KEY, JSON.stringify(data));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class Progress {
  private data: ProgressData = readGuest();
  private remote: RemoteStore | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  syncState: SyncState = "local";

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  private changed(): void {
    if (this.remote) this.scheduleSave();
    else writeGuest(this.data);
    this.notify();
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.syncState = "saving";
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  async flush(keepalive = false): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const remote = this.remote;
    if (!remote) return;
    try {
      await remote.save(this.data, keepalive);
      if (this.remote === remote && !this.saveTimer) this.syncState = "saved";
    } catch {
      if (this.remote === remote) this.syncState = "error";
    }
    this.notify();
  }

  get hasPendingSave(): boolean {
    return this.saveTimer !== undefined;
  }

  connect(remote: RemoteStore, serverData: ProgressData | null): void {
    const guest = this.remote ? empty() : this.data;
    this.data = mergeProgress(serverData ?? empty(), guest);
    this.remote = remote;
    writeGuest(null);
    const needsUpload = Object.keys(guest.lessons).length > 0 || !serverData;
    if (needsUpload) this.scheduleSave();
    else this.syncState = "saved";
    this.notify();
  }

  disconnect(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.remote = null;
    this.data = readGuest();
    this.syncState = "local";
    this.notify();
  }

  get(id: string): LessonProgress | undefined {
    return this.data.lessons[id];
  }

  isDone(id: string): boolean {
    return id in this.data.lessons;
  }

  complete(id: string, keys: number): { firstTime: boolean; improved: boolean } {
    const prev = this.data.lessons[id];
    const improved = !prev || keys < prev.bestKeys;
    this.data.lessons[id] = {
      completedAt: prev?.completedAt ?? Date.now(),
      bestKeys: prev ? Math.min(prev.bestKeys, keys) : keys,
    };
    this.changed();
    return { firstTime: !prev, improved };
  }

  get last(): string | undefined {
    return this.data.last;
  }

  set last(id: string | undefined) {
    if (this.data.last === id) return;
    this.data.last = id;
    this.changed();
  }

  count(ids: string[]): number {
    return ids.filter((id) => this.isDone(id)).length;
  }

  reset(): void {
    this.data = empty();
    this.changed();
  }
}
