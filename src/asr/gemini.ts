import { GoogleGenerativeAI as ClientGenAI } from "@google/generative-ai";
import { env } from "../env";
import type { Lyrics, Segment } from "../lyrics/schema";

/**
 * Gemini ASR.
 *
 * Path A — file <= threshold: inline base64.
 * Path B — file >  threshold: Files API (server SDK upload), then reference.
 *
 * NOTE: Files API SDK is server-flavored; in browser we hit the REST endpoint directly.
 */

const TRANSCRIBE_PROMPT = `Transcribe this song's lyrics with precise timing. Return STRICT JSON:
{ "language": "...", "segments": [ { "start": <sec>, "end": <sec>, "text": "..." } ] }
- Each segment is one sung line.
- Times in seconds (decimal).
- No commentary, no markdown, JSON only.`;

const MIME = (f: File): string => f.type || "audio/mpeg";

/**
 * Base64-encode a Blob without `btoa(String.fromCharCode(...buf))` — that
 * pattern overflows the call stack for any file larger than a few hundred KB
 * because spreading a Uint8Array as function arguments hits engine arg limits.
 * FileReader.readAsDataURL is fast, async, and engine-bounded.
 */
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

const inlineTranscribe = async (file: File): Promise<Lyrics> => {
  if (!env.asr.gemini.key) throw new Error("gemini: no key");
  const ai = new ClientGenAI(env.asr.gemini.key);
  const model = ai.getGenerativeModel({
    model: env.asr.gemini.model,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const b64 = await blobToBase64(file);
  const r = await model.generateContent([
    { inlineData: { mimeType: MIME(file), data: b64 } },
    { text: TRANSCRIBE_PROMPT },
  ]);
  return parseLyricsJson(r.response.text());
};

/**
 * Files API upload via REST (works in browser).
 * https://generativelanguage.googleapis.com/upload/v1beta/files (resumable)
 * Then: pass {fileData: {mimeType, fileUri}} to generateContent.
 */
const filesApiTranscribe = async (file: File): Promise<Lyrics> => {
  if (!env.asr.gemini.key) throw new Error("gemini: no key");
  const key = env.asr.gemini.key;
  const mime = MIME(file);

  // 1) initiate resumable upload
  const init = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(file.size),
        "X-Goog-Upload-Header-Content-Type": mime,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
    },
  );
  if (!init.ok) throw new Error(`gemini upload init ${init.status}`);
  const uploadUrl = init.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("gemini upload: no upload URL");

  // 2) upload bytes
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
  });
  if (!up.ok) throw new Error(`gemini upload bytes ${up.status}`);
  const { file: meta } = await up.json();
  let { name, uri, state } = meta as { name: string; uri: string; state: string };

  // 3) poll until ACTIVE
  while (state === "PROCESSING") {
    await new Promise(r => setTimeout(r, 1000));
    const s = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${encodeURIComponent(key)}`);
    const sj = await s.json();
    state = sj.state;
    if (state === "FAILED") throw new Error("gemini file FAILED");
  }

  // 4) generateContent referencing the file
  const ai = new ClientGenAI(key);
  const model = ai.getGenerativeModel({
    model: env.asr.gemini.model,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const r = await model.generateContent([
    { fileData: { mimeType: mime, fileUri: uri } } as any,
    { text: TRANSCRIBE_PROMPT },
  ]);
  return parseLyricsJson(r.response.text());
};

const parseLyricsJson = (txt: string): Lyrics => {
  if (!txt?.trim()) throw new Error("gemini empty response");
  const i = txt.indexOf("{"), j = txt.lastIndexOf("}");
  if (i === -1 || j === -1) throw new Error("gemini: no JSON");
  const obj = JSON.parse(txt.slice(i, j + 1));
  const segments: Segment[] = (obj.segments ?? []).map((s: any) => ({
    start: Number(s.start ?? 0),
    end:   Number(s.end ?? 0),
    text:  String(s.text ?? "").trim(),
  })).filter((s: Segment) => s.text);
  return { segments, language: obj.language };
};

export const transcribeGemini = async (file: File): Promise<Lyrics> => {
  const sizeMb = file.size / (1024 * 1024);
  return sizeMb > env.behavior.filesApiThresholdMb
    ? filesApiTranscribe(file)
    : inlineTranscribe(file);
};

