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
    // user-pinned values win over random
    const tilt = seg.anchorR != null ? seg.anchorR : (Math.random() * 2 - 1) * this.mood.tilt;
    line.style.setProperty("--tilt", `${tilt}deg`);
    const rand = this.position(this.mood.positionMode, seg.text.length);
    const x = seg.anchorX ?? rand.x;
    const y = seg.anchorY ?? rand.y;
    line.style.left = `${x}%`;
    line.style.top  = `${y}%`;
    // tell CSS where on-screen the line is, so max-width can shrink near edges
    line.style.setProperty("--ax", String(x));

    // size scaling (text length based ±25%)
    const baseSize = 64;
    const lengthScale = Math.max(0.5, Math.min(1.5, 16 / Math.max(1, seg.text.length)));
    const size = baseSize * (0.85 + Math.random() * 0.3) * lengthScale;
    line.style.fontSize = `${size}px`;

    // 1 char = 1 span (so per-char anim is possible)
    const chars = [...seg.text];      // grapheme-aware split
    chars.forEach((c, i) => {
      const s = document.createElement("span");
      s.className = "ch";
      s.textContent = c;
      s.style.setProperty("--ch-i", String(i));
      s.style.setProperty("--ch-n", String(chars.length));
      line.appendChild(s);
    });

    // entry: typewriter (per-char stagger) OR block (whole-line)
    const entry = pick(this.mood.entryKeyframes);
    if (this.mood.useTypewriter) {
      ensureTypewriterKf();
      const stagger = Math.min(0.06, 0.7 / Math.max(1, chars.length));   // sec per char
      const each    = "0.42s";
      const lineEls = line.querySelectorAll(".ch");
      lineEls.forEach((el, i) => {
        const e = el as HTMLElement;
        e.style.animation = `vjChType ${each} ease-out both`;
        e.style.animationDelay = `${(i * stagger).toFixed(3)}s`;
      });
      // line stays static (centring transform unchanged); chars do all the entry.
    } else if (entry) {
      line.style.animation = `${entry.name} ${entry.duration} ${entry.easing} ${entry.iteration ?? "1"} both`;
    }

    // motion KF (additive — applied to the line, runs alongside entry)
    if (Math.random() < this.mood.motionRate) {
      const motion = pick(this.mood.motionKeyframes);
      if (motion) {
        const cur = line.style.animation;
        line.style.animation = `${cur}, ${motion.name} ${motion.duration} ${motion.easing} ${motion.iteration ?? "infinite"}`;
      }
    }

    this.layer.appendChild(line);
    requestAnimationFrame(() => line.classList.add("shown"));
    this.active = line;

    // ghost echo
    if (Math.random() < this.mood.ghostRate) this.ghost(seg.text, x, y, size, tilt);

    // glitch
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

let _ghostKf = false;
const ensureGhostKf = (): void => {
  if (_ghostKf) return;
  const s = document.createElement("style");
  s.textContent = "@keyframes ghostFade { 0%{opacity:0.3} 100%{opacity:0; transform:translate(-50%,-50%) scale(1.4)} }";
  document.head.appendChild(s);
  _ghostKf = true;
};

let _twKf = false;
const ensureTypewriterKf = (): void => {
  if (_twKf) return;
  const s = document.createElement("style");
  s.textContent =
    "@keyframes vjChType { " +
      "0%   { opacity: 0; transform: translateY(0.2em) scale(0.75); filter: blur(4px); } " +
      "60%  { opacity: 1; transform: translateY(0)      scale(1.04); filter: blur(0); } " +
      "100% { opacity: 1; transform: translateY(0)      scale(1);    filter: blur(0); } " +
    "}";
  document.head.appendChild(s);
  _twKf = true;
};
