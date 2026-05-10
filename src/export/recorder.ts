/**
 * Stage recorder: mux #stage's visual output (via canvas mirror) + audio track
 * → MediaRecorder webm. mp4 is offered via export/ffmpeg-bridge (lazy).
 *
 * Strategy: instead of trying to captureStream() a CSS-driven stage (lossy on
 * Firefox/Safari), we rasterize each frame to an offscreen canvas via
 * html-to-canvas-style snapshot using svg-foreign... too heavy for MVP.
 *
 * MVP: captureStream() the existing #bgCanvas + overlay #lyricsLayer text
 * onto a mirror canvas at 30fps. CSS background variants are rasterized as
 * a still snapshot per-line transition.
 */

import type { Lyrics } from "../lyrics/schema";
import { getAudioGraph, resumeAudioGraph } from "../audio-graph";

export type ExportOpts = {
  audio: HTMLAudioElement;
  lyrics: Lyrics;
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (cur: number, dur: number) => void;
  signal?: AbortSignal;
};

export const recordWebm = async (opts: ExportOpts): Promise<Blob> => {
  const w = opts.width ?? 1280, h = opts.height ?? 720, fps = opts.fps ?? 30;

  const mirror = document.createElement("canvas");
  mirror.width = w; mirror.height = h;
  const mctx = mirror.getContext("2d")!;

  const bgCanvas = document.getElementById("bgCanvas") as HTMLCanvasElement;
  const lyrics   = document.getElementById("lyricsLayer")!;

  const stream = mirror.captureStream(fps);

  // Reuse the shared audio graph (cannot create a 2nd MediaElementSource on
  // the same <audio>). The graph already routes src → analyser → speakers and
  // src → streamDest, so we just lift the audio tracks from streamDest.
  const g = getAudioGraph(opts.audio);
  await resumeAudioGraph();
  for (const t of g.streamDest.stream.getAudioTracks()) stream.addTrack(t);

  const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  // Reset playback
  opts.audio.currentTime = 0;
  await new Promise<void>(r => opts.audio.addEventListener("canplay", () => r(), { once: true }));

  mr.start(250);
  await opts.audio.play();

  let raf = 0;
  const draw = () => {
    mctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#000";
    mctx.fillRect(0, 0, w, h);
    if (bgCanvas.width > 0) mctx.drawImage(bgCanvas, 0, 0, w, h);

    // draw active line text (single line snapshot — sufficient for MVP)
    const line = lyrics.querySelector(".line.shown") as HTMLElement | null;
    if (line) {
      const txt = line.textContent ?? "";
      const cs = getComputedStyle(line);
      mctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      mctx.fillStyle = cs.color;
      mctx.textAlign = "center"; mctx.textBaseline = "middle";
      mctx.shadowColor = "rgba(255,255,255,0.3)"; mctx.shadowBlur = 22;
      mctx.fillText(txt, w / 2, h / 2);
      mctx.shadowBlur = 0;
    }

    opts.onProgress?.(opts.audio.currentTime, opts.audio.duration || 0);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return new Promise<Blob>((resolve, reject) => {
    const stop = () => {
      cancelAnimationFrame(raf);
      mr.stop();
      opts.audio.pause();
    };
    opts.signal?.addEventListener("abort", () => { stop(); reject(new Error("aborted")); });
    opts.audio.addEventListener("ended", () => {
      stop();
      mr.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    }, { once: true });
  });
};
