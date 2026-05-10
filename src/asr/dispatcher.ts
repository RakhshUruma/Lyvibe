import { env } from "../env";
import type { Lyrics } from "../lyrics/schema";
import { transcribeOpenAI } from "./openai";
import { transcribeGemini } from "./gemini";
import { transcribeAssemblyAI } from "./assemblyai";

export type ASRSource = "openai" | "gemini" | "assemblyai";
export type ASRStatus = {
  openai: "?" | "ok" | "err" | "busy";
  gemini: "?" | "ok" | "err" | "busy";
  assemblyai: "?" | "ok" | "err" | "busy";
  source?: ASRSource;
  ms?: number;
  lastError?: string;
};

const order = (): ASRSource[] => {
  const primary = env.asr.primary;
  const all: ASRSource[] = ["openai", "gemini", "assemblyai"];
  return [primary, ...all.filter(x => x !== primary)];
};

const has = (s: ASRSource): boolean => {
  if (s === "openai")     return !!env.asr.openai.key;
  if (s === "gemini")     return !!env.asr.gemini.key;
  if (s === "assemblyai") return !!env.asr.assemblyai.key;
  return false;
};

const run = async (s: ASRSource, file: File): Promise<Lyrics> => {
  if (s === "openai") {
    // OpenAI inline limit 25MB — auto-promote to gemini
    if (file.size > 25 * 1024 * 1024 && env.asr.gemini.key) {
      return transcribeGemini(file);
    }
    return transcribeOpenAI(file);
  }
  if (s === "gemini")     return transcribeGemini(file);
  return transcribeAssemblyAI(file);
};

export const transcribe = async (
  file: File,
  onStatus?: (s: ASRStatus) => void,
): Promise<{ lyrics: Lyrics; status: ASRStatus }> => {
  const status: ASRStatus = { openai: "?", gemini: "?", assemblyai: "?" };
  const errs: string[] = [];
  const t0 = performance.now();

  for (const s of order()) {
    if (!has(s)) { (status as any)[s] = "err"; continue; }
    (status as any)[s] = "busy"; onStatus?.(status);
    try {
      const lyrics = await run(s, file);
      (status as any)[s] = "ok";
      status.source = s;
      status.ms = Math.round(performance.now() - t0);
      onStatus?.(status);
      return { lyrics, status };
    } catch (e) {
      (status as any)[s] = "err";
      errs.push(`${s}: ${e instanceof Error ? e.message : String(e)}`);
      onStatus?.(status);
    }
  }

  status.lastError = errs.join(" | ");
  onStatus?.(status);
  throw new Error(status.lastError || "all ASR sources failed");
};

export const probeASR = (): ASRStatus => ({
  openai:     env.asr.openai.key     ? "ok" : "err",
  gemini:     env.asr.gemini.key     ? "ok" : "err",
  assemblyai: env.asr.assemblyai.key ? "ok" : "err",
});
