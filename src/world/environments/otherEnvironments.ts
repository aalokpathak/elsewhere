import type { EnvironmentPreset } from './types';
import { countryRoad, variant } from './shared';

export const alpineRoads: EnvironmentPreset = {
  id: 'alpine-roads',
  name: 'Alpine Roads',
  tagline: 'Thin air, long switchbacks.',
  description:
    'A mountain pass winding between pine forests and grey scree, with snow-capped peaks hanging in the blue distance.',
  category: 'nature',
  status: 'complete',
  kind: 'outdoor',
  maxSpeedKmh: 100,
  road: {
    ...countryRoad, halfWidth: 3.3, shoulderWidth: 1, minRadius: 75, maxRadius: 280, straightChance: 0.15,
    segmentLength: [70, 170], maxGrade: 0.085, guardrails: 'curves', color: '#43464b',
  },
  terrain: {
    baseHeight: 620,
    amplitude: 150,
    frequency: 1 / 650,
    octaves: 5,
    ridged: 0.75,
    largeAmplitude: 120,
    largeFrequency: 1 / 2600,
    blendWidth: 38,
    colors: {
      low: '#566b3f',
      high: '#79816a',
      dry: '#8a8b6c',
      rock: '#7f7c78',
      roadside: '#6a6d55',
      snow: '#eef2f6',
      snowLine: 730,
    },
  },
  scenery: [
    { kind: 'conifer', density: 13, minRoadDistance: 8, scale: [0.8, 1.5], clusterFrequency: 1 / 180, clusterThreshold: -0.1, maxSlope: 1.05, maxHeight: 780, tints: ['#ffffff', '#d8e2d4', '#e8eee0'] },
    { kind: 'rock', density: 6, minRoadDistance: 6, scale: [0.6, 2.4], clusterFrequency: 1 / 120, clusterThreshold: 0.1, maxSlope: 3, tints: ['#ffffff', '#e6e6e8'] },
    { kind: 'boulder', density: 0.8, minRoadDistance: 14, scale: [1, 2], clusterFrequency: 1 / 220, clusterThreshold: 0.3, maxSlope: 2, tints: ['#ffffff'] },
    { kind: 'grass', density: 500, minRoadDistance: 5, scale: [0.5, 1.0], clusterFrequency: 1 / 40, clusterThreshold: 0, maxSlope: 0.8, maxHeight: 740, tints: ['#e8ecc8'], nearOnly: true },
  ],
  roadside: [
    { kind: 'delineator', spacing: 40, offset: 0.7, side: 'both', fill: 0.85 },
    { kind: 'sign', spacing: 800, offset: 1.4, side: 'right', fill: 0.6 },
  ],
  mountains: [
    { radius: 2000, height: 420, base: 520, color: '#56685e', haze: 0.5, roughness: 0.8 },
    { radius: 3400, height: 1150, base: 450, color: '#7e8fa0', haze: 0.6, roughness: 0.9, snowCap: 0.45 },
  ],
  variants: [
    variant({
      id: 'clear', name: 'Clear Air', sunElevation: 35, sunAzimuth: 40, skyZenith: '#3f7bc0', skyHorizon: '#c9dbe8',
      hemiSky: '#cfe0f5', hemiGround: '#4f5844', fogNear: 160, fogFar: 1600, cloudCover: 0.3, wind: 0.45,
    }),
    variant({
      id: 'snowfall', name: 'Snowfall', sunElevation: 30, sunAzimuth: 20, sunColor: '#d8dde4', sunIntensity: 0.9,
      skyZenith: '#9aa5af', skyHorizon: '#cfd6dc', skyGround: '#c2c8cc', hemiSky: '#dfe5ea', hemiGround: '#6a6e6c', hemiIntensity: 1.3,
      fogNear: 25, fogFar: 420, cloudCover: 1, cloudColor: '#e4e8ec', snow: 0.75, wetness: 0.3, wind: 0.6, sunDisc: 0,
    }),
    variant({
      id: 'cold-dusk', name: 'Cold Dusk', sunElevation: 3, sunAzimuth: -30, sunColor: '#ffb48a', sunIntensity: 1.8,
      skyZenith: '#2d3f63', skyHorizon: '#d89c8c', skyGround: '#5a5560', hemiSky: '#9aa4c6', hemiGround: '#35353a', hemiIntensity: 0.7,
      fogNear: 120, fogFar: 1300, cloudCover: 0.35, cloudColor: '#f2b8a4', headlights: true,
    }),
  ],
  audio: { layers: { wind: 0.85, birds: 0.15 }, music: 'calm', reverb: 0.2 },
  anomalies: ['silhouette', 'distant-sound', 'silence', 'fog-shift'],
  thumbnail: { accent: '#e3a857', motif: 'peaks' },
};

