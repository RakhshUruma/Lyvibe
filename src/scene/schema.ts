/**
 * Scene-element schema — discrete entities that fly / fall / orbit on the
 * stage, independent of the lyric line.
 *
 * The mood describes them as a list; the particle engine spawns instances,
 * each following one of the named motion patterns.
 */

export type ShapeKind = "svg" | "emoji";
export type MotionType = "drift" | "rain" | "rise" | "orbit" | "path" | "flock";
export type RotateMode = "follow-tangent" | "fixed" | "spin";
export type SelfAnimProp = "scaleX" | "scaleY" | "scale" | "rotate";

export type SelfAnim = {
  property: SelfAnimProp;
  range: [number, number];
  periodMs: number;
  easing?: string;
};

export type SceneMotion = {
  type: MotionType;
  /** SVG path "d" attribute (viewBox 0 0 100 100 — coords are %). For type=path. */
  pathD?: string;
  /** Seconds for one traversal of the screen (or one full orbit). */
  durationRange: [number, number];
  /** px — vertical/horizontal sine wobble amplitude (for drift/rain/rise). */
  sineAmplitude?: number;
  /** ms — sine wobble period. */
  sinePeriod?: number;
  rotateMode?: RotateMode;
};

export type SceneElement = {
  shape: ShapeKind;
  /** SVG path "d" — drawn at viewBox 0 0 40 40 (or svgViewBox). */
  svgPath?: string;
  svgViewBox?: string;
  emoji?: string;
  /** Beat-synced shape rotation — alternative svgPaths cycled through on
   *  every beat. When set, overrides svgPath each beat. Use 2-8 entries
   *  for triangle→square→circle morph kind of effect. */
  svgPaths?: string[];
  /** Filled fill color (or "none"). Ignored if strokeOnly. */
  fill?: string;
  /** SVG stroke color. When set with strokeOnly:true, the path is drawn as
   *  a curve / line (no interior fill). Use this for ribbons / glow lines. */
  stroke?: string;
  strokeWidth?: number;
  strokeOnly?: boolean;
  /** Optional CSS filter string applied to the wrap (drop-shadow, blur). */
  filter?: string;
  /** Element size in px, [min, max]. */
  sizeRange: [number, number];
  /** Maximum simultaneous instances. */
  count: number;
  /** Per-second spawn rate. 0 / undefined = static count, all spawned at start. */
  spawnRate?: number;
  motion: SceneMotion;
  selfAnim?: SelfAnim;
  /** Per-instance opacity drawn from this range. */
  opacityRange?: [number, number];
  blendMode?: string;
};
