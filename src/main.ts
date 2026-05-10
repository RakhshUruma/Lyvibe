import "./style.css";

import { CanvasBg, type BgMode } from "./stage/canvas-bg";
import { LineRenderer } from "./stage/lines";
import { PRESETS } from "./mood/presets";
import { applyMood, normalizeMood } from "./mood/normalize";
import { generateMood, probeMoodSources } from "./mood/dispatcher";
import type { Mood } from "./mood/schema";
import { transcribe, probeASR } from "./asr/dispatcher";
import type { Lyrics, Segment } from "./lyrics/schema";
import { sortLyrics, indexAt } from "./lyrics/schema";
import { saveProject, loadProject, projectIdFor } from "./lyrics/store";
import { Transport } from "./panel/transport";
import { LyricEditor } from "./panel/lyric-editor";
import { setMoodStatus, setAsrStatus, setMcpStatus, setMessage, emphasizePasteMood } from "./panel/status";
import { recordWebm } from "./export/recorder";
import { getAudioGraph, resumeAudioGraph } from "./audio-graph";
import { ParticleEngine } from "./scene/particle-engine";

// =====================================================================
// boot
// =====================================================================

const audio  = document.getElementById("audio") as HTMLAudioElement;
const bg     = new CanvasBg(document.getElementById("bgCanvas") as HTMLCanvasElement);
const lines  = new LineRenderer();
const transport = new Transport(audio);
const particleLayer = document.getElementById("particleLayer")!;
const particleEngine = new ParticleEngine(particleLayer);

const editor = new LyricEditor(
  document.getElementById("editor")!,
  (t) => { audio.currentTime = t; },
  (l) => { state.lyrics = l; persistLyrics(); showToast("✓ UPDATED"); flash("eApply"); },
);

const state: {
  mood: Mood;
  lyrics: Lyrics;
  audioFile: File | null;
  projectId: string | null;
  lastIdx: number;
  moodKey: string;
  intensity: number;
} = {
  mood:   PRESETS.cyber!,
  lyrics: { segments: [] },
  audioFile: null,
  projectId: null,
  lastIdx: -1,
  moodKey: "cyber",
  intensity: parseFloat(localStorage.getItem("vj.intensity") ?? "1") || 1,
};

// Restore previously generated custom mood (if any) so it survives reload.
const savedCustom = localStorage.getItem("vj.customMood");
if (savedCustom) {
  try {
    const m = normalizeMood(JSON.parse(savedCustom));
    (PRESETS as any).custom = m;
    const opt = document.getElementById("customOption") as HTMLOptionElement | null;
    if (opt) opt.hidden = false;
  } catch { /* corrupt — ignore */ }
}

// scale a mood by current intensity slider (0.3 - 2.0)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function scaleMood(m: Mood, k: number): Mood {
  return {
    ...m,
    motionRate: clamp(m.motionRate * k, 0, 1),
    glitchRate: clamp(m.glitchRate * k, 0, 1),
    ghostRate:  clamp(m.ghostRate  * k, 0, 1),
    bgSwapRate: clamp(m.bgSwapRate * k, 0, 1),
    tilt:       clamp(m.tilt * k, 0, 25),
  };
}

bg.start();

// =====================================================================
// initial mood + status probe
// =====================================================================

applyPreset("cyber");

(async () => {
  const moodStatus = await probeMoodSources();
  setMoodStatus(moodStatus);
  setAsrStatus(probeASR());
  // MCP indicator reflects the same relay endpoint as sub. If relay /health
  // answered, MCP server is up too (they're co-resident in vj-mcp.ts).
  setMcpStatus(moodStatus.relay === "ok");
})();

// =====================================================================
// MOOD UI
// =====================================================================

const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement;
presetSelect.addEventListener("change", () => applyPreset(presetSelect.value));

// Restore last selected preset (custom included).
const lastPreset = localStorage.getItem("vj.lastPreset");
if (lastPreset && PRESETS[lastPreset]) {
  presetSelect.value = lastPreset;
  applyPreset(lastPreset);
}

