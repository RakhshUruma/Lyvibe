import type { Mood, Keyframe } from "./schema";

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
    : [{ name: "entryFade", css: "0%{opacity:0;transform:translate(-50%,-50%) scale(0.8)} 100%{opacity:1;transform:translate(-50%,-50%) scale(1)}", duration: "0.8s", easing: "ease-out" }];

  const motion: Keyframe[] = Array.isArray(raw?.motionKeyframes)
    ? raw.motionKeyframes.map((k: any, i: number) => normKeyframe(k, `motion${i}`))
    : [];

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
    lineExtraCss:  sanitizeCss(str(raw?.lineExtraCss, "")),
    entryKeyframes: entry,
    motionKeyframes: motion,
    bgKeyframes:    bgKf,
    useTypewriter:  raw?.useTypewriter === true,
  };
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
