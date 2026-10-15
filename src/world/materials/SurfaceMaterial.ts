import * as THREE from 'three';
import type { EnvironmentPreset, MarkingStyle, SurfaceMode } from '../environments/types';

/**
 * Procedural surface material for roads, floors, ceilings and walls.
 *
 * It is a standard PBR material whose albedo and roughness are computed in the
 * fragment shader from a per-vertex `roadUv` attribute (x = lateral metres from
 * the centreline or height above the floor, y = arc length in metres). That
 * gives crisp lane markings, parking bays and tile seams at any distance with
 * no textures to download.
 *
 * Wet surfaces are an approximation: darker albedo plus lower roughness, so
 * the sky environment map and lights produce glossy highlights. There are no
 * true screen-space or planar reflections.
 */

const MODE_IDS: Record<SurfaceMode, number> = {
  asphalt: 0,
  'sand-road': 0,
  'parking-floor': 10,
  'corridor-floor': 11,
  ceiling: 12,
  wall: 13,
};

const MARK_IDS: Record<MarkingStyle, number> = {
  none: 0,
  'center-dashed': 1,
  'double-yellow': 2,
  'center-solid': 3,
};

export interface SurfaceUniforms {
  uWetness: { value: number };
  uTime: { value: number };
  uMirage: { value: number };
}

export interface SurfaceMaterialOptions {
  mode: SurfaceMode;
  markings: MarkingStyle;
  edgeLines: boolean;
  halfWidth: number;
  baseColor: string;
  shoulderColor: string;
  markColor: string;
  centerColor: string;
  accentColor?: string;
  roughness?: number;
  shared: SurfaceUniforms;
  side?: THREE.Side;
}

const GLSL_NOISE = /* glsl */ `
uniform float uWetness;
uniform float uTime;
uniform float uMirage;
uniform float uHalfWidth;
uniform vec3 uBaseColor;
uniform vec3 uShoulderColor;
uniform vec3 uMarkColor;
uniform vec3 uCenterColor;
uniform vec3 uAccentColor;
varying vec2 vRoadUv;
float es_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float es_vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(es_hash12(i), es_hash12(i + vec2(1.0, 0.0)), f.x),
             mix(es_hash12(i + vec2(0.0, 1.0)), es_hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float es_line(float d, float w) {
  float aa = fwidth(d) * 1.2 + 0.004;
  return 1.0 - smoothstep(w - aa, w + aa, abs(d));
}
`;

const GLSL_ALBEDO = /* glsl */ `
  vec2 ruv = vRoadUv;
  float lat = ruv.x;
  float alat = abs(lat);
  float grain = es_vnoise(ruv * 3.1) * 0.55 + es_vnoise(ruv * vec2(0.55, 0.17)) * 0.45;
  float mark = 0.0;
  vec3 markCol = uMarkColor;
  vec3 col = uBaseColor;
  float puddle = 0.0;
#if SURFACE_MODE == 0
  col = uBaseColor * (0.84 + 0.3 * grain);
  float laneCenter = uHalfWidth * 0.5;
  float track = es_line(abs(alat - laneCenter) - 0.8, 0.28) * 0.07;
  col *= 1.0 - track;
  float sh = smoothstep(uHalfWidth - 0.02, uHalfWidth + 0.1, alat);
  vec3 shoulder = uShoulderColor * (0.75 + 0.45 * es_vnoise(ruv * 5.0));
  col = mix(col, shoulder, sh);
  #if EDGE_LINES
    mark = max(mark, es_line(alat - (uHalfWidth - 0.3), 0.075));
  #endif
  #if MARK_MODE == 1
    float dash = step(fract(ruv.y / 12.0), 0.42);
    float c = es_line(alat, 0.07) * dash;
    if (c > mark) { mark = c; markCol = uCenterColor; }
  #elif MARK_MODE == 2
    float c = max(es_line(alat - 0.17, 0.065), 0.0);
    if (c > mark) { mark = c; markCol = uCenterColor; }
  #elif MARK_MODE == 3
    float c = es_line(alat, 0.07);
    if (c > mark) { mark = c; markCol = uCenterColor; }
  #endif
  mark *= 0.72 + 0.28 * es_vnoise(ruv * vec2(1.7, 0.4));
  puddle = smoothstep(0.62, 0.8, es_vnoise(ruv * vec2(0.35, 0.12))) * (1.0 - sh);
#elif SURFACE_MODE == 10
  float stain = es_vnoise(ruv * 0.18) * 0.6 + es_vnoise(ruv * 1.3) * 0.4;
  col = uBaseColor * (0.8 + 0.32 * grain) * (0.88 + 0.16 * stain);
  // Bays on both sides of the aisle, a second row beyond the pillar line.
  float b0 = uHalfWidth + 0.15;
  float bayDepth = 5.3;
  float inRow1 = step(b0, alat) * step(alat, b0 + bayDepth);
  float r2 = b0 + bayDepth + 1.4;
  float inRow2 = step(r2, alat) * step(alat, r2 + bayDepth);
  float bayLine = es_line(fract(ruv.y / 2.7 + 0.5) - 0.5, 0.022);
  mark = max(mark, bayLine * max(inRow1, inRow2));
  mark = max(mark, es_line(alat - (b0 + bayDepth), 0.06));
  mark = max(mark, es_line(alat - (r2 + bayDepth), 0.06) * step(r2, alat));
  float aisle = es_line(alat - uHalfWidth, 0.06) * step(fract(ruv.y / 6.0), 0.55);
  if (aisle > mark) { mark = aisle; markCol = uAccentColor; }
  // Painted direction arrows down the middle of the aisle.
  float ay = fract(ruv.y / 48.0) * 48.0;
  float arrow = step(abs(lat), 0.13) * step(1.0, ay) * step(ay, 3.2);
  float head = step(abs(lat), (4.4 - ay) * 0.45) * step(3.2, ay) * step(ay, 4.4);
  mark = max(mark, max(arrow, head) * 0.9);
  mark *= 0.7 + 0.3 * es_vnoise(ruv * 2.0);
#elif SURFACE_MODE == 11
  float fibre = es_hash12(floor(ruv * 40.0));
  float wear = es_vnoise(ruv * vec2(0.6, 0.2));
  col = uBaseColor * (0.86 + 0.12 * fibre + 0.08 * grain) * (0.92 + 0.1 * wear);
  col *= 1.0 - 0.1 * smoothstep(0.8, 0.0, abs(alat - uHalfWidth * 0.55)) * wear;
  float stain2 = smoothstep(0.7, 0.85, es_vnoise(ruv * 0.3));
  col *= 1.0 - stain2 * 0.15;
#elif SURFACE_MODE == 12
  vec2 tile = fract(vec2(lat / 1.2, ruv.y / 1.2));
  float seam = max(es_line(tile.x - 0.5, 0.48), 0.0);
  seam = 1.0 - min(es_line(tile.x - 0.5, 0.485), es_line(tile.y - 0.5, 0.485));
  col = uBaseColor * (0.95 + 0.06 * grain);
  col *= 1.0 - seam * 0.35;
  float waterStain = smoothstep(0.72, 0.86, es_vnoise(floor(vec2(lat / 1.2, ruv.y / 1.2)) * 0.37 + 3.0));
  col = mix(col, col * vec3(0.86, 0.78, 0.62), waterStain * 0.6);
#elif SURFACE_MODE == 13
  float hgt = ruv.x;
  col = uBaseColor * (0.93 + 0.07 * grain);
  col = mix(col, uAccentColor, step(hgt, 1.0));
  col *= 1.0 - 0.35 * es_line(hgt - 1.0, 0.03);
  col *= 1.0 - 0.45 * step(hgt, 0.12);
  float seamW = es_line(fract(ruv.y / 2.4) - 0.5, 0.497) ;
  col *= 1.0 - (1.0 - seamW) * 0.08;
  float grime = es_vnoise(ruv * vec2(0.5, 0.3)) * smoothstep(1.4, 0.0, hgt);
  col *= 1.0 - grime * 0.12;
#endif
  col = mix(col, markCol, clamp(mark, 0.0, 1.0));
  float wet = clamp(uWetness * (0.75 + 0.5 * puddle), 0.0, 1.0);
  col *= 1.0 - wet * 0.5 * (1.0 - mark * 0.4);
  diffuseColor.rgb = col;
`;

