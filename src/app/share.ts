import { getEnvironment, isEnvironmentId, type EnvironmentId } from '../config/environments';

/**
 * Shareable road links: `?env=coastal-highway&v=sunset&road=4242`.
 * Opening one shows exactly the same road, weather and time of day.
 */
export interface SharedDrive {
  environmentId: EnvironmentId;
  variantId: string | null;
  seed: number | null;
}

export function parseSeed(text: string | null | undefined): number | null {
  if (!text) return null;
  const n = Number(String(text).trim().replace(/^#/, ''));
  return Number.isInteger(n) && n >= 0 && n <= 4294967295 ? n : null;
}

/** Reads a shared drive from a URL query string; null when there is none or it is invalid. */
export function parseShareParams(search: string): SharedDrive | null {
  const params = new URLSearchParams(search);
  const env = params.get('env');
  if (!isEnvironmentId(env)) return null;
  const preset = getEnvironment(env);
  const v = params.get('v');
  const variantId = preset.variants.some((x) => x.id === v) ? v : null;
  return { environmentId: env, variantId, seed: parseSeed(params.get('road')) };
}

export function buildShareUrl(base: string, drive: { environmentId: string; variantId: string | null; seed: number | null | undefined }): string {
  const params = new URLSearchParams();
  params.set('env', drive.environmentId);
  if (drive.variantId) params.set('v', drive.variantId);
  if (drive.seed !== null && drive.seed !== undefined) params.set('road', String(drive.seed));
  return `${base.split('?')[0].split('#')[0]}?${params.toString()}`;
}
