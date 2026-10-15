/**
 * Environment presets are pure data. The engine (road generator, terrain,
 * scenery, atmosphere, audio) interprets them; no environment ships its own
 * driving controller or chunk manager.
 */

export type EnvironmentId =
  | 'green-highlands'
  | 'coastal-highway'
  | 'liminal-suburbia'
  | 'parking-structure'
  | 'alpine-roads'
  | 'misty-forest'
  | 'desert-highway'
  | 'midnight-highway'
  | 'service-corridors'
  | 'surreal-horizon';

export type EnvironmentKind = 'outdoor' | 'indoor';

/** `complete`: polished and tested. `experimental`: playable but less refined. */
export type EnvironmentStatus = 'complete' | 'experimental';

export type MarkingStyle = 'center-dashed' | 'double-yellow' | 'center-solid' | 'none';

export type SurfaceMode = 'asphalt' | 'parking-floor' | 'corridor-floor' | 'ceiling' | 'wall' | 'sand-road';

export interface RoadConfig {
  /** Half the paved width in metres. */
  halfWidth: number;
  shoulderWidth: number;
  /** Curve radius range in metres for curved segments. */
  minRadius: number;
  maxRadius: number;
  /** Probability that a new segment is straight. */
  straightChance: number;
  segmentLength: [number, number];
  /** Limits overall heading drift so the road never folds back on itself. */
  maxHeadingDeg: number;
  /** 'smooth' eases curvature over long transitions; 'angular' turns quickly. */
  style: 'smooth' | 'angular';
  maxGrade: number;
  elevation: 'terrain' | 'flat' | 'levels';
  baseElevation: number;
  minElevation: number;
  /** Storey height for 'levels' elevation (parking ramps). */
  levelHeight?: number;
  levelChangeChance?: number;
  markings: MarkingStyle;
  edgeLines: boolean;
  surface: SurfaceMode;
  /** sRGB colours of the paving / shoulder / markings. */
  color: string;
  shoulderColor: string;
  markingColor: string;
  centerColor: string;
  guardrails: 'none' | 'curves' | 'right' | 'both';
}

export interface TerrainColors {
  low: string;
  high: string;
  dry: string;
  rock: string;
  roadside: string;
  sand?: string;
  snow?: string;
  /** Height above which snow appears (absolute metres). */
  snowLine?: number;
}

export interface TerrainConfig {
  baseHeight: number;
  amplitude: number;
  frequency: number;
  octaves: number;
  /** 0 = rolling fbm, 1 = fully ridged mountains. */
  ridged: number;
  largeAmplitude: number;
  largeFrequency: number;
  /** Metres over which terrain blends from the road level to natural height. */
  blendWidth: number;
  /** Optional ocean on one side of the road. +1 = right-hand side. */
  coast?: { side: 1 | -1; start: number; width: number; seabed: number; noise: number };
  seaLevel?: number;
  colors: TerrainColors;
}

export type SceneryKind =
  | 'broadleaf'
  | 'conifer'
  | 'birch'
  | 'shrub'
  | 'rock'
  | 'boulder'
  | 'grass'
  | 'cactus'
  | 'deadtree'
  | 'mesa'
  | 'reed';

export interface SceneryLayer {
  kind: SceneryKind;
  /** Instances per 10,000 m² before clustering. */
  density: number;
  minRoadDistance: number;
  maxRoadDistance?: number;
  scale: [number, number];
  /** Noise frequency used to cluster instances; 0 disables clustering. */
  clusterFrequency: number;
  /** 0..1, higher → only the densest parts of the cluster noise are used. */
  clusterThreshold: number;
  maxSlope: number;
  minHeight?: number;
  maxHeight?: number;
  /** Colour tints (sRGB) chosen per instance. */
  tints: string[];
  /** Only placed in the highest-detail chunks (grass, small shrubs). */
  nearOnly?: boolean;
}

export type RoadsideKind =
  | 'streetlight'
  | 'delineator'
  | 'fence'
  | 'telephone-pole'
  | 'sign'
  | 'house'
  | 'mailbox';

