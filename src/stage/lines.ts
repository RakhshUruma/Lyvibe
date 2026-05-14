import type { Mood } from "../mood/schema";
import type { Segment } from "../lyrics/schema";
import { swapBgVariant } from "../mood/normalize";

/**
 * Render one lyric line into #lyricsLayer. Caller is responsible for timing
 * (call show() at segment start, hide() at end).
 */
export class LineRenderer {
  private layer: HTMLElement;
  private fxLayer: HTMLElement;
  private active: HTMLElement | null = null;
  private mood: Mood | null = null;

  constructor() {
    this.layer = document.getElementById("lyricsLayer")!;
    this.fxLayer = document.getElementById("fxLayer")!;
  }

  setMood(m: Mood) { this.mood = m; }

  show(seg: Segment, idx?: number): void {
    if (!this.mood) return;
    this.clear();
    if (Math.random() < this.mood.bgSwapRate) swapBgVariant(this.mood);

    const line = document.createElement("div");
    line.className = "line";
    if (idx != null) line.dataset.segIdx = String(idx);
    const tilt = seg.anchorR != null ? seg.anchorR : (Math.random() * 2 - 1) * this.mood.tilt;
    line.style.setProperty("--tilt", `${tilt}deg`);

    // size scaling (text length based ±25%)
    const baseSize = 64;
    const longestLine = seg.text.split("\n").reduce((m, l) => Math.max(m, [...l].length), 1);
    const lengthScale = Math.max(0.5, Math.min(1.5, 16 / Math.max(1, longestLine)));
    const size = baseSize * (0.85 + Math.random() * 0.3) * lengthScale;
    line.style.fontSize = `${size}px`;

    // 1 char = 1 span (so per-char anim is possible).
    // User-input "\n" inside seg.text is preserved as <br> so manual line
    // breaks survive the per-char split.
    const visible = [...seg.text].filter(c => c !== "\n");
    const total = visible.length;
    const emphSet = new Set(seg.emphasis ?? []);
    const layout = seg.layout;
    // When layout is set, .line becomes a positioning ANCHOR rather than a
    // flow container — each .ch absolutely positioned relative to it.
    const usePerCharLayout = layout && layout !== "rise";
    if (usePerCharLayout) line.classList.add("per-char-layout");

    let visIdx = 0;
    for (const c of [...seg.text]) {
      if (c === "\n") {
        line.appendChild(document.createElement("br"));
        continue;
      }
      const s = document.createElement("span");
      s.className = "ch";
      if (emphSet.has(visIdx)) s.classList.add("emph");
      s.textContent = c;
      s.style.setProperty("--ch-i", String(visIdx));
      s.style.setProperty("--ch-n", String(total));
      if (usePerCharLayout) {
        const pos = layoutCharPosition(layout!, visIdx, total, seg.charPositions);
        s.style.left = `${pos.x}em`;
        s.style.top  = `${pos.y}em`;
        if (pos.rot != null) s.style.setProperty("--ch-rot", `${pos.rot}deg`);
      }
      line.appendChild(s);
      visIdx++;
    }
    const chars = visible;     // used below for typewriter timing

    // === position resolution =========================================
    // No JS clamping of x — CSS max-width depends on --ax and naturally
    // shrinks the line near the edges, forcing wrap. That is symmetric
    // (works on both sides) and matches what the original prototype did.
    const rand = this.position(this.mood.positionMode, seg.text.length);
    const x = seg.anchorX ?? rand.x;
    const y = seg.anchorY ?? rand.y;
    line.style.left = `${x}%`;
    line.style.top  = `${y}%`;
    line.style.setProperty("--ax", String(x));
    this.layer.appendChild(line);

    // entry: typewriter (per-char stagger) OR block (whole-line)
    const entry = pick(this.mood.entryKeyframes);
    if (this.mood.useTypewriter) {
      const tw = this.mood.typewriter || {};
      const reveal = tw.reveal ?? "rise";
      const kfName = ensureTypewriterKf(reveal);
      const stagger    = (typeof tw.stagger === "number" && tw.stagger > 0)
        ? Math.min(0.2, Math.max(0.005, tw.stagger))
        : Math.min(0.06, 0.7 / Math.max(1, chars.length));
      const charDur    = tw.charDuration || "0.42s";
      const easing     = (reveal === "type") ? "steps(2)" : "ease-out";
      const lineEls    = line.querySelectorAll(".ch");
      lineEls.forEach((el, i) => {
        const e = el as HTMLElement;
        // shatter wants random per-char displacement
        if (reveal === "shatter") {
          e.style.setProperty("--rx", `${((Math.random()-0.5) * 60).toFixed(0)}px`);
          e.style.setProperty("--ry", `${((Math.random()-0.5) * 60).toFixed(0)}px`);
          e.style.setProperty("--rr", `${((Math.random()-0.5) * 90).toFixed(0)}deg`);
        }
        e.style.animation = `${kfName} ${charDur} ${easing} both`;
        e.style.animationDelay = `${(i * stagger).toFixed(3)}s`;
      });
    } else if (entry) {
      line.style.animation = `${entry.name} ${entry.duration} ${entry.easing} ${entry.iteration ?? "1"} both`;
    }

    if (Math.random() < this.mood.motionRate) {
      const motion = pick(this.mood.motionKeyframes);
      if (motion) {
        const cur = line.style.animation;
        line.style.animation = `${cur}, ${motion.name} ${motion.duration} ${motion.easing} ${motion.iteration ?? "infinite"}`;
      }
    }

    requestAnimationFrame(() => line.classList.add("shown"));
    this.active = line;

    if (Math.random() < this.mood.ghostRate) this.ghost(seg.text, x, y, size, tilt);
    if (Math.random() < this.mood.glitchRate) this.glitch(line);
  }

