import { env } from "../env";
import type { Lyrics, Segment } from "../lyrics/schema";

/**
 * AssemblyAI universal-2 (or whatever current).
 * 1) POST audio → upload_url
 * 2) POST transcript with audio_url + language_detection + speech_model
 * 3) GET transcript/{id} until status=completed
 */
const BASE = "https://api.assemblyai.com/v2";

export const transcribeAssemblyAI = async (file: File): Promise<Lyrics> => {
  const key = env.asr.assemblyai.key;
  if (!key) throw new Error("assemblyai: no key");
  const headers = { authorization: key };

  // 1) upload
  const up = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: { ...headers, "transfer-encoding": "chunked" },
    body: file,
  });
  if (!up.ok) throw new Error(`assemblyai upload ${up.status}`);
  const { upload_url } = await up.json();

  // 2) submit
  const sub = await fetch(`${BASE}/transcript`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_model: "universal",
      language_detection: true,
    }),
  });
  if (!sub.ok) throw new Error(`assemblyai submit ${sub.status}`);
  const { id } = await sub.json();

  // 3) poll
  for (;;) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`${BASE}/transcript/${id}`, { headers });
    const j = await r.json();
    if (j.status === "completed") {
      const segments: Segment[] = (j.utterances ?? j.words ?? []).map((u: any) => ({
        start: Number(u.start ?? 0) / 1000,
        end:   Number(u.end ?? 0) / 1000,
        text:  String(u.text ?? u.word ?? "").trim(),
      })).filter((s: Segment) => s.text);
      return { segments, language: j.language_code };
    }
    if (j.status === "error") throw new Error(`assemblyai: ${j.error}`);
  }
};
