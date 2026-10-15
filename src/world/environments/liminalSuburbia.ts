import type { EnvironmentPreset } from './types';
import { countryRoad, variant } from './shared';

export const liminalSuburbia: EnvironmentPreset = {
  id: 'liminal-suburbia',
  name: 'Liminal Suburbia',
  tagline: 'Everyone is home. No one is here.',
  description:
    'Wide, empty residential streets under a pale sky. The houses repeat — almost exactly. The lawns are perfect. Nobody waves.',
  category: 'liminal',
  status: 'complete',
  kind: 'outdoor',
  maxSpeedKmh: 90,
  road: {
    ...countryRoad,
    halfWidth: 4.4,
    shoulderWidth: 2.2,
    minRadius: 260,
    maxRadius: 900,
    straightChance: 0.6,
    segmentLength: [140, 300],
    maxHeadingDeg: 40,
    maxGrade: 0.03,
    markings: 'none',
    edgeLines: false,
    color: '#53565b',
    shoulderColor: '#a3a29b',
  },
  terrain: {
    baseHeight: 6,
    amplitude: 2.2,
    frequency: 1 / 260,
    octaves: 3,
    ridged: 0,
    largeAmplitude: 5,
    largeFrequency: 1 / 1800,
    blendWidth: 30,
    colors: {
      low: '#6f8550',
      high: '#7d8f58',
      dry: '#8f9566',
      rock: '#8a8a80',
      roadside: '#76895a',
    },
  },
  scenery: [
    { kind: 'broadleaf', density: 1.3, minRoadDistance: 9, scale: [0.7, 1.15], clusterFrequency: 0, clusterThreshold: 0, maxSlope: 0.5, tints: ['#ffffff', '#e8eed8'] },
    { kind: 'shrub', density: 2.5, minRoadDistance: 30, scale: [0.6, 1.0], clusterFrequency: 0, clusterThreshold: 0, maxSlope: 0.6, tints: ['#ffffff'] },
    { kind: 'grass', density: 220, minRoadDistance: 7, scale: [0.4, 0.6], clusterFrequency: 1 / 50, clusterThreshold: 0, maxSlope: 0.6, tints: ['#e8ecd0'], nearOnly: true },
  ],
  roadside: [
    { kind: 'house', spacing: 34, offset: 17, side: 'both', fill: 0.86, tints: ['#e8e2d2', '#d8dccf', '#e6d6c4', '#cfd6d8', '#ddd0c0', '#efe9dd'] },
    { kind: 'mailbox', spacing: 34, offset: 0.6, side: 'both', fill: 0.55 },
    { kind: 'streetlight', spacing: 80, offset: 0.7, side: 'alternate', fill: 0.9 },
  ],
  mountains: [
    { radius: 1100, height: 22, base: 0, color: '#5c6a58', haze: 0.7, roughness: 0.25 },
  ],
  variants: [
    variant({
      id: 'overcast', name: 'Overcast', sunElevation: 42, sunAzimuth: 50, sunColor: '#e9e7e0', sunIntensity: 1.1,
      skyZenith: '#b4b9bb', skyHorizon: '#d8d9d4', skyGround: '#a5a99c', hemiSky: '#dcdfdd', hemiGround: '#646c55', hemiIntensity: 1.45,
      fogNear: 50, fogFar: 520, cloudCover: 1, cloudColor: '#e2e3df', wind: 0.12, sunDisc: 0,
    }),
    variant({
      id: 'dusk', name: 'Dusk', sunElevation: 1.5, sunAzimuth: 160, sunColor: '#d79a7a', sunIntensity: 0.55,
      skyZenith: '#3d3f5c', skyHorizon: '#b68a86', skyGround: '#4d4a4f', hemiSky: '#8f88a3', hemiGround: '#2e3029', hemiIntensity: 0.6,
      fogNear: 40, fogFar: 460, cloudCover: 0.7, cloudColor: '#c49a96', wind: 0.08, lights: 1, headlights: true, sunDisc: 0,
    }),
    variant({
      id: 'pale-night', name: 'Pale Night', sunElevation: 40, sunAzimuth: -30, sunColor: '#9fb0d0', sunIntensity: 0.18,
      skyZenith: '#0d1220', skyHorizon: '#2a3242', skyGround: '#141820', hemiSky: '#3a4660', hemiGround: '#14161a', hemiIntensity: 0.32,
      fogNear: 30, fogFar: 360, cloudCover: 0.5, cloudColor: '#3a4252', wind: 0.05, lights: 1, headlights: true, stars: 0.4, sunDisc: 0.5,
      exposure: 1.1,
    }),
  ],
  audio: { layers: { wind: 0.3, traffic: 0.25, birds: 0.08 }, music: 'liminal', reverb: 0.15 },
  anomalies: ['silhouette', 'flicker', 'distant-sound', 'silence', 'fog-shift', 'empty-stretch'],
  thumbnail: { accent: '#e3a857', motif: 'houses' },
};
