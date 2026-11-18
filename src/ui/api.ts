import type { ProgressData } from "./progress";

export interface User {
  username: string;
  email: string | null;
  emailVerified: boolean;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      keepalive,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "The server is not reachable.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>("GET", "/api/me").then((r) => r.user),
  register: (username: string, email: string, password: string) =>
    request<{ user: User }>("POST", "/api/register", { username, email, password }).then((r) => r.user),
  login: (login: string, password: string) => request<{ user: User }>("POST", "/api/login", { login, password }).then((r) => r.user),
  verifyEmail: (token: string) => request<{ ok: true; user: User | null }>("POST", "/api/email/verify", { token }),
  resendVerification: () => request<{ ok: true; alreadyVerified?: boolean }>("POST", "/api/email/resend", {}),
  forgotPassword: (email: string) => request<{ ok: true }>("POST", "/api/password/forgot", { email }),
  resetPassword: (token: string, password: string) =>
    request<{ user: User }>("POST", "/api/password/reset", { token, password }).then((r) => r.user),
  logout: () => request<{ ok: true }>("POST", "/api/logout", {}),
  getProgress: () => request<{ progress: ProgressData | null }>("GET", "/api/progress").then((r) => r.progress),
  saveProgress: (data: ProgressData, keepalive = false) => request<{ ok: true }>("PUT", "/api/progress", data, keepalive),
};
