import type { Artwork, Viewport } from "../types";

export interface PlanetComposition {
  scale: number;
  sourceX: number;
  sourceY: number;
}

export type PlanetWorkerInput =
  | {
      type: "initialize";
      canvas: OffscreenCanvas;
      artwork: Artwork;
    }
  | {
      type: "resize";
      viewport: Viewport;
      composition: PlanetComposition;
    }
  | { type: "frame"; seconds: number };

export type PlanetWorkerOutput =
  | { type: "ready" }
  | { type: "failed"; reason: string };
