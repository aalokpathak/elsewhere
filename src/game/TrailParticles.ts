import * as THREE from 'three';

/**
 * A small pooled particle system for dust kicked up off-road, spray on wet
 * roads and tyre smoke. CPU-simulated (a few hundred particles), drawn as soft
 * round points. Memory is fixed: the oldest particle is recycled first.
 */
const vertex = /* glsl */ `
attribute vec4 aState; // age01, size, alpha, unused
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float age = aState.x;
  gl_PointSize = aState.y * (0.45 + age * 1.6) * uScale / max(0.5, -mv.z);
  vAlpha = aState.z * (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.08, age);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - d * d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class TrailParticles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly state: Float32Array;
  private readonly color: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array; // remaining seconds
  private readonly span: Float32Array; // total life
  private cursor = 0;
  private alive = 0;

  constructor(private readonly count: number) {
    const n = Math.max(1, count);
    this.pos = new Float32Array(n * 3);
    this.state = new Float32Array(n * 4);
    this.color = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.span = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) this.state[i * 4] = 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aState', new THREE.BufferAttribute(this.state, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.name = 'trail-particles';
    this.points.visible = false;
  }

  get enabled(): boolean {
    return this.count > 0;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, alpha: number): void {
    if (this.count <= 0) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    if (this.life[i] <= 0) this.alive++;
    this.life[i] = life;
    this.span[i] = life;
    this.state[i * 4] = 0;
    this.state[i * 4 + 1] = size;
    this.state[i * 4 + 2] = alpha;
    this.color[i * 3] = r;
    this.color[i * 3 + 1] = g;
    this.color[i * 3 + 2] = b;
  }

  update(dt: number, viewportHeight: number): void {
    if (this.count <= 0) return;
    this.material.uniforms.uScale.value = viewportHeight * 0.9;
    if (this.alive === 0) {
      this.points.visible = false;
      return;
    }
    const drag = Math.exp(-2.2 * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive--;
        this.state[i * 4] = 1;
        continue;
      }
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.35 * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.state[i * 4] = 1 - this.life[i] / this.span[i];
    }
    const g = this.points.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aState').needsUpdate = true;
    g.getAttribute('aColor').needsUpdate = true;
    this.points.visible = true;
  }

  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < this.count; i++) this.state[i * 4] = 1;
    this.alive = 0;
    this.points.visible = false;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
