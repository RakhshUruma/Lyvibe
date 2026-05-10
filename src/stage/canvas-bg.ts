/**
 * Built-in canvas background engine. Used by built-in presets.
 * Modes: grid · particles · rays · vortex · stripes · noise
 * Reads --bass / --energy CSS vars (set by main.ts from audio analyser).
 */

export type BgMode = "grid" | "particles" | "rays" | "vortex" | "stripes" | "noise";

export class CanvasBg {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mode: BgMode = "grid";
  private raf = 0;
  private t = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setMode(m: BgMode) { this.mode = m; }

  start() { if (this.raf) return; const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop()  { cancelAnimationFrame(this.raf); this.raf = 0; }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width  = this.canvas.clientWidth  * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private frame(): void {
    this.t += 1 / 60;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const cs = getComputedStyle(document.documentElement);
    const bg     = cs.getPropertyValue("--bg").trim() || "#0a0a12";
    const accent = cs.getPropertyValue("--accent").trim() || "#6fe9ff";
    const hot    = cs.getPropertyValue("--hot").trim() || "#ff2da0";
    const bass   = parseFloat(cs.getPropertyValue("--bass"))   || 0;

    const ctx = this.ctx;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    // Floating coloured orbs — soft ambient light layer that lives under
    // every mode. Reproduces the look of the original prototype's bg.
    this.drawOrbs(w, h, bass);

    switch (this.mode) {
      case "grid":      this.drawGrid(w, h, accent, bass); break;
      case "particles": this.drawParticles(w, h, accent); break;
      case "rays":      this.drawRays(w, h, hot, bass); break;
      case "vortex":    this.drawVortex(w, h, accent); break;
      case "stripes":   this.drawStripes(w, h, accent); break;
      case "noise":     this.drawNoise(w, h); break;
    }
  }

  private orbs: { x: number; y: number; vx: number; vy: number; r: number; hue: number }[] = [];
  private drawOrbs(w: number, h: number, bass: number): void {
    if (this.orbs.length === 0) {
      for (let i = 0; i < 5; i++) {
        this.orbs.push({
          x: Math.random(), y: Math.random(),
          vx: (Math.random() - 0.5) * 0.00025,
          vy: (Math.random() - 0.5) * 0.00025,
          r: 110 + Math.random() * 200,
          hue: Math.random() * 360,
        });
      }
    }
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";
    for (const o of this.orbs) {
      o.x += o.vx; o.y += o.vy;
      if (o.x < -0.2) o.x = 1.2; if (o.x > 1.2) o.x = -0.2;
      if (o.y < -0.2) o.y = 1.2; if (o.y > 1.2) o.y = -0.2;
      const cx = o.x * w, cy = o.y * h;
      const radius = o.r * (1 + bass * 0.35);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, `hsla(${o.hue}, 100%, 60%, ${0.20 + bass * 0.18})`);
      g.addColorStop(1, "hsla(0, 0%, 0%, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawGrid(w: number, h: number, c: string, bass: number): void {
    const ctx = this.ctx;
    const step = 60 + bass * 10;
    ctx.strokeStyle = c; ctx.globalAlpha = 0.12 + bass * 0.2; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (this.t * 30) % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = (this.t * 20) % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private parts: { x: number; y: number; vx: number; vy: number }[] = [];
  private drawParticles(w: number, h: number, c: string): void {
    if (this.parts.length === 0) {
      for (let i = 0; i < 80; i++) this.parts.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      });
    }
    const ctx = this.ctx;
    ctx.fillStyle = c; ctx.globalAlpha = 0.55;
    for (const p of this.parts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawRays(w: number, h: number, c: string, bass: number): void {
    const ctx = this.ctx;
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = c; ctx.globalAlpha = 0.3 + bass * 0.4;
    const r = Math.max(w, h);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + this.t * 0.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
    }
    ctx.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    ctx.globalAlpha = 1;
  }

  private drawVortex(w: number, h: number, c: string): void {
    const ctx = this.ctx;
    const cx = w / 2, cy = h / 2;
    ctx.strokeStyle = c; ctx.globalAlpha = 0.25;
    for (let i = 0; i < 60; i++) {
      const a = i * 0.4 + this.t;
      const r = i * 6;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawStripes(w: number, h: number, c: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = c; ctx.globalAlpha = 0.05;
    const sw = 80;
    for (let x = 0; x < w; x += sw * 2) ctx.fillRect(x, 0, sw, h);
    ctx.globalAlpha = 1;
  }

  private noiseImg?: ImageData;
  private drawNoise(w: number, h: number): void {
    const ctx = this.ctx;
    if (!this.noiseImg || this.noiseImg.width !== w || this.noiseImg.height !== h) {
      this.noiseImg = ctx.createImageData(w, h);
    }
    const d = this.noiseImg.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 30;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 60;
    }
    ctx.putImageData(this.noiseImg, 0, 0);
  }
}
