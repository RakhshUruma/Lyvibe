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
import { audioState } from "./audio-state";
import { analyzeVibe } from "./mood/vibe-analyze";

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
// We RE-normalize so any new schema fields (typewriter, recipes, …) are
// populated with defaults — pre-existing localStorage payloads predate them.
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
  // sub-linear scaling for rates so 2.0× doesn't always saturate to 1.0
  const rate = (v: number) => clamp(v * k, 0, 1);
  // rgbSplit grows with intensity, but more conservatively (so dim presets
  // still get punch without becoming illegible).
  const rgb = clamp(m.rgbSplit * (0.5 + 0.5 * k), 0, 12);
  return {
    ...m,
    motionRate: rate(m.motionRate),
    glitchRate: rate(m.glitchRate),
    ghostRate:  rate(m.ghostRate),
    bgSwapRate: rate(m.bgSwapRate),
    tilt:       clamp(m.tilt * k, 0, 25),
    rgbSplit:   rgb,
    sceneElements: m.sceneElements.map(se => ({
      ...se,
      // particle density scales with intensity — more sparks at 2×, fewer at 0.3×
      count:     Math.max(1, Math.round(se.count * k)),
      spawnRate: se.spawnRate != null ? se.spawnRate * k : undefined,
      sizeRange: [se.sizeRange[0], se.sizeRange[1] * (0.85 + 0.3 * k)] as [number, number],
    })),
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
  const quick = (document.getElementById("quickMode") as HTMLInputElement | null)?.checked === true;
  setMessage(quick ? "◐ QUICK · single-stage generating..." : "◐ STAGE 1 / 2 · imagining the scene...", "busy");
  let capturedBrief = "";
  try {
    const r = await generateMood(vibe, {
      quick,
      onStatus: setMoodStatus,
      onStage: (s) => {
        if (quick && s === "json") setMessage("◐ QUICK · writing CSS...", "busy");
        else if (s === "brief") setMessage("◐ STAGE 1 / 2 · imagining the scene...", "busy");
        else if (s === "json")  setMessage("◐ STAGE 2 / 2 · turning the brief into CSS...", "busy");
      },
      onBrief: (brief) => {
        capturedBrief = brief;
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
    // Push the generated mood JSON into the paste textarea so the user
    // can hand-edit it afterwards. <details> auto-opens for visibility.
    const moodJsonEl = document.getElementById("moodJson") as HTMLTextAreaElement;
    if (moodJsonEl) {
      moodJsonEl.value = JSON.stringify(r.mood, null, 2);
      const det = moodJsonEl.closest("details") as HTMLDetailsElement | null;
      if (det) det.open = true;
    }
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
       : key === "aurora"  ? "particles"
       : key === "forest"  ? "particles"
       : key === "flame"   ? "rays"
       : key === "aqua"    ? "vortex"
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

document.getElementById("lyricsLoadCurrentBtn")!.addEventListener("click", () => {
  const ta = document.getElementById("manualLyrics") as HTMLTextAreaElement;
  ta.value = JSON.stringify(state.lyrics, null, 2);
  flash("lyricsLoadCurrentBtn");
});
document.getElementById("moodLoadCurrentBtn")!.addEventListener("click", () => {
  const ta = document.getElementById("moodJson") as HTMLTextAreaElement;
  ta.value = JSON.stringify(state.mood, null, 2);
  flash("moodLoadCurrentBtn");
});

const downloadJson = (filename: string, payload: unknown): void => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById("exportMoodBtn")!.addEventListener("click", () => {
  const stem = (state.audioFile?.name || "mood").replace(/\.[^.]+$/, "");
  downloadJson(`${stem}.mood.json`, state.mood);
  flash("exportMoodBtn");
  setMessage("✓ mood JSON downloaded.", "ok");
});

document.getElementById("exportLyricsBtn")!.addEventListener("click", () => {
  const stem = (state.audioFile?.name || "lyrics").replace(/\.[^.]+$/, "");
  downloadJson(`${stem}.lyrics.json`, state.lyrics);
  flash("exportLyricsBtn");
  setMessage("✓ lyrics JSON downloaded.", "ok");
});

document.getElementById("suggestVibeBtn")!.addEventListener("click", async () => {
  if (!state.audioFile) { setMessage("choose an audio file first.", "err"); return; }
  const btn = document.getElementById("suggestVibeBtn") as HTMLButtonElement;
  btn.disabled = true; btn.classList.add("shimmer");
  setMessage("◐ analyzing vibe from audio...", "busy");
  try {
    const vibe = await analyzeVibe(state.audioFile);
    const ta = document.getElementById("moodPrompt") as HTMLTextAreaElement;
    ta.value = vibe;
    // open the "Generate from prompt" details so the user sees what was filled
    const det = ta.closest("details") as HTMLDetailsElement | null;
    if (det) det.open = true;
    setMessage(`✓ vibe suggested: "${vibe.slice(0, 60)}${vibe.length > 60 ? "…" : ""}"`, "ok");
    flash("suggestVibeBtn");
  } catch (e) {
    setMessage(`✗ vibe analyze: ${e instanceof Error ? e.message : e}`, "err");
  } finally {
    btn.disabled = false; btn.classList.remove("shimmer");
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

  // The CSS max-width formula uses --ax to shrink the box near edges, so
  // the line wraps naturally on both sides (no off-screen bleed). All we
  // need is to keep the centre on stage.
  const clampX = (v: number) => Math.max(2, Math.min(98, v));
  const clampY = (v: number) => Math.max(4, Math.min(96, v));

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
    curAX = clampX(nx);
    curAY = clampY(ny);
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
      curAX = clampX(curAX + (velPxX * FRAME / stageRect.width)  * 100);
      curAY = clampY(curAY + (velPxY * FRAME / stageRect.height) * 100);
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

  // Rolling bass average for kick (onset) detection.
  const bassHistory: number[] = [];
  const HISTORY_LEN = 30;       // ~half second at 60fps
  const KICK_THRESHOLD = 0.18;  // bass must exceed avg by this to fire kick
  const KICK_MIN = 0.35;        // absolute floor — quiet sections don't kick
  let kickEnvelope = 0;         // decays each frame
  let lastKickT = 0;

  const root = document.documentElement;
  const tick = () => {
    g.analyser.getByteFrequencyData(g.data);
    const N = g.data.length;
    // Three bands. fftSize=256 → 128 bins; spans 0..nyquist (~22kHz).
    //   bass:   0..7   (~0..1.4 kHz)
    //   mid:    8..31  (~1.4..5.5 kHz)
    //   treble: 32..127 (~5.5..22 kHz)
    let bSum = 0, mSum = 0, tSum = 0, total = 0;
    const bN = 8, mN = 24, tN = Math.max(1, N - 32);
    for (let i = 0; i < N; i++) {
      const v = g.data[i]!;
      total += v;
      if (i < 8) bSum += v;
      else if (i < 32) mSum += v;
      else tSum += v;
    }
    const bass   = (bSum / bN) / 255;
    const mid    = (mSum / mN) / 255;
    const treble = (tSum / tN) / 255;
    const energy = total / (N * 255);

    // kick detection — bass relative to recent rolling average
    bassHistory.push(bass);
    if (bassHistory.length > HISTORY_LEN) bassHistory.shift();
    const avgBass = bassHistory.reduce((a,b) => a+b, 0) / bassHistory.length;
    const now = performance.now();
    if (bass > avgBass + KICK_THRESHOLD && bass > KICK_MIN && (now - lastKickT) > 110) {
      kickEnvelope = 1;
      lastKickT = now;
    }
    // decay envelope (~250ms half-life)
    kickEnvelope *= 0.86;
    if (kickEnvelope < 0.01) kickEnvelope = 0;

    audioState.bass   = bass;
    audioState.mid    = mid;
    audioState.treble = treble;
    audioState.energy = energy;
    audioState.kick   = kickEnvelope;

    root.style.setProperty("--bass",   bass.toFixed(3));
    root.style.setProperty("--mid",    mid.toFixed(3));
    root.style.setProperty("--treble", treble.toFixed(3));
    root.style.setProperty("--energy", energy.toFixed(3));
    root.style.setProperty("--kick",   kickEnvelope.toFixed(3));

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
    const lyricsOnly = (document.getElementById("exportLyricsOnly") as HTMLInputElement)?.checked === true;
    const blob = await recordWebm({
      audio, lyrics: state.lyrics, signal: ctrl.signal,
      lyricsOnly,
      onProgress: (cur, dur) => {
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        (fill as HTMLElement).style.width = `${pct}%`;
        label.textContent = `${fmtT(cur)} / ${fmtT(dur)} · 720p30`;
      },
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const tag = lyricsOnly ? ".lyrics-only" : "";
    a.download = `${state.audioFile.name.replace(/\.[^.]+$/,"")}${tag}.webm`;
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
