import type { EnvironmentId, EnvironmentPreset } from '../world/environments/types';
import { greenHighlands } from '../world/environments/greenHighlands';
import { coastalHighway } from '../world/environments/coastalHighway';
import { liminalSuburbia } from '../world/environments/liminalSuburbia';
import { parkingStructure } from '../world/environments/parkingStructure';
import {
  alpineRoads,
  desertHighway,
  midnightHighway,
  mistyForest,
  serviceCorridors,
  surrealHorizon,
} from '../world/environments/otherEnvironments';

export type { EnvironmentId, EnvironmentPreset } from '../world/environments/types';

/** Display order in the selector. */
export const ENVIRONMENTS: readonly EnvironmentPreset[] = [
  greenHighlands,
  coastalHighway,
  liminalSuburbia,
  parkingStructure,
  alpineRoads,
  mistyForest,
  desertHighway,
  midnightHighway,
  serviceCorridors,
  surrealHorizon,
];

export const DEFAULT_ENVIRONMENT: EnvironmentId = 'green-highlands';

const byId = new Map(ENVIRONMENTS.map((e) => [e.id, e] as const));

export function getEnvironment(id: string | undefined | null): EnvironmentPreset {
  return (id && byId.get(id as EnvironmentId)) || byId.get(DEFAULT_ENVIRONMENT)!;
}

export function isEnvironmentId(id: unknown): id is EnvironmentId {
  return typeof id === 'string' && byId.has(id as EnvironmentId);
}

export function getVariant(env: EnvironmentPreset, variantId: string | undefined | null) {
  return env.variants.find((v) => v.id === variantId) ?? env.variants[0];
}
