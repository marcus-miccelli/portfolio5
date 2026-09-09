import type { FogRaster, Viewport } from "../types";

export interface FogRequest {
  id: number;
  viewport: Viewport;
  raster: FogRaster;
}

export type FogResponse =
  | {
      type: "ready";
      id: number;
      viewport: Viewport;
      blob: Blob;
    }
  | {
      type: "failed";
      id: number;
      viewport: Viewport;
      reason: string;
    };
