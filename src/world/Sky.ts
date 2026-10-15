import * as THREE from 'three';

/**
 * Procedural sky dome: gradient, sun disc and glow, drifting fbm clouds and
 * stars. Drawn at the far plane and centred on the camera every frame.
 */
const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uCloudCover;
uniform float uTime;
uniform float uStars;
uniform float uSunDisc;
varying vec3 vDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, h), 0.5));
  } else {
    col = mix(uHorizon, uGround, smoothstep(0.0, -0.18, h));
  }
  float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
  float glow = pow(sunDot, 6.0) * 0.22 + pow(sunDot, 48.0) * 0.4;
  col += uSunColor * glow * (0.35 + 0.65 * uSunDisc);
  // Haze band hugging the horizon.
  col = mix(col, uHorizon, (1.0 - smoothstep(0.0, 0.12, abs(h))) * 0.35);

  if (uStars > 0.0 && h > 0.0) {
    vec3 sp = d * 220.0;
    vec3 cell = floor(sp);
    float r = hash13(cell);
    float star = step(0.9975, r) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
    float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + r * 80.0);
    col += vec3(0.85, 0.9, 1.0) * star * twinkle * uStars * smoothstep(0.02, 0.25, h) * 1.6;
  }

  float disc = smoothstep(0.99955, 0.99975, sunDot);
  col += uSunColor * disc * 7.0 * uSunDisc;

#ifdef CLOUDS
  if (h > 0.0 && uCloudCover > 0.001) {
    vec2 uv = d.xz / (h + 0.12) * 0.55 + vec2(uTime * 0.0035, uTime * 0.0015);
    float n = fbm(uv * 1.6);
    float edge = 1.0 - uCloudCover;
    float cov = smoothstep(edge * 0.75, edge * 0.75 + 0.32, n);
    float fade = smoothstep(0.0, 0.18, h);
    float lit = 0.72 + 0.4 * smoothstep(0.35, 0.85, n);
    vec3 cloud = uCloudColor * lit + uSunColor * pow(sunDot, 5.0) * 0.3 * uSunDisc;
    col = mix(col, cloud, cov * fade * 0.92);
  }
#endif

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uCloudColor: { value: new THREE.Color() },
    uCloudCover: { value: 0.4 },
    uTime: { value: 0 },
    uStars: { value: 0 },
    uSunDisc: { value: 1 },
  };

  constructor(clouds: boolean) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      defines: clouds ? { CLOUDS: 1 } : {},
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
