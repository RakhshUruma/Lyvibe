import type { Mood, Keyframe } from "./schema";

// ====================================================================
// Reusable keyframe library
// All transform keyframes preserve translate(var(--xshift,-50%),-50%) to keep the line
// centred on its (left,top) anchor — that's how lines.ts positions them.
// ====================================================================

const ENTRY: Record<string, Keyframe> = {
  fade: {
    name: "kfFade", duration: "0.6s", easing: "ease-out",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) scale(0.92)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1)}",
  },
  popIn: {
    name: "kfPopIn", duration: "0.55s", easing: "cubic-bezier(.2,.9,.25,1.4)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) scale(0.2) rotate(-12deg)} 60%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1.12) rotate(2deg)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1) rotate(0)}",
  },
  slideUp: {
    name: "kfSlideUp", duration: "0.65s", easing: "cubic-bezier(.16,1,.3,1)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),calc(-50% + 50px)) scale(0.95)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1)}",
  },
  slideDown: {
    name: "kfSlideDown", duration: "0.65s", easing: "cubic-bezier(.16,1,.3,1)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),calc(-50% - 50px)) scale(0.95)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1)}",
  },
  slideLeft: {
    name: "kfSlideLeft", duration: "0.55s", easing: "cubic-bezier(.16,1,.3,1)",
    css: "0%{opacity:0;transform:translate(calc(var(--xshift,-50%) - 80px),-50%)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%)}",
  },
  slideRight: {
    name: "kfSlideRight", duration: "0.55s", easing: "cubic-bezier(.16,1,.3,1)",
    css: "0%{opacity:0;transform:translate(calc(var(--xshift,-50%) + 80px),-50%)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%)}",
  },
  spin: {
    name: "kfSpin", duration: "0.7s", easing: "cubic-bezier(.2,.9,.25,1.2)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) rotate(-180deg) scale(0.3)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) rotate(0) scale(1)}",
  },
  slam: {
    name: "kfSlam", duration: "0.4s", easing: "cubic-bezier(.55,0,.35,1.6)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) scale(2.2);filter:blur(8px)} 70%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(0.95);filter:blur(0)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1);filter:blur(0)}",
  },
  drop: {
    name: "kfDrop", duration: "0.7s", easing: "cubic-bezier(.55,0,.45,1.4)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),calc(-50% - 200px)) rotate(-8deg)} 60%{opacity:1;transform:translate(var(--xshift,-50%),calc(-50% + 6px)) rotate(2deg)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) rotate(0)}",
  },
  flip: {
    name: "kfFlip", duration: "0.65s", easing: "cubic-bezier(.4,0,.2,1)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) perspective(600px) rotateY(90deg)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) perspective(600px) rotateY(0)}",
  },
  glitchAppear: {
    name: "kfGlitchAppear", duration: "0.5s", easing: "steps(8)",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) translateX(-6px);filter:hue-rotate(90deg)} 25%{opacity:1;transform:translate(var(--xshift,-50%),-50%) translateX(8px);filter:hue-rotate(-30deg)} 50%{transform:translate(var(--xshift,-50%),-50%) translateX(-4px);filter:hue-rotate(60deg)} 75%{transform:translate(var(--xshift,-50%),-50%) translateX(2px);filter:hue-rotate(0)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%);filter:none}",
  },
  emerge: {
    name: "kfEmerge", duration: "0.9s", easing: "ease-out",
    css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) scale(0.3);filter:blur(20px) brightness(0.3)} 70%{opacity:1;filter:blur(2px) brightness(1.3)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1);filter:blur(0) brightness(1)}",
  },
};

