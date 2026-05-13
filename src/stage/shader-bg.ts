/**
 * WebGL fragment-shader background. When a mood has `shaderBg`, this
 * replaces the 2D CanvasBg. The user only writes the fragment body —
 * the vertex shader is a fullscreen triangle and the per-frame uniforms
 * (time + audio bands + intensity) are wired automatically.
 *
 * Available uniforms in the fragment shader:
 *   uniform float u_time;        // seconds since shader activated
 *   uniform vec2  u_resolution;  // canvas size in CSS pixels
 *   uniform float u_bass;        // 0..1
 *   uniform float u_mid;         // 0..1
 *   uniform float u_treble;      // 0..1
 *   uniform float u_kick;        // 0..1 (decays fast)
 *   uniform float u_intensity;   // user slider, ~0.3..2.0
 *   // any user-supplied uniforms named in shaderBg.uniforms (vecN floats)
 *
 *   plus a normalized fragment coord helper:
 *     vec2 uv = gl_FragCoord.xy / u_resolution.xy;
 *
 * The fragment must write gl_FragColor (vec4) in the main() function body
 * supplied by the user. We wrap it inside our own main() that sets up uv
 * and forwards to the user code, so the user only writes statements.
 */

import { audioState } from "../audio-state";

const VS = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FS_HEADER = `precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_kick;
uniform float u_intensity;
`;

type ShaderSpec = { fragment: string; uniforms?: Record<string, number[]> };

export class ShaderBg {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private raf = 0;
  private t0 = 0;
  private uTime: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;
  private uBass: WebGLUniformLocation | null = null;
  private uMid: WebGLUniformLocation | null = null;
  private uTreb: WebGLUniformLocation | null = null;
  private uKick: WebGLUniformLocation | null = null;
  private uIntensity: WebGLUniformLocation | null = null;
  private userUniforms: Array<{ loc: WebGLUniformLocation; values: number[] }> = [];
  private intensityGetter: () => number = () => 1;

  constructor(canvas: HTMLCanvasElement, intensityGetter?: () => number) {
    this.canvas = canvas;
    if (intensityGetter) this.intensityGetter = intensityGetter;
    window.addEventListener("resize", () => this.resize());
  }

  setIntensityGetter(g: () => number): void { this.intensityGetter = g; }

  /** Compile and start rendering the given fragment shader. */
  setShader(spec: ShaderSpec): void {
    this.clear();
    const gl = (this.gl ??= this.canvas.getContext("webgl", { antialias: false, alpha: true })!);
    if (!gl) {
      console.warn("[shader-bg] WebGL not available");
      return;
    }
    this.resize();

    const fragSrc = FS_HEADER
      + this.buildUserUniformDecls(spec.uniforms)
      + "\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution.xy;\n"
      + spec.fragment
      + "\n}\n";

    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[shader-bg] link failed:", gl.getProgramInfoLog(prog));
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);

    // fullscreen triangle (3 verts cover the whole NDC)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uTime = gl.getUniformLocation(prog, "u_time");
    this.uRes  = gl.getUniformLocation(prog, "u_resolution");
    this.uBass = gl.getUniformLocation(prog, "u_bass");
    this.uMid  = gl.getUniformLocation(prog, "u_mid");
    this.uTreb = gl.getUniformLocation(prog, "u_treble");
    this.uKick = gl.getUniformLocation(prog, "u_kick");
    this.uIntensity = gl.getUniformLocation(prog, "u_intensity");

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

  /** Tear down shader and hide canvas — caller should re-start CanvasBg. */
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
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width  = this.canvas.clientWidth  * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private frame(): void {
    const gl = this.gl; if (!gl || !this.prog) return;
    const t = (performance.now() - this.t0) / 1000;
    gl.useProgram(this.prog);
    if (this.uTime) gl.uniform1f(this.uTime, t);
    if (this.uRes)  gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    if (this.uBass) gl.uniform1f(this.uBass, audioState.bass);
    if (this.uMid)  gl.uniform1f(this.uMid,  audioState.mid);
    if (this.uTreb) gl.uniform1f(this.uTreb, audioState.treble);
    if (this.uKick) gl.uniform1f(this.uKick, audioState.kick);
    if (this.uIntensity) gl.uniform1f(this.uIntensity, this.intensityGetter());
    for (const { loc, values } of this.userUniforms) {
      const v = values;
      if (v.length === 1) gl.uniform1f(loc, v[0]!);
      else if (v.length === 2) gl.uniform2f(loc, v[0]!, v[1]!);
      else if (v.length === 3) gl.uniform3f(loc, v[0]!, v[1]!, v[2]!);
      else if (v.length === 4) gl.uniform4f(loc, v[0]!, v[1]!, v[2]!, v[3]!);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
}

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
