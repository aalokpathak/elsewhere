import * as THREE from 'three';

/**
 * The player's car: an original stylised coupé. The body is a single lofted
 * surface — cross-sections interpolated along the car's length — which gives a
 * curved hood, a tapered glasshouse, real wheel arches and flush glass with
 * smooth reflections. Lights, wheels, mirrors and a simple cockpit are added
 * on top. Local frame: +Z forward, +Y up, +X = driver's (left) side; ground
 * contact at y = 0.
 */

export const WHEEL_RADIUS = 0.34;
export const WHEELBASE = 2.64;
export const TRACK = 1.55;
export const DRIVER_SEAT = new THREE.Vector3(0.36, 1.17, -0.28);
export const HOOD_CAMERA = new THREE.Vector3(0, 1.17, 1.12);

export interface CarVisualState {
  steerAngle: number;
  wheelSpin: number;
  braking: boolean;
  reversing: boolean;
  lightsOn: boolean;
  headlights: number;
  /** 0..1 visibility of the volumetric headlight beams (fog, rain, darkness). */
  beams: number;
  speedKmh: number;
  units: 'kmh' | 'mph';
  /** 0 = daylight, 1 = darkness; drives the fill light. */
  darkness: number;
  /** Opacity of the soft contact shadow under the car. */
  contactShadow: number;
  /** Suspension pose (radians / metres). */
  pitch: number;
  roll: number;
  bounce: number;
}

// --- Body loft ---------------------------------------------------------------
// Key cross-sections from tail to nose:
// [z, wBot, wBelt, yBot, yBelt, yTop, wTop, crown]
const KEYS: number[][] = [
  [-2.23, 0.77, 0.85, 0.4, 0.9, 0.975, 0.71, 0.004],
  [-2.12, 0.82, 0.885, 0.32, 0.945, 1.025, 0.735, 0.012],
  [-1.96, 0.84, 0.895, 0.3, 0.955, 1.035, 0.74, 0.015],
  [-1.72, 0.86, 0.905, 0.27, 0.965, 1.05, 0.73, 0.015],
  [-1.45, 0.87, 0.91, 0.25, 0.97, 1.23, 0.64, 0.015],
  [-1.2, 0.87, 0.91, 0.25, 0.97, 1.365, 0.6, 0.018],
  [-1.0, 0.87, 0.91, 0.25, 0.97, 1.41, 0.59, 0.02],
  [-0.45, 0.87, 0.91, 0.25, 0.97, 1.43, 0.6, 0.02],
  [0.0, 0.87, 0.91, 0.25, 0.968, 1.425, 0.6, 0.02],
  [0.22, 0.87, 0.91, 0.25, 0.965, 1.4, 0.59, 0.02],
  [0.45, 0.87, 0.91, 0.25, 0.962, 1.275, 0.62, 0.016],
  [0.72, 0.87, 0.91, 0.25, 0.958, 1.125, 0.66, 0.012],
  [0.98, 0.87, 0.908, 0.25, 0.952, 1.012, 0.72, 0.012],
  [1.3, 0.87, 0.905, 0.25, 0.93, 0.985, 0.72, 0.02],
  [1.7, 0.86, 0.895, 0.25, 0.9, 0.945, 0.7, 0.02],
  [2.0, 0.82, 0.87, 0.27, 0.855, 0.89, 0.66, 0.015],
  [2.2, 0.76, 0.82, 0.31, 0.79, 0.815, 0.6, 0.008],
  [2.27, 0.71, 0.79, 0.36, 0.735, 0.765, 0.56, 0.004],
];