const GLSL_ROUGHNESS = /* glsl */ `
  roughnessFactor = mix(roughnessFactor, 0.6, clamp(mark, 0.0, 1.0) * 0.4);
  roughnessFactor = mix(roughnessFactor, 0.08, clamp(wet * (0.75 + 0.25 * grain), 0.0, 1.0));
`;

const GLSL_MIRAGE = /* glsl */ `
#ifdef USE_FOG
  float es_vd = length(vViewPosition);
  float es_m = uMirage * smoothstep(130.0, 480.0, es_vd) * (0.65 + 0.35 * sin(vRoadUv.y * 0.07 + uTime * 1.6));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(es_m, 0.0, 0.75));
#endif
`;

export function createSurfaceUniforms(): SurfaceUniforms {
  return { uWetness: { value: 0 }, uTime: { value: 0 }, uMirage: { value: 0 } };
}

export function createSurfaceMaterial(opts: SurfaceMaterialOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.9,
    metalness: 0,
    side: opts.side ?? THREE.FrontSide,
    polygonOffset: opts.mode === 'asphalt' || opts.mode === 'sand-road',
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mode = MODE_IDS[opts.mode];
  const mark = MARK_IDS[opts.markings];
  mat.defines = { SURFACE_MODE: mode, MARK_MODE: mark, EDGE_LINES: opts.edgeLines ? 1 : 0 };
  const local = {
    uHalfWidth: { value: opts.halfWidth },
    uBaseColor: { value: new THREE.Color(opts.baseColor) },
    uShoulderColor: { value: new THREE.Color(opts.shoulderColor) },
    uMarkColor: { value: new THREE.Color(opts.markColor) },
    uCenterColor: { value: new THREE.Color(opts.centerColor) },
    uAccentColor: { value: new THREE.Color(opts.accentColor ?? opts.centerColor) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, opts.shared, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 roadUv;\nvarying vec2 vRoadUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadUv = roadUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${GLSL_ALBEDO}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${GLSL_ROUGHNESS}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n${GLSL_MIRAGE}`);
  };
  mat.customProgramCacheKey = () => `es-surface-${mode}-${mark}-${opts.edgeLines ? 1 : 0}`;
  return mat;
}

/** Convenience: the road material for an environment preset. */
export function createRoadMaterial(env: EnvironmentPreset, shared: SurfaceUniforms): THREE.MeshStandardMaterial {
  const r = env.road;
  return createSurfaceMaterial({
    mode: r.surface,
    markings: r.markings,
    edgeLines: r.edgeLines,
    halfWidth: r.halfWidth,
    baseColor: r.color,
    shoulderColor: r.shoulderColor,
    markColor: r.markingColor,
    centerColor: r.centerColor,
    accentColor: env.indoor?.accentColor,
    roughness: r.surface === 'corridor-floor' ? 0.95 : 0.88,
    shared,
  });
}
