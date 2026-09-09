import { ART, LAYOUT, smooth } from "./config";
import type { Viewport } from "./types";

export function compose(viewport: Viewport) {
  const { width, height } = viewport;
  const landscape = smooth(
    (width / height - LAYOUT.aspectStart) / LAYOUT.aspectRange,
  );
  const preferred =
    height * (LAYOUT.portraitHeight + LAYOUT.landscapeHeightGain * landscape);
  const diameter =
    preferred /
    (1 + (preferred / (width * LAYOUT.widthLimit)) ** LAYOUT.blendPower) **
      (1 / LAYOUT.blendPower);
  const scale = diameter / (ART.globe.radius * 2);
  return {
    scale,
    sourceX: width * LAYOUT.horizontalCenter - ART.globe.x * scale,
    sourceY: height * LAYOUT.verticalCenter - ART.globe.y * scale,
  };
}
