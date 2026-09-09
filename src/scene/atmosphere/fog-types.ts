import type { Viewport } from "../types";

export interface FogRequest {
  id: number;
  viewport: Viewport;
}

export interface FogResponse extends FogRequest {
  width: number;
  height: number;
  buffer: ArrayBuffer;
}
