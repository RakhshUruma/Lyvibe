/**
 * WebGL fragment-shader background with stdlib + ping-pong feedback +
 * spectrum/beat uniforms. The user writes the fragment body only; we
 * prepend a header that defines:
 *
 *   ── Uniforms ────────────────────────────────────────────────
 *   uniform float u_time;
 *   uniform vec2  u_resolution;
 *   uniform float u_bass, u_mid, u_treble, u_kick, u_energy;
 *   uniform float u_beat;            // 0..1 phase within current beat
 *   uniform float u_spectrum[32];    // log-spaced FFT magnitudes
 *   uniform float u_intensity;
 *   uniform sampler2D u_prev;        // previous frame (feedback)
 *   uniform vec2  u_mouse;           // (0..1, 0..1) for future use
 *
 *   ── Helpers (always available) ──────────────────────────────
 *   float hash11(float)              one-dim hash
 *   float hash21(vec2)               2D → 1D hash
 *   vec2  hash22(vec2)               2D → 2D hash
 *   float vnoise(vec2)               value noise
 *   float snoise(vec3)               simplex noise (3D)
 *   float fbm(vec2)                  4-octave fractal brownian motion
 *   vec2  voronoi(vec2)              .x = distance to closest, .y = id
 *   vec3  palette(float t, vec3 a, vec3 b, vec3 c, vec3 d)   IQ's cosine palette
 *   vec3  hsv2rgb(vec3 c)
 *   mat2  rot2d(float a)
 *   float sdBox(vec2 p, vec2 b)      signed-distance box
 *   float sdCircle(vec2 p, float r)
 *   float sdTriangle(vec2 p)         equilateral, radius 1
 *
 * To opt in to feedback, set `shaderBg.feedback: true`. Without it,
 * u_prev samples a black texture (always vec4(0)).
 *
 * To declare custom user uniforms, list them in `shaderBg.uniforms`:
 *   { "amount": [0.5], "tint": [1.0, 0.3, 0.8] }
 * Each becomes a float / vec2 / vec3 / vec4 by array length.
 */

import { audioState } from "../audio-state";

const VS = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const STDLIB = `
// ── stdlib ───────────────────────────────────────────────────────
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash21(i), b = hash21(i+vec2(1.0,0.0)), c = hash21(i+vec2(0.0,1.0)), d = hash21(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}

// 3D simplex (Ashima Arts, public domain, condensed)
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute( i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0+1.0; vec4 s1 = floor(b1)*2.0+1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for(int i=0; i<4; i++){ v += a * vnoise(p); p = m*p; a *= 0.5; }
  return v;
}

// returns vec2(distance-to-closest, cell-id 0..1)
vec2 voronoi(vec2 p){
  vec2 g = floor(p), f = fract(p);
  float d = 1.5; vec2 id = vec2(0.0);
  for(int j=-1; j<=1; j++) for(int i=-1; i<=1; i++){
    vec2 o = vec2(float(i), float(j));
    vec2 r = o + hash22(g+o) - f;
    float dr = dot(r, r);
    if(dr < d){ d = dr; id = g+o; }
  }
  return vec2(sqrt(d), hash21(id));
}

// IQ's cosine palette: t in 0..1
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b*cos(6.28318*(c*t+d)); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
mat2 rot2d(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p)-b; return length(max(d,0.0)) + min(max(d.x,d.y), 0.0); }
float sdCircle(vec2 p, float r){ return length(p) - r; }
float sdTriangle(vec2 p){ const float k = sqrt(3.0); p.x = abs(p.x) - 1.0; p.y = p.y + 1.0/k; if(p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y)/2.0; p.x -= clamp(p.x, -2.0, 0.0); return -length(p)*sign(p.y); }
`;

const FS_HEADER = `precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_kick;
uniform float u_energy;
uniform float u_beat;
uniform float u_spectrum[32];
uniform float u_intensity;
uniform sampler2D u_prev;
uniform vec2  u_mouse;
` + STDLIB;

type ShaderSpec = {
  fragment: string;
  uniforms?: Record<string, number[]>;
  feedback?: boolean;
};

