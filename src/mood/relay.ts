import { env } from "../env";

/**
 * Subscription relay (compat with reference vj-relay.mjs).
 * Contract:
 *   POST /generate { prompt, model? } -> { result: string, source, raw? }
 *   GET  /health                      -> { ok, version, claude }
 */

export const generateTextRelay = async (
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> => {
  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  const r = await fetch(`${env.relay.url.replace(/\/$/, "")}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, model: env.anthropic.model }),
    signal,
  });
  if (!r.ok) throw new Error(`relay HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (typeof j?.result !== "string" || !j.result.trim()) throw new Error("relay: empty result");
  return j.result;
};

export const probeRelay = async (): Promise<boolean> => {
  try {
    const r = await fetch(`${env.relay.url.replace(/\/$/, "")}/health`, { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
};