// Intensity slider — multiplies all motion-related rates
const intensityEl = document.getElementById("intensity") as HTMLInputElement;
const intensityVal = document.getElementById("intensityVal")!;
intensityEl.value = String(state.intensity);
const renderIntensity = () => {
  const v = state.intensity;
  intensityVal.textContent = `${v.toFixed(2)}×`;
  // visualize fill of the track
  const pct = ((v - 0.3) / (2 - 0.3)) * 100;
  intensityEl.style.setProperty("--p", `${pct}%`);
};
renderIntensity();
intensityEl.addEventListener("input", () => {
  state.intensity = parseFloat(intensityEl.value);
  renderIntensity();
  // re-apply current mood with new intensity (no full re-build of CSS — vars only need scaled rates)
  const scaled = scaleMood(state.mood, state.intensity);
  applyMood(scaled); lines.setMood(scaled);
  particleEngine.setElements(scaled.sceneElements ?? []);
});
intensityEl.addEventListener("change", () => {
  try { localStorage.setItem("vj.intensity", String(state.intensity)); } catch {}
});

document.getElementById("moodGenBtn")!.addEventListener("click", async () => {
  const vibe = (document.getElementById("moodPrompt") as HTMLTextAreaElement).value.trim();
  if (!vibe) { setMessage("enter a vibe first.", "err"); return; }
  const btn = document.getElementById("moodGenBtn") as HTMLButtonElement;
  btn.disabled = true;
  document.body.classList.add("generating");
  emphasizePasteMood(false);
  setMessage("◐ STAGE 1 / 2 · imagining the scene...", "busy");
  let capturedBrief = "";
  try {
    const r = await generateMood(vibe, {
      onStatus: setMoodStatus,
      onStage: (s) => {
        if (s === "brief") setMessage("◐ STAGE 1 / 2 · imagining the scene...", "busy");
        if (s === "json")  setMessage("◐ STAGE 2 / 2 · turning the brief into CSS...", "busy");
      },
      onBrief: (brief) => {
        capturedBrief = brief;
        // show first ~120 chars of the brief in status to convey "the LLM imagined this"
        const preview = brief.replace(/\s+/g, " ").slice(0, 120);
        setMessage(`◐ STAGE 2 / 2 · brief: "${preview}…"`, "busy");
      },
    });
    state.mood = r.mood; state.moodKey = "custom";
    (PRESETS as any).custom = r.mood;
    const customOpt = document.getElementById("customOption") as HTMLOptionElement;
    customOpt.hidden = false;
    (document.getElementById("presetSelect") as HTMLSelectElement).value = "custom";
    clearAnchors();
    const scaled = scaleMood(r.mood, state.intensity);
    applyMood(scaled); lines.setMood(scaled); particleEngine.setElements(scaled.sceneElements ?? []);
    repaintCurrentLine();
    document.getElementById("moodMeta")!.textContent = `custom · ${r.status.source}`;
    const briefSnippet = (r.brief || capturedBrief).replace(/\s+/g, " ").slice(0, 80);
    setMessage(`✓ via ${r.status.source} in ${r.status.ms||0}ms · "${briefSnippet}…"`, "ok");
    try {
      localStorage.setItem("vj.customMood", JSON.stringify(r.mood));
      localStorage.setItem("vj.lastBrief", r.brief);
      localStorage.setItem("vj.lastPreset", "custom");
    } catch {}
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setMessage(`✗ ${msg}`, "err");
    emphasizePasteMood(true);
  } finally {
    document.body.classList.remove("generating");
    btn.disabled = false;
  }
});

document.getElementById("moodApplyBtn")!.addEventListener("click", () => {
  const txt = (document.getElementById("moodJson") as HTMLTextAreaElement).value;
  try {
    const m = normalizeMood(JSON.parse(txt));
    state.mood = m; state.moodKey = "custom";
    (PRESETS as any).custom = m;
    const customOpt = document.getElementById("customOption") as HTMLOptionElement;
    customOpt.hidden = false;
    (document.getElementById("presetSelect") as HTMLSelectElement).value = "custom";
    clearAnchors();
    const scaled = scaleMood(m, state.intensity);
    applyMood(scaled); lines.setMood(scaled); particleEngine.setElements(scaled.sceneElements ?? []);
    repaintCurrentLine();
    document.getElementById("moodMeta")!.textContent = "custom · pasted";
    setMessage("✓ pasted mood applied — saved as CUSTOM preset", "ok");
    emphasizePasteMood(false);
    try {
      localStorage.setItem("vj.customMood", JSON.stringify(m));
      localStorage.setItem("vj.lastPreset", "custom");
    } catch {}
    flash("moodApplyBtn");
  } catch (e) {
    setMessage(`✗ JSON parse: ${e instanceof Error ? e.message : e}`, "err");
  }
});

