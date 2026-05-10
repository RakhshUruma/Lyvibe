/**
 * Parametric keyframe generators.
 *
 * Each function takes a small parameter bag → emits a valid Keyframe object.
 * The generator handles all CSS string assembly, baseline transform
 * preservation (translate(var(--xshift,-50%),-50%)), and sane defaults.
 *
 * The mood JSON can therefore reference a generator by name + params:
 *   { "name": "shake", "params": { "amplitude": 6, "period": 0.18 } }
 * which expands at normalize time into a proper Keyframe ready to inject.
 *
 * Why parametric instead of fixed pool?
 *   - Continuous parameter space → effectively infinite variants.
 *   - Quality guaranteed (the generator owns valid CSS).
 *   - LLM's job becomes "interpret vibe → set numbers", which it does well.
 *   - Free-form raw keyframes are still allowed via the original
 *     entryKeyframes / motionKeyframes arrays (no-hint LLM novelty).
 */

import type { Keyframe } from "./schema";

export type Recipe = {
  name: string;                       // generator key
  params?: Record<string, any>;
};

const num = (v: any, d: number, lo = -Infinity, hi = Infinity): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
};
const str = (v: any, d: string): string => (typeof v === "string" && v) ? v : d;

const baseT = "translate(var(--xshift,-50%),-50%)";

// ====================================================================
// MOTION GENERATORS — looped, run while line is shown
// ====================================================================

export const MOTION_GENERATORS: Record<
  string, (p: any, id: string) => Keyframe