export const mistyForest: EnvironmentPreset = {
  id: 'misty-forest',
  name: 'Misty Forest',
  tagline: 'The trees close in, softly.',
  description:
    'A narrow road through dense pine and birch, damp asphalt and layered fog. Visibility is short; the forest is not in a hurry.',
  category: 'nature',
  status: 'complete',
  kind: 'outdoor',
  maxSpeedKmh: 100,
  road: {
    ...countryRoad, halfWidth: 3.1, shoulderWidth: 1, minRadius: 120, maxRadius: 420, straightChance: 0.25,
    color: '#34373b', markingColor: '#d8d2c2', centerColor: '#d8d2c2',
  },
  terrain: {
    baseHeight: 60,
    amplitude: 20,
    frequency: 1 / 320,
    octaves: 4,
    ridged: 0.1,
    largeAmplitude: 24,
    largeFrequency: 1 / 1800,
    blendWidth: 24,
    colors: {
      low: '#3f5532',
      high: '#4d5f36',
      dry: '#5d5a3c',
      rock: '#5f625b',
      roadside: '#4b5236',
    },
  },
  scenery: [
    { kind: 'conifer', density: 26, minRoadDistance: 6.5, scale: [0.9, 1.7], clusterFrequency: 1 / 120, clusterThreshold: -0.4, maxSlope: 0.9, tints: ['#ffffff', '#d4ddd0', '#c8d4c4'] },
    { kind: 'birch', density: 5, minRoadDistance: 6.5, scale: [0.8, 1.3], clusterFrequency: 1 / 90, clusterThreshold: 0.2, maxSlope: 0.7, tints: ['#ffffff', '#e8e4c4'] },
    { kind: 'deadtree', density: 1.2, minRoadDistance: 7, scale: [0.8, 1.2], clusterFrequency: 0, clusterThreshold: 0, maxSlope: 0.7, tints: ['#ffffff'] },
    { kind: 'shrub', density: 12, minRoadDistance: 5, scale: [0.5, 1.1], clusterFrequency: 1 / 60, clusterThreshold: -0.2, maxSlope: 0.9, tints: ['#d8e2c8', '#ffffff'] },
    { kind: 'grass', density: 600, minRoadDistance: 5, scale: [0.6, 1.2], clusterFrequency: 1 / 25, clusterThreshold: -0.2, maxSlope: 0.9, tints: ['#c8d4b0'], nearOnly: true },
  ],
  roadside: [{ kind: 'delineator', spacing: 50, offset: 0.7, side: 'both', fill: 0.7 }],
  mountains: [
    { radius: 1200, height: 60, base: 30, color: '#3a4a3c', haze: 0.8, roughness: 0.9 },
  ],
  variants: [
    variant({
      id: 'morning-mist', name: 'Morning Mist', sunElevation: 22, sunAzimuth: 30, sunColor: '#e6e2d4', sunIntensity: 1.2,
      skyZenith: '#9aa6a6', skyHorizon: '#b7c1bd', skyGround: '#8d9890', hemiSky: '#c6d0cc', hemiGround: '#3b4530', hemiIntensity: 1.2,
      fogNear: 8, fogFar: 190, cloudCover: 0.9, cloudColor: '#dfe4e2', wetness: 0.55, wind: 0.25, sunDisc: 0.2,
    }),
    variant({
      id: 'forest-rain', name: 'Rain', sunElevation: 30, sunColor: '#c4c8c8', sunIntensity: 0.7,
      skyZenith: '#7d8786', skyHorizon: '#9da7a4', skyGround: '#6f7a74', hemiSky: '#b0bab8', hemiGround: '#323c2a', hemiIntensity: 1.1,
      fogNear: 6, fogFar: 150, cloudCover: 1, cloudColor: '#b8c0c0', rain: 0.75, wetness: 1, wind: 0.5, sunDisc: 0,
    }),
  ],
  audio: { layers: { forest: 0.85, wind: 0.35, birds: 0.3 }, music: 'calm', reverb: 0.25 },
  anomalies: ['silhouette', 'distant-sound', 'silence', 'fog-shift'],
  thumbnail: { accent: '#e3a857', motif: 'forest' },
};

