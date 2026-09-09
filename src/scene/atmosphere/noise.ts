// Background fields adapted from Frank Hugenroth /frankenburgh/'s Galaxy
// shader (07/2015, nordlicht/bremen): https://www.shadertoy.com/view/lty3Rt
// User-supplied reference; galaxy, core glow and camera travel are omitted.
import { clamp, smooth } from "../config";
const mix = (a: number, b: number, weight: number) => a + (b - a) * weight;
const hashCache = new Map<number, number>();
export const clearNoiseCache = () => hashCache.clear();
const hash = (n: number) => {
  const cached = hashCache.get(n);
  if (cached !== undefined) return cached;
  const value = Math.cos(n) * 41415.92653;
  const result = value - Math.floor(value);
  hashCache.set(n, result);
  return result;
};
function noise(x: number, y: number, z: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const a = smooth(x - ix),
    b = smooth(y - iy),
    c = smooth(z - iz);
  const n = ix + 57 * iy + 113 * iz;
  const lower = mix(
    mix(hash(n), hash(n + 1), a),
    mix(hash(n + 57), hash(n + 58), a),
    b,
  );
  const upper = mix(
    mix(hash(n + 113), hash(n + 114), a),
    mix(hash(n + 170), hash(n + 171), a),
    b,
  );
  return mix(lower, upper, c);
}
function fractal(x: number, y: number, z: number): number {
  let result = 0.5 * noise(x, y, z);
  let nextX = (-1.6 * y - 1.2 * z) * 1.2;
  let nextY = (1.6 * x + 0.72 * y - 0.96 * z) * 1.2;
  let nextZ = (1.2 * x - 0.96 * y + 1.28 * z) * 1.2;
  x = nextX;
  y = nextY;
  z = nextZ;
  result += 0.25 * noise(x, y, z);
  nextX = (-1.6 * y - 1.2 * z) * 1.3;
  nextY = (1.6 * x + 0.72 * y - 0.96 * z) * 1.3;
  nextZ = (1.2 * x - 0.96 * y + 1.28 * z) * 1.3;
  x = nextX;
  y = nextY;
  z = nextZ;
  result += 0.1666 * noise(x, y, z);
  nextX = (-1.6 * y - 1.2 * z) * 1.4;
  nextY = (1.6 * x + 0.72 * y - 0.96 * z) * 1.4;
  nextZ = (1.2 * x - 0.96 * y + 1.28 * z) * 1.4;
  result += 0.0834 * noise(nextX, nextY, nextZ);
  return result;
}
export function density(u: number, v: number, aspect: number): number {
  const rx = (2 * u - 1) * aspect,
    ry = 1 - 2 * v,
    length = Math.hypot(rx, ry, 1.6);
  let x = (1500 * rx) / length + 831,
    y = (1500 * ry) / length + 321,
    z = 2400 / length + 1000;
  const broad = fractal(x * 0.0035, y * 0.0035, z * 0.0035) - 0.5;
  x += 831;
  y += 321;
  z += 999;
  const wisps = 10 * fractal(x * 0.0045, y * 0.0045, z * 0.0045) ** 10;
  x += 3831;
  y += 221;
  z += 999;
  const dust = 0.3 * fractal(x * 0.0145, y * 0.0145, z * 0.0145) ** 2;
  return (
    clamp(0.018 + broad * 0.18 + wisps * 0.08 + dust * 0.03, 0, 0.085) *
    Math.max(0, 1 - ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 1.35)
  );
}
