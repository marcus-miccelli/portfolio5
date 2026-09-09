import { MOTION, clamp } from "../config";
import type { Viewport } from "../types";

export const MAX_STARS = 100;
export const TWINKLE_DURATION = 0.72;

export interface Star {
  x: number;
  y: number;
  opacity: number;
  canTwinkle: boolean;
}

export function starRandom(index: number, seed: number): number {
  let value = Math.imul(index, 374761393) + Math.imul(seed, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

/** Preserve the former canvas star positions while moving them into WebGL. */
export function createStarfield(
  viewport: Viewport,
  globeRadius: number,
): Star[] {
  const { width, height } = viewport;
  const count = Math.max(
    22,
    Math.min(MAX_STARS, Math.round((width * height) / 24000)),
  );
  const stars: Star[] = [];
  for (let index = 0; index < count; index++) {
    const x = (0.025 + starRandom(index, 91) * 0.95) * width;
    const y = (0.035 + starRandom(index, 173) * 0.93) * height;
    const strength = starRandom(index, 317);
    const distance = Math.hypot(x - width * 0.3, y - height * 0.5);
    const mask = clamp(
      (distance - globeRadius * 0.94) / (globeRadius * 0.13),
    );
    stars.push({
      x,
      y,
      opacity: (0.65 + strength * 0.23) * mask,
      canTwinkle:
        width > 600 &&
        x > 8 &&
        x < width - 8 &&
        y > 8 &&
        y < height - 8 &&
        distance > globeRadius * 1.07 + 8,
    });
  }
  return stars;
}

export function twinkleAt(seconds: number): {
  cycle: number;
  progress: number;
} {
  const cycle = Math.floor(seconds / MOTION.twinkleSeconds);
  return {
    cycle,
    progress: (seconds - cycle * MOTION.twinkleSeconds) / TWINKLE_DURATION,
  };
}
