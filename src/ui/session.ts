import { api, type User } from "./api";
import type { Progress } from "./progress";

export class Session {
  user: User | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly progress: Progress) {
    window.addEventListener("pagehide", () => {
      if (this.progress.hasPendingSave) void this.progress.flush(true);
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  async init(): Promise<void> {
    try {
      const user = await api.me();
      if (user) await this.attach(user);
    } catch {
      /* server unavailable: stay a guest */
    }
  }

  async login(login: string, password: string): Promise<void> {
    await this.attach(await api.login(login, password));
  }

  async register(username: string, email: string, password: string): Promise<void> {
    await this.attach(await api.register(username, email, password));
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await api.resetPassword(token, password);
    if (this.user) this.progress.disconnect();
    await this.attach(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const result = await api.verifyEmail(token);
    if (result.user && this.user) {
      this.user = result.user;
      this.notify();
    }
  }

  async resendVerification(): Promise<boolean> {
    const result = await api.resendVerification();
    if (result.alreadyVerified && this.user) {
      this.user = { ...this.user, emailVerified: true };
      this.notify();
    }
    return !result.alreadyVerified;
  }

  async logout(): Promise<void> {
    await this.progress.flush();
    await api.logout().catch(() => undefined);
    this.user = null;
    this.progress.disconnect();
    this.notify();
  }

  private async attach(user: User): Promise<void> {
    const serverData = await api.getProgress();
    this.user = user;
    this.progress.connect({ save: (data, keepalive) => api.saveProgress(data, keepalive) }, serverData);
    this.notify();
  }
}
