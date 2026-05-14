import type { SceneElement } from "../scene/schema";
export type { SceneElement };

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
  entryKeyframes: Keyframe[];   // raw / "no-hint" — full LLM custom or curated
  motionKeyframes: Keyframe[];
  /** Generator references — names + params. Expanded by normalize into
   *  Keyframe objects appended to entryKeyframes / motionKeyframes. */
  entryRecipes?: { name: string; params?: Record<string, any> }[];
  motionRecipes?: { name: string; params?: Record<string, any> }[];
  /** Background-only keyframes; injected globally so bgCssVariants can
   *  reference them via `animation: <name> ... infinite;`. */
  bgKeyframes: Keyframe[];

  /** When true, each character animates in one-by-one (typewriter). When
   *  false, the whole line uses entryKeyframes as a single block. */
  useTypewriter: boolean;
  /** Typewriter parameters used when useTypewriter=true. */
  typewriter?: {
    stagger?: number;        // seconds between char starts (0.02-0.15)
    charDuration?: string;   // each char's reveal anim length, "0.15s" - "0.8s"
    reveal?: "fade" | "drop" | "scale" | "blur" | "rise" | "shatter" | "type";
  };

  /** Discrete entities (butterflies, snow, sparks, birds, …) that fly /
   *  fall / orbit on the stage independently of the lyric line.
   *  Empty array (default) = no scene particles. */
  sceneElements: SceneElement[];

  /** Per-section overrides — when a segment's `section` (verse/chorus/…)
   *  matches a key here, the matching partial mood is merged on top of
   *  this base mood for that segment. Lets the chorus burn brighter, the
   *  bridge calm down, etc. */
  variants?: Record<string, Partial<Mood>>;

  /** Optional fragment-shader background. When set, replaces the 2D canvas
   *  bg engine. `fragment` is a GLSL ES 1.0 shader body that has access to
   *  uniforms: u_time, u_resolution, u_bass, u_mid, u_treble, u_kick,
   *  u_energy, u_beat, u_spectrum[32], u_intensity, u_prev (sampler2D),
   *  u_mouse, plus stdlib helpers (hash/snoise/fbm/voronoi/palette/sdf…).
   *  When `feedback: true`, u_prev samples the previous frame for trails. */
  shaderBg?: {
    fragment: string;
    uniforms?: Record<string, number[]>;
    feedback?: boolean;
  };

  /** BPM driving the u_beat phase uniform + beat-locked features
   *  (sceneElement.svgPaths cycle). Default 120. */
  bpm?: number;

  /** Per-second triggered one-shot events. Fires when audio.currentTime
   *  crosses `at`. Idempotent — each event id fires at most once per
   *  playback pass. Use cases:落ちサビフラッシュ, mid-song bg swap,
   *  per-section shockwave. */
  events?: MoodEvent[];

  /** CSS3D transform applied to the #stage element. Animated via the
   *  string interpolated like an animation; one CSS transform value. */
  cameraTransform?: string;

  /** Generative palette spec — if present, normalize derives accent/hot/
   *  cool/color from a base hue + harmony rule, overriding any explicit
   *  colors above. Useful for LLMs that pick a vibe but not 4 hex codes. */
  palette?: {
    baseHue: number;            // 0..360
    rule?: "complementary" | "triad" | "analogous" | "split" | "tetrad";
    saturation?: number;        // 0..1
    lightness?: number;         // 0..1
  };
};

export type MoodEvent =
  | { id: string; at: number; kind: "flash"; color?: string; durationMs?: number }
  | { id: string; at: number; kind: "zoom";  factor?: number; durationMs?: number }
  | { id: string; at: number; kind: "shake"; amplitude?: number; durationMs?: number }
  | { id: string; at: number; kind: "shockwave"; color?: string; durationMs?: number }
  | { id: string; at: number; kind: "bgSwap"; variantIndex?: number; }
  | { id: string; at: number; kind: "applyVariant"; variant: string; };

export const MOOD_JSON_SCHEMA = {
  type: "object",
  required: [
    "bg","accent","hot","cool","font","weight","color",
    "blur","rgbSplit","panelBorder","tilt","glitchRate","ghostRate",
    "motionRate","bgSwapRate","positionMode","bgCssVariants",
    "lineExtraCss","entryKeyframes","motionKeyframes","useTypewriter","sceneElements",
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
    sceneElements: {
      type: "array", minItems: 0, maxItems: 6,
      items: {
        type: "object",
        required: ["shape","sizeRange","count","motion"],
        properties: {
          shape: { type: "string", enum: ["svg", "emoji"] },
          svgPath: { type: "string" },
          svgViewBox: { type: "string" },
          emoji: { type: "string" },
          fill: { type: "string" },
          sizeRange: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          count: { type: "number" },
          spawnRate: { type: "number" },
          motion: {
            type: "object",
            required: ["type","durationRange"],
            properties: {
              type: { type: "string", enum: ["drift","rain","rise","orbit","path","flock"] },
              pathD: { type: "string" },
              durationRange: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
              sineAmplitude: { type: "number" },
              sinePeriod: { type: "number" },
              rotateMode: { type: "string", enum: ["follow-tangent","fixed","spin"] },
            },
          },
          selfAnim: {
            type: "object",
            required: ["property","range","periodMs"],
            properties: {
              property: { type: "string", enum: ["scaleX","scaleY","scale","rotate"] },
              range: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
              periodMs: { type: "number" },
              easing: { type: "string" },
            },
          },
          opacityRange: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          blendMode: { type: "string" },
        },
      },
    },
  },
} as const;
