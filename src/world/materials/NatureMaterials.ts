import * as THREE from 'three';

/** Uniforms shared by every swaying material, updated once per frame. */
export interface WindUniforms {
  uTime: { value: number };
  uWind: { value: number };
}

export function createWindUniforms(): WindUniforms {
  return { uTime: { value: 0 }, uWind: { value: 0.3 } };
}

let detailTexture: THREE.DataTexture | null = null;

/** Small tileable greyscale noise used to break up terrain vertex colours. */
function getDetailTexture(): THREE.DataTexture {
  if (detailTexture) return detailTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  // Tileable value noise built from a few wrapped octaves.
  const rand = (x: number, y: number, s: number) => {
    const n = Math.sin(((x % s) + s) % s * 127.1 + (((y % s) + s) % s) * 311.7 + s * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      for (const cells of [4, 8, 16, 32]) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = rand(ix, iy, cells);
        const b = rand(ix + 1, iy, cells);
        const c = rand(ix, iy + 1, cells);
        const d = rand(ix + 1, iy + 1, cells);
        v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        amp *= 0.5;
      }
      const g = Math.round(150 + (v / 0.9375) * 105);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.min(255, g);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  detailTexture = tex;
  return tex;
}

/**
 * Terrain: vertex-coloured Lambert with two scales of detail noise so large
 * slopes don't read as flat colour fields.
 */
export function createTerrainMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: getDetailTexture() });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `
      #ifdef USE_MAP
        float es_d1 = texture2D(map, vMapUv).r;
        float es_d2 = texture2D(map, vMapUv * 0.173 + 0.31).r;
        float es_d3 = texture2D(map, vMapUv * 3.7).r;
        diffuseColor.rgb *= 0.36 + 0.42 * es_d1 + 0.28 * es_d2 + 0.12 * es_d3;
      #endif
      `,
    );
  };
  mat.customProgramCacheKey = () => 'es-terrain';
  return mat;
}

/**
 * Vegetation: flat-shaded Lambert with vertex colours, per-instance tint and a
 * gentle wind sway that increases with height above the instance base.
 */
export function createFoliageMaterial(
  wind: WindUniforms,
  opts: { sway: number; side?: THREE.Side; flat?: boolean },
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: opts.flat ?? true,
    side: opts.side ?? THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uWind = wind.uWind;
    shader.uniforms.uSway = { value: opts.sway };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform float uSway;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 es_ip = instanceMatrix[3].xyz;
        #else
          vec3 es_ip = vec3(0.0);
        #endif
        float es_h = max(position.y, 0.0);
        float es_ph = es_ip.x * 0.073 + es_ip.z * 0.051;
        float es_w = (0.35 + uWind) * uSway;
        float es_gust = sin(uTime * 0.6 + es_ph * 0.3) * 0.5 + 0.5;
        transformed.x += sin(uTime * 1.9 + es_ph) * es_w * es_h * (0.6 + es_gust * 0.8);
        transformed.z += cos(uTime * 1.4 + es_ph * 1.3) * es_w * es_h * 0.5;
        `,
      );
  };
  mat.customProgramCacheKey = () => `es-foliage-${opts.sway}-${opts.side ?? 0}-${opts.flat ?? true}`;
  return mat;
}