export interface RoadsideFeature {
  kind: RoadsideKind;
  /** Average spacing in metres along the road. */
  spacing: number;
  /** Lateral offset from the road edge in metres. */
  offset: number;
  side: 'left' | 'right' | 'both' | 'alternate';
  /** Probability of each slot actually being filled. */
  fill: number;
  tints?: string[];
}

export interface IndoorConfig {
  type: 'parking' | 'corridor';
  /** Lateral half-width the car may drive in. */
  driveHalfWidth: number;
  /** Half-width of the floor / ceiling slabs. */
  floorHalfWidth: number;
  ceilingHeight: number;
  /** Spacing between structural bays (pillars, light fixtures). */
  baySpacing: number;
  floorColor: string;
  ceilingColor: string;
  wallColor: string;
  accentColor: string;
  pillarColor: string;
  lightColor: string;
}

export interface MountainLayer {
  radius: number;
  height: number;
  base: number;
  color: string;
  /** 0 = layer colour, 1 = fully dissolved into the horizon colour. */
  haze: number;
  roughness: number;
  /** Optional: only raise silhouettes in a world-space direction (radians). */
  maskAngle?: number;
  maskWidth?: number;
  /** 0..1: proportion of the ring that is flat (islands, isolated buttes). */
  sparsity?: number;
  snowCap?: number;
}

export interface LandmarkConfig {
  kind: 'monolith' | 'arch' | 'sphere' | 'tower' | 'pylon';
  spacing: number;
  lateral: [number, number];
  scale: [number, number];
  color: string;
}

/** A complete atmospheric look — time of day, weather and grading. */
export interface AtmosphereVariant {
  id: string;
  name: string;
  sunElevation: number; // degrees
  sunAzimuth: number; // degrees, 0 = +Z (road direction)
  sunColor: string;
  sunIntensity: number;
  skyZenith: string;
  skyHorizon: string;
  skyGround: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  cloudCover: number;
  cloudColor: string;
  exposure: number;
  rain: number;
  snow: number;
  wetness: number;
  wind: number;
  headlights: boolean;
  /** 0..1 intensity of streetlights / fixtures. */
  lights: number;
  stars: number;
  /** Sun disc visibility 0..1 (hidden indoors or in heavy overcast). */
  sunDisc: number;
  waterColor?: string;
}

export type AmbienceLayer =
  | 'wind'
  | 'birds'
  | 'ocean'
  | 'forest'
  | 'crickets'
  | 'hum'
  | 'drone'
  | 'traffic'
  | 'mechanical'
  | 'insects';

export type MusicMood = 'calm' | 'liminal' | 'dream' | 'night';

export interface AudioConfig {
  layers: Partial<Record<AmbienceLayer, number>>;
  music: MusicMood;
  /** Reverb send for indoor spaces. */
  reverb: number;
}

export type AnomalyKind =
  | 'silhouette'
  | 'flicker'
  | 'distant-sound'
  | 'distant-car'
  | 'silence'
  | 'fog-shift'
  | 'empty-stretch';

export interface EnvironmentPreset {
  id: EnvironmentId;
  name: string;
  tagline: string;
  description: string;
  category: 'nature' | 'liminal' | 'surreal';
  status: EnvironmentStatus;
  kind: EnvironmentKind;
  road: RoadConfig;
  terrain: TerrainConfig;
  scenery: SceneryLayer[];
  roadside: RoadsideFeature[];
  indoor?: IndoorConfig;
  mountains: MountainLayer[];
  landmarks?: LandmarkConfig;
  variants: AtmosphereVariant[];
  audio: AudioConfig;
  anomalies: AnomalyKind[];
  /** Speed cap for this environment (km/h); the player's setting may be lower. */
  maxSpeedKmh: number;
  /** Rough render-side thumbnail accents. */
  thumbnail: { accent: string; motif: 'hills' | 'coast' | 'houses' | 'pillars' | 'peaks' | 'forest' | 'dunes' | 'night' | 'corridor' | 'monolith' };
}
