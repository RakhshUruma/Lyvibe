import type { Mood, Keyframe } from "./schema";
import type { SceneElement } from "../scene/schema";
import { ENTRY_GENERATORS, MOTION_GENERATORS, expandRecipe, type Recipe } from "./generators";

const clamp = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
};
const str = (v: unknown, d: string): string =>
  (typeof v === "string" && v.trim()) ? v : d;

const sanitizeCss = (css: string): string => {
  // Remove anything that could break out of #bgCssLayer or inject scripts.
  // Strip </style>, <script>, javascript:, expression(), @import url(...)
  return css
    .replace(/<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/@import[^;]*;/gi, "")
    .replace(/url\s*\(\s*["']?\s*data:text\/html/gi, "url(about:blank");
};

const normKeyframe = (kf: any, fallbackName: string): Keyframe => ({
  name:      str(kf?.name, fallbackName).replace(/[^a-zA-Z0-9_-]/g, ""),
  css:       sanitizeCss(str(kf?.css, "0%{opacity:0}100%{opacity:1}")),
  duration:  str(kf?.duration, "1s"),
  easing:    str(kf?.easing, "ease-in-out"),
  iteration: kf?.iteration ? str(kf.iteration, "1") : undefined,
});

export const normalizeMood = (raw: any): Mood => {
  const variants: string[] = Array.isArray(raw?.bgCssVariants)
    ? raw.bgCssVariants.map(sanitizeCss).filter(Boolean)
    : [];
  if (variants.length === 0) {
    variants.push("background: radial-gradient(ellipse at center, #1a0e2a, #050010 70%);");
  }

  const entry: Keyframe[] = Array.isArray(raw?.entryKeyframes) && raw.entryKeyframes.length
    ? raw.entryKeyframes.map((k: any, i: number) => normKeyframe(k, `entry${i}`))
    : [];

  const motion: Keyframe[] = Array.isArray(raw?.motionKeyframes)
    ? raw.motionKeyframes.map((k: any, i: number) => normKeyframe(k, `motion${i}`))
    : [];

  // Expand entryRecipes / motionRecipes → keyframes, append to the raw arrays.
  const entryRecipes: Recipe[] = Array.isArray(raw?.entryRecipes) ? raw.entryRecipes : [];
  entryRecipes.forEach((r, i) => {
    const k = expandRecipe(r, ENTRY_GENERATORS, `e${i}`);
    if (k) entry.push(k);
  });
  const motionRecipes: Recipe[] = Array.isArray(raw?.motionRecipes) ? raw.motionRecipes : [];
  motionRecipes.forEach((r, i) => {
    const k = expandRecipe(r, MOTION_GENERATORS, `m${i}`);
    if (k) motion.push(k);
  });

  // Final fallback if both raw and recipes produced nothing.
  if (entry.length === 0) {
    entry.push({
      name: "entryFade",
      css: "0%{opacity:0;transform:translate(var(--xshift,-50%),-50%) scale(0.85)} 100%{opacity:1;transform:translate(var(--xshift,-50%),-50%) scale(1)}",
      duration: "0.6s", easing: "ease-out",
    });
  }

  const bgKf: Keyframe[] = Array.isArray(raw?.bgKeyframes)
    ? raw.bgKeyframes.map((k: any, i: number) => normKeyframe(k, `bg${i}`))
    : [];

  return {
    bg:      str(raw?.bg, "#0a0a12"),
    accent:  str(raw?.accent, "#6fe9ff"),
    hot:     str(raw?.hot, "#ff2da0"),
    cool:    str(raw?.cool, "#00f0ff"),
    font:    str(raw?.font, "Impact, sans-serif"),
    weight:  clamp(raw?.weight, 100, 900, 900),
    color:   str(raw?.color, "#ffffff"),
    blur:    clamp(raw?.blur, 0, 12, 0),
    rgbSplit:clamp(raw?.rgbSplit, 0, 12, 3),
    panelBorder: str(raw?.panelBorder, "rgba(255,255,255,0.08)"),
    tilt:    clamp(raw?.tilt, 0, 25, 4),
    glitchRate: clamp(raw?.glitchRate, 0, 1, 0.15),
    ghostRate:  clamp(raw?.ghostRate,  0, 1, 0.2),
    motionRate: clamp(raw?.motionRate, 0, 1, 0.4),
    bgSwapRate: clamp(raw?.bgSwapRate, 0, 1, 0.25),
    positionMode: raw?.positionMode === "scatter" ? "scatter" : "center",
    bgCssVariants: variants,
    // If LLM left lineExtraCss empty, inject a generic glow tied to mood vars
    // so plain text never appears flat. Most presets/generates won't trip this.
    lineExtraCss:  sanitizeCss(str(raw?.lineExtraCss, "") || DEFAULT_LINE_EXTRA),
    entryKeyframes: entry,
    motionKeyframes: motion,
    bgKeyframes:    bgKf,
    useTypewriter:  raw?.useTypewriter !== false,
    typewriter:     normTypewriter(raw?.typewriter),
    sceneElements:  Array.isArray(raw?.sceneElements)
      ? raw.sceneElements.map(normSceneElement).filter(Boolean) as SceneElement[]
      : [],
  };
};

const REVEAL_VALID = ["fade","drop","scale","blur","rise","shatter","type"] as const;
type RevealStyle = typeof REVEAL_VALID[number];
const normTypewriter = (raw: any): Mood["typewriter"] => {
  if (!raw || typeof raw !== "object") return { reveal: "rise", stagger: 0.05, charDuration: "0.42s" };
  const reveal: RevealStyle = (REVEAL_VALID as readonly string[]).includes(raw.reveal) ? raw.reveal : "rise";
  return {
    reveal,
    stagger: typeof raw.stagger === "number" ? Math.max(0.005, Math.min(0.2, raw.stagger)) : 0.05,
    charDuration: typeof raw.charDuration === "string" ? raw.charDuration : "0.42s",
  };
};

const DEFAULT_LINE_EXTRA =
  "text-shadow: 0 0 16px var(--accent), 0 0 32px var(--hot); filter: drop-shadow(0 0 6px var(--accent));";

const normSceneElement = (raw: any): SceneElement | null => {
  if (!raw || typeof raw !== "object") return null;
  const shape = raw.shape === "emoji" ? "emoji" : "svg";
  const motionType = ["drift","rain","rise","orbit","path","flock"].includes(raw?.motion?.type)
    ? raw.motion.type : "drift";
  const sizeRange: [number, number] = Array.isArray(raw.sizeRange) && raw.sizeRange.length === 2
    ? [Number(raw.sizeRange[0]) || 24, Number(raw.sizeRange[1]) || 48]
    : [24, 48];
  const durationRange: [number, number] = Array.isArray(raw.motion?.durationRange) && raw.motion.durationRange.length === 2
    ? [Math.max(0.5, Number(raw.motion.durationRange[0]) || 4), Math.max(0.5, Number(raw.motion.durationRange[1]) || 8)]
    : [4, 8];
  const count = Math.max(1, Math.min(80, Math.round(Number(raw.count) || 6)));
  const out: SceneElement = {
    shape,
    svgPath: typeof raw.svgPath === "string" ? raw.svgPath : undefined,
    svgViewBox: typeof raw.svgViewBox === "string" ? raw.svgViewBox : undefined,
    emoji: typeof raw.emoji === "string" ? raw.emoji.slice(0, 4) : undefined,
    fill: typeof raw.fill === "string" ? raw.fill : undefined,
    stroke: typeof raw.stroke === "string" ? raw.stroke : undefined,
    strokeWidth: typeof raw.strokeWidth === "number" ? raw.strokeWidth : undefined,
    strokeOnly: raw.strokeOnly === true,
    filter: typeof raw.filter === "string" ? raw.filter : undefined,
    sizeRange,
    count,
    spawnRate: typeof raw.spawnRate === "number" && raw.spawnRate > 0 ? raw.spawnRate : undefined,
    motion: {
      type: motionType,
      pathD: typeof raw.motion?.pathD === "string" ? raw.motion.pathD : undefined,
      durationRange,
      sineAmplitude: typeof raw.motion?.sineAmplitude === "number" ? raw.motion.sineAmplitude : undefined,
      sinePeriod:    typeof raw.motion?.sinePeriod === "number"    ? raw.motion.sinePeriod    : undefined,
      rotateMode:    ["follow-tangent","fixed","spin"].includes(raw.motion?.rotateMode) ? raw.motion.rotateMode : undefined,
    },
    selfAnim: raw.selfAnim && typeof raw.selfAnim === "object" && Array.isArray(raw.selfAnim.range) && raw.selfAnim.range.length === 2 ? {
      property: ["scaleX","scaleY","scale","rotate"].includes(raw.selfAnim.property) ? raw.selfAnim.property : "scale",
      range: [Number(raw.selfAnim.range[0]) || 0.8, Number(raw.selfAnim.range[1]) || 1.2],
      periodMs: Math.max(60, Number(raw.selfAnim.periodMs) || 600),
      easing: typeof raw.selfAnim.easing === "string" ? raw.selfAnim.easing : "ease-in-out",
    } : undefined,
    opacityRange: Array.isArray(raw.opacityRange) && raw.opacityRange.length === 2
      ? [Number(raw.opacityRange[0]) || 0.6, Number(raw.opacityRange[1]) || 1]
      : undefined,
    blendMode: typeof raw.blendMode === "string" ? raw.blendMode : undefined,
  };
  // sanity: svg without path → emoji fallback so engine doesn't render nothing
  if (out.shape === "svg" && !out.svgPath) {
    out.shape = "emoji"; out.emoji = out.emoji || "✨";
  }
  if (out.shape === "emoji" && !out.emoji) out.emoji = "✨";
  return out;
};

/**
 * Apply mood to the document.
 * Two bg layers (#bgCssA / #bgCssB) inside #bgCssLayer let us cross-fade
 * between variants instead of cutting; that makes swaps actually feel like
 * a scene change.
 */
export const applyMood = (mood: Mood): void => {
  const root = document.documentElement.style;
  root.setProperty("--bg", mood.bg);
  root.setProperty("--accent", mood.accent);
  root.setProperty("--hot", mood.hot);
  root.setProperty("--cool", mood.cool);
  root.setProperty("--rgb-split", `${mood.rgbSplit}px`);
  root.setProperty("--line-font", mood.font);
  root.setProperty("--line-weight", String(mood.weight));
  root.setProperty("--line-color", mood.color);
  root.setProperty("--line-blur", `${mood.blur}px`);

  ensureBgLayers();

  const kfCss = [
    ...mood.entryKeyframes,
    ...mood.motionKeyframes,
    ...mood.bgKeyframes,
  ]
    .map(k => `@keyframes ${k.name} { ${k.css} }`)
    .join("\n");

  upsertStyle("dynamic-mood-style", `${kfCss}\n.line.shown { ${mood.lineExtraCss} }`);

  // start: layer A holds variant[0] visible, layer B empty/hidden
  _bgIdx = 0;
  upsertStyle("dynamic-bg-style", buildBgCss("a", mood.bgCssVariants[0] ?? "", "b", "", "a"));
};

/** Layer state for cross-fade. */
let _bgIdx = 0;

export const swapBgVariant = (mood: Mood): void => {
  if (mood.bgCssVariants.length <= 1) return;
  // pick any variant DIFFERENT from the current one
  let next = _bgIdx;
  while (next === _bgIdx) next = Math.floor(Math.random() * mood.bgCssVariants.length);
  const cur = _bgIdx, target = (cur === 0 ? 1 : 0); // ping-pong layers
  _bgIdx = next;
  const visibleSlot = target === 0 ? "a" : "b";
  const hidingSlot  = target === 0 ? "b" : "a";
  const visibleCss  = mood.bgCssVariants[next] ?? "";
  const hidingCss   = mood.bgCssVariants[(_bgIdx + 1) % mood.bgCssVariants.length] ?? "";
  upsertStyle("dynamic-bg-style",
    buildBgCss(visibleSlot, visibleCss, hidingSlot, hidingCss, visibleSlot));
};

const buildBgCss = (slotA: "a"|"b", aCss: string, slotB: "a"|"b", bCss: string, visible: "a"|"b") => {
  return `
#bgCss${slotA.toUpperCase()} { ${aCss} }
#bgCss${slotB.toUpperCase()} { ${bCss} }
#bgCssA, #bgCssB { position: absolute; inset: 0; transition: opacity 800ms ease; }
#bgCssA { opacity: ${visible === "a" ? 1 : 0}; }
#bgCssB { opacity: ${visible === "b" ? 1 : 0}; }`;
};

const ensureBgLayers = (): void => {
  const layer = document.getElementById("bgCssLayer");
  if (!layer) return;
  if (!document.getElementById("bgCssA")) {
    const a = document.createElement("div"); a.id = "bgCssA";
    layer.appendChild(a);
  }
  if (!document.getElementById("bgCssB")) {
    const b = document.createElement("div"); b.id = "bgCssB";
    layer.appendChild(b);
  }
};

const upsertStyle = (id: string, css: string): void => {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
};