const MOTION: Record<string, Keyframe> = {
  breathe: {
    name: "kfBreathe", duration: "2.6s", easing: "ease-in-out", iteration: "infinite",
    css: "0%,100%{transform:translate(var(--xshift,-50%),-50%) scale(1)} 50%{transform:translate(var(--xshift,-50%),-50%) scale(1.04)}",
  },
  bounce: {
    name: "kfBounce", duration: "1.1s", easing: "ease-out", iteration: "infinite",
    css: "0%,100%{transform:translate(var(--xshift,-50%),-50%)} 40%{transform:translate(var(--xshift,-50%),calc(-50% - 8px))}",
  },
  sway: {
    name: "kfSway", duration: "3.2s", easing: "ease-in-out", iteration: "infinite alternate",
    css: "0%{transform:translate(var(--xshift,-50%),-50%) rotate(-2deg)} 100%{transform:translate(var(--xshift,-50%),-50%) rotate(2deg)}",
  },
  flicker: {
    name: "kfFlicker", duration: "0.8s", easing: "steps(8)", iteration: "infinite",
    css: "0%,100%{opacity:1} 30%{opacity:0.5} 50%{opacity:1} 60%{opacity:0.7} 80%{opacity:1}",
  },
  jitter: {
    name: "kfJitter", duration: "0.18s", easing: "steps(4)", iteration: "infinite",
    css: "0%,100%{transform:translate(var(--xshift,-50%),-50%)} 25%{transform:translate(calc(var(--xshift,-50%) - 1px),calc(-50% + 1px))} 50%{transform:translate(calc(var(--xshift,-50%) + 1px),calc(-50% - 1px))} 75%{transform:translate(calc(var(--xshift,-50%) + 1px),calc(-50% + 1px))}",
  },
  heartbeat: {
    name: "kfHeartbeat", duration: "1.15s", easing: "ease-in-out", iteration: "infinite",
    css: "0%,65%,100%{transform:translate(var(--xshift,-50%),-50%) scale(1);filter:brightness(1)} 12%{transform:translate(var(--xshift,-50%),-50%) scale(1.12);filter:brightness(1.4)} 28%{transform:translate(var(--xshift,-50%),-50%) scale(1);filter:brightness(1)} 42%{transform:translate(var(--xshift,-50%),-50%) scale(1.06);filter:brightness(1.2)}",
  },
  drift: {
    name: "kfDrift", duration: "5s", easing: "ease-in-out", iteration: "infinite alternate",
    css: "0%{transform:translate(calc(var(--xshift,-50%) - 8px),calc(-50% + 4px))} 100%{transform:translate(calc(var(--xshift,-50%) + 8px),calc(-50% - 4px))}",
  },
  pulseGlow: {
    name: "kfPulseGlow", duration: "1.6s", easing: "ease-in-out", iteration: "infinite",
    css: "0%,100%{filter:drop-shadow(0 0 4px rgba(255,255,255,0.4))} 50%{filter:drop-shadow(0 0 18px rgba(255,255,255,0.9))}",
  },
};

const k = (...names: (keyof typeof ENTRY)[]): Keyframe[] => names.map(n => ENTRY[n]!);
const m = (...names: (keyof typeof MOTION)[]): Keyframe[] => names.map(n => MOTION[n]!);

// Reusable bg keyframes — give static gradients pulse / drift / scan / bleed.
const BGK: Record<string, Keyframe> = {
  pulse: {
    name: "vjBgPulse", duration: "3.6s", easing: "ease-in-out", iteration: "infinite",
    css: "0%,100%{filter:brightness(1) saturate(1)} 50%{filter:brightness(1.25) saturate(1.3)}",
  },
  drift: {
    name: "vjBgDrift", duration: "12s", easing: "ease-in-out", iteration: "infinite alternate",
    css: "0%{background-position:0% 50%} 100%{background-position:100% 50%}",
  },
  scan: {
    name: "vjBgScan", duration: "6s", easing: "linear", iteration: "infinite",
    css: "0%{background-position:0 -100%} 100%{background-position:0 200%}",
  },
  spin: {
    name: "vjBgSpin", duration: "30s", easing: "linear", iteration: "infinite",
    css: "from{rotate:0deg} to{rotate:360deg}",
  },
  flicker: {
    name: "vjBgFlicker", duration: "0.18s", easing: "steps(4)", iteration: "infinite",
    css: "0%,100%{opacity:1} 50%{opacity:0.85}",
  },
};
const bg = (...names: (keyof typeof BGK)[]): Keyframe[] => names.map(n => BGK[n]!);

