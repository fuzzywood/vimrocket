import { ApiError, api } from "../api";
import { h } from "../dom";
import type { Session } from "../session";
import type { Page } from "./lesson";

export type AuthView = "login" | "register" | "forgot" | "reset" | "verify" | "account";

interface FieldOptions {
  name: string;
  label: string;
  type?: string;
  autocomplete: string;
  help?: string;
  minlength?: number;
  maxlength?: number;
}

function input(opts: FieldOptions): { el: HTMLElement; input: HTMLInputElement } {
  const el = h("input", {
    name: opts.name,
    type: opts.type ?? "text",
    autocomplete: opts.autocomplete,
    required: true,
    minlength: opts.minlength,
    maxlength: opts.maxlength ?? 200,
    autocapitalize: "none",
    spellcheck: "false",
  });
  return {
    input: el,
    el: h("label", { class: "field" }, h("span", { class: "field-label" }, opts.label), el, opts.help ? h("span", { class: "field-help" }, opts.help) : null),
  };
}

const errorMessage = (err: unknown): string => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

function card(eyebrow: string, title: string, lead: string, ...content: (HTMLElement | null)[]): HTMLElement {
  return h(
    "div",
    { class: "page auth" },
    h("div", { class: "auth-card" }, h("p", { class: "eyebrow" }, eyebrow), h("h1", {}, title), h("p", { class: "lead" }, lead), ...content),
  );
}

interface FormSpec {
  fields: { el: HTMLElement }[];
  submit: string;
  footer?: HTMLElement;
  validate?: () => string | null;
  action: () => Promise<void>;
}

