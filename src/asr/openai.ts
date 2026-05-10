import OpenAI from "openai";
import { env } from "../env";
import type { Lyrics, Segment } from "../lyrics/schema";

let _c: OpenAI | null = null;
const client = (): OpenAI => {
  if (_c) return _c;
  if (!env.asr.openai.key) throw new Error("openai: no key");
  _c = new OpenAI({ apiKey: env.asr.openai.key, dangerouslyAllowBrowser: true });
  return _c;
};

/**
 * Whisper-1 returns segment + word timestamps via verbose_json.
 * gpt-4o-transcribe / -mini-transcribe ONLY support text/json — no timestamps.
 * For a lyric video we need timestamps, so whisper-1 is the right default.
 *
 * If the configured model lacks timestamp support, we still return a single
 * synthetic segment (start=0, end=audio length) so the user sees text appear,
 * but for proper sync they should switch to whisper-1.
 */
const supportsTimestamps = (model: string): boolean =>
  /whisper/i.test(model);

const guessAudioDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio(url);
    a.addEventListener("loadedmetadata", () => {
      const d = a.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    }, { once: true });
    a.addEventListener("error", () => { URL.revokeObjectURL(url); resolve(0); }, { once: true });
  });

export const transcribeOpenAI = async (file: File): Promise<Lyrics> => {
  const c = client();
  const model = env.asr.openai.model;

  if (supportsTimestamps(model)) {
    const r: any = await c.audio.transcriptions.create({
      file,
      model,
      response_format: "verbose_json",
      timestamp_granularities: ["segment", "word"],
    });
    const segments: Segment[] = (r.segments ?? []).map((s: any) => ({
      start: Number(s.start ?? 0),
      end:   Number(s.end ?? 0),
      text:  String(s.text ?? "").trim(),
      words: Array.isArray(s.words)
        ? s.words.map((w: any) => ({
            start: Number(w.start ?? 0),
            end:   Number(w.end ?? 0),
            word:  String(w.word ?? w.text ?? ""),
          }))
        : undefined,
    })).filter((s: Segment) => s.text);
    return { segments, language: r.language };
  }

  // gpt-4o-transcribe / gpt-4o-mini-transcribe path: no timestamps available.
  const r: any = await c.audio.transcriptions.create({
    file,
    model,
    response_format: "json",
  });
  const text = String(r.text ?? "").trim();
  if (!text) return { segments: [], language: r.language };
  const dur = await guessAudioDuration(file);
  return {
    segments: [{ start: 0, end: dur || 30, text }],
    language: r.language,
  };
};
