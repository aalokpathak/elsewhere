import * as THREE from 'three';
import { DEG, smoothstep } from '../core/math';
import { Noise2D } from '../core/noise';
import { hashInts, Rng } from '../core/random';
import type { EnvironmentPreset, MountainLayer } from './environments/types';
import type { RoadGenerator } from './RoadGenerator';
import type { SceneryRenderer, InstanceRefs } from './SceneryRenderer';
import type { StructureId } from './assets/structures';

/**
 * Distant silhouettes that establish scale: mountain rings that travel with
 * the car (so they behave like infinitely distant ranges) and, for surreal
 * environments, enormous landmarks placed in the world that you can drive
 * past over several kilometres.
 */

const ringVertex = /* glsl */ `
attribute float aTop;
attribute float aPeak;
varying float vTop;
varying float vPeak;
void main() {
  vTop = aTop;
  vPeak = aPeak;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ringFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHaze;
uniform vec3 uSnow;
uniform float uHazeAmount;
uniform float uSnowCap;
varying float vTop;
varying float vPeak;
void main() {
  vec3 col = uColor;
  if (uSnowCap > 0.0) {
    float snow = smoothstep(1.0 - uSnowCap, 1.0 - uSnowCap + 0.08, vTop * vPeak);
    col = mix(col, uSnow, snow);
  }
  float haze = clamp(uHazeAmount + (1.0 - vTop) * 0.22, 0.0, 1.0);
  col = mix(col, uHaze, haze);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface Ring {
  layer: MountainLayer;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  color: THREE.Color;
}

function buildRing(layer: MountainLayer, seed: number, index: number): THREE.BufferGeometry {
  const noise = new Noise2D(hashInts(seed, 0x3a11, index));
  const segs = 256;
  const pos: number[] = [];
  const top: number[] = [];
  const peak: number[] = [];
  const heights: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    // Sample noise on a circle so the silhouette wraps seamlessly.
    const r = 2.2 + layer.roughness * 3;
    const n1 = noise.ridged(Math.cos(a) * r + 10, Math.sin(a) * r + 10, 4);
    const n2 = noise.fbm(Math.cos(a) * r * 2.3, Math.sin(a) * r * 2.3, 3) * 0.5 + 0.5;
    let h = Math.pow(n1, 1.4) * 0.75 + n2 * 0.25;
    if (layer.sparsity) h = Math.max(0, (h - layer.sparsity) / (1 - layer.sparsity));
    if (layer.maskAngle !== undefined) {
      const diff = Math.abs(Math.atan2(Math.sin(a - layer.maskAngle * DEG), Math.cos(a - layer.maskAngle * DEG)));
      h *= 1 - smoothstep((layer.maskWidth ?? 90) * DEG * 0.35, (layer.maskWidth ?? 90) * DEG * 0.5, diff);
    }
    heights.push(h);
  }
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.sin(a) * layer.radius;
    const z = Math.cos(a) * layer.radius;
    const h = heights[i];
    pos.push(x, layer.base - 420, z, x, layer.base + h * layer.height, z);
    top.push(0, 1);
    peak.push(h, h);
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    // Faces point inwards (towards the camera at the centre).
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  g.setAttribute('aPeak', new THREE.Float32BufferAttribute(peak, 1));
  g.setIndex(idx);
  return g;
}

export class DistantScenery {
  readonly group = new THREE.Group();
  private readonly rings: Ring[] = [];
  private landmarkRefs: InstanceRefs = new Map();
  private landmarkSlots = new Map<number, InstanceRefs>();

  constructor(
    parent: THREE.Object3D,
    private readonly env: EnvironmentPreset,
    private readonly seed: number,
    private readonly scenery: SceneryRenderer,
  ) {
    this.group.name = 'distant';
    parent.add(this.group);
    env.mountains.forEach((layer, i) => {
      const material = new THREE.ShaderMaterial({
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        uniforms: {
          uColor: { value: new THREE.Color(layer.color) },
          uHaze: { value: new THREE.Color() },
          uSnow: { value: new THREE.Color('#e8eef4') },
          uHazeAmount: { value: layer.haze },
          uSnowCap: { value: layer.snowCap ?? 0 },
        },
        side: THREE.FrontSide,
        fog: false,
        depthWrite: true,
      });
      const mesh = new THREE.Mesh(buildRing(layer, seed, i), material);
      mesh.frustumCulled = false;
      mesh.renderOrder = -900 + i;
      mesh.name = `mountains-${i}`;
      this.group.add(mesh);
      this.rings.push({ layer, mesh, material, color: new THREE.Color(layer.color) });
    });
  }

  /** Re-tints every layer for the current light and horizon colour. */
  setAtmosphere(horizon: THREE.Color, light: number, sun: THREE.Color): void {
    for (const r of this.rings) {
      const u = r.material.uniforms;
      (u.uHaze.value as THREE.Color).copy(horizon);
      (u.uColor.value as THREE.Color).copy(r.color).multiplyScalar(light).lerp(sun, 0.06 * Math.min(1, light));
      (u.uSnow.value as THREE.Color).setRGB(0.9, 0.93, 0.96).multiplyScalar(Math.min(1.15, light * 1.1));
    }
  }

  update(carX: number, carZ: number, road: RoadGenerator, carS: number): void {
    for (const r of this.rings) r.mesh.position.set(carX, 0, carZ);
    this.updateLandmarks(road, carS);
  }

  private updateLandmarks(road: RoadGenerator, carS: number): void {
    const lm = this.env.landmarks;
    if (!lm) return;
    const id = `landmark-${lm.kind}` as StructureId;
    const k0 = Math.floor((carS - 2500) / lm.spacing);
    const k1 = Math.floor((carS + 4500) / lm.spacing);
    for (const [k, refs] of this.landmarkSlots) {
      if (k < k0 || k > k1) {
        this.scenery.remove(refs);
        this.landmarkSlots.delete(k);
      }
    }
    for (let k = Math.max(1, k0); k <= k1; k++) {
      if (this.landmarkSlots.has(k)) continue;
      const s = k * lm.spacing;
      if (s > road.endS || s < road.startS) continue;
      const rng = new Rng(hashInts(this.seed, k, 0x1a4d));
      const p = road.pointAt(s);
      const side = rng.sign();
      const lateral = side * (lm.lateral[0] + rng.next() * (lm.lateral[1] - lm.lateral[0]));
      const x = p.x - Math.cos(p.heading) * lateral;
      const z = p.z + Math.sin(p.heading) * lateral;
      const scale = lm.scale[0] + rng.next() * (lm.scale[1] - lm.scale[0]);
      const kinds: StructureId[] = ['landmark-monolith', 'landmark-arch', 'landmark-sphere', 'landmark-tower', 'landmark-pylon'];
      const pick = rng.next() < 0.5 ? id : kinds[Math.floor(rng.next() * kinds.length)];
      const refs = this.scenery.addStructures([
        { id: pick, x, y: this.env.terrain.baseHeight - 2, z, rot: rng.next() * Math.PI, scale },
      ]);
      this.landmarkSlots.set(k, refs);
    }
  }

  dispose(): void {
    for (const r of this.rings) {
      r.mesh.geometry.dispose();
      r.material.dispose();
    }
    for (const refs of this.landmarkSlots.values()) this.scenery.remove(refs);
    this.landmarkSlots.clear();
    this.scenery.remove(this.landmarkRefs);
    this.group.removeFromParent();
  }
}
