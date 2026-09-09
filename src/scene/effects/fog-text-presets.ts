import type { FogRaster } from "../types";

export interface FogTextPreset {
  readonly name: "monochrome" | "chromatic";
  readonly blendMode: "luminosity" | "screen";
  readonly opacity: number;
  readonly raster: FogRaster;
}

/**
 * The original treatment, preserved intact as a first-class preset.
 * It deliberately supplies only grayscale luminosity to the live backdrop.
 */
export const monochromeFogText: FogTextPreset = {
  name: "monochrome",
  blendMode: "luminosity",
  opacity: 0.78,
  raster: {
    brightnessBase: 250,
    brightnessRange: 174,
    densityOffset: 0.008,
    densityRange: 0.034,
    color: [1, 1, 1],
  },
};

/**
 * The same inverted fog structure, colourised with the atmosphere's source
 * blue. CSS rotates this cached texture by the scene's live hue angle.
 */
export const chromaticFogText: FogTextPreset = {
  name: "chromatic",
  blendMode: "screen",
  opacity: 0.82,
  raster: {
    brightnessBase: 250,
    brightnessRange: 174,
    densityOffset: 0.008,
    densityRange: 0.034,
    color: [0.42, 0.67, 1],
  },
};

// Change this one line to restore the exact grayscale/luminosity treatment.
export const activeFogTextPreset = chromaticFogText;