// Wipe per-segment user-pinned anchors. Called when a fresh mood is
// generated/applied — the new mood probably wants its own positioning, and
// holding stale anchors locks lines into the previous look.
function clearAnchors(): void {
  let touched = 0;
  for (const seg of state.lyrics.segments) {
    if (seg.anchorX != null || seg.anchorY != null || seg.anchorR != null) {
      delete seg.anchorX; delete seg.anchorY; delete seg.anchorR;
      touched++;
    }
  }
  if (touched) persistLyrics();
}

// brief visual feedback on a button (flash + scale)
function flash(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("flashed");
  // reflow so animation restarts
  void (el as HTMLElement).offsetWidth;
  el.classList.add("flashed");
  setTimeout(() => el.classList.remove("flashed"), 600);
}

// toast for editor Apply
function showToast(msg = "✓ UPDATED"): void {
  const t = document.getElementById("editorToast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1100);
}

function applyPreset(key: string) {
  const m = PRESETS[key];
  if (!m) return;
  state.mood = m; state.moodKey = key;
  const scaled = scaleMood(m, state.intensity);
  applyMood(scaled); lines.setMood(scaled);
  particleEngine.setElements(scaled.sceneElements ?? []);
  document.getElementById("moodMeta")!.textContent = key;
  bg.setMode(presetToBgMode(key));
  repaintCurrentLine();
  try { localStorage.setItem("vj.lastPreset", key); } catch {}
}

/** After a mood swap, drop any stale .line element and re-render the
 *  segment that's currently active. Stops the previous mood's keyframes
 *  from clinging on (often manifests as off-screen / mis-clamped lines).*/
function repaintCurrentLine(): void {
  state.lastIdx = -2;
  lines.clear();
  const t = audio.currentTime || 0;
  const i = indexAt(state.lyrics.segments, t);
  if (i >= 0) {
    const seg = state.lyrics.segments[i]!;
    if (t <= seg.end + 0.1) {
      lines.show(seg, i);
      state.lastIdx = i;
    }
  }
}

function presetToBgMode(key: string): BgMode {
  return key === "cyber"   ? "grid"
       : key === "dream"   ? "particles"
       : key === "neon"    ? "rays"
       : key === "zen"     ? "vortex"
       : key === "mono"    ? "stripes"
       : key === "vhs"     ? "noise"
       : "noise";
}

// =====================================================================
// AUDIO + Manual lyrics
// =====================================================================

(document.getElementById("audioFile") as HTMLInputElement).addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
  if (!f) return;
  // Reset playback + previous lyrics state BEFORE loading the new file.
  audio.pause();
  audio.currentTime = 0;
  state.audioFile = f;
  state.lyrics = { segments: [] };
  state.lastIdx = -1;
  lines.clear();
  audio.src = URL.createObjectURL(f);
  state.projectId = projectIdFor(f);
  const cached = await loadProject(state.projectId);
  if (cached) {
    state.lyrics = cached;
    setMessage(`✓ restored ${cached.segments.length} segments from cache.`, "ok");
  } else {
    setMessage(`audio loaded: ${f.name} (${(f.size/1024/1024).toFixed(1)}MB) — press TRANSCRIBE & PLAY`);
  }
});

document.getElementById("manualLyricsBtn")!.addEventListener("click", () => {
  const txt = (document.getElementById("manualLyrics") as HTMLTextAreaElement).value;
  try {
    const j = JSON.parse(txt);
    const segs: Segment[] = (j.segments ?? j).map((s: any) => ({
      start: Number(s.start ?? 0),
      end:   Number(s.end ?? 0),
      text:  String(s.text ?? "").trim(),
    })).filter((s: Segment) => s.text);
    state.lyrics = sortLyrics({ segments: segs });
    persistLyrics();
    setMessage(`✓ manual lyrics applied (${segs.length}).`, "ok");
  } catch (e) {
    setMessage(`✗ JSON parse: ${e instanceof Error ? e.message : e}`, "err");
  }
});

