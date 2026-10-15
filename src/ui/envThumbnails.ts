import type { EnvironmentPreset } from '../config/environments';
import { hashString, mulberry32 } from '../core/random';

/**
 * Locally generated environment previews: a small painted scene per preset
 * (sky gradient from its first atmosphere variant, layered silhouettes, a
 * road vanishing to the horizon and a motif). No image files needed.
 */
const cache = new Map<string, string>();

export function environmentThumbnail(env: EnvironmentPreset, variantIndex = 0, w = 320, h = 180): string {
  const key = `${env.id}:${variantIndex}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const v = env.variants[Math.min(variantIndex, env.variants.length - 1)];
  const rand = mulberry32(hashString(env.id));
  const horizon = h * 0.56;
  const indoor = env.kind === 'indoor';

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, v.skyZenith);
  sky.addColorStop(1, v.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 1);

  if (!indoor && v.sunDisc > 0.2) {
    const sx = w * (0.5 + Math.sin((v.sunAzimuth * Math.PI) / 180) * 0.35);
    const sy = horizon - Math.max(6, (v.sunElevation / 60) * horizon * 0.9);
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60);
    glow.addColorStop(0, v.sunColor);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon);
    ctx.globalAlpha = 1;
    ctx.fillStyle = v.sunColor;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (v.stars > 0.2) {
    ctx.fillStyle = 'rgba(230,236,255,0.8)';
    for (let i = 0; i < 40; i++) ctx.fillRect(rand() * w, rand() * horizon * 0.8, 1, 1);
  }

  // Distant layers.
  const ridge = (y: number, amp: number, color: string, rough: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const n = Math.sin(x * 0.018 * rough + rand() * 0.2) * 0.5 + Math.sin(x * 0.051 * rough + 2) * 0.3 + rand() * 0.15;
      ctx.lineTo(x, y - Math.max(0, n) * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };

  const ground = env.terrain.colors.low;
  if (indoor) {
    ctx.fillStyle = env.indoor?.ceilingColor ?? '#666';
    ctx.fillRect(0, 0, w, horizon * 0.55);
    ctx.fillStyle = v.skyHorizon;
    ctx.fillRect(0, horizon * 0.55, w, horizon * 0.45);
  } else {
    env.mountains.forEach((m, i) => ridge(horizon + 2, (m.height / 600) * 60 + 8, mix(m.color, v.skyHorizon, m.haze * 0.8), 1 + i));
  }

  // Ground.
  const gnd = ctx.createLinearGradient(0, horizon, 0, h);
  gnd.addColorStop(0, indoor ? env.indoor!.floorColor : mix(ground, v.skyHorizon, 0.5));
  gnd.addColorStop(1, indoor ? shade(env.indoor!.floorColor, 0.6) : shade(ground, 0.75));
  ctx.fillStyle = gnd;
  ctx.fillRect(0, horizon, w, h - horizon);

  if (env.thumbnail.motif === 'coast') {
    ctx.fillStyle = mix(v.waterColor ?? '#1f5068', v.skyHorizon, 0.25);
    ctx.fillRect(0, horizon, w * 0.42, h - horizon);
  }

  // Road vanishing toward the horizon with a gentle bend.
  const vx = w * 0.56;
  ctx.fillStyle = env.road.color;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h);
  ctx.bezierCurveTo(w * 0.42, h * 0.8, w * 0.62, horizon + 14, vx - 2, horizon);
  ctx.lineTo(vx + 2, horizon);
  ctx.bezierCurveTo(w * 0.68, horizon + 14, w * 0.7, h * 0.8, w * 0.86, h);
  ctx.closePath();
  ctx.fill();
  if (env.road.markings !== 'none') {
    ctx.strokeStyle = env.road.centerColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(w * 0.52, h);
    ctx.bezierCurveTo(w * 0.56, h * 0.8, w * 0.66, horizon + 14, vx, horizon);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Motifs.
  const accent = env.thumbnail.accent;
  switch (env.thumbnail.motif) {
    case 'hills':
    case 'forest': {
      const n = env.thumbnail.motif === 'forest' ? 26 : 9;
      for (let i = 0; i < n; i++) {
        const x = rand() < 0.5 ? rand() * w * 0.3 : w * 0.78 + rand() * w * 0.22;
        const y = horizon + 4 + rand() * (h - horizon) * 0.7;
        const s = 6 + ((y - horizon) / (h - horizon)) * 26;
        ctx.fillStyle = shade('#2f4a2e', 0.8 + rand() * 0.4);
        ctx.beginPath();
        if (env.thumbnail.motif === 'forest') {
          ctx.moveTo(x, y - s * 1.6);
          ctx.lineTo(x - s * 0.45, y);
          ctx.lineTo(x + s * 0.45, y);
        } else {
          ctx.arc(x, y - s * 0.6, s * 0.5, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      break;
    }
    case 'houses':
      for (let i = 0; i < 5; i++) {
        const left = i % 2 === 0;
        const d = 1 - i / 6;
        const x = left ? w * (0.32 - d * 0.28) : w * (0.7 + d * 0.22);
        const y = horizon + 10 + d * 40;
        const s = 10 + d * 30;
        ctx.fillStyle = shade('#e8e2d2', 0.85);
        ctx.fillRect(x - s / 2, y - s * 0.6, s, s * 0.6);
        ctx.fillStyle = '#4a4f57';
        ctx.beginPath();
        ctx.moveTo(x - s * 0.6, y - s * 0.6);
        ctx.lineTo(x, y - s);
        ctx.lineTo(x + s * 0.6, y - s * 0.6);
        ctx.fill();
      }
      break;
    case 'pillars':
    case 'corridor':
      for (let i = 0; i < 6; i++) {
        const d = 1 - i / 7;
        const off = w * (0.12 + d * 0.33);
        const top = horizon * 0.55 - d * horizon * 0.5;
        const bot = horizon + d * (h - horizon);
        ctx.fillStyle = shade(env.indoor?.pillarColor ?? '#999', 0.7 + d * 0.3);
        const pw = 2 + d * 14;
        ctx.fillRect(w * 0.56 - off - pw / 2, top, pw, bot - top);
        ctx.fillRect(w * 0.56 + off - pw / 2, top, pw, bot - top);
        ctx.fillStyle = 'rgba(240,248,240,0.9)';
        ctx.fillRect(w * 0.56 - 10 * d - 2, top + 2, 20 * d + 4, 2);
      }
      break;
    case 'peaks':
      ctx.fillStyle = 'rgba(240,244,248,0.8)';
      for (let i = 0; i < 4; i++) {
        const x = w * (0.1 + i * 0.27);
        ctx.beginPath();
        ctx.moveTo(x, horizon - 30 - rand() * 10);
        ctx.lineTo(x - 8, horizon - 18);
        ctx.lineTo(x + 8, horizon - 18);
        ctx.fill();
      }
      break;
    case 'dunes':
      ctx.fillStyle = shade('#3f5a32', 0.9);
      for (let i = 0; i < 4; i++) {
        const x = w * (0.08 + rand() * 0.25) + (i % 2) * w * 0.7;
        const y = horizon + 20 + rand() * 40;
        ctx.fillRect(x, y - 22, 4, 22);
        ctx.fillRect(x - 5, y - 15, 5, 3);
        ctx.fillRect(x - 5, y - 21, 3, 8);
      }
      break;
    case 'night':
      for (let i = 0; i < 6; i++) {
        const d = 1 - i / 7;
        const x = w * (0.86 - (1 - d) * 0.28);
        const y = horizon + d * (h - horizon) * 0.8;
        ctx.fillStyle = accent;
        ctx.fillRect(x, y - 6 * d - 2, 2, 2);
      }
      break;
    case 'monolith':
      ctx.fillStyle = '#2e2a3a';
      ctx.fillRect(w * 0.14, horizon - 70, 14, 72);
      ctx.fillRect(w * 0.8, horizon - 40, 9, 42);
      ctx.beginPath();
      ctx.arc(w * 0.35, horizon - 18, 16, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'coast':
      ctx.fillStyle = mix('#6d8590', v.skyHorizon, 0.5);
      ctx.beginPath();
      ctx.ellipse(w * 0.12, horizon, 26, 7, 0, Math.PI, 0);
      ctx.ellipse(w * 0.3, horizon, 14, 4, 0, Math.PI, 0);
      ctx.fill();
      break;
  }

  // Soft vignette for cohesion with the UI.
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(8,12,20,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  return `rgb(${ca.map((c, i) => Math.round(c + (cb[i] - c) * t)).join(',')})`;
}

function shade(hex: string, k: number): string {
  const c = parse(hex);
  return `rgb(${c.map((v) => Math.round(Math.min(255, v * k))).join(',')})`;
}