function form(spec: FormSpec): HTMLFormElement {
  const error = h("p", { class: "form-error", role: "alert", hidden: true });
  const button = h("button", { class: "btn primary", type: "submit" }, spec.submit);
  const onSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    error.hidden = true;
    const problem = spec.validate?.() ?? null;
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    button.disabled = true;
    try {
      await spec.action();
    } catch (err) {
      error.textContent = errorMessage(err);
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
  return h(
    "form",
    { class: "auth-form", novalidate: true, onsubmit: (e: Event) => void onSubmit(e) },
    spec.fields.map((f) => f.el),
    error,
    button,
    spec.footer ?? null,
  );
}

const switchLine = (text: string, label: string, href: string): HTMLElement =>
  h("p", { class: "auth-switch" }, `${text} `, h("a", { href }, label));

function loginPage(session: Session, onSignedIn: () => void): Page {
  const login = input({ name: "login", label: "Username or email", autocomplete: "username" });
  const password = input({ name: "password", label: "Password", type: "password", autocomplete: "current-password" });
  const el = card(
    "Account",
    "Welcome back",
    "Sign in to continue where you left off — on any device.",
    form({
      fields: [login, password],
      submit: "Sign in",
      footer: h(
        "div",
        { class: "auth-links" },
        h("a", { href: "/forgot" }, "Forgot password?"),
        switchLine("No account yet?", "Create one", "/register"),
      ),
      action: async () => {
        await session.login(login.input.value.trim(), password.input.value);
        onSignedIn();
      },
    }),
  );
  return { el, mount: () => login.input.focus(), dispose: () => undefined };
}

function registerPage(session: Session, onSignedIn: () => void): Page {
  const username = input({ name: "username", label: "Username", autocomplete: "username", help: "3–32 characters: letters, digits, . _ -", minlength: 3, maxlength: 32 });
  const email = input({ name: "email", label: "Email", type: "email", autocomplete: "email", help: "We send a confirmation link and use it for password resets only.", maxlength: 254 });
  const password = input({ name: "password", label: "Password", type: "password", autocomplete: "new-password", help: "At least 8 characters", minlength: 8 });
  const confirm = input({ name: "confirm", label: "Repeat password", type: "password", autocomplete: "new-password" });
  const el = card(
    "Account",
    "Create an account",
    "Save your progress on the server so it follows you to every browser. Lessons you already finished here are kept.",
    form({
      fields: [username, email, password, confirm],
      submit: "Create account",
      footer: switchLine("Already registered?", "Sign in", "/login"),
      validate: () => (password.input.value !== confirm.input.value ? "The passwords do not match." : null),
      action: async () => {
        await session.register(username.input.value.trim(), email.input.value.trim(), password.input.value);
        onSignedIn();
      },
    }),
  );
  return { el, mount: () => username.input.focus(), dispose: () => undefined };
}

function forgotPage(): Page {
  const email = input({ name: "email", label: "Email", type: "email", autocomplete: "email", maxlength: 254 });
  const container = h("div");
  const done = (address: string): void => {
    container.replaceChildren(
      h(
        "div",
        { class: "auth-notice" },
        h("strong", {}, "Check your inbox"),
        h("p", {}, `If an account exists for ${address}, we have sent a link to reset the password. It is valid for one hour.`),
        h("a", { class: "btn", href: "/login" }, "Back to sign in"),
      ),
    );
  };
  container.append(
    form({
      fields: [email],
      submit: "Send reset link",
      footer: switchLine("Remembered it?", "Sign in", "/login"),
      action: async () => {
        const address = email.input.value.trim();
        await api.forgotPassword(address);
        done(address);
      },
    }),
  );
  const el = card("Account", "Forgot your password?", "Enter the email address of your account and we will send you a link to choose a new password.", container);
  return { el, mount: () => email.input.focus(), dispose: () => undefined };
}

function resetPage(session: Session, token: string, onSignedIn: () => void): Page {
  if (!token) {
    return {
      el: card("Account", "Link incomplete", "This reset link is missing its token. Please request a new one.", h("a", { class: "btn primary", href: "/forgot" }, "Request a new link")),
      dispose: () => undefined,
    };
  }
  const password = input({ name: "password", label: "New password", type: "password", autocomplete: "new-password", help: "At least 8 characters", minlength: 8 });
  const confirm = input({ name: "confirm", label: "Repeat new password", type: "password", autocomplete: "new-password" });
  const el = card(
    "Account",
    "Choose a new password",
    "After saving you are signed in. All other devices are signed out for safety.",
    form({
      fields: [password, confirm],
      submit: "Save new password",
      footer: switchLine("Link expired?", "Request a new one", "/forgot"),
      validate: () => (password.input.value !== confirm.input.value ? "The passwords do not match." : null),
      action: async () => {
        await session.resetPassword(token, password.input.value);
        onSignedIn();
      },
    }),
  );
  return { el, mount: () => password.input.focus(), dispose: () => undefined };
}

function verifyPage(session: Session, token: string): Page {
  const status = h("div", { class: "auth-notice" }, h("p", {}, "Confirming your email address…"));
  const el = card("Account", "Email confirmation", "One moment please.", status);
  const show = (title: string, text: string, ok: boolean): void => {
    status.className = `auth-notice${ok ? " success" : " failure"}`;
    status.replaceChildren(
      h("strong", {}, title),
      h("p", {}, text),
      h("a", { class: "btn primary", href: ok ? "/" : "/account" }, ok ? "Continue learning" : "Go to your account"),
    );
  };
  const run = async (): Promise<void> => {
    if (!token) return show("Link incomplete", "This confirmation link is missing its token.", false);
    try {
      await session.verifyEmail(token);
      show("Email confirmed", "Thank you! You can now reset your password by email whenever you need to.", true);
    } catch (err) {
      show("Confirmation failed", `${errorMessage(err)} You can request a new link from your account page.`, false);
    }
  };
  return { el, mount: () => void run(), dispose: () => undefined };
}

function accountPage(session: Session): Page {
  const user = session.user!;
  const notice = h("p", { class: "account-feedback", role: "status" });
  const resend = h("button", { class: "btn small" }, "Resend confirmation email");
  resend.addEventListener("click", async () => {
    resend.disabled = true;
    try {
      notice.textContent = (await session.resendVerification()) ? "A new confirmation link is on its way." : "Your email is already confirmed.";
    } catch (err) {
      notice.textContent = errorMessage(err);
    } finally {
      resend.disabled = false;
    }
  });
  const emailRow = user.email
    ? h(
        "div",
        { class: "account-email" },
        h("span", { class: "field-label" }, "Email"),
        h("span", {}, user.email, " ", h("span", { class: `badge ${user.emailVerified ? "ok" : "warn"}` }, user.emailVerified ? "confirmed" : "not confirmed")),
        user.emailVerified ? null : h("div", { class: "account-email-actions" }, resend, notice),
      )
    : h("p", { class: "field-help" }, "This account was created before email addresses were introduced, so password resets are not available for it.");
  const el = card(
    "Account",
    `Hi, ${user.username}`,
    "You are signed in. Your progress is saved to your account automatically.",
    emailRow,
    h(
      "div",
      { class: "hero-actions" },
      h("a", { class: "btn primary", href: "/" }, "Back to the course"),
      h("button", { class: "btn", onclick: () => void session.logout() }, "Sign out"),
    ),
  );
  return { el, dispose: () => undefined };
}

export function renderAuth(view: AuthView, session: Session, onSignedIn: () => void, token = ""): Page {
  switch (view) {
    case "verify":
      return verifyPage(session, token);
    case "reset":
      return resetPage(session, token, onSignedIn);
    case "forgot":
      return session.user ? accountPage(session) : forgotPage();
    case "register":
      return session.user ? accountPage(session) : registerPage(session, onSignedIn);
    case "account":
    case "login":
      return session.user ? accountPage(session) : loginPage(session, onSignedIn);
  }
}
