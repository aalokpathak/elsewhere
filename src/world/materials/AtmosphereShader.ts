import * as THREE from 'three';

/**
 * Shared atmosphere shading injected into every lit world material:
 *
 *  - Cloud shadows: soft, slowly drifting patches of shade over terrain, road,
 *    vegetation and buildings (world-space noise, so everything agrees).
 *  - Sun-tinted fog: distance haze picks up the sun's glow when you look
 *    toward it, so far hills melt into a sunset instead of reading as flat
 *    horizon-coloured cut-outs. Matches the glow term of the sky shader.
 *
 * One set of uniform objects is shared by all materials and updated once per
 * frame by the EnvironmentManager.
 */
export const atmosphereUniforms = {
  uEsCloudTime: { value: 0 },
  uEsCloudCover: { value: 0.4 },
  /** 0 = no cloud shadows (overcast, night, indoors). */
  uEsCloudShadow: { value: 0 },
  uEsSunFog: { value: new THREE.Color(0, 0, 0) },
  /** Sun direction in view space (fog glow is evaluated per fragment). */
  uEsSunViewDir: { value: new THREE.Vector3(0, 1, 0) },
};

const PARS_VERTEX = /* glsl */ `
varying vec3 vEsView;
varying vec2 vEsWorld;
`;

const VERTEX = /* glsl */ `
vEsView = mvPosition.xyz;
{
  vec4 esW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    esW = instanceMatrix * esW;
  #endif
  vEsWorld = (modelMatrix * esW).xz;
}
`;

const PARS_FRAGMENT = /* glsl */ `
uniform float uEsCloudTime;
uniform float uEsCloudCover;
uniform float uEsCloudShadow;
uniform vec3 uEsSunFog;
uniform vec3 uEsSunViewDir;
varying vec3 vEsView;
varying vec2 vEsWorld;
float esA_hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float esA_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(esA_hash(i), esA_hash(i + vec2(1.0, 0.0)), f.x),
             mix(esA_hash(i + vec2(0.0, 1.0)), esA_hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float esCloudShade(vec2 world) {
  if (uEsCloudShadow <= 0.001) return 1.0;
  vec2 p = world * 0.0042 + vec2(uEsCloudTime * 0.012, uEsCloudTime * 0.005);
  float n = esA_noise(p) * 0.62 + esA_noise(p * 2.3 + 7.1) * 0.38;
  float edge = 0.74 - uEsCloudCover * 0.5;
  return 1.0 - smoothstep(edge, edge + 0.22, n) * uEsCloudShadow;
}
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float esFogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float esFogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  float esSun = max(dot(normalize(vEsView), uEsSunViewDir), 0.0);
  esSun *= esSun;
  vec3 esFogColor = fogColor + uEsSunFog * (esSun * esSun * esSun);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, esFogColor, esFogFactor);
#endif
`;

/**
 * Call from a built-in material's `onBeforeCompile` (after any other source
 * edits). The material must support fog. Remember to give the material a
 * distinct `customProgramCacheKey`.
 */
export function applyAtmosphere(
  shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string },
  opts: { cloudShadow?: boolean } = {},
): void {
  Object.assign(shader.uniforms, atmosphereUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <fog_pars_vertex>', `#include <fog_pars_vertex>\n${PARS_VERTEX}`)
    .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERTEX}`);
  let frag = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\n${PARS_FRAGMENT}`)
    .replace('#include <fog_fragment>', FOG_FRAGMENT);
  if (opts.cloudShadow !== false) {
    frag = frag.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= esCloudShade(vEsWorld);');
  }
  shader.fragmentShader = frag;
}

/** Convenience for plain built-in materials that have no other shader edits. */
export function withAtmosphere<T extends THREE.Material>(material: T, key: string, opts: { cloudShadow?: boolean } = {}): T {
  material.onBeforeCompile = (shader) => applyAtmosphere(shader, opts);
  material.customProgramCacheKey = () => `es-atm-${key}-${opts.cloudShadow !== false ? 1 : 0}`;
  return material;
}