// =====================================================================
// CTA: TRANSCRIBE & PLAY
// =====================================================================

document.getElementById("goBtn")!.addEventListener("click", async () => {
  if (!state.audioFile) { setMessage("choose an audio file first.", "err"); return; }
  if (state.lyrics.segments.length === 0) {
    setMessage("◐ transcribing...", "busy");
    try {
      const { lyrics, status } = await transcribe(state.audioFile, setAsrStatus);
      state.lyrics = sortLyrics(lyrics);
      persistLyrics();
      setMessage(`✓ got ${lyrics.segments.length} segments via ${status.source} in ${status.ms}ms.`, "ok");
    } catch (e) {
      setMessage(`✗ ASR: ${e instanceof Error ? e.message : e}`, "err");
      return;
    }
  }
  transport.show();
  await audio.play();
});

// =====================================================================
// Transport callbacks
// =====================================================================

transport.onPlayPause = () => {
  if (audio.paused) audio.play();
  else { audio.pause(); openEditorAtCurrent(); }
};
transport.onStop = () => {
  audio.pause();
  audio.currentTime = 0;
  lines.clear();
  openEditorAtCurrent();
};
transport.onSeek = (t) => { audio.currentTime = t; };

// =====================================================================
// Playback ticker → show/hide lines
// =====================================================================

audio.addEventListener("timeupdate", () => {
  const t = audio.currentTime;
  const i = indexAt(state.lyrics.segments, t);
  if (i !== state.lastIdx) {
    state.lastIdx = i;
    if (i >= 0) {
      const seg = state.lyrics.segments[i]!;
      if (t <= seg.end + 0.1) lines.show(seg, i);
    } else {
      lines.clear();
    }
  } else if (i >= 0) {
    const seg = state.lyrics.segments[i]!;
    if (t > seg.end) lines.clear();
  }
});

// ---------------------------------------------------------------
// drag-to-anchor while paused: grab the visible line and drop it.
// pause/play toggles body.paused-edit so styles + listeners apply only
// when the user has stopped, matching the editor flow.
// ---------------------------------------------------------------
const stage = document.getElementById("stage")!;
audio.addEventListener("pause",  () => document.body.classList.add("paused-edit"));
audio.addEventListener("play",   () => document.body.classList.remove("paused-edit"));
audio.addEventListener("ended",  () => document.body.classList.add("paused-edit"));

/* Drag-to-anchor while paused.
 *   Simple translate-only with inertial coast on release.
 *   Rotation was tried (corner-grab + Shift) but the UX is finicky for a
 *   prototype — dropped in favour of "obviously works". The schema retains
 *   anchorR so we can revisit later (e.g. as a dedicated handle).
 */
