import "server-only";
import type { ReactElement } from "react";
import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

export type EmailProvider = "outbox" | "gmail" | "resend" | "console";

type Env = Record<string, string | undefined>;

/**
 * Which transport sends email, in priority order:
 * - outbox: E2E tests (never on Vercel, so a stray variable can't swallow real mail)
 * - gmail:  free, any recipient, ~500/day, no domain needed (Google app password)
 * - resend: needs a verified domain to reach anyone but the account owner
 * - console: local development without credentials (links are printed)
 */
export function pickEmailProvider(e: Env = process.env): EmailProvider | null {
  if (e.EMAIL_OUTBOX_FILE && !e.VERCEL) return "outbox";
  if (e.GMAIL_USER && e.GMAIL_APP_PASSWORD) return "gmail";
  if (e.RESEND_API_KEY && e.RESEND_FROM_EMAIL) return "resend";
  if (e.NODE_ENV === "development") return "console";
  return null;
}

export type EmailOptions = {
  to: string;
  subject: string;
  react: ReactElement;
  /** Extra data recorded by the outbox/console providers (e.g. the magic link). */
  meta?: Record<string, string>;
  /** Adds List-Unsubscribe headers, which mailbox providers reward for notifications. */
  unsubscribeUrl?: string;
};

let gmail: Transporter | null = null;
let resend: Resend | null = null;

function gmailTransport() {
  gmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      // Google shows app passwords as "abcd efgh ijkl mnop"; spaces are not part of it.
      pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, ""),
    },
  });
  return gmail;
}

export async function sendEmail({ to, subject, react, meta = {}, unsubscribeUrl }: EmailOptions) {
  const provider = pickEmailProvider();

  switch (provider) {
    case "outbox": {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(process.env.EMAIL_OUTBOX_FILE!, JSON.stringify({ to, subject, meta, at: Date.now() }) + "\n");
      return;
    }
    case "console":
      console.info(`[email] to=${to} subject="${subject}"`, meta);
      return;
    case "gmail": {
      const [html, text] = await Promise.all([render(react), render(react, { plainText: true })]);
      await gmailTransport().sendMail({
        from: { name: process.env.EMAIL_FROM_NAME ?? "Tracklet", address: process.env.GMAIL_USER! },
        to,
        subject,
        html,
        text,
        ...(unsubscribeUrl ? { list: { unsubscribe: { url: unsubscribeUrl, comment: "Manage notifications" } } } : {}),
      });
      return;
    }
    case "resend": {
      resend ??= new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to,
        subject,
        react,
        ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } } : {}),
      });
      if (error) throw new Error(`Resend: ${error.message}`);
      return;
    }
    default:
      throw new Error("No email provider configured (set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY + RESEND_FROM_EMAIL)");
  }
}
