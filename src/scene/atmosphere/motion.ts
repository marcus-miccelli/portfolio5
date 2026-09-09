import { FOG, TAU } from "../config";
import type { Viewport } from "../types";
export function fogPosition(
  seconds: number,
  viewport: Viewport,
): [number, number] {
  const short = Math.min(viewport.width, viewport.height);
  const angle = (seconds * TAU) / FOG.period;
  return [
    Math.sin(angle * 2) * short * FOG.horizontalTravel,
    -Math.sin(angle) * viewport.height * FOG.verticalTravel,
  ];
}
