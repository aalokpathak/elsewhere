import type { EnvironmentPreset } from './types';
import { countryRoad, variant } from './shared';

export const coastalHighway: EnvironmentPreset = {
  id: 'coastal-highway',
  name: 'Coastal Highway',
  tagline: 'Salt air and a long horizon.',
  description:
    'A cliff-top road with the ocean on your right, distant islands in the haze and hills rolling inland.',
  category: 'nature',
  status: 'complete',
  kind: 'outdoor',
  maxSpeedKmh: 140,
  road: { ...countryRoad, minElevation: 9, guardrails: 'right', minRadius: 170, maxHeadingDeg: 45 },
  terrain: {
    baseHeight: 22,
    amplitude: 20,
    frequency: 1 / 380,
    octaves: 5,
    ridged: 0.3,
    largeAmplitude: 22,
    largeFrequency: 1 / 2000,
    blendWidth: 30,
    coast: { side: 1, start: 16, width: 50, seabed: -22, noise: 14 },
    seaLevel: 0,
    colors: {
      low: '#7d8a4e',
      high: '#9a9a62',
      dry: '#a8a072',
      rock: '#8b8174',
      roadside: '#857f5c',
      sand: '#cdbb92',
    },
  },
  scenery: [
    { kind: 'conifer', density: 1.4, minRoadDistance: 10, scale: [0.7, 1.15], clusterFrequency: 1 / 200, clusterThreshold: 0.35, maxSlope: 0.5, minHeight: 6, tints: ['#ffffff', '#dfe5d4'] },
    { kind: 'shrub', density: 14, minRoadDistance: 5.5, scale: [0.5, 1.2], clusterFrequency: 1 / 70, clusterThreshold: 0, maxSlope: 0.9, minHeight: 2, tints: ['#ffffff', '#e8e2c0', '#d8e0c4'] },
    { kind: 'rock', density: 5, minRoadDistance: 6, scale: [0.6, 2.2], clusterFrequency: 1 / 100, clusterThreshold: 0.2, maxSlope: 3, tints: ['#ffffff', '#ece4d6'] },
    { kind: 'grass', density: 700, minRoadDistance: 5.6, scale: [0.6, 1.2], clusterFrequency: 1 / 30, clusterThreshold: -0.2, maxSlope: 0.8, minHeight: 2, tints: ['#f2ecc8'], nearOnly: true },
  ],
  roadside: [
    { kind: 'delineator', spacing: 50, offset: 0.9, side: 'left', fill: 0.9 },
    { kind: 'sign', spacing: 1100, offset: 1.6, side: 'left', fill: 0.6 },
  ],
  mountains: [
    { radius: 2400, height: 90, base: -6, color: '#6d8590', haze: 0.62, roughness: 0.6, maskAngle: -90, maskWidth: 110, sparsity: 0.6 },
    { radius: 2100, height: 210, base: 0, color: '#5f7468', haze: 0.55, roughness: 0.6, maskAngle: 90, maskWidth: 200 },
  ],
  variants: [
    variant({
      id: 'midday', name: 'Midday', sunElevation: 52, sunAzimuth: -70, skyZenith: '#4f8cc6', skyHorizon: '#d4e4ec',
      fogNear: 150, fogFar: 1500, cloudCover: 0.35, wind: 0.5, waterColor: '#1d5a74',
    }),
    variant({
      id: 'sunset', name: 'Sunset', sunElevation: 4, sunAzimuth: -62, sunColor: '#ff9f5a', sunIntensity: 2.6,
      skyZenith: '#3d5583', skyHorizon: '#f7a873', skyGround: '#6a5a50', hemiSky: '#f0b896', hemiGround: '#433a33', hemiIntensity: 0.8,
      fogNear: 120, fogFar: 1300, cloudCover: 0.45, cloudColor: '#ffc39a', exposure: 1.05, wind: 0.45, waterColor: '#2a4a66',
    }),
    variant({
      id: 'sea-haze', name: 'Sea Haze', sunElevation: 28, sunAzimuth: -40, sunColor: '#e8e4dc', sunIntensity: 1.5,
      skyZenith: '#94a7b3', skyHorizon: '#d2d9db', skyGround: '#8f9a96', hemiSky: '#d8dee0', hemiGround: '#5d655a', hemiIntensity: 1.2,
      fogNear: 25, fogFar: 480, cloudCover: 0.8, cloudColor: '#eef0f0', wind: 0.6, sunDisc: 0.3, waterColor: '#3c6070',
    }),
  ],
  audio: { layers: { wind: 0.65, ocean: 0.85, birds: 0.25 }, music: 'calm', reverb: 0.1 },
  anomalies: ['silhouette', 'distant-sound', 'distant-car', 'fog-shift'],
  thumbnail: { accent: '#e3a857', motif: 'coast' },
};
