import { describe, expect, it, vi } from "vitest";
import { isPushConfigured, pushPayload, sendPush, type PushTarget } from "@/lib/push";

const target: PushTarget = { endpoint: "https://push.example/abc", p256dh: "key", auth: "secret" };
const payload = pushPayload({ kind: "price_drop", productId: "p1", productName: "Boat Airdopes 141", newPrice: 1299, currency: "INR" });

describe("isPushConfigured", () => {
  it("needs all three values", () => {
    const all = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.test" };
    expect(isPushConfigured(all)).toBe(true);
    expect(isPushConfigured({ ...all, VAPID_PRIVATE_KEY: "" })).toBe(false);
    expect(isPushConfigured({})).toBe(false);
  });
});

describe("pushPayload", () => {
  it("links to the product and replaces an earlier notification for it", () => {
    expect(payload).toMatchObject({ url: "/products/p1", tag: "product-p1", icon: "/icons/192" });
    expect(payload.body).toContain("Boat Airdopes 141");
    expect(payload.body).toContain("1,299");
  });
});

describe("sendPush", () => {
  it("reports success and sends the payload as JSON", async () => {
    const sender = vi.fn(async () => ({}));
    expect(await sendPush(target, payload, sender)).toBe("ok");
    expect(sender).toHaveBeenCalledWith(target, JSON.stringify(payload));
  });

  it.each([404, 410])("reports a %i as gone so the subscription can be removed", async (statusCode) => {
    const sender = vi.fn(async () => {
      throw Object.assign(new Error("gone"), { statusCode });
    });
    expect(await sendPush(target, payload, sender)).toBe("gone");
  });

  it("keeps the subscription after other failures", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sender = vi.fn(async () => {
      throw Object.assign(new Error("busy"), { statusCode: 503 });
    });
    expect(await sendPush(target, payload, sender)).toBe("error");
    spy.mockRestore();
  });
});
