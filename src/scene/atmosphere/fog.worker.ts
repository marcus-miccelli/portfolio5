import { clearNoiseCache, density } from "./noise";
import { FOG, smooth } from "../config";
import type { FogRequest, FogResponse } from "./fog-types";

const MIN_FIELD_LONG_EDGE = 768;
const MAX_FIELD_LONG_EDGE = 1536;

interface WorkerScope {
  onmessage: ((event: MessageEvent<FogRequest>) => void) | null;
  postMessage(message: FogResponse): void;
}

function soften(
  source: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const horizontal = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      horizontal[row + x] =
        (source[row + Math.max(0, x - 1)] +
          2 * source[row + x] +
          source[row + Math.min(width - 1, x + 1)]) *
        0.25;
    }
  }
  for (let y = 0; y < height; y++) {
    const previous = Math.max(0, y - 1) * width;
    const row = y * width;
    const next = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++)
      source[row + x] =
        (horizontal[previous + x] +
          2 * horizontal[row + x] +
          horizontal[next + x]) *
        0.25;
  }
  return source;
}

const scope = self as unknown as WorkerScope;
scope.onmessage = ({ data: { id, viewport, raster } }) => {
  void (async () => {
    const aspect = viewport.width / viewport.height;
    const displayLongEdge =
      Math.max(viewport.width, viewport.height) * FOG.displayScale;
    const densityScale = Math.min(2, viewport.pixelRatio) / 3;
    const desiredLongEdge =
      Math.round((displayLongEdge * densityScale) / 64) * 64;
    const longEdge = Math.max(
      MIN_FIELD_LONG_EDGE,
      Math.min(MAX_FIELD_LONG_EDGE, desiredLongEdge),
    );
    const width = Math.max(192, Math.round(longEdge * Math.min(1, aspect)));
    const height = Math.max(192, Math.round(longEdge / Math.max(1, aspect)));
    const generated = new Float32Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        generated[y * width + x] = density(x / width, y / height, aspect);
    clearNoiseCache();
    const densities = soften(generated, width, height);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Worker fog rasterizing is unavailable");
    const pixels = context.createImageData(width, height);
    for (let index = 0; index < densities.length; index++) {
      const value = Math.round(
        raster.brightnessBase -
          raster.brightnessRange *
            smooth(
              (densities[index] - raster.densityOffset) / raster.densityRange,
            ),
      );
      const offset = index * 4;
      pixels.data[offset] = Math.round(value * raster.color[0]);
      pixels.data[offset + 1] = Math.round(value * raster.color[1]);
      pixels.data[offset + 2] = Math.round(value * raster.color[2]);
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    scope.postMessage({ type: "ready", id, viewport, blob });
  })().catch((error) => {
    scope.postMessage({
      type: "failed",
      id,
      viewport,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
  });
};
