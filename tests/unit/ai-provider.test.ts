import { describe, expect, it } from "vitest";
import { aiModelId, pickAiProvider } from "@/lib/ai-provider";

describe("pickAiProvider", () => {
  it("prefers NVIDIA, then an opted-in gateway, else off", () => {
    expect(pickAiProvider({ NVIDIA_API_KEY: "nvapi-x", AI_GATEWAY_API_KEY: "k" })).toBe("nvidia");
    expect(pickAiProvider({ AI_GATEWAY_API_KEY: "k" })).toBe("gateway");
    expect(pickAiProvider({ AI_GATEWAY: "oidc" })).toBe("gateway");
    expect(pickAiProvider({})).toBeNull();
  });

  it("does not treat a Vercel OIDC token alone as AI being available", () => {
    expect(pickAiProvider({ VERCEL: "1", VERCEL_OIDC_TOKEN: "t" })).toBeNull();
  });
});

describe("aiModelId", () => {
  it("uses a provider default unless AI_MODEL overrides it", () => {
    expect(aiModelId({ NVIDIA_API_KEY: "nvapi-x" })).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(aiModelId({ AI_GATEWAY_API_KEY: "k" })).toBe("anthropic/claude-haiku-4.5");
    expect(aiModelId({ NVIDIA_API_KEY: "nvapi-x", AI_MODEL: "nvidia/nemotron-nano-3-30b-a3b" })).toBe(
      "nvidia/nemotron-nano-3-30b-a3b"
    );
  });
});