> = {
  /** Smooth scale breathing. params: { period, depth } */
  breathe: (p, id) => {
    const period = num(p.period, 2.6, 0.4, 12);
    const depth  = num(p.depth, 0.04, 0.005, 0.4);
    return {
      name: id, duration: `${period}s`, easing: "ease-in-out", iteration: "infinite",
      css: `0%,100%{transform:${baseT} scale(1)}50%{transform:${baseT} scale(${1 + depth})}`,
    };
  },

  /** Heartbeat double-tap. params: { period, big, small } */
  heartbeat: (p, id) => {
    const period = num(p.period, 1.15, 0.4, 4);
    const big    = num(p.big,    1.18, 1.02, 1.6);
    const small  = num(p.small,  1.07, 1.0, 1.4);
    return {
      name: id, duration: `${period}s`, easing: "ease-in-out", iteration: "infinite",
      css: `0%,65%,100%{transform:${baseT} scale(1)}12%{transform:${baseT} scale(${big})}30%{transform:${baseT} scale(1)}44%{transform:${baseT} scale(${small})}`,
    };
  },

  /** Sway rotation. params: { period, angleDeg } */
  sway: (p, id) => {
    const period = num(p.period, 3.2, 0.5, 12);
    const ang    = num(p.angleDeg, 2, 0.5, 25);
    return {
      name: id, duration: `${period}s`, easing: "ease-in-out", iteration: "infinite alternate",
      css: `0%{transform:${baseT} rotate(-${ang}deg)}100%{transform:${baseT} rotate(${ang}deg)}`,
    };
  },

  /** Vertical bounce. params: { period, height } */
  bounce: (p, id) => {
    const period = num(p.period, 1.0, 0.2, 4);
    const h      = num(p.height, 6, 1, 60);
    return {
      name: id, duration: `${period}s`, easing: "ease-out", iteration: "infinite",
      css: `0%,100%{transform:${baseT}}40%{transform:${baseT} translateY(-${h}px)}80%{transform:${baseT}}`,
    };
  },

  /** Stepped jitter. params: { amplitude, period, axis (x|y|both) } */
  shake: (p, id) => {
    const amp    = num(p.amplitude, 3, 0.5, 30);
    const period = num(p.period, 0.18, 0.05, 1);
    const axis   = str(p.axis, "x");
    const dx = axis === "y" ? 0 : amp;
    const dy = axis === "x" ? 0 : amp;
    return {
      name: id, duration: `${period}s`, easing: "steps(4)", iteration: "infinite",
      css: `0%,100%{transform:${baseT}}25%{transform:translate(calc(var(--xshift,-50%) - ${dx}px),calc(-50% + ${dy}px))}50%{transform:translate(calc(var(--xshift,-50%) + ${dx}px),calc(-50% - ${dy}px))}75%{transform:translate(calc(var(--xshift,-50%) - ${dx*0.5}px),calc(-50% + ${dy*0.5}px))}`,
    };
  },

  /** Diagonal drift, alternates direction. params: { angleDeg, distance, period } */
  drift: (p, id) => {
    const ang = num(p.angleDeg, 30, 0, 360);
    const d   = num(p.distance, 8, 1, 60);
    const period = num(p.period, 5, 0.5, 20);
    const dx = (Math.cos(ang * Math.PI / 180) * d).toFixed(1);
    const dy = (Math.sin(ang * Math.PI / 180) * d).toFixed(1);
    return {
      name: id, duration: `${period}s`, easing: "ease-in-out", iteration: "infinite alternate",
      css: `0%{transform:translate(calc(var(--xshift,-50%) - ${dx}px),calc(-50% - ${dy}px))}100%{transform:translate(calc(var(--xshift,-50%) + ${dx}px),calc(-50% + ${dy}px))}`,
    };
  },

  /** Stepped glitch with optional hue rotation. params: { jitterPx, period, hueRotate } */
  glitch: (p, id) => {
    const j = num(p.jitterPx, 4, 1, 30);
    const period = num(p.period, 0.3, 0.08, 1.2);
    const hue = num(p.hueRotate, 0, 0, 180);
    return {
      name: id, duration: `${period}s`, easing: "steps(4)", iteration: "infinite",
      css: `0%,100%{transform:${baseT};filter:hue-rotate(0deg)}25%{transform:translate(calc(var(--xshift,-50%) - ${j}px),-50%);filter:hue-rotate(${hue}deg)}50%{transform:translate(calc(var(--xshift,-50%) + ${(j*1.3).toFixed(1)}px),-50%);filter:hue-rotate(-${(hue/2).toFixed(0)}deg)}75%{transform:translate(calc(var(--xshift,-50%) - ${(j*0.5).toFixed(1)}px),-50%);filter:hue-rotate(0deg)}`,
    };
  },

  /** Wing-flap-like flutter (rotation+slight Y). params: { period, angleDeg, lift } */
  flutter: (p, id) => {
    const period = num(p.period, 0.6, 0.2, 2);
    const ang = num(p.angleDeg, 6, 1, 25);
    const lift = num(p.lift, 3, 0, 20);
    return {
      name: id, duration: `${period}s`, easing: "ease-in-out", iteration: "infinite",
      css: `0%,100%{transform:${baseT} rotate(0deg)}33%{transform:${baseT} translateY(-${lift}px) rotate(${ang}deg)}66%{transform:${baseT} translateY(-${(lift*0.5).toFixed(1)}px) rotate(-${ang}deg)}`,
    };
  },

  /** Anisotropic squash/stretch. params: { period, amplitude } */
  ripple: (p, id) => {
    const period = num(p.period, 0.8, 0.2, 4);
    const amp = num(p.amplitude, 0.06, 0.01, 0.3);
    return {
      name: id, duration: `${period}s`, easing: "ease-in-out", iteration: "infinite",
      css: `0%,100%{transform:${baseT} scaleX(1) scaleY(1)}50%{transform:${baseT} scaleX(${1+amp}) scaleY(${1-amp})}`,
    };
  },

  /** Pulsing drop-shadow glow. params: { period, baseBlur, peakBlur } */
  pulseGlow: (p, id) => {
    const period = num(p.period, 1.6, 0.4, 6);
    const base = num(p.baseBlur, 4, 0, 60);
    const peak = num(p.peakBlur, 22, base + 2, 80);
    return {
      name: id, duration: `${period}s`, easing: "ease-in-out", iteration: "infinite",
      css: `0%,100%{filter:drop-shadow(0 0 ${base}px var(--accent))}50%{filter:drop-shadow(0 0 ${peak}px var(--hot)) drop-shadow(0 0 ${(peak*0.6).toFixed(0)}px var(--accent))}`,
    };
  },

  /** Opacity flicker. params: { period, depth } */
  flicker: (p, id) => {
    const period = num(p.period, 0.9, 0.1, 3);
    const depth = num(p.depth, 0.4, 0.1, 0.9);
    const lo = (1 - depth).toFixed(2);
    return {
      name: id, duration: `${period}s`, easing: "steps(8)", iteration: "infinite",
      css: `0%,100%{opacity:1}30%{opacity:${lo}}60%{opacity:1}75%{opacity:${(parseFloat(lo) + 0.2).toFixed(2)}}`,
    };
  },
};

// ====================================================================
// ENTRY GENERATORS — one-shot when a line appears
// ====================================================================

const ENTRY_FILL = "both";

export const ENTRY_GENERATORS: Record<
  string, (p: any, id: string) => Keyframe