export const desertHighway: EnvironmentPreset = {
  id: 'desert-highway',
  name: 'Desert Highway',
  tagline: 'Nothing for miles. Exactly as promised.',
  description:
    'Long straight roads over warm sand and scrub, mesas on the horizon and a sky that takes up almost everything.',
  category: 'nature',
  status: 'complete',
  kind: 'outdoor',
  maxSpeedKmh: 160,
  road: {
    ...countryRoad, halfWidth: 3.8, shoulderWidth: 1.8, minRadius: 450, maxRadius: 1600, straightChance: 0.6,
    segmentLength: [200, 520], maxGrade: 0.045, markings: 'double-yellow', centerColor: '#e2b546',
    color: '#4a4846', shoulderColor: '#a58c6a',
  },
  terrain: {
    baseHeight: 120,
    amplitude: 9,
    frequency: 1 / 460,
    octaves: 4,
    ridged: 0.1,
    largeAmplitude: 30,
    largeFrequency: 1 / 3200,
    blendWidth: 40,
    colors: {
      low: '#cfa978',
      high: '#d9b98a',
      dry: '#c39a6a',
      rock: '#a7704e',
      roadside: '#b8956c',
    },
  },
  scenery: [
    { kind: 'shrub', density: 9, minRoadDistance: 6, scale: [0.4, 1.0], clusterFrequency: 1 / 80, clusterThreshold: -0.1, maxSlope: 0.6, tints: ['#c8b48a', '#b0a070', '#d2c49a'] },
    { kind: 'cactus', density: 1.6, minRoadDistance: 9, scale: [0.7, 1.4], clusterFrequency: 1 / 150, clusterThreshold: 0.1, maxSlope: 0.4, tints: ['#ffffff', '#e8e4c8'] },
    { kind: 'rock', density: 3, minRoadDistance: 7, scale: [0.6, 2.2], clusterFrequency: 1 / 130, clusterThreshold: 0.2, maxSlope: 2, tints: ['#e8b896', '#f0c8a4'] },
    { kind: 'mesa', density: 0.05, minRoadDistance: 140, scale: [0.7, 1.5], clusterFrequency: 1 / 900, clusterThreshold: 0.2, maxSlope: 3, tints: ['#ffffff', '#f0d8c0'] },
    { kind: 'deadtree', density: 0.3, minRoadDistance: 10, scale: [0.6, 1], clusterFrequency: 0, clusterThreshold: 0, maxSlope: 0.5, tints: ['#e8d8c0'] },
  ],
  roadside: [
    { kind: 'telephone-pole', spacing: 55, offset: 9, side: 'left', fill: 0.97 },
    { kind: 'sign', spacing: 1600, offset: 2, side: 'right', fill: 0.6 },
  ],
  mountains: [
    { radius: 2200, height: 140, base: 90, color: '#b77a58', haze: 0.45, roughness: 0.2, sparsity: 0.45 },
    { radius: 3600, height: 260, base: 80, color: '#a88a90', haze: 0.65, roughness: 0.4 },
  ],
  variants: [
    variant({
      id: 'afternoon', name: 'Afternoon', sunElevation: 48, sunAzimuth: 70, sunColor: '#fff0d8', sunIntensity: 3.2,
      skyZenith: '#3f7cc0', skyHorizon: '#e8dcc8', skyGround: '#c9ab84', hemiSky: '#d8e4f0', hemiGround: '#a88a64', hemiIntensity: 1,
      fogNear: 250, fogFar: 1800, cloudCover: 0.12, wind: 0.4,
    }),
    variant({
      id: 'sunset', name: 'Sunset', sunElevation: 3.5, sunAzimuth: 12, sunColor: '#ff9a52', sunIntensity: 2.6,
      skyZenith: '#384d80', skyHorizon: '#f39a5e', skyGround: '#8c6650', hemiSky: '#f0b48c', hemiGround: '#5c4232', hemiIntensity: 0.8,
      fogNear: 200, fogFar: 1600, cloudCover: 0.25, cloudColor: '#ffb684', wind: 0.3,
    }),
    variant({
      id: 'twilight', name: 'Twilight', sunElevation: -3, sunAzimuth: 15, sunColor: '#8f7fb0', sunIntensity: 0.35,
      skyZenith: '#141c38', skyHorizon: '#a86f78', skyGround: '#3a3038', hemiSky: '#6c6a96', hemiGround: '#3a2e2c', hemiIntensity: 0.55,
      fogNear: 150, fogFar: 1200, cloudCover: 0.15, cloudColor: '#8a6a80', stars: 0.6, headlights: true, sunDisc: 0, wind: 0.2,
    }),
  ],
  audio: { layers: { wind: 0.8, insects: 0.25 }, music: 'dream', reverb: 0.1 },
  anomalies: ['distant-car', 'silhouette', 'distant-sound', 'empty-stretch', 'silence'],
  thumbnail: { accent: '#f39a5e', motif: 'dunes' },
};