const base = (over: Partial<Mood>): Mood => ({
  bg: "#0a0a12", accent: "#6fe9ff", hot: "#ff2da0", cool: "#00f0ff",
  font: "Impact, sans-serif", weight: 900, color: "#ffffff",
  blur: 0, rgbSplit: 3, panelBorder: "rgba(255,255,255,0.08)",
  tilt: 6, glitchRate: 0.18, ghostRate: 0.4, motionRate: 0.7, bgSwapRate: 0.45,
  positionMode: "scatter",
  bgCssVariants: ["background: #0a0a12;"],
  lineExtraCss: "",
  entryKeyframes: k("fade", "popIn", "slideUp"),
  motionKeyframes: m("breathe", "sway"),
  bgKeyframes: [],
  useTypewriter: false,
  sceneElements: [],
  ...over,
});

// ====================================================================
// PRESETS — each one varies entry/motion vocabulary & bg variants
// ====================================================================

export const PRESETS: Record<string, Mood> = {
  cyber: base({
    bg: "#02030a", accent: "#00f0ff", hot: "#ff2da0", cool: "#00f0ff",
    rgbSplit: 3, glitchRate: 0.18, ghostRate: 0.35, motionRate: 0.55, bgSwapRate: 0.35,
    tilt: 5, positionMode: "scatter",
    entryKeyframes: k("popIn", "slideUp", "spin", "glitchAppear"),
    motionKeyframes: m("sway", "jitter", "pulseGlow"),
    bgKeyframes: bg("scan", "pulse"),
    bgCssVariants: [
      "background: #02030a; background-image: linear-gradient(0deg,transparent 59px,rgba(0,240,255,0.20) 60px),linear-gradient(90deg,transparent 59px,rgba(0,240,255,0.20) 60px); background-size: 60px 60px; animation: vjBgScan 14s linear infinite;",
      "background: radial-gradient(ellipse at center, #0a1530, #02030a 70%); animation: vjBgPulse 5s ease-in-out infinite;",
      "background: #02030a; background-image: repeating-linear-gradient(135deg, transparent 0 40px, rgba(255,45,160,0.08) 40px 41px); animation: vjBgScan 10s linear infinite;",
    ],
  }),

  dream: base({
    bg: "#1a0e2a", accent: "#ffb3e6", hot: "#ffd1ff", cool: "#a0e5ff",
    blur: 0.4, rgbSplit: 1, glitchRate: 0.04, ghostRate: 0.4, motionRate: 0.7, bgSwapRate: 0.35,
    tilt: 2, positionMode: "scatter", color: "#fff5fc", weight: 400, font: "Georgia, serif",
    entryKeyframes: k("fade", "slideUp", "emerge"),
    motionKeyframes: m("breathe", "drift", "sway"),
    bgKeyframes: bg("pulse", "drift"),
    sceneElements: [{
      shape: "svg",
      svgPath: "M20,12 C16,4 4,4 4,16 C4,22 12,24 20,20 C28,24 36,22 36,16 C36,4 24,4 20,12 Z",
      svgViewBox: "0 0 40 40",
      fill: "#ffb3e6",
      sizeRange: [36, 64],
      count: 4,
      spawnRate: 0.25,
      motion: { type: "drift", durationRange: [10, 16], sineAmplitude: 50, sinePeriod: 1600 },
      selfAnim: { property: "scaleX", range: [0.45, 1.0], periodMs: 320, easing: "ease-in-out" },
      opacityRange: [0.6, 0.9],
      blendMode: "screen",
    }],
    bgCssVariants: [
      "background: radial-gradient(circle at 30% 30%, #5a3580 0%, #1a0e2a 60%); background-size: 200% 200%; animation: vjBgDrift 14s ease-in-out infinite alternate, vjBgPulse 5s ease-in-out infinite;",
      "background: radial-gradient(circle at 70% 70%, #8a4dab 0%, #1a0e2a 60%); background-size: 200% 200%; animation: vjBgDrift 18s ease-in-out infinite alternate;",
      "background: linear-gradient(135deg, #2a1545 0%, #1a0e2a 50%, #2a1255 100%); background-size: 300% 300%; animation: vjBgDrift 16s ease-in-out infinite alternate;",
      "background: radial-gradient(ellipse at 50% 0%, #a070d0 0%, #1a0e2a 65%); animation: vjBgPulse 4s ease-in-out infinite;",
    ],
  }),

  mono: base({
    bg: "#000", accent: "#fff", hot: "#fff", cool: "#fff", color: "#fff",
    rgbSplit: 0, blur: 0, glitchRate: 0.12, ghostRate: 0.3, motionRate: 0.45, bgSwapRate: 0.6,
    tilt: 0, positionMode: "center", font: "Courier New, monospace", weight: 700,
    useTypewriter: true,
    entryKeyframes: k("slideLeft", "slideRight", "fade"),
    motionKeyframes: m("flicker", "jitter"),
    bgCssVariants: [
      "background: #000;",
      "background: repeating-linear-gradient(90deg, #000 0 80px, #0a0a0a 80px 160px);",
      "background: #000; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 4px);",
    ],
  }),

  neon: base({
    bg: "#0a0014", accent: "#ff5fa0", hot: "#ff5fa0", cool: "#9d3aff",
    rgbSplit: 4, glitchRate: 0.18, ghostRate: 0.45, motionRate: 0.65, bgSwapRate: 0.4,
    tilt: 6, positionMode: "scatter",
    entryKeyframes: k("popIn", "spin", "drop", "slideRight"),
    motionKeyframes: m("bounce", "pulseGlow", "sway"),
    bgKeyframes: bg("pulse", "spin"),
    bgCssVariants: [
      "background: radial-gradient(ellipse at center, #2a0044, #0a0014 70%); animation: vjBgPulse 4s ease-in-out infinite;",
      "background: linear-gradient(45deg, #0a0014, #1a0030); background-size: 200% 200%; animation: vjBgDrift 14s ease-in-out infinite alternate;",
      "background: #0a0014; background-image: radial-gradient(circle at 20% 80%, rgba(255,95,160,0.28), transparent 40%), radial-gradient(circle at 80% 20%, rgba(157,58,255,0.28), transparent 40%); animation: vjBgPulse 3.5s ease-in-out infinite;",
      "background: conic-gradient(from 0deg at 50% 50%, #1a0030, #0a0014, #2a0044, #0a0014, #1a0030); animation: vjBgSpin 60s linear infinite;",
    ],
  }),

  vhs: base({
    bg: "#080806", accent: "#f4d03f", hot: "#ff5040", cool: "#40d0ff",
    rgbSplit: 4, glitchRate: 0.3, ghostRate: 0.3, motionRate: 0.55, bgSwapRate: 0.45,
    tilt: 0, positionMode: "center",
    entryKeyframes: k("glitchAppear", "slam", "slideLeft"),
    motionKeyframes: m("flicker", "jitter"),
    bgKeyframes: bg("scan", "flicker"),
    bgCssVariants: [
      "background: #080806; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 4px); animation: vjBgScan 12s linear infinite, vjBgFlicker 0.6s steps(4) infinite;",
      "background: #080806; background-image: linear-gradient(180deg, rgba(255,255,255,0.06), transparent 30%), repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px); animation: vjBgScan 16s linear infinite;",
      "background: #080806; background-image: radial-gradient(ellipse at 50% 50%, rgba(244,208,63,0.08), transparent 60%); animation: vjBgFlicker 0.8s steps(4) infinite;",
    ],
  }),

  zen: base({
    bg: "#1c2026", accent: "#9bbac3", hot: "#c8a878", cool: "#9bbac3",
    rgbSplit: 0, blur: 0, glitchRate: 0, ghostRate: 0.15, motionRate: 0.5, bgSwapRate: 0.15,
    tilt: 1, positionMode: "center",
    color: "#e8e4d8", weight: 300, font: "Georgia, serif",
    useTypewriter: true,
    entryKeyframes: k("fade", "slideUp"),
    motionKeyframes: m("breathe", "drift"),
    bgCssVariants: [
      "background: radial-gradient(ellipse at center, #2c343c, #1c2026 70%);",
      "background: linear-gradient(180deg, #2c343c 0%, #1c2026 60%);",
    ],
  }),

  aurora: base({
    bg: "#020822", accent: "#7affc1", hot: "#9d6bff", cool: "#3affff",
    rgbSplit: 2, blur: 0.4, glitchRate: 0, ghostRate: 0.5, motionRate: 0.7, bgSwapRate: 0.4,
    tilt: 2, positionMode: "scatter", color: "#e8fff5", weight: 400, font: "Georgia, serif",
    useTypewriter: true,
    entryKeyframes: k("fade", "slideUp", "emerge"),
    motionKeyframes: m("breathe", "drift", "sway"),
    bgKeyframes: bg("drift", "pulse"),
    bgCssVariants: [
      "background: linear-gradient(180deg, #020822 0%, #082040 60%, #020822 100%); background-size: 200% 200%; animation: vjBgDrift 20s ease-in-out infinite alternate;",
      "background: radial-gradient(ellipse at 50% 110%, #1a4a78 0%, #082040 35%, #020822 75%); animation: vjBgPulse 6s ease-in-out infinite;",
      "background: linear-gradient(135deg, #082040 0%, #1a3050 50%, #020822 100%); background-size: 300% 300%; animation: vjBgDrift 14s ease-in-out infinite alternate;",
    ],
    sceneElements: [{
      shape: "emoji", emoji: "✨",
      sizeRange: [12, 22], count: 30, spawnRate: 0.6,
      motion: { type: "rise", durationRange: [10, 18], sineAmplitude: 18, sinePeriod: 3000 },
      selfAnim: { property: "scale", range: [0.55, 1.0], periodMs: 2200 },
      opacityRange: [0.4, 0.9], blendMode: "screen",
    }],
  }),

  forest: base({
    bg: "#0a1812", accent: "#9ad28f", hot: "#d4a16f", cool: "#7fb59f",
    rgbSplit: 1, blur: 0.3, glitchRate: 0, ghostRate: 0.3, motionRate: 0.7, bgSwapRate: 0.3,
    tilt: 3, positionMode: "scatter", color: "#e8f0e0", weight: 400, font: "Georgia, serif",
    useTypewriter: true,
    entryKeyframes: k("fade", "slideUp", "emerge"),
    motionKeyframes: m("breathe", "sway", "drift"),
    bgKeyframes: bg("drift", "pulse"),
    bgCssVariants: [
      "background: radial-gradient(ellipse at 30% 30%, #1a3025 0%, #0a1812 70%); background-size: 200% 200%; animation: vjBgDrift 18s ease-in-out infinite alternate;",
      "background: linear-gradient(170deg, #0e2018 0%, #0a1812 60%, #050a08 100%); animation: vjBgPulse 6s ease-in-out infinite;",
    ],
    sceneElements: [{
      shape: "svg",
      svgPath: "M4,20 C12,4 28,4 36,20 C28,36 12,36 4,20 Z",
      svgViewBox: "0 0 40 40",
      fill: "#c4d49a",
      sizeRange: [22, 40], count: 14, spawnRate: 0.8,
      motion: { type: "rain", durationRange: [9, 15], sineAmplitude: 60, sinePeriod: 2400, rotateMode: "spin" },
      opacityRange: [0.55, 0.9], blendMode: "screen",
    }],
  }),

  flame: base({
    bg: "#0a0200", accent: "#ff7f30", hot: "#ffd23f", cool: "#ff3030",
    rgbSplit: 4, blur: 0.5, glitchRate: 0.18, ghostRate: 0.55, motionRate: 0.85, bgSwapRate: 0.5,
    tilt: 5, positionMode: "scatter", color: "#fff5e0", weight: 900, font: "Impact, sans-serif",
    entryKeyframes: k("popIn", "drop", "slam", "emerge"),
    motionKeyframes: m("heartbeat", "pulseGlow", "sway"),
    bgKeyframes: bg("pulse", "drift"),
    bgCssVariants: [
      "background: radial-gradient(ellipse at 50% 110%, #ff6020 0%, #401000 30%, #0a0200 70%); animation: vjBgPulse 1.6s ease-in-out infinite;",
      "background: linear-gradient(0deg, #ff3030 0%, #401000 35%, #0a0200 75%); background-size: 200% 200%; animation: vjBgDrift 4s ease-in-out infinite alternate, vjBgPulse 2s ease-in-out infinite;",
      "background: radial-gradient(circle at 50% 100%, rgba(255,127,48,0.5), transparent 50%), #0a0200; animation: vjBgPulse 1.2s ease-in-out infinite;",
    ],
    sceneElements: [{
      shape: "emoji", emoji: "🔥",
      sizeRange: [40, 80], count: 14, spawnRate: 2.5,
      motion: { type: "rise", durationRange: [2.5, 4], sineAmplitude: 18, sinePeriod: 600 },
      selfAnim: { property: "scale", range: [0.7, 1.25], periodMs: 380 },
      opacityRange: [0.7, 1.0], blendMode: "screen",
    }, {
      shape: "emoji", emoji: "✨",
      sizeRange: [14, 26], count: 30, spawnRate: 4,
      motion: { type: "rise", durationRange: [1.6, 3], sineAmplitude: 30, sinePeriod: 800 },
      opacityRange: [0.5, 0.95], blendMode: "screen",
    }],
  }),

  aqua: base({
    bg: "#021022", accent: "#5fd0ff", hot: "#a0f0ff", cool: "#3088c0",
    rgbSplit: 2, blur: 0.4, glitchRate: 0, ghostRate: 0.45, motionRate: 0.8, bgSwapRate: 0.4,
    tilt: 2, positionMode: "scatter", color: "#e8f8ff", weight: 400, font: "Georgia, serif",
    useTypewriter: true,
    entryKeyframes: k("fade", "slideUp", "emerge"),
    motionKeyframes: m("breathe", "drift", "sway"),
    bgKeyframes: bg("pulse", "drift"),
    bgCssVariants: [
      "background: radial-gradient(ellipse at 50% 30%, #1a5080 0%, #021022 70%); background-size: 180% 180%; animation: vjBgDrift 16s ease-in-out infinite alternate, vjBgPulse 5s ease-in-out infinite;",
      "background: linear-gradient(180deg, #1a4070 0%, #021022 70%, #000810 100%); animation: vjBgPulse 4s ease-in-out infinite;",
      "background: radial-gradient(circle at 30% 20%, #3088c0 0%, #021022 60%); animation: vjBgPulse 5s ease-in-out infinite;",
    ],
    sceneElements: [{
      shape: "emoji", emoji: "🫧",
      sizeRange: [18, 44], count: 18, spawnRate: 1.2,
      motion: { type: "rise", durationRange: [6, 11], sineAmplitude: 30, sinePeriod: 2200 },
      selfAnim: { property: "scale", range: [0.85, 1.05], periodMs: 1800 },
      opacityRange: [0.5, 0.85],
    }],
  }),

  chaos: base({
    bg: "#000", accent: "#00ff00", hot: "#ff00ff", cool: "#00ffff",
    rgbSplit: 6, blur: 0.5, glitchRate: 0.45, ghostRate: 0.7, motionRate: 0.8, bgSwapRate: 0.6,
    tilt: 14, positionMode: "scatter",
    entryKeyframes: k("popIn", "spin", "drop", "flip", "slam", "glitchAppear", "slideLeft", "slideRight"),
    motionKeyframes: m("jitter", "bounce", "flicker", "pulseGlow", "heartbeat"),
    bgKeyframes: bg("drift", "spin", "flicker", "pulse"),
    bgCssVariants: [
      "background: linear-gradient(45deg, #ff00ff, #00ffff, #ffff00, #ff00ff); background-size: 400% 400%; animation: vjBgDrift 8s ease-in-out infinite alternate;",
      "background: conic-gradient(from 0deg, #ff00ff, #00ffff, #ffff00, #ff00ff); animation: vjBgSpin 14s linear infinite;",
      "background: radial-gradient(circle at 50% 50%, #ff0080, #000); animation: vjBgPulse 1.5s ease-in-out infinite;",
      "background: repeating-linear-gradient(45deg, #ff00ff 0 30px, #00ffff 30px 60px, #ffff00 60px 90px); background-size: 200% 200%; animation: vjBgDrift 4.5s ease-in-out infinite alternate;",
    ],
  }),
};
