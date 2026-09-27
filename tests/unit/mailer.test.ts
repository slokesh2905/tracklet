import { describe, expect, it } from "vitest";
import { pickEmailProvider } from "@/lib/mailer";

const gmail = { GMAIL_USER: "me@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" };
const resend = { RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "Tracklet <onboarding@resend.dev>" };

describe("pickEmailProvider", () => {
  it("prefers Gmail over Resend when both are configured", () => {
    expect(pickEmailProvider({ ...gmail, ...resend })).toBe("gmail");
    expect(pickEmailProvider(resend)).toBe("resend");
  });

  it("uses the E2E outbox only off Vercel", () => {
    expect(pickEmailProvider({ ...gmail, EMAIL_OUTBOX_FILE: "/tmp/o" })).toBe("outbox");
    expect(pickEmailProvider({ ...gmail, EMAIL_OUTBOX_FILE: "/tmp/o", VERCEL: "1" })).toBe("gmail");
  });

  it("needs both halves of a credential pair", () => {
    expect(pickEmailProvider({ GMAIL_USER: "me@gmail.com" })).toBeNull();
    expect(pickEmailProvider({ RESEND_API_KEY: "re_x" })).toBeNull();
  });

  it("falls back to the console only in development", () => {
    expect(pickEmailProvider({ NODE_ENV: "development" })).toBe("console");
    expect(pickEmailProvider({ NODE_ENV: "production" })).toBeNull();
  });
});
