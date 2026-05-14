/**
 * Particle engine — spawns and animates SceneElement instances on the stage.
 *
 * Renders SVG / emoji shapes to a layered <div id="particleLayer">. Each
 * instance has its own age + seed; motion is computed per-frame from the
 * SceneMotion's `type` (drift / rain / rise / orbit / path / flock).
 *
 * DOM-based for ~50-150 particles. For higher counts, swap to canvas.
 */

import type { SceneElement, SceneMotion, SelfAnim } from "./schema";
import { audioState } from "../audio-state";

type Particle = {
  dom: HTMLElement;
  age: number;             // seconds
  duration: number;        // seconds
  seed: number;            // 0..1, stable per particle
  spawnX: number;          // px
  spawnY: number;          // px
  size: number;            // px
  dir: 1 | -1;             // for drift
  pathEl?: SVGPathElement; // for type=path
  pathLen?: number;
  /** The inner SVG path element when shape=svg; used for shape morphing. */
  shapePath?: SVGPathElement;
  /** Total stroke length when drawStroke is enabled (for dashoffset). */
  strokeLen?: number;
};

const SVG_NS = "http://www.w3.org/2000/svg";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const createShape = (el: SceneElement, sizePx: number): HTMLElement => {
  // Two-layer composition: <wrap> handles position (engine writes transform),
  // <inner> handles selfAnim transform. Without an inner element the engine's
  // setProperty would clash with the per-instance flap/breath animation, AND
  // applying selfAnim to a text-node wrap fails ("style of undefined").
  const wrap = document.createElement("div");
  wrap.style.position = "absolute";
  wrap.style.willChange = "transform";
  wrap.style.left = "0";
  wrap.style.top  = "0";
  wrap.style.width  = `${sizePx}px`;
  wrap.style.height = `${sizePx}px`;
  wrap.style.pointerEvents = "none";

  if (el.shape === "emoji") {
    const inner = document.createElement("span");
    inner.textContent = el.emoji ?? "✨";
    inner.style.display = "block";
    inner.style.fontSize = `${sizePx}px`;
    inner.style.lineHeight = "1";
    inner.style.willChange = "transform";
    inner.style.transformOrigin = "center center";
    wrap.appendChild(inner);
  } else {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", el.svgViewBox || "0 0 40 40");
    svg.setAttribute("width",  String(sizePx));
    svg.setAttribute("height", String(sizePx));
    svg.setAttribute("overflow", "visible"); // let stroke + glow extend past viewBox
    (svg as unknown as HTMLElement).style.display = "block";
    (svg as unknown as HTMLElement).style.willChange = "transform";
    (svg as unknown as HTMLElement).style.transformOrigin = "center center";
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", el.svgPath || "M2,20 Q20,2 38,20 Q20,38 2,20 Z");
    if (el.strokeOnly) {
      path.setAttribute("fill", "none");
    } else {
      path.setAttribute("fill", el.fill || "currentColor");
    }
    if (el.stroke) {
      path.setAttribute("stroke", el.stroke);
      path.setAttribute("stroke-width", String(el.strokeWidth ?? 2));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    }
    svg.appendChild(path);
    wrap.appendChild(svg);
    (wrap as any).__shapePath = path;

    // Stroke-draw effect: compute total path length, set dasharray=length,
    // dashoffset=length (fully hidden). The tick loop animates offset → 0.
    if (el.drawStroke) {
      // path needs to be in DOM for getTotalLength
      try {
        const L = (path as SVGPathElement).getTotalLength();
        path.setAttribute("stroke-dasharray", String(L));
        path.setAttribute("stroke-dashoffset", String(L));
        (wrap as any).__strokeLen = L;
      } catch {
        (wrap as any).__strokeLen = 0;
      }
    }
  }
  if (el.filter) wrap.style.filter = el.filter;
  return wrap;
};