  clear(): void {
    if (this.active) {
      this.active.remove();
      this.active = null;
    }
    while (this.fxLayer.firstChild) this.fxLayer.removeChild(this.fxLayer.firstChild);
  }

  /**
   * Place a line. Long text always centres so it can use the full max-width.
   * Scatter mode uses a tighter [30, 50, 70] grid (vs the old [16, 50, 84])
   * so even off-centre lines still have ~60vw of horizontal room before
   * the centred max-width formula starts wrapping them.
   */
  private position(mode: "center" | "scatter", textLen: number): { x: number; y: number } {
    if (mode === "center" || textLen >= 22) {
      return { x: 50 + (Math.random() - 0.5) * 6, y: 50 + (Math.random() - 0.5) * 8 };
    }
    const xCols = [30, 50, 70];
    const yCols = [33, 50, 67];
    const cx = xCols[Math.floor(Math.random() * xCols.length)]!;
    const cy = yCols[Math.floor(Math.random() * yCols.length)]!;
    return { x: cx + (Math.random() - 0.5) * 8, y: cy + (Math.random() - 0.5) * 10 };
  }

  private ghost(text: string, x: number, y: number, size: number, tilt: number): void {
    const g = document.createElement("div");
    g.className = "line";
    g.style.left = `${x}%`; g.style.top = `${y}%`;
    g.style.fontSize = `${size}px`;
    g.style.setProperty("--tilt", `${tilt}deg`);
    g.style.opacity = "0.3";
    g.style.filter  = "blur(6px)";
    g.textContent = text;
    g.style.animation = "ghostFade 1.6s ease-out forwards";
    this.fxLayer.appendChild(g);
    setTimeout(() => g.remove(), 1700);
    ensureGhostKf();
  }

  private glitch(el: HTMLElement): void {
    el.animate(
      [
        { transform: "translate(-50%,-50%) translateX(0)" },
        { transform: "translate(-50%,-50%) translateX(8px)" },
        { transform: "translate(-50%,-50%) translateX(-6px)" },
        { transform: "translate(-50%,-50%) translateX(0)" },
      ],
      { duration: 220, iterations: 1, easing: "steps(4)" },
    );
  }
}

const pick = <T>(arr: T[]): T | null => arr.length ? arr[Math.floor(Math.random() * arr.length)]! : null;

