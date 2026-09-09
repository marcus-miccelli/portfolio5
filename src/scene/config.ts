// Measured source-artwork coordinates. Keep these separate from CSS layout.
export const ART = {
  width: 5760,
  height: 3232,
  columns: 300,
  rows: 101,
  cell: { width: 19.2, height: 32 },
  globe: { x: 2818, y: 1597, radius: 1104 },
  ring: { x: 2846, y: 1601, major: 2304, minor: 861, angle: 0.525412 },
  stroke: {
    x: 2842.64028,
    y: 1600.54205,
    major: 2289.61036,
    minor: 840.213519,
    angle: 0.524567347,
  },
} as const;
export const LAYOUT = {
  horizontalCenter: 0.3,
  verticalCenter: 0.5,
  aspectStart: 0.65,
  aspectRange: 1.15,
  portraitHeight: 0.78,
  landscapeHeightGain: 0.1,
  widthLimit: 1.2,
  blendPower: 8,
} as const;
export const FOG = {
  displayScale: 1.64,
  period: 64,
  horizontalTravel: 0.04,
  verticalTravel: 0.26,
} as const;
export const MOTION = {
  fps: 12,
  orbitSeconds: 120,
  hueSeconds: 120,
  twinkleSeconds: 20,
} as const;
export const TAU = Math.PI * 2;
export const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
