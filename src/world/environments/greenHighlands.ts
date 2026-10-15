import type { EnvironmentPreset } from './types';
import { countryRoad, variant } from './shared';

export const greenHighlands: EnvironmentPreset = {
  id: 'green-highlands',
  name: 'Green Highlands',
  tagline: 'A quiet countryside drive.',
  description:
    'Rolling green hills, scattered woodland and soft clouds under a wide sky. The road follows the land wherever it wants to go.',
  category: 'nature',
  status: 'complete',
  kind: 'outdoor',
  maxSpeedKmh: 140,
  road: { ...countryRoad },
  terrain: {
    baseHeight: 40,
    amplitude: 34,
    frequency: 1 / 420,
    octaves: 5,
    ridged: 0.15,
    largeAmplitude: 45,
    largeFrequency: 1 / 2200,
    blendWidth: 34,
    colors: {
      low: '#5f7f3a',
      high: '#8a9a4c',
      dry: '#9c9a5a',
      rock: '#7c7869',
      roadside: '#6d7448',
    },
  },
  scenery: [
    { kind: 'broadleaf', density: 5.5, minRoadDistance: 9, scale: [0.8, 1.45], clusterFrequency: 1 / 160, clusterThreshold: 0.25, maxSlope: 0.55, tints: ['#ffffff', '#e8f0d0', '#d8e6c0', '#f4e6c4'] },
    { kind: 'conifer', density: 1.6, minRoadDistance: 10, scale: [0.8, 1.3], clusterFrequency: 1 / 210, clusterThreshold: 0.45, maxSlope: 0.6, tints: ['#ffffff', '#dfe8d8'] },
    { kind: 'shrub', density: 10, minRoadDistance: 6, scale: [0.6, 1.4], clusterFrequency: 1 / 90, clusterThreshold: 0.1, maxSlope: 0.7, tints: ['#ffffff', '#e4ecc8', '#f0e4c0'] },
    { kind: 'rock', density: 2.2, minRoadDistance: 6, scale: [0.5, 1.6], clusterFrequency: 1 / 140, clusterThreshold: 0.3, maxSlope: 1.5, tints: ['#ffffff', '#e8e2d8'] },
    { kind: 'grass', density: 900, minRoadDistance: 5.6, scale: [0.7, 1.4], clusterFrequency: 1 / 40, clusterThreshold: -0.3, maxSlope: 0.9, tints: ['#ffffff'], nearOnly: true },
  ],
  roadside: [
    { kind: 'fence', spacing: 3.2, offset: 4.5, side: 'left', fill: 0.55 },
    { kind: 'sign', spacing: 900, offset: 1.6, side: 'right', fill: 0.7 },
  ],
  mountains: [
    { radius: 1900, height: 120, base: 10, color: '#5f7a6a', haze: 0.55, roughness: 0.55 },
    { radius: 3300, height: 420, base: 0, color: '#6f8796', haze: 0.72, roughness: 0.75 },
  ],
  variants: [
    variant({ id: 'afternoon', name: 'Afternoon' }),
    variant({
      id: 'morning', name: 'Morning', sunElevation: 13, sunAzimuth: -65, sunColor: '#ffdcb6', sunIntensity: 2.4,
      skyZenith: '#7ba4cf', skyHorizon: '#efd9c8', hemiSky: '#d9e2ef', hemiGround: '#55603e', hemiIntensity: 0.95,
      fogNear: 60, fogFar: 900, cloudCover: 0.3, wind: 0.2,
    }),
    variant({
      id: 'golden-hour', name: 'Golden Hour', sunElevation: 6, sunAzimuth: 18, sunColor: '#ffb265', sunIntensity: 2.7,
      skyZenith: '#4e6e9b', skyHorizon: '#f3b27c', skyGround: '#7d6e58', hemiSky: '#f2c79c', hemiGround: '#4c4630', hemiIntensity: 0.85,
      fogNear: 100, fogFar: 1300, cloudCover: 0.4, cloudColor: '#ffd2a8', exposure: 1.05,
    }),
    variant({
      id: 'drizzle', name: 'Overcast Drizzle', sunElevation: 35, sunColor: '#c9ced2', sunIntensity: 0.9,
      skyZenith: '#8b959c', skyHorizon: '#b8bfc2', skyGround: '#7d877c', hemiSky: '#c8cfd3', hemiGround: '#4f5845', hemiIntensity: 1.25,
      fogNear: 30, fogFar: 650, cloudCover: 0.95, cloudColor: '#d6dadc', rain: 0.45, wetness: 0.8, wind: 0.55, sunDisc: 0,
    }),
  ],
  audio: { layers: { wind: 0.55, birds: 0.7 }, music: 'calm', reverb: 0.1 },
  anomalies: ['silhouette', 'distant-sound', 'distant-car', 'silence'],
  thumbnail: { accent: '#e3a857', motif: 'hills' },
};