const applySelfAnim = (dom: HTMLElement, sa: SelfAnim, seed: number): void => {
  const name = `vjSelf_${sa.property}_${Math.round(sa.range[0]*100)}_${Math.round(sa.range[1]*100)}_${sa.periodMs}`;
  ensureSelfAnimKf(name, sa);
  const inner = dom.firstElementChild as (HTMLElement | SVGElement | null);
  if (!inner) return;
  const style = (inner as unknown as { style?: CSSStyleDeclaration }).style;
  if (!style) return;
  style.animation = `${name} ${sa.periodMs}ms ${sa.easing || "ease-in-out"} infinite`;
  style.animationDelay = `-${(seed * sa.periodMs).toFixed(0)}ms`;
};

const _selfAnimSeen = new Set<string>();
const ensureSelfAnimKf = (name: string, sa: SelfAnim): void => {
  if (_selfAnimSeen.has(name)) return;
  const propValAt = (v: number): string => {
    switch (sa.property) {
      case "scaleX": return `transform:scaleX(${v})`;
      case "scaleY": return `transform:scaleY(${v})`;
      case "scale":  return `transform:scale(${v})`;
      case "rotate": return `transform:rotate(${v}deg)`;
    }
  };
  const css =
    `@keyframes ${name} { ` +
    `0%,100%{${propValAt(sa.range[0])}} ` +
    `50%{${propValAt(sa.range[1])}} ` +
    `}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  _selfAnimSeen.add(name);
};

export class ParticleEngine {
  private layer: HTMLElement;
  private elements: SceneElement[] = [];
  private buckets: Particle[][] = [];     // per-element-index lists
  private spawnAccum: number[] = [];
  private rafId = 0;
  private lastT = 0;

  constructor(layer: HTMLElement) {
    this.layer = layer;
  }

  setElements(els: SceneElement[]): void {
    this.clear();
    this.elements = els;
    this.buckets = els.map(() => []);
    this.spawnAccum = els.map(() => 0);
    // initial spawn for static counts (no spawnRate)
    for (let i = 0; i < els.length; i++) {
      const e = els[i]!;
      if (!e.spawnRate || e.spawnRate <= 0) {
        for (let n = 0; n < e.count; n++) this.spawn(i);
      }
    }
    if (els.length && !this.rafId) this.start();
  }

  start(): void {
    if (this.rafId) return;
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - this.lastT) / 1000);
      this.lastT = t;
      this.tick(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  clear(): void {
    while (this.layer.firstChild) this.layer.removeChild(this.layer.firstChild);
    this.elements = [];
    this.buckets = [];
    this.spawnAccum = [];
  }

  private spawn(idx: number): void {
    const el = this.elements[idx]!;
    // audio-reactive size: kick boosts up to +60% on the spawn instant.
    const sizeMul = 1 + audioState.kick * 0.6 + audioState.bass * 0.15;
    const size = rand(el.sizeRange[0], el.sizeRange[1]) * sizeMul;
    const dom = createShape(el, size);
    if (el.opacityRange) dom.style.opacity = String(rand(el.opacityRange[0], el.opacityRange[1]));
    if (el.blendMode) dom.style.mixBlendMode = el.blendMode as any;
    this.layer.appendChild(dom);

    const seed = Math.random();
    const dir: 1 | -1 = (seed > 0.5 ? 1 : -1);
    const w = window.innerWidth, h = window.innerHeight;

    let spawnX = 0, spawnY = 0;
    switch (el.motion.type) {
      case "drift":
        spawnX = dir > 0 ? -size : w + size;
        spawnY = rand(h * 0.15, h * 0.85);
        break;
      case "rain":
        spawnX = rand(0, w);
        spawnY = -size;
        break;
      case "rise":
        spawnX = rand(0, w);
        spawnY = h + size;
        break;
      case "orbit":
        spawnX = w / 2; spawnY = h / 2;
        break;
      case "path":
        // sample t=0 on path (we'll do this on first tick too)
        spawnX = 0; spawnY = 0;
        break;
      case "flock":
        spawnX = rand(0, w); spawnY = rand(0, h);
        break;
    }

    const p: Particle = {
      dom, age: 0,
      duration: rand(el.motion.durationRange[0], el.motion.durationRange[1]),
      seed, spawnX, spawnY, size, dir,
      shapePath: (dom as any).__shapePath,
      strokeLen:  (dom as any).__strokeLen,
    };

    if (el.motion.type === "path" && el.motion.pathD) {
      const pathEl = document.createElementNS(SVG_NS, "path") as SVGPathElement;
      pathEl.setAttribute("d", el.motion.pathD);
      // need to be in DOM to call getTotalLength reliably in some browsers
      const tmp = document.createElementNS(SVG_NS, "svg");
      tmp.style.position = "absolute"; tmp.style.width = "0"; tmp.style.height = "0";
      tmp.appendChild(pathEl);
      this.layer.appendChild(tmp);
      try { p.pathLen = pathEl.getTotalLength(); } catch { p.pathLen = 0; }
      tmp.remove();
      p.pathEl = pathEl;
    }

    if (el.selfAnim) applySelfAnim(dom, el.selfAnim, seed);

    this.buckets[idx]!.push(p);
  }

  /** track last beat phase per element to detect beat zero-crossing for morph */
  private lastBeatPhase = 1;
  private beatStep = 0;

  private tick(dt: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    // beat zero-crossing → increment morph step
    if (audioState.beat < this.lastBeatPhase) {
      this.beatStep++;
      // morph every shape that defines svgPaths
      for (let i = 0; i < this.elements.length; i++) {
        const el = this.elements[i]!;
        if (!el.svgPaths || el.svgPaths.length < 2) continue;
        const nextD = el.svgPaths[this.beatStep % el.svgPaths.length]!;
        for (const p of this.buckets[i]!) {
          if (p.shapePath) p.shapePath.setAttribute("d", nextD);
        }
      }
    }
    this.lastBeatPhase = audioState.beat;

    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i]!;
      const list = this.buckets[i]!;

      if (el.spawnRate && el.spawnRate > 0) {
        // audio-reactive spawn rate: bass adds up to +1.5×, kick spike +2×.
        const reactiveRate = el.spawnRate * (1 + audioState.bass * 1.4 + audioState.kick * 2.0);
        this.spawnAccum[i] = (this.spawnAccum[i] || 0) + dt;
        const interval = 1 / reactiveRate;
        // hard cap: count×2 absolute ceiling so kicks don't blow past memory
        const cap = el.count * 2;
        while (this.spawnAccum[i]! >= interval) {
          if (list.length < cap) this.spawn(i);
          this.spawnAccum[i]! -= interval;
        }
      }

      for (let j = list.length - 1; j >= 0; j--) {
        const p = list[j]!;
        p.age += dt;
        if (p.age >= p.duration) {
          p.dom.remove();
          list.splice(j, 1);
          // top up if static count
          if ((!el.spawnRate || el.spawnRate <= 0) && list.length < el.count) this.spawn(i);
          continue;
        }
        const t = p.age / p.duration;
        // stroke-draw progression: dashoffset shrinks from L → 0 over
        // drawStrokeDuration (or particle duration). Modes:
        //   "loop": triangle wave (draws then erases, repeats)
        //   "fade": draw once, opacity fades after completion
        //   "hold": draw once and stay (default)
        if (el.drawStroke && p.shapePath && p.strokeLen) {
          const drawDur = el.drawStrokeDuration ?? p.duration;
          const drawT = Math.min(1, p.age / drawDur);
          const mode = el.drawStrokeMode ?? "hold";
          let progress: number;
          if (mode === "loop") {
            const phase = (p.age / drawDur) % 2;
            progress = phase < 1 ? phase : 2 - phase;
          } else {
            progress = drawT;
          }
          p.shapePath.setAttribute("stroke-dashoffset", String(p.strokeLen * (1 - progress)));
          if (mode === "fade" && drawT >= 1) {
            const fade = Math.max(0, 1 - (p.age - drawDur) / Math.max(0.5, p.duration - drawDur));
            p.dom.style.opacity = String(fade);
          }
        }
        const pos = computePosition(p, el.motion, t, w, h);
        // attractor physics — pull toward each attractor with inverse-distance
        // falloff. Reactivity scales force with audio.
        if (el.motion.attractors && el.motion.attractors.length) {
          const reactivity = el.motion.attractors[0] ? (el.motion.attractorReactivity ?? 0) : 0;
          const audioMul = 1 + audioState.bass * 1.5 * reactivity + audioState.kick * 2 * reactivity;
          for (const a of el.motion.attractors) {
            const ax = a.x / 100 * w, ay = a.y / 100 * h;
            const dx = ax - pos.x, dy = ay - pos.y;
            const dist2 = dx*dx + dy*dy + 100; // +100 prevents singularity
            const radius2 = a.radius ? a.radius * a.radius : Infinity;
            if (dist2 > radius2) continue;
            const pull = (a.force * audioMul * 12000) / dist2; // px/frame deflection
            pos.x += dx / Math.sqrt(dist2) * pull * dt;
            pos.y += dy / Math.sqrt(dist2) * pull * dt;
          }
        }
        p.dom.style.transform = `translate(${pos.x - p.size / 2}px, ${pos.y - p.size / 2}px) rotate(${pos.rot}deg)`;
      }
    }
  }
}

const computePosition = (
  p: Particle, m: SceneMotion, t: number, w: number, h: number,
): { x: number; y: number; rot: number } => {
  let x = 0, y = 0, rot = 0;
  const sineAmp = m.sineAmplitude ?? 30;
  const sinePer = m.sinePeriod ?? 1500;
  const sineRad = (p.age * 1000) / sinePer * Math.PI * 2 + p.seed * 6.28;

  switch (m.type) {
    case "drift": {
      const xStart = p.dir > 0 ? -p.size : w + p.size;
      const xEnd   = p.dir > 0 ? w + p.size : -p.size;
      x = xStart + t * (xEnd - xStart);
      y = p.spawnY + sineAmp * Math.sin(sineRad);
      break;
    }
    case "rain": {
      x = p.spawnX + sineAmp * Math.sin(sineRad);
      y = -p.size + t * (h + p.size * 2);
      break;
    }
    case "rise": {
      x = p.spawnX + sineAmp * Math.sin(sineRad);
      y = (h + p.size) - t * (h + p.size * 2);
      break;
    }
    case "orbit": {
      const cx = w / 2, cy = h / 2;
      const radius = Math.min(w, h) * (0.20 + p.seed * 0.20);
      const a = t * Math.PI * 2 + p.seed * Math.PI * 2;
      x = cx + Math.cos(a) * radius;
      y = cy + Math.sin(a) * radius;
      if (m.rotateMode === "follow-tangent") rot = (a + Math.PI / 2) * 180 / Math.PI;
      break;
    }
    case "path": {
      if (p.pathEl && p.pathLen) {
        const pt = p.pathEl.getPointAtLength(t * p.pathLen);
        // path is in [0..100] x [0..100] coordinate space; map to viewport
        x = pt.x * w / 100;
        y = pt.y * h / 100;
        if (m.rotateMode === "follow-tangent") {
          // estimate tangent
          const ahead = p.pathEl.getPointAtLength(Math.min(p.pathLen, t * p.pathLen + 1));
          rot = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI;
        }
      }
      break;
    }
    case "flock": {
      // simple swarm: each particle drifts on its own sin-cos with shared offset
      const cx = w * 0.5, cy = h * 0.5;
      const r = Math.min(w, h) * (0.25 + p.seed * 0.15);
      const angle = (p.age * 0.6 + p.seed * 6.28);
      x = cx + Math.cos(angle) * r + sineAmp * Math.sin(sineRad);
      y = cy + Math.sin(angle) * r * 0.6 + sineAmp * Math.cos(sineRad);
      break;
    }
  }
  if (m.rotateMode === "spin") rot = p.age * 90;
  return { x, y, rot };
};
