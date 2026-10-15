import type { AtmosphereVariant, RoadConfig } from './types';

/** Baseline two-lane country road; presets override what they need. */
export const countryRoad: RoadConfig = {
  halfWidth: 3.6,
  shoulderWidth: 1.4,
  minRadius: 150,
  maxRadius: 650,
  straightChance: 0.3,
  segmentLength: [90, 220],
  maxHeadingDeg: 58,
  style: 'smooth',
  maxGrade: 0.065,
  elevation: 'terrain',
  baseElevation: 0,
  minElevation: -1000,
  markings: 'center-dashed',
  edgeLines: true,
  surface: 'asphalt',
  color: '#3d4046',
  shoulderColor: '#6f685b',
  markingColor: '#ebe6d8',
  centerColor: '#ebe6d8',
  guardrails: 'none',
};

/** Baseline daylight variant; presets spread over it. */
export const baseVariant: AtmosphereVariant = {
  id: 'day',
  name: 'Day',
  sunElevation: 40,
  sunAzimuth: 30,
  sunColor: '#fff1dc',
  sunIntensity: 3,
  skyZenith: '#5d8fc4',
  skyHorizon: '#cfdde6',
  skyGround: '#8e9c8a',
  hemiSky: '#cfe0f0',
  hemiGround: '#5d6e45',
  hemiIntensity: 1.1,
  fogNear: 140,
  fogFar: 1400,
  cloudCover: 0.45,
  cloudColor: '#ffffff',
  exposure: 1,
  rain: 0,
  snow: 0,
  wetness: 0,
  wind: 0.35,
  headlights: false,
  lights: 0,
  stars: 0,
  sunDisc: 1,
};

export function variant(
  overrides: Partial<AtmosphereVariant> & Pick<AtmosphereVariant, 'id' | 'name'>,
): AtmosphereVariant {
  return { ...baseVariant, ...overrides };
}
