import nodemailer from "nodemailer";
import type { SmtpConfig } from "./config.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  verify?(): Promise<void>;
}

export function createSmtpMailer(smtp: SmtpConfig, from: string): Mailer {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
    async verify() {
      await transport.verify();
    },
  };
}

export function createConsoleMailer(): Mailer {
  return {
    async send(message) {
      console.log(`\n[mail] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    },
  };
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, intro: string, action: string, link: string, outro: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0f1115;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6e8ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1e27;border:1px solid #2b3140;border-radius:14px">
<tr><td style="padding:32px">
<p style="margin:0 0 6px;color:#7ee787;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">LearnVim</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;line-height:1.55;color:#cdd2dd">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#7ee787;color:#0b1a0d;font-weight:700;text-decoration:none">${escapeHtml(action)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#9aa3b5">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${escapeHtml(link)}" style="color:#56d4dd">${escapeHtml(link)}</a></p>
<p style="margin:0;font-size:13px;color:#9aa3b5">${escapeHtml(outro)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function verificationEmail(to: string, username: string, link: string): MailMessage {
  const intro = `Hi ${username}, please confirm your email address so you can recover your account if you ever forget your password.`;
  const outro = "The link is valid for 48 hours. If you did not create an account, you can ignore this email.";
  return {
    to,
    subject: "Confirm your email address",
    text: `${intro}\n\nConfirm your email: ${link}\n\n${outro}\n`,
    html: layout("Confirm your email address", intro, "Confirm email", link, outro),
  };
}

export function passwordResetEmail(to: string, username: string, link: string): MailMessage {
  const intro = `Hi ${username}, somebody (hopefully you) asked to reset the password of your LearnVim account.`;
  const outro = "The link is valid for 1 hour and can be used once. If you did not request this, you can ignore this email — your password stays unchanged.";
  return {
    to,
    subject: "Reset your password",
    text: `${intro}\n\nChoose a new password: ${link}\n\n${outro}\n`,
    html: layout("Reset your password", intro, "Choose a new password", link, outro),
  };
}