export const midnightHighway: EnvironmentPreset = {
  id: 'midnight-highway',
  name: 'Midnight Highway',
  tagline: 'Only as far as the headlights reach.',
  description:
    'A dark two-lane road at 3 a.m. Reflector posts, a sky full of stars and the occasional lamp marking a junction nobody uses.',
  category: 'liminal',
  status: 'complete',
  kind: 'outdoor',
  maxSpeedKmh: 140,
  road: { ...countryRoad, color: '#2d2f33', markingColor: '#f2eee2', centerColor: '#e8c25a', markings: 'center-dashed' },
  terrain: {
    baseHeight: 40,
    amplitude: 26,
    frequency: 1 / 420,
    octaves: 4,
    ridged: 0.2,
    largeAmplitude: 30,
    largeFrequency: 1 / 2200,
    blendWidth: 30,
    colors: {
      low: '#3e4b34',
      high: '#4c5640',
      dry: '#5a5a44',
      rock: '#5c5a56',
      roadside: '#4a503c',
    },
  },
  scenery: [
    { kind: 'conifer', density: 3, minRoadDistance: 10, scale: [0.8, 1.4], clusterFrequency: 1 / 170, clusterThreshold: 0.3, maxSlope: 0.6, tints: ['#ffffff'] },
    { kind: 'broadleaf', density: 2, minRoadDistance: 10, scale: [0.8, 1.3], clusterFrequency: 1 / 200, clusterThreshold: 0.35, maxSlope: 0.6, tints: ['#ffffff'] },
    { kind: 'shrub', density: 5, minRoadDistance: 6, scale: [0.6, 1.2], clusterFrequency: 1 / 90, clusterThreshold: 0.1, maxSlope: 0.7, tints: ['#ffffff'] },
    { kind: 'grass', density: 500, minRoadDistance: 5.6, scale: [0.7, 1.3], clusterFrequency: 1 / 40, clusterThreshold: -0.2, maxSlope: 0.9, tints: ['#d8dcc0'], nearOnly: true },
  ],
  roadside: [
    { kind: 'delineator', spacing: 50, offset: 0.9, side: 'both', fill: 0.95 },
    { kind: 'telephone-pole', spacing: 60, offset: 8, side: 'right', fill: 0.9 },
    { kind: 'streetlight', spacing: 650, offset: 0.9, side: 'right', fill: 0.75 },
    { kind: 'sign', spacing: 1200, offset: 1.6, side: 'right', fill: 0.6 },
  ],
  mountains: [
    { radius: 2000, height: 110, base: 10, color: '#0d121c', haze: 0.25, roughness: 0.55 },
  ],
  variants: [
    variant({
      id: 'clear-dark', name: 'Clear Darkness', sunElevation: 38, sunAzimuth: -40, sunColor: '#8ea4cc', sunIntensity: 0.22,
      skyZenith: '#03050b', skyHorizon: '#141b2a', skyGround: '#07090e', hemiSky: '#2a3550', hemiGround: '#0a0c0e', hemiIntensity: 0.28,
      fogNear: 60, fogFar: 700, cloudCover: 0.15, cloudColor: '#1a2030', wind: 0.2, headlights: true, lights: 1, stars: 1, sunDisc: 0.7,
      exposure: 1.15,
    }),
    variant({
      id: 'night-fog', name: 'Fog', sunElevation: 38, sunAzimuth: -40, sunColor: '#8090a8', sunIntensity: 0.12,
      skyZenith: '#0a0d12', skyHorizon: '#1d232b', skyGround: '#0d1014', hemiSky: '#2c3440', hemiGround: '#0a0c0e', hemiIntensity: 0.3,
      fogNear: 8, fogFar: 150, cloudCover: 0.8, cloudColor: '#1d232b', wind: 0.1, headlights: true, lights: 1, sunDisc: 0,
      exposure: 1.15,
    }),
    variant({
      id: 'night-rain', name: 'Rain', sunElevation: 38, sunAzimuth: -40, sunColor: '#8090a8', sunIntensity: 0.1,
      skyZenith: '#06080c', skyHorizon: '#161c24', skyGround: '#090b0e', hemiSky: '#283040', hemiGround: '#0a0c0e', hemiIntensity: 0.28,
      fogNear: 20, fogFar: 320, cloudCover: 1, cloudColor: '#161c24', rain: 0.85, wetness: 1, wind: 0.5, headlights: true, lights: 1, sunDisc: 0,
      exposure: 1.15,
    }),
  ],
  audio: { layers: { crickets: 0.55, wind: 0.35, traffic: 0.1 }, music: 'night', reverb: 0.15 },
  anomalies: ['distant-car', 'silhouette', 'flicker', 'distant-sound', 'silence'],
  thumbnail: { accent: '#e8c25a', motif: 'night' },
};

