import * as THREE from 'three';

/**
 * The player's car: an original stylised hatchback built from an extruded side
 * profile with wheel arches, glass, lights, wheels and a simple cockpit for
 * the first-person view. Local frame: +Z forward, +Y up, +X = driver's (left)
 * side. Ground contact is at y = 0.
 */

export const WHEEL_RADIUS = 0.34;
export const WHEELBASE = 2.64;
export const TRACK = 1.56;
export const DRIVER_SEAT = new THREE.Vector3(0.36, 1.21, -0.32);

export interface CarVisualState {
  steerAngle: number;
  wheelSpin: number;
  braking: boolean;
  lightsOn: boolean;
  headlights: number;
  speedKmh: number;
  units: 'kmh' | 'mph';
  /** 0 = daylight, 1 = darkness; drives the fill light. */
  darkness: number;
  /** Suspension pose (radians / metres). */
  pitch: number;
  roll: number;
  bounce: number;
}

function bodyShape(): THREE.Shape {
  const s = new THREE.Shape();
  const ax = 1.32;
  const ar = 0.44;
  const ay = 0.34;
  s.moveTo(-2.2, 0.5);
  s.lineTo(-2.12, 0.32);
  s.lineTo(-ax - ar, 0.3);
  s.absarc(-ax, ay, ar, Math.PI, 0, true);
  s.lineTo(ax - ar, 0.3);
  s.absarc(ax, ay, ar, Math.PI, 0, true);
  s.lineTo(2.12, 0.32);
  s.lineTo(2.25, 0.5);
  s.lineTo(2.22, 0.67);
  s.lineTo(2.08, 0.8);
  s.lineTo(0.95, 0.94);
  s.lineTo(0.1, 1.36);
  s.lineTo(-0.95, 1.38);
  s.lineTo(-1.8, 1.01);
  s.lineTo(-2.16, 0.95);
  s.lineTo(-2.24, 0.76);
  s.closePath();
  return s;
}