stage.addEventListener("pointerdown", (e) => {
  if (!document.body.classList.contains("paused-edit")) return;
  const el = (e.target as HTMLElement).closest(".line.shown") as HTMLElement | null;
  if (!el) return;
  const idxStr = el.dataset.segIdx;
  if (idxStr == null) return;
  const idx = parseInt(idxStr, 10);
  const seg = state.lyrics.segments[idx];
  if (!seg) return;
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch {}
  el.classList.add("dragging", "moving");

  const stageRect = stage.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const cxPx0 = elRect.left + elRect.width  / 2;
  const cyPx0 = elRect.top  + elRect.height / 2;

  // initial state
  const startX = e.clientX, startY = e.clientY;
  const initAX = ((cxPx0 - stageRect.left) / stageRect.width)  * 100;
  const initAY = ((cyPx0 - stageRect.top ) / stageRect.height) * 100;
  let curAX = initAX, curAY = initAY;
  let velPxX = 0, velPxY = 0;          // px / ms — used for inertia
  let lastT = performance.now();
  let lastClientX = e.clientX, lastClientY = e.clientY;

  const onMove = (mv: PointerEvent) => {
    const t = performance.now();
    const dt = Math.max(1, t - lastT);
    const nx = initAX + ((mv.clientX - startX) / stageRect.width)  * 100;
    const ny = initAY + ((mv.clientY - startY) / stageRect.height) * 100;
    curAX = clamp(nx, 2, 98);
    curAY = clamp(ny, 2, 98);
    el.style.left = `${curAX}%`;
    el.style.top  = `${curAY}%`;
    el.style.setProperty("--ax", String(curAX));
    seg.anchorX = curAX;
    seg.anchorY = curAY;
    velPxX = (mv.clientX - lastClientX) / dt;
    velPxY = (mv.clientY - lastClientY) / dt;
    lastT = t; lastClientX = mv.clientX; lastClientY = mv.clientY;
  };

  const onUp = () => {
    try { el.releasePointerCapture(e.pointerId); } catch {}
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);

    // gentle inertial coast
    const decay = 0.93;
    const minLin = 0.0008;
    const FRAME  = 16.67;
    const tick = () => {
      if (Math.abs(velPxX) <= minLin && Math.abs(velPxY) <= minLin) {
        el.classList.remove("dragging", "moving");
        persistLyrics();
        showToast("✓ ANCHORED");
        return;
      }
      velPxX *= decay; velPxY *= decay;
      curAX = clamp(curAX + (velPxX * FRAME / stageRect.width)  * 100, 2, 98);
      curAY = clamp(curAY + (velPxY * FRAME / stageRect.height) * 100, 2, 98);
      el.style.left = `${curAX}%`;
      el.style.top  = `${curAY}%`;
      el.style.setProperty("--ax", String(curAX));
      seg.anchorX = curAX; seg.anchorY = curAY;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
});

// =====================================================================
// Audio analyser → --bass / --energy CSS vars (uses shared graph)
// =====================================================================

let _tickStarted = false;
audio.addEventListener("play", () => {
  const g = getAudioGraph(audio);
  void resumeAudioGraph();
  if (_tickStarted) return;
  _tickStarted = true;
  const tick = () => {
    g.analyser.getByteFrequencyData(g.data);
    let bass = 0, total = 0;
    for (let i = 0; i < g.data.length; i++) {
      total += g.data[i]!;
      if (i < 8) bass += g.data[i]!;
    }
    bass /= 8 * 255;
    const energy = total / (g.data.length * 255);
    document.documentElement.style.setProperty("--bass", bass.toFixed(3));
    document.documentElement.style.setProperty("--energy", energy.toFixed(3));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// =====================================================================
// Lyric editor opening
// =====================================================================

function openEditorAtCurrent() {
  const t = audio.currentTime;
  const i = indexAt(state.lyrics.segments, t);
  editor.open(state.lyrics, i, t);
}

document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === " ") { e.preventDefault(); transport.onPlayPause(); }
  if (e.key === "e" || e.key === "E") {
    if (!audio.paused) audio.pause();
    openEditorAtCurrent();
  }
});

// panel min/max
document.getElementById("panelToggle")!.addEventListener("click", () => {
  document.getElementById("panel")!.classList.toggle("minimized");
});

// =====================================================================
// EXPORT
// =====================================================================

document.getElementById("exportBtn")!.addEventListener("click", async () => {
  if (!state.audioFile) { setMessage("choose audio first.", "err"); return; }
  const overlay = document.getElementById("exportOverlay")!;
  const fill    = document.getElementById("exportFill")!;
  const label   = document.getElementById("exportLabel")!;
  overlay.classList.remove("hidden");
  const ctrl = new AbortController();
  document.getElementById("exportCancel")!.onclick = () => ctrl.abort();
  try {
    const blob = await recordWebm({
      audio, lyrics: state.lyrics, signal: ctrl.signal,
      onProgress: (cur, dur) => {
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        (fill as HTMLElement).style.width = `${pct}%`;
        label.textContent = `${fmtT(cur)} / ${fmtT(dur)} · 720p30`;
      },
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.audioFile.name.replace(/\.[^.]+$/,"")}.webm`;
    a.click();
    setMessage("✓ exported.", "ok");
  } catch (e) {
    setMessage(`✗ export: ${e instanceof Error ? e.message : e}`, "err");
  } finally {
    overlay.classList.add("hidden");
  }
});

const fmtT = (t: number): string => {
  if (!Number.isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// =====================================================================
// persistence
// =====================================================================

async function persistLyrics() {
  if (state.projectId) {
    await saveProject(state.projectId, state.lyrics, state.audioFile?.name);
  }
}
