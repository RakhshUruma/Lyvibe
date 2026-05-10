export type Keyframe = {
  name: string;
  css: string;        // body of @keyframes (without "@keyframes name {}" wrapper)
  duration: string;   // "1.2s"
  easing: string;     // "ease-in-out"
  iteration?: string; // "infinite" | "1" ...
};

export type Mood = {
  // base palette
  bg: string;
  accent: string;
  hot: string;
  cool: string;

  // typography
  font: string;
  weight: number;
  color: string;

  // line FX
  blur: number;        // px
  rgbSplit: number;    // px
  panelBorder: string; // CSS color

  // motion params (0..1 unless noted)
  tilt: number;        // ±deg max
  glitchRate: number;
  ghostRate: number;
  motionRate: number;
  bgSwapRate: number;

  positionMode: "center" | "scatter";

  bgCssVariants: string[];   // each is a CSS body for #bgCssLayer
  lineExtraCss: string;      // extra CSS appended to .line
  entryKeyframes: Keyframe[];
  motionKeyframes: Keyframe[];
  /** Background-only keyframes; injected globally so bgCssVariants can
   *  reference them via `animation: <name> ... infinite;`. */
  bgKeyframes: Keyframe[];

  /** When true, each character animates in one-by-one (typewriter). When
   *  false, the whole line uses entryKeyframes as a single block. */
  useTypewriter: boolean;
};

export const MOOD_JSON_SCHEMA = {
  type: "object",
  required: [
    "bg","accent","hot","cool","font","weight","color",
    "blur","rgbSplit","panelBorder","tilt","glitchRate","ghostRate",
    "motionRate","bgSwapRate","positionMode","bgCssVariants",
    "lineExtraCss","entryKeyframes","motionKeyframes","useTypewriter",
  ],
  properties: {
    bg: { type: "string" }, accent: { type: "string" },
    hot: { type: "string" }, cool: { type: "string" },
    font: { type: "string" }, weight: { type: "number" }, color: { type: "string" },
    blur: { type: "number" }, rgbSplit: { type: "number" }, panelBorder: { type: "string" },
    tilt: { type: "number" }, glitchRate: { type: "number" }, ghostRate: { type: "number" },
    motionRate: { type: "number" }, bgSwapRate: { type: "number" },
    positionMode: { type: "string", enum: ["center", "scatter"] },
    bgCssVariants: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    lineExtraCss: { type: "string" },
    entryKeyframes: {
      type: "array", minItems: 1, maxItems: 6,
      items: {
        type: "object",
        required: ["name","css","duration","easing"],
        properties: {
          name: { type: "string" }, css: { type: "string" },
          duration: { type: "string" }, easing: { type: "string" },
          iteration: { type: "string" },
        },
      },
    },
    motionKeyframes: {
      type: "array", minItems: 0, maxItems: 6,
      items: {
        type: "object",
        required: ["name","css","duration","easing"],
        properties: {
          name: { type: "string" }, css: { type: "string" },
          duration: { type: "string" }, easing: { type: "string" },
          iteration: { type: "string" },
        },
      },
    },
    bgKeyframes: {
      type: "array", minItems: 0, maxItems: 6,
      items: {
        type: "object",
        required: ["name","css","duration","easing"],
        properties: {
          name: { type: "string" }, css: { type: "string" },
          duration: { type: "string" }, easing: { type: "string" },
          iteration: { type: "string" },
        },
      },
    },
    useTypewriter: { type: "boolean" },
  },
} as const;
