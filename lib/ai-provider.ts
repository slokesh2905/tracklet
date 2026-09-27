import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { extractReasoningMiddleware, wrapLanguageModel, type LanguageModel } from "ai";

export type AiProvider = "nvidia" | "gateway";

type Env = Record<string, string | undefined>;

/**
 * Which model backend powers AI features:
 * - nvidia:  NVIDIA API catalog (build.nvidia.com), free key, OpenAI-compatible
 * - gateway: Vercel AI Gateway. Opt-in via AI_GATEWAY_API_KEY, or AI_GATEWAY=oidc
 *            on Vercel (the team needs a card on file, even for free credits)
 * With neither, AI features are hidden rather than failing at request time.
 */
export function pickAiProvider(e: Env = process.env): AiProvider | null {
  if (e.NVIDIA_API_KEY) return "nvidia";
  if (e.AI_GATEWAY_API_KEY || e.AI_GATEWAY === "oidc") return "gateway";
  return null;
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  nvidia: "nvidia/nemotron-3-super-120b-a12b",
  gateway: "anthropic/claude-haiku-4.5",
};

export function aiModelId(e: Env = process.env) {
  const provider = pickAiProvider(e);
  return e.AI_MODEL || (provider ? DEFAULT_MODEL[provider] : "none");
}

let nvidiaModel: LanguageModel | null = null;

export function getModel(): LanguageModel {
  const provider = pickAiProvider();
  if (!provider) throw new Error("No AI provider configured (set NVIDIA_API_KEY or AI_GATEWAY_API_KEY)");

  if (provider === "gateway") return aiModelId();

  if (!nvidiaModel) {
    const nvidia = createOpenAICompatible({
      name: "nvidia",
      baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY,
      supportsStructuredOutputs: true,
    });
    // Nemotron reasoning models can emit <think>…</think>; keep it out of the answer.
    nvidiaModel = wrapLanguageModel({
      model: nvidia(aiModelId()),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  }
  return nvidiaModel;
}