export const serviceCorridors: EnvironmentPreset = {
  id: 'service-corridors',
  name: 'Service Corridors',
  tagline: 'Authorised personnel only. Probably.',
  description:
    'Pale, carpeted service corridors wide enough for a car and far too long for a building. Doors that never open. A hum that never stops.',
  category: 'liminal',
  status: 'experimental',
  kind: 'indoor',
  maxSpeedKmh: 50,
  road: {
    ...countryRoad, halfWidth: 2.6, shoulderWidth: 0, minRadius: 34, maxRadius: 60, straightChance: 0.62,
    segmentLength: [40, 120], maxHeadingDeg: 50, style: 'angular', elevation: 'flat', baseElevation: 0, maxGrade: 0,
    markings: 'none', edgeLines: false, surface: 'corridor-floor', color: '#a39a80', shoulderColor: '#a39a80',
  },
  terrain: {
    baseHeight: 0, amplitude: 0, frequency: 1 / 400, octaves: 1, ridged: 0, largeAmplitude: 0, largeFrequency: 1 / 1000, blendWidth: 10,
    colors: { low: '#333', high: '#333', dry: '#333', rock: '#333', roadside: '#333' },
  },
  indoor: {
    type: 'corridor',
    driveHalfWidth: 3.5,
    floorHalfWidth: 4.4,
    ceilingHeight: 3.3,
    baySpacing: 6,
    floorColor: '#a39a80',
    ceilingColor: '#e2dccb',
    wallColor: '#d8d0b0',
    accentColor: '#9a9276',
    pillarColor: '#cfc7a8',
    lightColor: '#fff6dc',
  },
  scenery: [],
  roadside: [],
  mountains: [],
  variants: [
    variant({
      id: 'hum', name: 'The Hum', sunIntensity: 0, sunDisc: 0, cloudCover: 0, wind: 0, headlights: true,
      skyZenith: '#3a372d', skyHorizon: '#5c5745', skyGround: '#3a372d', hemiSky: '#f0e8c8', hemiGround: '#8a8064', hemiIntensity: 0.9,
      fogNear: 12, fogFar: 120, lights: 1,
    }),
    variant({
      id: 'dim', name: 'Low Power', sunIntensity: 0, sunDisc: 0, cloudCover: 0, wind: 0, headlights: true,
      skyZenith: '#1c1b16', skyHorizon: '#2e2b22', skyGround: '#1c1b16', hemiSky: '#c8bc98', hemiGround: '#4c4636', hemiIntensity: 0.4,
      fogNear: 8, fogFar: 85, lights: 0.55,
    }),
  ],
  audio: { layers: { hum: 0.85, mechanical: 0.45 }, music: 'liminal', reverb: 0.8 },
  anomalies: ['flicker', 'distant-sound', 'silence', 'silhouette'],
  thumbnail: { accent: '#e8d890', motif: 'corridor' },
};