> = {
  /** Plain fade with mild scale. params: { duration, fromScale } */
  fade: (p, id) => ({
    name: id, duration: `${num(p.duration, 0.6, 0.15, 2)}s`,
    easing: str(p.easing, "ease-out"), iteration: ENTRY_FILL,
    css: `0%{opacity:0;transform:${baseT} scale(${num(p.fromScale, 0.92, 0.5, 1.5)})}100%{opacity:1;transform:${baseT} scale(1)}`,
  }),

  /** Pop with slight rotate. params: { duration, fromScale, fromRotate } */
  pop: (p, id) => ({
    name: id, duration: `${num(p.duration, 0.5, 0.15, 1.2)}s`,
    easing: str(p.easing, "cubic-bezier(.2,.9,.25,1.4)"), iteration: ENTRY_FILL,
    css: `0%{opacity:0;transform:${baseT} scale(${num(p.fromScale, 0.2, 0, 1)}) rotate(${num(p.fromRotate, -12, -180, 180)}deg)}60%{opacity:1;transform:${baseT} scale(1.12) rotate(2deg)}100%{opacity:1;transform:${baseT} scale(1) rotate(0)}`,
  }),

  /** Slide direction. params: { duration, fromDir (up|down|left|right), distance } */
  slide: (p, id) => {
    const dir = str(p.fromDir, "up");
    const d = num(p.distance, 50, 5, 300);
    let from = "";
    if (dir === "up")    from = `transform:${baseT} translateY(${d}px)`;
    if (dir === "down")  from = `transform:${baseT} translateY(-${d}px)`;
    if (dir === "left")  from = `transform:translate(calc(var(--xshift,-50%) - ${d}px),-50%)`;
    if (dir === "right") from = `transform:translate(calc(var(--xshift,-50%) + ${d}px),-50%)`;
    return {
      name: id, duration: `${num(p.duration, 0.55, 0.15, 1.5)}s`,
      easing: str(p.easing, "cubic-bezier(.16,1,.3,1)"), iteration: ENTRY_FILL,
      css: `0%{opacity:0;${from}}100%{opacity:1;transform:${baseT}}`,
    };
  },

  /** Spin in. params: { duration, fromAngleDeg, fromScale } */
  spin: (p, id) => ({
    name: id, duration: `${num(p.duration, 0.7, 0.2, 1.5)}s`,
    easing: str(p.easing, "cubic-bezier(.2,.9,.25,1.2)"), iteration: ENTRY_FILL,
    css: `0%{opacity:0;transform:${baseT} rotate(${num(p.fromAngleDeg, -180, -720, 720)}deg) scale(${num(p.fromScale, 0.3, 0, 1)})}100%{opacity:1;transform:${baseT} rotate(0) scale(1)}`,
  }),

  /** Slam with blur. params: { duration, fromScale, blurPx } */
  slam: (p, id) => ({
    name: id, duration: `${num(p.duration, 0.4, 0.2, 1.0)}s`,
    easing: str(p.easing, "cubic-bezier(.55,0,.35,1.6)"), iteration: ENTRY_FILL,
    css: `0%{opacity:0;transform:${baseT} scale(${num(p.fromScale, 2.2, 1.2, 4)});filter:blur(${num(p.blurPx, 8, 0, 30)}px)}70%{opacity:1;transform:${baseT} scale(0.95);filter:blur(0)}100%{opacity:1;transform:${baseT} scale(1);filter:blur(0)}`,
  }),

  /** Drop from above. params: { duration, distance, tiltDeg } */
  drop: (p, id) => {
    const d = num(p.distance, 200, 20, 600);
    const t = num(p.tiltDeg, -8, -45, 45);
    return {
      name: id, duration: `${num(p.duration, 0.65, 0.2, 1.5)}s`,
      easing: str(p.easing, "cubic-bezier(.55,0,.45,1.4)"), iteration: ENTRY_FILL,
      css: `0%{opacity:0;transform:${baseT} translateY(-${d}px) rotate(${t}deg)}60%{opacity:1;transform:${baseT} translateY(8px) rotate(${(-t/4).toFixed(1)}deg)}100%{opacity:1;transform:${baseT} translateY(0) rotate(0)}`,
    };
  },

  /** 3D flip. params: { duration, axis (X|Y), fromAngle } */
  flip: (p, id) => {
    const axis = str(p.axis, "Y").toUpperCase() === "X" ? "X" : "Y";
    const ang = num(p.fromAngleDeg, 90, 30, 180);
    return {
      name: id, duration: `${num(p.duration, 0.6, 0.2, 1.5)}s`,
      easing: str(p.easing, "cubic-bezier(.4,0,.2,1)"), iteration: ENTRY_FILL,
      css: `0%{opacity:0;transform:${baseT} perspective(600px) rotate${axis}(${ang}deg)}100%{opacity:1;transform:${baseT} perspective(600px) rotate${axis}(0)}`,
    };
  },

  /** Glitch hue+jitter steps. params: { duration, jitterPx, hueRotate } */
  glitch: (p, id) => {
    const j = num(p.jitterPx, 6, 1, 30);
    const h = num(p.hueRotate, 90, 0, 270);
    return {
      name: id, duration: `${num(p.duration, 0.5, 0.2, 1.2)}s`,
      easing: str(p.easing, "steps(8)"), iteration: ENTRY_FILL,
      css: `0%{opacity:0;transform:${baseT} translateX(-${j}px);filter:hue-rotate(${h}deg)}25%{opacity:1;transform:${baseT} translateX(${(j*1.3).toFixed(1)}px);filter:hue-rotate(-${(h/3).toFixed(0)}deg)}50%{transform:${baseT} translateX(-${(j*0.6).toFixed(1)}px);filter:hue-rotate(${(h*0.6).toFixed(0)}deg)}75%{transform:${baseT} translateX(${(j*0.3).toFixed(1)}px);filter:hue-rotate(0)}100%{opacity:1;transform:${baseT};filter:none}`,
    };
  },

  /** Emerge from blur+darkness. params: { duration, fromBlurPx, fromBrightness } */
  emerge: (p, id) => ({
    name: id, duration: `${num(p.duration, 0.85, 0.3, 2)}s`,
    easing: str(p.easing, "ease-out"), iteration: ENTRY_FILL,
    css: `0%{opacity:0;transform:${baseT} scale(${num(p.fromScale, 0.3, 0, 1)});filter:blur(${num(p.fromBlurPx, 20, 0, 40)}px) brightness(${num(p.fromBrightness, 0.3, 0, 1)})}70%{opacity:1;filter:blur(2px) brightness(1.3)}100%{opacity:1;transform:${baseT} scale(1);filter:blur(0) brightness(1)}`,
  }),

  /** Shatter assemble (multiple chars feel). params: { duration, scatter, rotate } */
  shatter: (p, id) => {
    const s = num(p.scatter, 30, 5, 120);
    const r = num(p.rotate, 35, 0, 180);
    return {
      name: id, duration: `${num(p.duration, 0.7, 0.3, 2)}s`,
      easing: str(p.easing, "cubic-bezier(.2,.9,.25,1.2)"), iteration: ENTRY_FILL,
      css: `0%{opacity:0;transform:${baseT} translate(${s}px,-${(s*0.7).toFixed(0)}px) rotate(${r}deg) scale(2);filter:blur(6px)}100%{opacity:1;transform:${baseT} translate(0,0) rotate(0) scale(1);filter:blur(0)}`,
    };
  },

  /** Vibrate-in (high frequency rattle in). params: { duration, jitterPx, settle } */
  vibrate: (p, id) => {
    const j = num(p.jitterPx, 4, 1, 20);
    return {
      name: id, duration: `${num(p.duration, 0.45, 0.2, 1.2)}s`,
      easing: str(p.easing, "steps(8)"), iteration: ENTRY_FILL,
      css: `0%{opacity:0;transform:${baseT} translate(-${j}px,${j}px)}20%{opacity:1;transform:${baseT} translate(${j}px,-${j}px)}40%{transform:${baseT} translate(-${(j*0.7).toFixed(1)}px,${(j*0.7).toFixed(1)}px)}60%{transform:${baseT} translate(${(j*0.4).toFixed(1)}px,-${(j*0.4).toFixed(1)}px)}80%{transform:${baseT} translate(-${(j*0.2).toFixed(1)}px,0)}100%{opacity:1;transform:${baseT}}`,
    };
  },
};

// ====================================================================
// Expand a recipe → Keyframe (returns null if generator unknown)
// ====================================================================

export const expandRecipe = (
  recipe: Recipe,
  pool: Record<string, (p: any, id: string) => Keyframe>,
  fallbackId: string,
): Keyframe | null => {
  if (!recipe || typeof recipe.name !== "string") return null;
  const gen = pool[recipe.name];
  if (!gen) return null;
  const id = `vj-gen-${recipe.name}-${Math.random().toString(36).slice(2, 7)}-${fallbackId}`;
  try { return gen(recipe.params || {}, id); }
  catch { return null; }
};

export const listMotionGenerators = () => Object.keys(MOTION_GENERATORS);
export const listEntryGenerators  = () => Object.keys(ENTRY_GENERATORS);
