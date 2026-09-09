import { smooth } from "../config";

export interface FogTextPreset {
  readonly name: "monochrome" | "chromatic";
  readonly blendMode: "luminosity" | "screen";
  readonly opacity: number;
  writePixel(target: Uint8ClampedArray, offset: number, density: number): void;
}

function invertedBrightness(density: number): number {
  return Math.round(250 - 174 * smooth((density - 0.008) / 0.034));
}

/**
 * The original treatment, preserved intact as a first-class preset.
 * It deliberately supplies only grayscale luminosity to the live backdrop.
 */
export const monochromeFogText: FogTextPreset = {
  name: "monochrome",
  blendMode: "luminosity",
  opacity: 0.78,
  writePixel(target, offset, density) {
    const value = invertedBrightness(density);
    target[offset] = value;
    target[offset + 1] = value;
    target[offset + 2] = value;
    target[offset + 3] = 255;
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
  writePixel(target, offset, density) {
    const value = invertedBrightness(density);
    target[offset] = Math.round(value * 0.42);
    target[offset + 1] = Math.round(value * 0.67);
    target[offset + 2] = value;
    target[offset + 3] = 255;
  },
};

// Change this one line to restore the exact grayscale/luminosity treatment.
export const activeFogTextPreset = chromaticFogText;
