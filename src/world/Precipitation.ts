import * as THREE from 'three';

/**
 * GPU-animated rain streaks and snowflakes in a box that wraps around the
 * camera. Positions never change on the CPU; intensity just changes how many
 * particles are drawn.
 */
const BOX = new THREE.Vector3(70, 34, 70);

const rainVertex = /* glsl */ `
attribute vec3 aBase;
attribute float aEnd;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec2 uWind;
uniform float uFall;
uniform float uLength;
varying float vAlpha;
void main() {
  vec3 p = aBase;
  p.y = mod(p.y - uTime * uFall - uCam.y, uBox.y) + uCam.y - uBox.y * 0.5;
  p.xz = mod(p.xz + uWind * uTime - uCam.xz, uBox.xz) + uCam.xz - uBox.xz * 0.5;
  vec3 vel = normalize(vec3(uWind.x, -uFall, uWind.y));
  p -= vel * aEnd * uLength;
  vAlpha = 1.0 - aEnd * 0.8;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vAlpha *= smoothstep(1.0, 4.0, -mv.z) * (1.0 - smoothstep(18.0, 34.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const rainFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}
`;

const snowVertex = /* glsl */ `
attribute vec3 aBase;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec2 uWind;
uniform float uFall;
uniform float uSize;
varying float vAlpha;
void main() {
  vec3 p = aBase;
  float sway = sin(uTime * 0.9 + aBase.x * 0.37) * 0.8;
  p.y = mod(p.y - uTime * uFall - uCam.y, uBox.y) + uCam.y - uBox.y * 0.5;
  p.x += sway;
  p.xz = mod(p.xz + uWind * uTime - uCam.xz, uBox.xz) + uCam.xz - uBox.xz * 0.5;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (60.0 / max(1.0, -mv.z));
  vAlpha = smoothstep(0.5, 3.0, -mv.z) * (1.0 - smoothstep(20.0, 34.0, -mv.z));
}
`;

const snowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * vAlpha * uOpacity);
}
`;

export class Precipitation {
  readonly group = new THREE.Group();
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly rainMat: THREE.ShaderMaterial;
  private readonly snowMat: THREE.ShaderMaterial;
  private readonly max: number;

  constructor(maxParticles: number) {
    this.max = maxParticles;
    const base = new Float32Array(maxParticles * 3);
    for (let i = 0; i < maxParticles * 3; i += 3) {
      base[i] = Math.random() * BOX.x;
      base[i + 1] = Math.random() * BOX.y;
      base[i + 2] = Math.random() * BOX.z;
    }
    // Rain: two vertices per streak sharing a base position.
    const rainBase = new Float32Array(maxParticles * 6);
    const ends = new Float32Array(maxParticles * 2);
    for (let i = 0; i < maxParticles; i++) {
      for (let k = 0; k < 2; k++) {
        rainBase[(i * 2 + k) * 3] = base[i * 3];
        rainBase[(i * 2 + k) * 3 + 1] = base[i * 3 + 1];
        rainBase[(i * 2 + k) * 3 + 2] = base[i * 3 + 2];
        ends[i * 2 + k] = k;
      }
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainBase.slice(), 3));
    rainGeo.setAttribute('aBase', new THREE.BufferAttribute(rainBase, 3));
    rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    const shared = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
      uWind: { value: new THREE.Vector2(1.5, 0.5) },
    };
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      uniforms: { ...shared, uFall: { value: 22 }, uLength: { value: 0.9 }, uColor: { value: new THREE.Color('#b8c4cc') }, uOpacity: { value: 0.35 } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.rain = new THREE.LineSegments(rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 10;

    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    snowGeo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    this.snowMat = new THREE.ShaderMaterial({
      vertexShader: snowVertex,
      fragmentShader: snowFragment,
      uniforms: { ...shared, uFall: { value: 2.2 }, uSize: { value: 2.2 }, uColor: { value: new THREE.Color('#f4f6f8') }, uOpacity: { value: 0.85 } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.snow = new THREE.Points(snowGeo, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 10;
    this.group.add(this.rain, this.snow);
    this.group.name = 'precipitation';
  }

  update(time: number, camera: THREE.Camera, rain: number, snow: number, wind: number, light: number): void {
    for (const m of [this.rainMat, this.snowMat]) {
      m.uniforms.uTime.value = time;
      (m.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
      (m.uniforms.uWind.value as THREE.Vector2).set(1 + wind * 6, 0.4 + wind * 2);
    }
    this.rain.visible = rain > 0.01;
    this.snow.visible = snow > 0.01;
    this.rain.geometry.setDrawRange(0, Math.floor(this.max * Math.min(1, rain)) * 2);
    this.snow.geometry.setDrawRange(0, Math.floor(this.max * Math.min(1, snow)));
    (this.rainMat.uniforms.uColor.value as THREE.Color).setRGB(0.55, 0.6, 0.65).multiplyScalar(0.4 + light * 0.8);
    (this.snowMat.uniforms.uColor.value as THREE.Color).setRGB(0.95, 0.96, 0.98).multiplyScalar(0.35 + light * 0.75);
  }

  dispose(): void {
    this.rain.geometry.dispose();
    this.snow.geometry.dispose();
    this.rainMat.dispose();
    this.snowMat.dispose();
    this.group.removeFromParent();
  }
}
