import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Post-processing built for integrated graphics.
 *
 * The scene is rendered into a (multisampled) HDR target. Bright areas — sun,
 * lamps, tail lights, fluorescent tubes — are extracted at quarter resolution
 * and blurred at 1/4 and 1/8 size (five small passes in total), then a single
 * final pass adds the bloom, tone-maps, grades and dithers the image.
 *
 * The dither/grain is tiny (about one 8-bit step) but it removes the banding
 * that smooth sky and fog gradients otherwise show.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PREFILTER = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
vec3 tap(vec2 o) {
  vec3 c = texture2D(tScene, vUv + o * uTexel).rgb;
  // A single NaN/Inf pixel would otherwise be smeared over the whole screen.
  if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.0);
  return min(c, vec3(12.0));
}
void main() {
  vec3 c = (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

const BLUR = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  // 9-tap Gaussian using bilinear taps.
  vec3 c = texture2D(tInput, vUv).rgb * 0.227027;
  c += texture2D(tInput, vUv + uDir * 1.384615).rgb * 0.316216;
  c += texture2D(tInput, vUv - uDir * 1.384615).rgb * 0.316216;
  c += texture2D(tInput, vUv + uDir * 3.230769).rgb * 0.070270;
  c += texture2D(tInput, vUv - uDir * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}
`;

const FINAL = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloomNear;
uniform sampler2D tBloomWide;
uniform float uBloom;
uniform float uTime;
uniform float uGrain;
uniform float uSaturation;
uniform float uContrast;
varying vec2 vUv;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
#ifdef FXAA
uniform vec2 uTexel;
// Luma of a tone-compressed colour, so HDR highlights don't dominate edge detection.
float fxLuma(vec3 c) {
  c = c / (1.0 + c);
  return dot(c, vec3(0.299, 0.587, 0.114));
}
// Compact FXAA: smooths edges in one pass, far cheaper than MSAA on a float target.
vec3 fxaa(vec2 uv) {
  vec3 rgbM = texture2D(tScene, uv).rgb;
  float lNW = fxLuma(texture2D(tScene, uv + vec2(-1.0, -1.0) * uTexel).rgb);
  float lNE = fxLuma(texture2D(tScene, uv + vec2(1.0, -1.0) * uTexel).rgb);
  float lSW = fxLuma(texture2D(tScene, uv + vec2(-1.0, 1.0) * uTexel).rgb);
  float lSE = fxLuma(texture2D(tScene, uv + vec2(1.0, 1.0) * uTexel).rgb);
  float lM = fxLuma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.1)) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
  float lB = fxLuma(b);
  return (lB < lMin || lB > lMax) ? a : b;
}
#endif
void main() {
#ifdef FXAA
  vec3 scene = fxaa(vUv);
#else
  vec3 scene = texture2D(tScene, vUv).rgb;
#endif
  if (!(scene.r == scene.r) || !(scene.g == scene.g) || !(scene.b == scene.b)) scene = vec3(0.0);
  vec3 bloom = texture2D(tBloomNear, vUv).rgb * 0.55 + texture2D(tBloomWide, vUv).rgb * 0.75;
  gl_FragColor = vec4(scene + bloom * uBloom, 1.0);
  #include <tonemapping_fragment>
  vec3 c = gl_FragColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.18) * uContrast + 0.18;
  gl_FragColor.rgb = max(c, 0.0);
  #include <colorspace_fragment>
  float n = hash(gl_FragCoord.xy + fract(uTime) * 61.7) + hash(gl_FragCoord.yx * 1.31 + fract(uTime * 1.7) * 37.3) - 1.0;
  gl_FragColor.rgb += n * uGrain;
  gl_FragColor.a = 1.0;
}
`;

function target(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
}

export class PostFX {
  private readonly scene: THREE.WebGLRenderTarget;
  private readonly quarterA: THREE.WebGLRenderTarget;
  private readonly quarterB: THREE.WebGLRenderTarget;
  private readonly eighthA: THREE.WebGLRenderTarget;
  private readonly eighthB: THREE.WebGLRenderTarget;
  private readonly prefilter: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly final: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  /** Debug switch: skip the bloom passes. */
  bloomEnabled = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly world: THREE.Scene,
    private readonly camera: THREE.Camera,
    samples: number,
  ) {
    this.scene = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.quarterA = target(2, 2);
    this.quarterB = target(2, 2);
    this.eighthA = target(2, 2);
    this.eighthB = target(2, 2);
    const base = { vertexShader: VERT, depthTest: false, depthWrite: false, toneMapped: false } as const;
    this.prefilter = new THREE.ShaderMaterial({
      ...base,
      fragmentShader: PREFILTER,
      uniforms: { tScene: { value: this.scene.texture }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } },
    });
    this.blur = new THREE.ShaderMaterial({
      ...base,
      fragmentShader: BLUR,
      uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
    });
    this.final = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FINAL,
      depthTest: false,
      depthWrite: false,
      // Without multisampling, edges are smoothed in the final pass instead.
      defines: samples > 0 ? {} : { FXAA: 1 },
      uniforms: {
        uTexel: { value: new THREE.Vector2() },
        tScene: { value: this.scene.texture },
        tBloomNear: { value: this.quarterA.texture },
        tBloomWide: { value: this.eighthA.texture },
        uBloom: { value: 0.3 },
        uTime: { value: 0 },
        uGrain: { value: 0.012 },
        uSaturation: { value: 1.06 },
        uContrast: { value: 1.03 },
      },
    });
    this.quad = new FullScreenQuad(this.prefilter);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.resize(size.x, size.y);
  }

  /** Sizes are in CSS pixels; the pixel ratio converts to device pixels. */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.resize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
  }

  private resize(w: number, h: number): void {
    w = Math.max(8, w);
    h = Math.max(8, h);
    if (this.scene.width === w && this.scene.height === h) return;
    this.scene.setSize(w, h);
    const qw = Math.max(2, Math.round(w / 4));
    const qh = Math.max(2, Math.round(h / 4));
    this.quarterA.setSize(qw, qh);
    this.quarterB.setSize(qw, qh);
    const ew = Math.max(2, Math.round(w / 8));
    const eh = Math.max(2, Math.round(h / 8));
    this.eighthA.setSize(ew, eh);
    this.eighthB.setSize(ew, eh);
    (this.prefilter.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    (this.final.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  /** `glow` 0..1: how strongly lights should bloom (higher at night / indoors). */
  setLook(glow: number, time: number): void {
    this.final.uniforms.uBloom.value = this.bloomEnabled ? 0.2 + glow * 0.5 : 0;
    this.prefilter.uniforms.uThreshold.value = 1.0 - glow * 0.3;
    this.final.uniforms.uTime.value = time;
  }

  private pass(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(to);
    this.quad.render(this.renderer);
  }

  private blurPass(from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, dx: number, dy: number): void {
    this.blur.uniforms.tInput.value = from.texture;
    (this.blur.uniforms.uDir.value as THREE.Vector2).set(dx / from.width, dy / from.height);
    this.pass(this.blur, to);
  }

  render(): void {
    const r = this.renderer;
    r.setRenderTarget(this.scene);
    r.render(this.world, this.camera);
    if (this.bloomEnabled) {
      this.pass(this.prefilter, this.quarterA);
      this.blurPass(this.quarterA, this.quarterB, 1, 0);
      this.blurPass(this.quarterB, this.quarterA, 0, 1);
      // Wider glow from a further 2× downsample (the taps double as the downsample filter).
      this.blurPass(this.quarterA, this.eighthB, 1, 0);
      this.blurPass(this.eighthB, this.eighthA, 0, 1);
    }
    this.pass(this.final, null);
  }

  dispose(): void {
    this.scene.dispose();
    this.quarterA.dispose();
    this.quarterB.dispose();
    this.eighthA.dispose();
    this.eighthB.dispose();
    this.prefilter.dispose();
    this.blur.dispose();
    this.final.dispose();
    this.quad.dispose();
  }
}
