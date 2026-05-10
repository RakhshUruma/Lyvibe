import { env } from "../env";
import type { Mood } from "./schema";
import { normalizeMood } from "./normalize";
import { generateTextAnthropic, type MoodGenOptions } from "./anthropic";
import { generateTextRelay, probeRelay } from "./relay";
import { generateTextGemini, generateMoodJsonGemini } from "./gemini";
import { MOOD_SYSTEM_PROMPT } from "./prompt";
import {
  BRIEF_SYSTEM_PROMPT,
  buildBriefUserPrompt,
  buildMoodUserPromptWithBrief,
} from "./prompt-brief";

export type SourceStatus = "?" | "ok" | "err" | "busy";
export type StatusReport = {
  anthropic: SourceStatus;
  relay:     SourceStatus;
  gemini:    SourceStatus;
  lastError?: string;
  source?: "anthropic" | "relay" | "gemini";
  cacheHit?: boolean;
  ms?: number;
};

export type GenerateOptions = MoodGenOptions & {
  onStatus?: (s: StatusReport) => void;
  onStage?:  (s: "brief" | "json") => void;
  onBrief?:  (brief: string) => void;
  /** When true, skip the brief stage entirely — single LLM call straight
   *  from vibe to mood JSON. ~3-4× faster, slightly less creative. */
  quick?: boolean;
};

export type GenerateResult = {
  mood: Mood;
  raw: string;
  brief: string;
  status: StatusReport;
};

const noteErr = (s: string[], who: string, e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  s.push(`${who}: ${msg}`);
};

/** Try a generator across sources in priority order. */
const tryEachSource = async <T>(
  status: StatusReport,
  errors: string[],
  opts: GenerateOptions,
  fns: {
    anthropic?: () => Promise<T>;
    relay?:     () => Promise<T>;
    gemini?:    () => Promise<T>;
  },
): Promise<{ value: T; source: "anthropic" | "relay" | "gemini" }> => {
  if (env.anthropic.key && fns.anthropic) {
    status.anthropic = "busy"; opts.onStatus?.(status);
    try {
      const v = await fns.anthropic();
      status.anthropic = "ok"; status.source = "anthropic";
      opts.onStatus?.(status);
      return { value: v, source: "anthropic" };
    } catch (e) {
      status.anthropic = "err"; noteErr(errors, "anthropic", e);
      opts.onStatus?.(status);
    }
  }
  if (fns.relay) {
    status.relay = "busy"; opts.onStatus?.(status);
    try {
      const v = await fns.relay();
      status.relay = "ok"; status.source = "relay";
      opts.onStatus?.(status);
      return { value: v, source: "relay" };
    } catch (e) {
      status.relay = "err"; noteErr(errors, "relay", e);
      opts.onStatus?.(status);
    }
  }
  if (env.geminiMood.key && fns.gemini) {
    status.gemini = "busy"; opts.onStatus?.(status);
    try {
      const v = await fns.gemini();
      status.gemini = "ok"; status.source = "gemini";
      opts.onStatus?.(status);
      return { value: v, source: "gemini" };
    } catch (e) {
      status.gemini = "err"; noteErr(errors, "gemini", e);
      opts.onStatus?.(status);
    }
  }
  throw new Error(errors.join(" | ") || "all sources failed");
};

const extractJson = (s: string): string => {
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i === -1 || j === -1 || j < i) throw new Error("no JSON object found in response");
  return s.slice(i, j + 1);
};

/**
 * Two-stage mood generation.
 *   Stage 1: vibe → vivid prose brief (entry/motion/bg/atmosphere)
 *   Stage 2: brief + vibe → mood JSON keyframes
 *
 * Each stage independently dispatches anthropic → relay → gemini.
 * Sources are not pinned to one stage; if anthropic succeeds for the brief
 * but is rate-limited for stage 2, the dispatcher will fall through.
 */
export const generateMood = async (
  vibe: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> => {
  const status: StatusReport = { anthropic: "?", relay: "?", gemini: "?" };
  const errors: string[] = [];
  const t0 = performance.now();

  // === QUICK mode — skip the brief, single LLM call ===
  if (opts.quick) {
    opts.onStage?.("json");
    const userPrompt =
      `vibe: ${vibe.trim()}\n\nReturn the mood JSON now. No brief intermediate. ` +
      `Make sure useTypewriter is true, bgKeyframes are referenced from bgCssVariants, ` +
      `and motionRecipes/entryRecipes are populated where appropriate.`;
    const jsonRes = await tryEachSource(status, errors, opts, {
      anthropic: () =>
        generateTextAnthropic(MOOD_SYSTEM_PROMPT, userPrompt, opts, { maxTokens: 4096, thinking: false }),
      relay: () =>
        generateTextRelay(MOOD_SYSTEM_PROMPT, userPrompt, opts.signal),
      gemini: () =>
        generateMoodJsonGemini(MOOD_SYSTEM_PROMPT, userPrompt),
    });
    const raw = extractJson(jsonRes.value);
    const mood = normalizeMood(JSON.parse(raw));
    status.ms = Math.round(performance.now() - t0);
    status.source = jsonRes.source;
    opts.onStatus?.(status);
    return { mood, raw, brief: "(quick mode — no brief)", status };
  }

  // === Stage 1: brief ===
  opts.onStage?.("brief");
  const briefRes = await tryEachSource(status, errors, opts, {
    anthropic: () =>
      generateTextAnthropic(BRIEF_SYSTEM_PROMPT, buildBriefUserPrompt(vibe), opts, { maxTokens: 800 }),
    relay: () =>
      generateTextRelay(BRIEF_SYSTEM_PROMPT, buildBriefUserPrompt(vibe), opts.signal),
    gemini: () =>
      generateTextGemini(BRIEF_SYSTEM_PROMPT, buildBriefUserPrompt(vibe)),
  });
  const brief = briefRes.value.trim();
  opts.onBrief?.(brief);

  // === Stage 2: mood JSON ===
  opts.onStage?.("json");
  // reset status flags (stage 2 may use a different source)
  const jsonRes = await tryEachSource(status, errors, opts, {
    anthropic: () =>
      generateTextAnthropic(
        MOOD_SYSTEM_PROMPT,
        buildMoodUserPromptWithBrief(vibe, brief),
        opts,
        { maxTokens: 4096, thinking: brief.length > 600 },
      ),
    relay: () =>
      generateTextRelay(MOOD_SYSTEM_PROMPT, buildMoodUserPromptWithBrief(vibe, brief), opts.signal),
    gemini: () =>
      generateMoodJsonGemini(MOOD_SYSTEM_PROMPT, buildMoodUserPromptWithBrief(vibe, brief)),
  });

  const raw = extractJson(jsonRes.value);
  const mood = normalizeMood(JSON.parse(raw));
  status.ms = Math.round(performance.now() - t0);
  status.source = jsonRes.source;
  opts.onStatus?.(status);
  return { mood, raw, brief, status };
};

export const probeMoodSources = async (): Promise<StatusReport> => {
  const s: StatusReport = { anthropic: "?", relay: "?", gemini: "?" };
  s.anthropic = env.anthropic.key ? "ok" : "err";
  s.gemini    = env.geminiMood.key ? "ok" : "err";
  s.relay     = (await probeRelay()) ? "ok" : "err";
  return s;
};
