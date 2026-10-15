import * as THREE from 'three';

/**
 * Stylised ocean: a large plane that follows the camera, with analytic wave
 * normals, Fresnel sky reflection and a sun glint. No simulation, no
 * reflection render pass — cheap enough for every quality preset.
 */
const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragment = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform float uTime;
uniform float uFogNear;
uniform float uFogFar;
uniform vec2 uOffset;
varying vec3 vWorld;

vec2 wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
  float ph = dot(p, dir) * freq + uTime * speed;
  return dir * cos(ph) * amp * freq;
}

void main() {
  vec2 p = vWorld.xz - uOffset;
  vec2 g = vec2(0.0);
  g += wave(p, normalize(vec2(0.8, 0.6)), 0.045, 0.9, 0.9);
  g += wave(p, normalize(vec2(-0.3, 1.0)), 0.09, 1.3, 0.35);
  g += wave(p, normalize(vec2(1.0, -0.4)), 0.21, 1.9, 0.12);
  g += wave(p, normalize(vec2(-0.7, -0.6)), 0.55, 2.7, 0.04);
  g += wave(p, normalize(vec2(0.2, -1.0)), 1.3, 3.6, 0.012);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  // Calm the normal with distance to avoid shimmering.
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(150.0, 1400.0, dist) * 0.7));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 r = reflect(-v, n);
  vec3 skyRef = mix(uHorizon, uSky, smoothstep(0.0, 0.5, r.y));
  vec3 base = mix(uShallow, uDeep, smoothstep(0.2, 0.9, v.y + 0.3));
  vec3 col = mix(base, skyRef, 0.12 + 0.78 * fres);
  float spec = pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0);
  float spark = pow(max(dot(r, normalize(uSunDir)), 0.0), 28.0) * 0.12;
  col += uSunColor * (spec * 3.0 + spark) * uSunStrength;
  float fog = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uHorizon, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uDeep: { value: new THREE.Color('#123e55') },
    uShallow: { value: new THREE.Color('#2a6a78') },
    uSky: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunStrength: { value: 1 },
    uTime: { value: 0 },
    uFogNear: { value: 100 },
    uFogFar: { value: 1000 },
    uOffset: { value: new THREE.Vector2() },
  };
  private readonly material: THREE.ShaderMaterial;

  constructor(readonly level: number) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: this.uniforms,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 1, 1).rotateX(-Math.PI / 2), this.material);
    this.mesh.position.y = level;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -800;
    this.mesh.name = 'water';
  }

  setColor(hex: string | undefined): void {
    if (!hex) return;
    this.uniforms.uDeep.value.set(hex);
    this.uniforms.uShallow.value.set(hex).offsetHSL(0, 0.02, 0.08);
  }

  follow(camera: THREE.Camera): void {
    // Snap so the wave pattern does not swim; keep the offset small for precision.
    const sx = Math.round(camera.position.x / 500) * 500;
    const sz = Math.round(camera.position.z / 500) * 500;
    this.mesh.position.set(sx, this.level, sz);
    this.uniforms.uOffset.value.set(Math.floor(sx / 10000) * 10000, Math.floor(sz / 10000) * 10000);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
