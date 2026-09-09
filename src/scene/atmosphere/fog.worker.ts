import { clearNoiseCache, density } from "./noise";
import { FOG } from "../config";
import type { FogRequest, FogResponse } from "./fog-types";

const MIN_FIELD_LONG_EDGE = 768;
const MAX_FIELD_LONG_EDGE = 1536;

interface WorkerScope {
  onmessage: ((event: MessageEvent<FogRequest>) => void) | null;
  postMessage(message: FogResponse, transfer: Transferable[]): void;
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
scope.onmessage = ({ data: { id, viewport } }) => {
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
  const buffer = densities.buffer as ArrayBuffer;
  scope.postMessage({ id, width, height, viewport, buffer }, [buffer]);
};