export const surrealHorizon: EnvironmentPreset = {
  id: 'surreal-horizon',
  name: 'Surreal Horizon',
  tagline: 'The road is real. The rest is negotiable.',
  description:
    'A perfectly flat plain under impossible colours. Enormous, quiet shapes stand at the edge of the world and never get any closer.',
  category: 'surreal',
  status: 'experimental',
  kind: 'outdoor',
  maxSpeedKmh: 140,
  road: {
    ...countryRoad, minRadius: 600, maxRadius: 2500, straightChance: 0.5, segmentLength: [200, 600], maxGrade: 0.01,
    markings: 'none', edgeLines: true, color: '#cfc5cf', shoulderColor: '#b9aab8', markingColor: '#fff8f0',
  },
  terrain: {
    baseHeight: 0,
    amplitude: 1.2,
    frequency: 1 / 500,
    octaves: 2,
    ridged: 0,
    largeAmplitude: 2,
    largeFrequency: 1 / 3000,
    blendWidth: 40,
    colors: {
      low: '#b79db8',
      high: '#c4a8c0',
      dry: '#cbb0b8',
      rock: '#9c8aa8',
      roadside: '#bfa6bc',
    },
  },
  scenery: [
    { kind: 'boulder', density: 0.25, minRoadDistance: 30, scale: [0.8, 2.5], clusterFrequency: 0, clusterThreshold: 0, maxSlope: 2, tints: ['#f0e8f4', '#e0d8f0'] },
    { kind: 'deadtree', density: 0.12, minRoadDistance: 25, scale: [1, 1.6], clusterFrequency: 0, clusterThreshold: 0, maxSlope: 1, tints: ['#f8f0f8'] },
  ],
  roadside: [],
  mountains: [],
  landmarks: { kind: 'monolith', spacing: 650, lateral: [450, 1700], scale: [0.6, 1.8], color: '#2e2a3a' },
  variants: [
    variant({
      id: 'lavender', name: 'Lavender', sunElevation: 9, sunAzimuth: 8, sunColor: '#ffd8d0', sunIntensity: 2.2,
      skyZenith: '#6f6aae', skyHorizon: '#f2c4c4', skyGround: '#c4a4bc', hemiSky: '#e0c8e8', hemiGround: '#8a6a88', hemiIntensity: 1.1,
      fogNear: 300, fogFar: 2600, cloudCover: 0.2, cloudColor: '#ffe0e8', wind: 0.1,
    }),
    variant({
      id: 'teal-dream', name: 'Teal Dream', sunElevation: 22, sunAzimuth: -30, sunColor: '#e8fff4', sunIntensity: 2,
      skyZenith: '#1d5a63', skyHorizon: '#cde7d6', skyGround: '#8ab8a8', hemiSky: '#bfe4dc', hemiGround: '#3c6a64', hemiIntensity: 1.1,
      fogNear: 300, fogFar: 2600, cloudCover: 0.3, cloudColor: '#e8fff8', wind: 0.1,
    }),
    variant({
      id: 'amber-void', name: 'Amber Void', sunElevation: 4, sunAzimuth: 0, sunColor: '#ffb070', sunIntensity: 2.4,
      skyZenith: '#1e1416', skyHorizon: '#ef9a58', skyGround: '#5a3a30', hemiSky: '#c89070', hemiGround: '#3a2620', hemiIntensity: 0.8,
      fogNear: 250, fogFar: 2400, cloudCover: 0.1, cloudColor: '#ffb070', stars: 0.4, wind: 0.05,
    }),
  ],
  audio: { layers: { drone: 0.7, wind: 0.3 }, music: 'dream', reverb: 0.4 },
  anomalies: ['silhouette', 'distant-sound', 'silence', 'fog-shift', 'empty-stretch'],
  thumbnail: { accent: '#f2c4c4', motif: 'monolith' },
};