/** Position the i-th visible char of `total` according to a layout pattern.
 *  Returns offset in EM units relative to the line's center anchor. */
const layoutCharPosition = (
  layout: "arc" | "spiral" | "scatter" | "rise" | "constellation",
  i: number,
  total: number,
  charPositions?: { x: number; y: number; rot?: number }[],
): { x: number; y: number; rot?: number } => {
  if (layout === "constellation" && charPositions && charPositions[i]) {
    const p = charPositions[i]!;
    // viewport % positions reinterpreted as em offsets — scale down so we
    // don't depend on viewport; treat 100% ~ 8em so chars fit in a band
    return { x: (p.x - 50) * 0.16, y: (p.y - 50) * 0.16, rot: p.rot };
  }
  if (layout === "arc") {
    // upward semi-circle, total span 6em
    const t = total > 1 ? i / (total - 1) : 0.5;  // 0..1
    const angle = (t - 0.5) * Math.PI;            // -π/2..π/2
    const r = 2.8;                                 // em
    return { x: Math.sin(angle) * r, y: -Math.abs(Math.cos(angle)) * r * 0.4, rot: angle * 180 / Math.PI * 0.4 };
  }
  if (layout === "spiral") {
    const t = total > 1 ? i / (total - 1) : 0;    // 0..1, 0 outer, 1 inner
    const angle = t * Math.PI * 3;                 // 1.5 turns
    const r = 3.5 * (1 - t * 0.85);                // shrinks from 3.5 to 0.5 em
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, rot: angle * 180 / Math.PI };
  }
  if (layout === "scatter") {
    // deterministic-ish scatter using char index hash so re-renders look stable
    const h1 = Math.sin(i * 12.9898) * 43758.5453;
    const h2 = Math.sin(i * 78.233) * 12345.678;
    return { x: (h1 - Math.floor(h1) - 0.5) * 5, y: (h2 - Math.floor(h2) - 0.5) * 2.5 };
  }
  return { x: 0, y: 0 };
};

let _ghostKf = false;
const ensureGhostKf = (): void => {
  if (_ghostKf) return;
  const s = document.createElement("style");
  s.textContent = "@keyframes ghostFade { 0%{opacity:0.3} 100%{opacity:0; transform:translate(-50%,-50%) scale(1.4)} }";
  document.head.appendChild(s);
  _ghostKf = true;
};

/** Per-char reveal keyframes. Kept tiny so they compose well with line-level
 *  motion. The "shatter" variant reads --rx/--ry/--rr from each .ch (set
 *  inline at line build time) for randomised origin. */
const REVEAL_KFS: Record<string, string> = {
  fade:    "0%{opacity:0}100%{opacity:1}",
  drop:    "0%{opacity:0;transform:translateY(-0.6em)}100%{opacity:1;transform:translateY(0)}",
  scale:   "0%{opacity:0;transform:scale(0.0)}60%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}",
  blur:    "0%{opacity:0;filter:blur(8px) brightness(0.4)}100%{opacity:1;filter:blur(0) brightness(1)}",
  rise:    "0%{opacity:0;transform:translateY(0.25em) scale(0.7);filter:blur(4px)}60%{opacity:1;transform:translateY(0) scale(1.05);filter:blur(0)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}",
  shatter: "0%{opacity:0;transform:translate(var(--rx,0px),var(--ry,0px)) rotate(var(--rr,0deg)) scale(0.5);filter:blur(4px)}100%{opacity:1;transform:translate(0,0) rotate(0) scale(1);filter:blur(0)}",
  type:    "0%,49%{opacity:0}50%,100%{opacity:1}",
};

const _twSeen = new Set<string>();
const ensureTypewriterKf = (variant = "rise"): string => {
  const v = REVEAL_KFS[variant] ? variant : "rise";
  const name = `vjReveal_${v}`;
  if (_twSeen.has(name)) return name;
  const s = document.createElement("style");
  s.textContent = `@keyframes ${name} { ${REVEAL_KFS[v]} }`;
  document.head.appendChild(s);
  _twSeen.add(name);
  return name;
};