/** Cubic Hermite interpolation of the key cross-sections at z. */
function sectionAt(z: number): number[] {
  let i = 0;
  while (i < KEYS.length - 2 && z > KEYS[i + 1][0]) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const p = KEYS[Math.max(0, i - 1)];
  const n = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const h = b[0] - a[0];
  const t = Math.min(1, Math.max(0, (z - a[0]) / h));
  const t2 = t * t;
  const t3 = t2 * t;
  const out = [z];
  for (let k = 1; k < a.length; k++) {
    const ma = ((b[k] - p[k]) / (b[0] - p[0])) * h;
    const mb = ((n[k] - a[k]) / (n[0] - a[0])) * h;
    out.push((2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * ma + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * mb);
  }
  return out;
}

/** Points per cross-section ring (the shoulder point is doubled to crease the beltline). */
const HALF = 11;
const RING = HALF * 2 - 2;
const GLASS_SIDE: [number, number][] = [
  [-1.5, -0.44],
  [-0.33, 0.8],
];
const WINDSCREEN: [number, number] = [0.25, 0.95];
const REAR_GLASS: [number, number] = [-1.67, -1.03];

function buildBody(): THREE.BufferGeometry {
  const z0 = KEYS[0][0];
  const z1 = KEYS[KEYS.length - 1][0];
  const stations = 78;
  const positions: number[] = [];
  const zs: number[] = [];
  const archR = 0.45;
  for (let s = 0; s < stations; s++) {
    const z = z0 + ((z1 - z0) * s) / (stations - 1);
    zs.push(z);
    const [, wBot, wBelt, yBot, yBelt, yTop, wTop, crown] = sectionAt(z);
    const shoulder = wBelt * 0.955;
    const half: [number, number][] = [
      [0, yBot],
      [wBot * 0.75, yBot],
      [wBot, yBot + 0.07],
      [wBelt, yBot + (yBelt - yBot) * 0.48],
      [wBelt * 0.99, yBelt - 0.03],
      [shoulder, yBelt],
      [shoulder, yBelt],
      [Math.min(shoulder, wTop * 1.05), Math.max(yBelt + 0.004, yTop - 0.075)],
      [wTop * 0.86, yTop - 0.016],
      [wTop * 0.45, yTop],
      [0, yTop + crown],
    ];
    // Wheel arches: lift the lower body edge over each wheel.
    for (const za of [-WHEELBASE / 2, WHEELBASE / 2]) {
      const dz = Math.abs(z - za);
      if (dz < archR) {
        const top = WHEEL_RADIUS + Math.sqrt(archR * archR - dz * dz);
        for (let k = 1; k <= 3; k++) half[k][1] = Math.max(half[k][1], top);
        half[4][1] = Math.max(half[4][1], top + 0.03);
      }
    }
    for (let k = 0; k < HALF; k++) positions.push(half[k][0], half[k][1], z);
    for (let k = HALF - 2; k >= 1; k--) positions.push(-half[k][0], half[k][1], z);
  }
  // End caps.
  const capRear = positions.length / 3;
  const sr = sectionAt(z0);
  positions.push(0, (sr[3] + sr[5]) / 2, z0 - 0.03);
  const capFront = positions.length / 3;
  const sf = sectionAt(z1);
  positions.push(0, (sf[3] + sf[5]) / 2, z1 + 0.03);

  const inRange = (z: number, r: [number, number]) => z >= r[0] && z <= r[1];
  const groups: number[][] = [[], [], []]; // paint, glass, trim
  for (let s = 0; s < stations - 1; s++) {
    const zm = (zs[s] + zs[s + 1]) / 2;
    for (let j = 0; j < RING; j++) {
      const k = j < HALF - 1 ? j : RING - 1 - j;
      if (k === 5) continue; // zero-width crease strip
      const a = s * RING + j;
      const b = s * RING + ((j + 1) % RING);
      const c = (s + 1) * RING + j;
      const d = (s + 1) * RING + ((j + 1) % RING);
      let g = 0;
      if (k <= 1) g = 2;
      else if (k === 6 && GLASS_SIDE.some((r) => inRange(zm, r))) g = 1;
      else if (k >= 8 && (inRange(zm, WINDSCREEN) || inRange(zm, REAR_GLASS))) g = 1;
      groups[g].push(a, c, b, b, c, d);
    }
  }
  for (let j = 0; j < RING; j++) {
    const n = (j + 1) % RING;
    groups[0].push(capRear, j, n);
    const base = (stations - 1) * RING;
    groups[0].push(capFront, base + n, base + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Make sure faces point outwards (flip everything if the first face points in).
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const idx = groups[0];
  pa.fromArray(positions, idx[6 * 4] * 3);
  pb.fromArray(positions, idx[6 * 4 + 1] * 3);
  pc.fromArray(positions, idx[6 * 4 + 2] * 3);
  const normal = pb.clone().sub(pa).cross(pc.clone().sub(pa));
  const outward = pa.clone().add(pb).add(pc).multiplyScalar(1 / 3).sub(new THREE.Vector3(0, 0.75, pa.z));
  if (normal.dot(outward) < 0) {
    for (const g of groups) for (let i = 0; i < g.length; i += 3) [g[i + 1], g[i + 2]] = [g[i + 2], g[i + 1]];
  }
  const all = [...groups[0], ...groups[1], ...groups[2]];
  geo.setIndex(all);
  geo.addGroup(0, groups[0].length, 0);
  geo.addGroup(groups[0].length, groups[1].length, 1);
  geo.addGroup(groups[0].length + groups[1].length, groups[2].length, 2);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const beamVertex = /* glsl */ `
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewV;
void main() {
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewV;
void main() {
  float rim = abs(dot(normalize(vNormalV), normalize(vViewV)));
  float a = smoothstep(0.0, 0.45, rim) * pow(clamp(1.0 - vAlong, 0.0, 1.0), 1.5) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class CarModel {
  readonly root = new THREE.Group();
  /** Pitched / rolled by the suspension simulation. */
  readonly body = new THREE.Group();
  readonly exterior = new THREE.Group();
  readonly cockpit = new THREE.Group();
  readonly headlights: THREE.SpotLight[] = [];
  /** Soft local light so the car stays readable at night and indoors. */
  readonly fill = new THREE.PointLight('#a9bcd6', 0, 9, 2);

  private readonly paint: THREE.MeshStandardMaterial;
  private readonly headlightLens: THREE.MeshStandardMaterial;
  private readonly tailLens: THREE.MeshStandardMaterial;
  private readonly reverseLens: THREE.MeshStandardMaterial;
  private readonly beamMaterial: THREE.ShaderMaterial;
  private readonly contactMaterial: THREE.MeshBasicMaterial;
  private readonly beams: THREE.Mesh[] = [];
  private readonly wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly dashCanvas: HTMLCanvasElement | null;
  private readonly dashTexture: THREE.CanvasTexture | null;
  private readonly steeringWheel: THREE.Mesh;
  private dashTimer = 0;
  private lastDash = '';

  constructor(color = '#d9cfb8') {
    this.root.name = 'player-car';
    this.root.add(this.body);
    this.body.add(this.exterior, this.cockpit);

    this.paint = this.track(
      new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.18 }),
    );
    const glass = this.track(
      new THREE.MeshStandardMaterial({ color: '#0b1014', metalness: 0.55, roughness: 0.05, envMapIntensity: 1.6 }),
    );
    const trim = this.track(new THREE.MeshStandardMaterial({ color: '#16181b', metalness: 0.2, roughness: 0.62 }));
    const chrome = this.track(new THREE.MeshStandardMaterial({ color: '#c3c7cb', metalness: 0.95, roughness: 0.22 }));
    const rubber = this.track(new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.92, side: THREE.DoubleSide }));
    this.headlightLens = this.track(
      new THREE.MeshStandardMaterial({ color: '#f4f0e6', emissive: '#fff2d6', emissiveIntensity: 0.2, roughness: 0.2 }),
    );
    this.tailLens = this.track(
      new THREE.MeshStandardMaterial({ color: '#4a0a0a', emissive: '#ff2414', emissiveIntensity: 0.25, roughness: 0.3 }),
    );
    this.reverseLens = this.track(
      new THREE.MeshStandardMaterial({ color: '#c8c8c0', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.3 }),
    );

    // --- Body -------------------------------------------------------------
    const bodyMesh = new THREE.Mesh(this.track(buildBody()), [this.paint, glass, trim]);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.exterior.add(bodyMesh);

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, ry = 0, rx = 0) => {
      const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      this.exterior.add(m);
      return m;
    };
    for (const sx of [-1, 1]) {
      // Headlights wrap round the nose; tail lamps sit on the rear corners.
      addBox(0.36, 0.085, 0.14, sx * 0.53, 0.705, 2.2, this.headlightLens, sx * 0.42, -0.1);
      addBox(0.44, 0.11, 0.1, sx * 0.54, 0.83, -2.2, this.tailLens, -sx * 0.16, 0.06);
      addBox(0.1, 0.04, 0.06, sx * 0.2, 0.75, -2.245, this.reverseLens);
      // Mirrors.
      const stalk = addBox(0.08, 0.025, 0.05, sx * 0.9, 1.0, 0.8, trim);
      stalk.castShadow = false;
      const mirror = addBox(0.11, 0.08, 0.06, sx * 0.965, 1.02, 0.79, this.paint, sx * 0.2);
      mirror.castShadow = true;
      // Door handles.
      addBox(0.02, 0.025, 0.14, sx * 0.915, 0.9, -0.12, chrome);
    }
    // Light bar joining the tail lamps, grille, splitter, diffuser, plates, exhaust.
    addBox(0.66, 0.03, 0.05, 0, 0.835, -2.235, this.tailLens);
    addBox(1.36, 0.03, 0.16, 0, 1.03, -2.1, this.paint);
    addBox(0.8, 0.1, 0.05, 0, 0.58, 2.262, trim);
    addBox(1.36, 0.045, 0.16, 0, 0.345, 2.17, trim);
    addBox(1.44, 0.14, 0.2, 0, 0.36, -2.14, trim);
    const plate = this.track(new THREE.MeshStandardMaterial({ color: '#e8e2d0', roughness: 0.6 }));
    addBox(0.46, 0.11, 0.02, 0, 0.6, -2.255, plate);
    addBox(0.38, 0.09, 0.02, 0, 0.45, 2.285, plate);
    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 10).rotateX(Math.PI / 2)), chrome);
      tip.position.set(sx * 0.48, 0.33, -2.2);
      this.exterior.add(tip);
    }

    // --- Contact shadow ---------------------------------------------------
    // A soft dark patch under the car. It grounds the car when real shadows
    // are off (Low preset, overcast, night) and adds depth when they are on.
    const n = 48;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = Math.abs((x + 0.5) / n - 0.5) * 2;
        const dy = Math.abs((y + 0.5) / n - 0.5) * 2;
        // Rounded-rectangle falloff.
        const d = Math.pow(Math.pow(dx, 3.5) + Math.pow(dy, 3.5), 1 / 3.5);
        const a = Math.max(0, 1 - d);
        const i = (y * n + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = Math.round(Math.min(1, a * 2.4) ** 1.5 * 255);
      }
    }
    const shadowTex = this.track(new THREE.DataTexture(data, n, n, THREE.RGBAFormat));
    shadowTex.magFilter = THREE.LinearFilter;
    shadowTex.minFilter = THREE.LinearFilter;
    shadowTex.needsUpdate = true;
    this.contactMaterial = this.track(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        color: '#000000',
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
      }),
    );
    const contact = new THREE.Mesh(this.track(new THREE.PlaneGeometry(2.7, 5.5).rotateX(-Math.PI / 2)), this.contactMaterial);
    contact.position.y = 0.045;
    contact.renderOrder = 1;
    this.root.add(contact);

    // --- Wheels -----------------------------------------------------------
    const tireProfile = [
      [0.2, -0.125], [0.3, -0.125], [0.332, -0.1], [0.34, -0.06], [0.34, 0.06], [0.332, 0.1], [0.3, 0.125], [0.2, 0.125],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const tireGeo = this.track(new THREE.LatheGeometry(tireProfile, 24).rotateZ(Math.PI / 2));
    const rimGeo = this.track(new THREE.CylinderGeometry(0.215, 0.215, 0.2, 20).rotateZ(Math.PI / 2));
    const discGeo = this.track(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 16).rotateZ(Math.PI / 2));
    const spokeGeo = this.track(new THREE.BoxGeometry(0.035, 0.2, 0.05));
    const capGeo = this.track(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10).rotateZ(Math.PI / 2));
    const rimDark = this.track(new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: 0.7, roughness: 0.45 }));
    for (const [x, z, front] of [
      [TRACK / 2, WHEELBASE / 2, true],
      [-TRACK / 2, WHEELBASE / 2, true],
      [TRACK / 2, -WHEELBASE / 2, false],
      [-TRACK / 2, -WHEELBASE / 2, false],
    ] as [number, number, boolean][]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_RADIUS, z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, rubber);
      tire.castShadow = true;
      spin.add(tire, new THREE.Mesh(rimGeo, rimDark));
      const outer = Math.sign(x) * 0.105;
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(spokeGeo, chrome);
        const a = (i / 5) * Math.PI * 2;
        spoke.position.set(outer, Math.cos(a) * 0.115, Math.sin(a) * 0.115);
        spoke.rotation.x = a;
        spin.add(spoke);
      }
      const cap = new THREE.Mesh(capGeo, chrome);
      cap.position.x = outer * 1.1;
      spin.add(cap);
      const disc = new THREE.Mesh(discGeo, rimDark);
      disc.position.x = outer * 0.5;
      pivot.add(disc);
      pivot.add(spin);
      this.root.add(pivot);
      this.wheels.push({ pivot, spin, front });
    }

    // --- Headlight beams --------------------------------------------------
    this.beamMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uColor: { value: new THREE.Color('#ffeccd') }, uOpacity: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    // A cone from the lamp (narrow end, uv.y = 0) widening forward along +Z.
    const beamGeo = this.track(
      new THREE.CylinderGeometry(3.4, 0.12, 30, 20, 1, true).translate(0, 15, 0).rotateX(Math.PI / 2),
    );
    for (const sx of [-1, 1]) {
      const light = new THREE.SpotLight('#fff1d8', 0, 190, 0.5, 0.6, 1.2);
      light.position.set(sx * 0.55, 0.72, 2.15);
      light.target.position.set(sx * 0.9, 0, 26);
      this.root.add(light, light.target);
      this.headlights.push(light);
      const beam = new THREE.Mesh(beamGeo, this.beamMaterial);
      beam.position.set(sx * 0.55, 0.7, 2.25);
      beam.rotation.set(0.035, sx * -0.02, 0);
      beam.frustumCulled = false;
      beam.visible = false;
      beam.renderOrder = 5;
      this.root.add(beam);
      this.beams.push(beam);
    }
    this.fill.position.set(0, 3.4, -2.6);
    this.root.add(this.fill);

    // --- Cockpit (first-person) ------------------------------------------
    const dashMat = this.track(
      new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.9, emissive: '#14161a', emissiveIntensity: 1 }),
    );
    const cockpitBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = dashMat) => {
      const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      this.cockpit.add(m);
      return m;
    };
    cockpitBox(1.66, 0.24, 0.6, 0, 0.88, 0.72);
    const cowl = cockpitBox(1.6, 0.04, 0.4, 0, 0.995, 0.74);
    cowl.rotation.x = -0.2;
    cockpitBox(0.05, 0.42, 2.0, 0.86, 0.78, -0.2);
    cockpitBox(0.05, 0.42, 2.0, -0.86, 0.78, -0.2);
    cockpitBox(1.3, 0.03, 1.5, 0, 1.4, -0.4, this.track(new THREE.MeshStandardMaterial({ color: '#33353a', roughness: 1, emissive: '#121316', emissiveIntensity: 1 })));
    cockpitBox(0.2, 0.055, 0.02, 0, 1.31, 0.26, trim);
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * 0.82, 0.97, 0.96);
      const b = new THREE.Vector3(sx * 0.6, 1.39, 0.24);
      const len = a.distanceTo(b);
      const pillar = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.05, 0.06, len)), dashMat);
      pillar.position.copy(a).add(b).multiplyScalar(0.5);
      pillar.lookAt(b);
      this.cockpit.add(pillar);
    }
    const wheelMat = this.track(
      new THREE.MeshStandardMaterial({ color: '#1d1f23', roughness: 0.7, emissive: '#0c0d10', emissiveIntensity: 1 }),
    );
    this.steeringWheel = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.14, 0.018, 8, 28)), wheelMat);
    this.steeringWheel.position.set(DRIVER_SEAT.x, 0.88, 0.36);
    this.steeringWheel.rotation.x = -0.35;
    this.cockpit.add(this.steeringWheel);
    this.steeringWheel.add(new THREE.Mesh(this.track(new THREE.BoxGeometry(0.27, 0.026, 0.02)), wheelMat));

    // Instrument panel rendered from a small canvas (skipped without a DOM).
    if (typeof document !== 'undefined') {
      this.dashCanvas = document.createElement('canvas');
      this.dashCanvas.width = 256;
      this.dashCanvas.height = 128;
      this.dashTexture = this.track(new THREE.CanvasTexture(this.dashCanvas));
      this.dashTexture.colorSpace = THREE.SRGBColorSpace;
      const panel = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(0.26, 0.13)),
        this.track(new THREE.MeshBasicMaterial({ map: this.dashTexture, toneMapped: false })),
      );
      panel.position.set(DRIVER_SEAT.x, 1.065, 0.5);
      panel.rotation.set(0.2, Math.PI, 0);
      // A small binnacle behind the gauges.
      cockpitBox(0.34, 0.17, 0.12, DRIVER_SEAT.x, 1.06, 0.57);
      this.cockpit.add(panel);
    } else {
      this.dashCanvas = null;
      this.dashTexture = null;
    }
    this.cockpit.visible = false;
  }

  setColor(color: string): void {
    this.paint.color.set(color);
  }

  /**
   * From inside, the body shell's faces are back-facing and culled, so the
   * hood and mirrors stay visible through the glass while the cockpit pieces
   * (dash, pillars, roof liner) frame the view.
   */
  setCockpitMode(inside: boolean): void {
    this.cockpit.visible = inside;
  }

  update(dt: number, s: CarVisualState): void {
    this.body.rotation.set(Number.isFinite(s.pitch) ? s.pitch : 0, 0, Number.isFinite(s.roll) ? s.roll : 0);
    this.body.position.y = Number.isFinite(s.bounce) ? s.bounce : 0;
    for (const w of this.wheels) {
      w.spin.rotation.x = s.wheelSpin;
      if (w.front) w.pivot.rotation.y = s.steerAngle;
    }
    this.steeringWheel.rotation.z = -s.steerAngle * 6;
    this.headlightLens.emissiveIntensity = s.lightsOn ? 5 : 0.15;
    this.tailLens.emissiveIntensity = s.braking ? 7 : s.lightsOn ? 2.4 : 0.2;
    this.reverseLens.emissiveIntensity = s.reversing ? 3 : 0;
    this.fill.intensity = Math.max(0, s.darkness - 0.25) * 9;
    this.contactMaterial.opacity = s.contactShadow;
    for (const l of this.headlights) l.intensity = s.headlights;
    const beam = s.lightsOn ? s.beams : 0;
    this.beamMaterial.uniforms.uOpacity.value = beam * 0.42;
    for (const b of this.beams) b.visible = beam > 0.01;

    if (this.cockpit.visible && this.dashCanvas && this.dashTexture) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.dashTimer = 0.12;
        this.drawDash(s);
      }
    }
  }

  private drawDash(s: CarVisualState): void {
    const v = s.units === 'mph' ? s.speedKmh * 0.621371 : s.speedKmh;
    const text = `${Math.round(Math.abs(v))}`;
    if (text === this.lastDash) return;
    this.lastDash = text;
    const ctx = this.dashCanvas!.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(94,140,138,0.8)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    const frac = Math.min(1, Math.abs(v) / (s.units === 'mph' ? 120 : 200));
    ctx.arc(128, 118, 96, Math.PI * 1.05, Math.PI * (1.05 + 0.9 * frac));
    ctx.stroke();
    ctx.fillStyle = '#efe6d2';
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 100);
    ctx.fillStyle = '#8a949b';
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillText(s.units === 'mph' ? 'MPH' : 'KM/H', 128, 122);
    this.dashTexture!.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.root.removeFromParent();
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }
}
