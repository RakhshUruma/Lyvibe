import type { Lyrics, Segment } from "./schema";

/** Minimal LRC parser/serializer (no metadata tags). */
const LRC_LINE = /^\s*\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;

export const parseLrc = (text: string): Lyrics => {
  const segments: Segment[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = LRC_LINE.exec(raw);
    if (!m) continue;
    const start = (Number(m[1]) * 60) + Number(m[2]);
    const t = (m[3] ?? "").trim();
    if (t) segments.push({ start, end: start + 3, text: t });
  }
  // patch end times = next start
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i]!.end = segments[i + 1]!.start;
  }
  return { segments };
};

const fmt = (t: number): string => {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(2).padStart(5, "0");
  return `[${String(m).padStart(2,"0")}:${s}]`;
};

export const toLrc = (l: Lyrics): string =>
  l.segments.map(s => `${fmt(s.start)}${s.text}`).join("\n");
