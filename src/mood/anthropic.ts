import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

let _client: Anthropic | null = null;
const client = (): Anthropic => {
  if (_client) return _client;
  if (!env.anthropic.key) throw new Error("anthropic: no key");
  _client = new Anthropic({
    apiKey: env.anthropic.key,
    dangerouslyAllowBrowser: true,
  });
  return _client;
};

export type MoodGenOptions = {
  onPartial?: (partialText: string) => void;
  signal?: AbortSignal;
};

/**
 * Low-level text generation against Anthropic.
 * - Prompt caching on the system block (when enabled).
 * - Optional extended thinking budget.
 * - Streaming when env.behavior.streaming.
 * Returns the raw assistant text (no JSON extraction).
 */
export const generateTextAnthropic = async (
  systemPrompt: string,
  userPrompt: string,
  opts: MoodGenOptions = {},
  config: { maxTokens?: number; thinking?: boolean } = {},
): Promise<string> => {
  const c = client();
  const useStream = env.behavior.streaming;
  const useThinking = (config.thinking ?? false) && env.anthropic.thinkingBudget > 0;

  const systemBlock = env.anthropic.promptCache
    ? [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }]
    : systemPrompt;

  const baseParams = {
    model: env.anthropic.model,
    max_tokens: config.maxTokens ?? 2048,
    system: systemBlock as any,
    messages: [{ role: "user" as const, content: userPrompt }],
    ...(useThinking && {
      thinking: { type: "enabled" as const, budget_tokens: env.anthropic.thinkingBudget },
    }),
  };

  if (useStream) {
    let acc = "";
    const stream = c.messages.stream(baseParams as any, { signal: opts.signal });
    stream.on("text", (chunk: string) => {
      acc += chunk;
      opts.onPartial?.(acc);
    });
    const final = await stream.finalMessage();
    return final.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }

  const resp = await c.messages.create(baseParams as any);
  return (resp.content as any[])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
};