export class ShaderBg {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private raf = 0;
  private t0 = 0;
  // standard uniform locations
  private u: {
    time?: WebGLUniformLocation; res?: WebGLUniformLocation;
    bass?: WebGLUniformLocation; mid?: WebGLUniformLocation;
    treble?: WebGLUniformLocation; kick?: WebGLUniformLocation;
    energy?: WebGLUniformLocation; beat?: WebGLUniformLocation;
    spectrum?: WebGLUniformLocation; intensity?: WebGLUniformLocation;
    prev?: WebGLUniformLocation; mouse?: WebGLUniformLocation;
  } = {};
  private userUniforms: Array<{ loc: WebGLUniformLocation; values: number[] }> = [];
  private intensityGetter: () => number = () => 1;
  // ping-pong feedback
  private feedback = false;
  private fbA: { fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private fbB: { fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private cur: "a" | "b" = "a";
  // 1×1 black fallback texture when feedback is off
  private blackTex: WebGLTexture | null = null;
  private mouse: [number, number] = [0.5, 0.5];

  constructor(canvas: HTMLCanvasElement, intensityGetter?: () => number) {
    this.canvas = canvas;
    if (intensityGetter) this.intensityGetter = intensityGetter;
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("mousemove", (e) => {
      this.mouse = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
    });
  }

  setIntensityGetter(g: () => number): void { this.intensityGetter = g; }

  setShader(spec: ShaderSpec): void {
    this.clear();
    const gl = (this.gl ??= this.canvas.getContext("webgl", { antialias: false, alpha: true, preserveDrawingBuffer: false })!);
    if (!gl) { console.warn("[shader-bg] WebGL not available"); return; }
    this.feedback = !!spec.feedback;
    this.resize();
    this.ensureBlackTex(gl);
    if (this.feedback) this.ensureFeedbackTargets(gl);

    const fragSrc = FS_HEADER
      + this.buildUserUniformDecls(spec.uniforms)
      + "\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution.xy;\n"
      + spec.fragment
      + "\n}\n";

    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[shader-bg] link failed:", gl.getProgramInfoLog(prog));
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.u = {
      time:      gl.getUniformLocation(prog, "u_time")      ?? undefined,
      res:       gl.getUniformLocation(prog, "u_resolution")?? undefined,
      bass:      gl.getUniformLocation(prog, "u_bass")      ?? undefined,
      mid:       gl.getUniformLocation(prog, "u_mid")       ?? undefined,
      treble:    gl.getUniformLocation(prog, "u_treble")    ?? undefined,
      kick:      gl.getUniformLocation(prog, "u_kick")      ?? undefined,
      energy:    gl.getUniformLocation(prog, "u_energy")    ?? undefined,
      beat:      gl.getUniformLocation(prog, "u_beat")      ?? undefined,
      spectrum:  gl.getUniformLocation(prog, "u_spectrum[0]") ?? undefined,
      intensity: gl.getUniformLocation(prog, "u_intensity") ?? undefined,
      prev:      gl.getUniformLocation(prog, "u_prev")      ?? undefined,
      mouse:     gl.getUniformLocation(prog, "u_mouse")     ?? undefined,
    };

    this.userUniforms = [];
    if (spec.uniforms) {
      for (const [name, vals] of Object.entries(spec.uniforms)) {
        const loc = gl.getUniformLocation(prog, name);
        if (loc) this.userUniforms.push({ loc, values: vals });
      }
    }

    this.t0 = performance.now();
    this.canvas.style.display = "block";
    this.start();
  }

  clear(): void {
    this.stop();
    if (this.gl && this.prog) {
      this.gl.deleteProgram(this.prog);
      this.prog = null;
    }
    this.canvas.style.display = "none";
  }

  private start(): void {
    if (this.raf) return;
    const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  private stop(): void { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth * dpr, h = this.canvas.clientHeight * dpr;
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w; this.canvas.height = h;
    if (this.gl) {
      this.gl.viewport(0, 0, w, h);
      // re-allocate feedback textures to new size
      if (this.feedback) {
        this.destroyFeedbackTargets();
        this.ensureFeedbackTargets(this.gl);
      }
    }
  }

  private frame(): void {
    const gl = this.gl; if (!gl || !this.prog) return;
    const t = (performance.now() - this.t0) / 1000;
    gl.useProgram(this.prog);

    const src = this.cur === "a" ? this.fbA : this.fbB;
    const dst = this.cur === "a" ? this.fbB : this.fbA;

    // bind u_prev: feedback source (or black)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.feedback && src ? src.tex : this.blackTex!);
    if (this.u.prev) gl.uniform1i(this.u.prev, 0);

    if (this.u.time)      gl.uniform1f(this.u.time, t);
    if (this.u.res)       gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    if (this.u.bass)      gl.uniform1f(this.u.bass, audioState.bass);
    if (this.u.mid)       gl.uniform1f(this.u.mid,  audioState.mid);
    if (this.u.treble)    gl.uniform1f(this.u.treble, audioState.treble);
    if (this.u.kick)      gl.uniform1f(this.u.kick, audioState.kick);
    if (this.u.energy)    gl.uniform1f(this.u.energy, audioState.energy);
    if (this.u.beat)      gl.uniform1f(this.u.beat, audioState.beat);
    if (this.u.spectrum)  gl.uniform1fv(this.u.spectrum, audioState.spectrum);
    if (this.u.intensity) gl.uniform1f(this.u.intensity, this.intensityGetter());
    if (this.u.mouse)     gl.uniform2f(this.u.mouse, this.mouse[0], this.mouse[1]);
    for (const { loc, values } of this.userUniforms) {
      const v = values;
      if (v.length === 1) gl.uniform1f(loc, v[0]!);
      else if (v.length === 2) gl.uniform2f(loc, v[0]!, v[1]!);
      else if (v.length === 3) gl.uniform3f(loc, v[0]!, v[1]!, v[2]!);
      else if (v.length === 4) gl.uniform4f(loc, v[0]!, v[1]!, v[2]!, v[3]!);
    }

    if (this.feedback && dst) {
      // render to feedback target, then copy/draw to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // now blit dst → screen by drawing once more (cheap; alternatively use a second prog)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dst.tex);
      // Re-run the same shader to screen would double the work. Cheaper:
      // we already rendered to FBO, and the user's shader writes the final
      // visual into dst.tex. To show on canvas without a separate "present"
      // pass, we use the same shader but disable feedback contribution:
      // simplest is to just redraw — webgl framebuffer→canvas needs blit
      // via texture, requires a present shader. For now redraw at screen.
      gl.bindTexture(gl.TEXTURE_2D, src ? src.tex : this.blackTex!); // u_prev for screen pass = previous
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.cur = this.cur === "a" ? "b" : "a";
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  private buildUserUniformDecls(uniforms?: Record<string, number[]>): string {
    if (!uniforms) return "";
    const lines: string[] = [];
    for (const [name, vals] of Object.entries(uniforms)) {
      const type = vals.length === 1 ? "float"
        : vals.length === 2 ? "vec2"
        : vals.length === 3 ? "vec3" : "vec4";
      lines.push(`uniform ${type} ${name};`);
    }
    return lines.join("\n") + "\n";
  }

  private ensureBlackTex(gl: WebGLRenderingContext): void {
    if (this.blackTex) return;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.blackTex = t;
  }

  private ensureFeedbackTargets(gl: WebGLRenderingContext): void {
    if (this.fbA && this.fbB) return;
    this.fbA = makeFbo(gl, this.canvas.width, this.canvas.height);
    this.fbB = makeFbo(gl, this.canvas.width, this.canvas.height);
  }
  private destroyFeedbackTargets(): void {
    const gl = this.gl; if (!gl) return;
    for (const f of [this.fbA, this.fbB]) {
      if (f) { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex); }
    }
    this.fbA = null; this.fbB = null;
  }
}

const makeFbo = (gl: WebGLRenderingContext, w: number, h: number): { fbo: WebGLFramebuffer; tex: WebGLTexture } => {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
};

const compile = (gl: WebGLRenderingContext, kind: number, src: string): WebGLShader | null => {
  const s = gl.createShader(kind)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("[shader-bg] compile failed:", gl.getShaderInfoLog(s), "\nsrc:\n", src);
    gl.deleteShader(s);
    return null;
  }
  return s;
};
