/**
 * Single source of truth for all VITE_* env vars.
 * Never read import.meta.env outside this module.
 */

const e = import.meta.env;

const num = (v: string | undefined, d: number): number => {
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: string | undefined, d: boolean): boolean => {
  if (v == null || v === "") return d;
  return /^(1|true|yes|on)$/i.test(v);
};

export const env = {
  // mood
  anthropic: {
    key:    e.VITE_ANTHROPIC_API_KEY ?? "",
    model:  e.VITE_ANTHROPIC_MODEL   ?? "claude-sonnet-4-6",
    thinkingBudget: num(e.VITE_ANTHROPIC_THINKING_BUDGET, 2048),
    promptCache: bool(e.VITE_ANTHROPIC_PROMPT_CACHE, true),
  },
  geminiMood: {
    key:   e.VITE_GEMINI_API_KEY ?? "",
    model: e.VITE_GEMINI_MOOD_MODEL ?? "gemini-2.5-pro",
  },
  // asr
  asr: {
    primary: (e.VITE_ASR_PRIMARY ?? "openai") as "openai" | "gemini" | "assemblyai",
    openai: {
      key:   e.VITE_OPENAI_API_KEY ?? "",
      // whisper-1 is the only OpenAI model that returns word/segment
      // timestamps. gpt-4o-transcribe is text-only, unusable for lyric sync.
      model: e.VITE_OPENAI_TRANSCRIBE_MODEL ?? "whisper-1",
    },
    gemini: {
      key:   e.VITE_GEMINI_API_KEY ?? "",
      model: e.VITE_GEMINI_ASR_MODEL ?? "gemini-2.5-pro",
    },
    assemblyai: {
      key: e.VITE_ASSEMBLYAI_API_KEY ?? "",
    },
  },
  relay: {
    url: e.VITE_RELAY_URL ?? "http://127.0.0.1:8787",
  },
  behavior: {
    streaming: bool(e.VITE_STREAMING, true),
    filesApiThresholdMb: num(e.VITE_USE_FILES_API_THRESHOLD_MB, 18),
  },
} as const;

export type Env = typeof env;