function windowShape(points: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

/** Maps profile coordinates (length, height) and width to car local space. */
function slopedQuad(
  a: [number, number],
  b: [number, number],
  halfA: number,
  halfB: number,
  lift: number,
): THREE.BufferGeometry {
  // Profile point (len, h) → (x, y, z) = (width, h, len)
  const dl = b[0] - a[0];
  const dh = b[1] - a[1];
  const len = Math.hypot(dl, dh);
  // Outward normal of the profile edge for a counter-clockwise outline.
  const nz = dh / len;
  const ny = -dl / len;
  const o = (p: [number, number], x: number) => [x, p[1] + ny * lift, p[0] + nz * lift];
  const v = [...o(a, -halfA), ...o(a, halfA), ...o(b, halfB), ...o(a, -halfA), ...o(b, halfB), ...o(b, -halfB)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

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

    this.paint = this.track(new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.38 }));
    const glass = this.track(
      new THREE.MeshStandardMaterial({ color: '#0e1418', metalness: 0.3, roughness: 0.06, envMapIntensity: 1.4 }),
    );
    const trim = this.track(new THREE.MeshStandardMaterial({ color: '#1b1d20', metalness: 0.2, roughness: 0.6 }));
    const chrome = this.track(new THREE.MeshStandardMaterial({ color: '#b8bcc0', metalness: 0.9, roughness: 0.25 }));
    const rubber = this.track(new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92 }));
    this.headlightLens = this.track(
      new THREE.MeshStandardMaterial({ color: '#f4f0e6', emissive: '#fff2d6', emissiveIntensity: 0.2, roughness: 0.2 }),
    );
    this.tailLens = this.track(
      new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#ff2414', emissiveIntensity: 0.25, roughness: 0.3 }),
    );

    // --- Body -------------------------------------------------------------
    const depth = 1.62;
    const bodyGeo = this.track(
      new THREE.ExtrudeGeometry(bodyShape(), {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.09,
        bevelSize: 0.08,
        bevelSegments: 3,
        curveSegments: 10,
      })
        .translate(0, 0, -depth / 2)
        .rotateY(-Math.PI / 2),
    );
    const bodyMesh = new THREE.Mesh(bodyGeo, this.paint);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.exterior.add(bodyMesh);

    // Side windows (front and rear panes, B-pillar between them).
    const sideDepth = depth + 0.2;
    for (const pts of [
      [[0.86, 0.98], [0.14, 1.31], [-0.3, 1.32], [-0.3, 0.98]],
      [[-0.42, 0.98], [-0.42, 1.32], [-0.92, 1.33], [-1.64, 1.0]],
    ] as [number, number][][]) {
      const g = this.track(
        new THREE.ExtrudeGeometry(windowShape(pts), { depth: sideDepth, bevelEnabled: false })
          .translate(0, 0, -sideDepth / 2)
          .rotateY(-Math.PI / 2),
      );
      this.exterior.add(new THREE.Mesh(g, glass));
    }
    // Windscreen and rear glass, lifted just off the body surface.
    this.exterior.add(new THREE.Mesh(this.track(slopedQuad([0.93, 0.955], [0.13, 1.35], 0.74, 0.68, 0.1)), glass));
    this.exterior.add(new THREE.Mesh(this.track(slopedQuad([-0.97, 1.37], [-1.76, 1.03], 0.66, 0.72, 0.1)), glass));

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      this.exterior.add(m);
      return m;
    };
    // Lights, grille, bumpers, mirrors, plate.
    for (const sx of [-1, 1]) {
      addBox(0.44, 0.13, 0.08, sx * 0.6, 0.7, 2.27, this.headlightLens);
      addBox(0.5, 0.12, 0.08, sx * 0.6, 0.86, -2.29, this.tailLens);
      const mirror = addBox(0.2, 0.12, 0.1, sx * 0.99, 1.02, 0.78, this.paint);
      mirror.castShadow = true;
    }
    addBox(0.95, 0.15, 0.06, 0, 0.55, 2.31, trim);
    addBox(1.78, 0.18, 0.16, 0, 0.38, 2.2, trim);
    addBox(1.78, 0.18, 0.16, 0, 0.4, -2.22, trim);
    addBox(1.82, 0.06, 3.4, 0, 0.3, 0, trim);
    addBox(0.52, 0.12, 0.02, 0, 0.56, -2.31, this.track(new THREE.MeshStandardMaterial({ color: '#e8e2d0' })));

    // --- Wheels -----------------------------------------------------------
    const tireGeo = this.track(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.24, 20).rotateZ(Math.PI / 2));
    const rimGeo = this.track(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 12).rotateZ(Math.PI / 2));
    const spokeGeo = this.track(new THREE.BoxGeometry(0.26, 0.05, 0.38));
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
      spin.add(tire, new THREE.Mesh(rimGeo, chrome));
      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(spokeGeo, trim);
        spoke.rotation.x = (i * Math.PI) / 3;
        spin.add(spoke);
      }
      pivot.add(spin);
      this.root.add(pivot);
      this.wheels.push({ pivot, spin, front });
    }

    // --- Headlight beams --------------------------------------------------
    for (const sx of [-1, 1]) {
      const light = new THREE.SpotLight('#fff1d8', 0, 150, 0.42, 0.55, 1.25);
      light.position.set(sx * 0.6, 0.72, 2.1);
      light.target.position.set(sx * 0.9, 0, 26);
      this.root.add(light, light.target);
      this.headlights.push(light);
    }

    this.fill.position.set(0, 3.4, -2.6);
    this.root.add(this.fill);

    // --- Cockpit (first-person) ------------------------------------------
    const dashMat = this.track(new THREE.MeshStandardMaterial({ color: '#17191c', roughness: 0.85 }));
    const cockpitBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat = dashMat) => {
      const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      this.cockpit.add(m);
      return m;
    };
    cockpitBox(1.64, 0.22, 0.56, 0, 0.9, 0.78);
    const hood = cockpitBox(1.6, 0.05, 0.4, 0, 1.0, 0.68);
    hood.rotation.x = -0.25;
    cockpitBox(0.06, 0.4, 1.9, 0.86, 0.8, -0.1);
    cockpitBox(0.06, 0.4, 1.9, -0.86, 0.8, -0.1);
    cockpitBox(1.6, 0.04, 1.4, 0, 1.39, -0.45, this.track(new THREE.MeshStandardMaterial({ color: '#2a2b2d', roughness: 1 })));
    cockpitBox(0.22, 0.06, 0.02, 0, 1.31, 0.3, trim);
    // A-pillars follow the windscreen edge.
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * 0.78, 0.95, 0.93);
      const b = new THREE.Vector3(sx * 0.72, 1.36, 0.13);
      const len = a.distanceTo(b);
      const pillar = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.05, 0.06, len)), dashMat);
      pillar.position.copy(a).add(b).multiplyScalar(0.5);
      pillar.lookAt(b.add(this.cockpit.position));
      this.cockpit.add(pillar);
    }
    const wheelMat = this.track(new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.7 }));
    this.steeringWheel = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.155, 0.02, 8, 28)), wheelMat);
    this.steeringWheel.position.set(DRIVER_SEAT.x, 0.94, 0.36);
    this.steeringWheel.rotation.x = -0.35;
    this.cockpit.add(this.steeringWheel);
    const spokeBar = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.3, 0.028, 0.02)), wheelMat);
    this.steeringWheel.add(spokeBar);

    // Instrument panel rendered from a small canvas (skipped without a DOM).
    if (typeof document !== 'undefined') {
      this.dashCanvas = document.createElement('canvas');
      this.dashCanvas.width = 256;
      this.dashCanvas.height = 128;
      this.dashTexture = this.track(new THREE.CanvasTexture(this.dashCanvas));
      this.dashTexture.colorSpace = THREE.SRGBColorSpace;
      const panel = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(0.34, 0.17)),
        this.track(new THREE.MeshBasicMaterial({ map: this.dashTexture, toneMapped: false })),
      );
      panel.position.set(DRIVER_SEAT.x, 1.03, 0.6);
      panel.rotation.set(0.35, Math.PI, 0);
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
    this.body.rotation.set(s.pitch, 0, s.roll);
    this.body.position.y = s.bounce;
    for (const w of this.wheels) {
      w.spin.rotation.x = s.wheelSpin;
      if (w.front) w.pivot.rotation.y = s.steerAngle;
    }
    this.steeringWheel.rotation.z = -s.steerAngle * 6;
    this.headlightLens.emissiveIntensity = s.lightsOn ? 3.2 : 0.15;
    this.tailLens.emissiveIntensity = s.braking ? 4 : s.lightsOn ? 2.2 : 0.2;
    this.fill.intensity = Math.max(0, s.darkness - 0.25) * 9;
    for (const l of this.headlights) l.intensity = s.headlights;

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
