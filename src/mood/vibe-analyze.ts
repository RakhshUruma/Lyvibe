/**
 * Vibe analyzer — feed an audio (or video) file to Gemini and get back a
 * short Japanese-friendly mood-brief seed (60-120 chars). Designed to be
 * dropped straight into the moodPrompt textarea so the user can iterate
 * without writing the first version.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../env";

const VIBE_PROMPT = `この音声の冒頭を聴き、曲の vibe(雰囲気・色・動き・温度感・シーン)を日本語で60〜140字で描写してください。

ルール:
- 歌詞の文字起こしは禁止。雰囲気を語る言葉だけ。
- 具体的な視覚イメージ・比喩・色名・動きの種類を入れる。
- "色: ◯◯ / 動き: ◯◯" のような構造化はせず、自然な散文1段落で。
- 引用符・カッコ・改行・前置きの「この曲は」等は不要。本文のみ。

例:
深紅と漆黒のホラーの夜、心臓の鼓動のような重低音、霧の中で蝶が舞う
夏の海岸、爽やかな風とパステル色の波、遠くに花火が散る
冷たい都市の雨、ネオンのにじみ、グリッチが走るサイバーパンク`;

const blobToBase64 = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

const audioMime = (f: File): string => {
  const t = (f.type || "").toLowerCase();
  if (t === "video/mp4" || t === "video/quicktime" || t === "video/x-m4v") return "audio/mp4";
  if (t === "video/webm")     return "audio/webm";
  if (t === "video/ogg")      return "audio/ogg";
  if (t.startsWith("video/")) return "audio/mp4";
  return t || "audio/mpeg";
};

export const analyzeVibe = async (file: File): Promise<string> => {
  if (!env.geminiMood.key) throw new Error("gemini key required (vibe analysis uses Gemini multimodal)");
  const sizeMB = file.size / 1024 / 1024;
  if (sizeMB > 18) {
    throw new Error(
      `audio is ${sizeMB.toFixed(1)}MB — vibe analysis uses inline upload up to 18MB. Trim to a shorter clip.`,
    );
  }
  const ai = new GoogleGenerativeAI(env.geminiMood.key);
  const model = ai.getGenerativeModel({
    model: env.geminiMood.model,
    generationConfig: { temperature: 0.85 },
  });
  const b64 = await blobToBase64(file);
  const r = await model.generateContent([
    { inlineData: { mimeType: audioMime(file), data: b64 } },
    { text: VIBE_PROMPT },
  ]);
  const txt = r.response.text().trim();
  if (!txt) {
    const fr = (r.response as any).candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`gemini empty (finishReason=${fr})`);
  }
  // strip surrounding quotes if Gemini included any
  return txt.replace(/^["「『]|["」』]$/g, "").trim();
};
