export type SceneMode = "playing" | "paused" | "source";

/** CSS viewport pixels, never physical display pixels or artwork coordinates. */
export interface Viewport {
  width: number;
  height: number;
  pixelRatio: number;
}
export interface Artwork {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  rows: string[];
  colors: string[][];
  variants: number[][];
}
export interface Cell {
  index: number;
  row: number;
  column: number;
  char: string;
  color: string;
  variant: number;
  kind: "surface" | "ring" | "fixed";
  /** Normalized sphere coordinates. */
  x: number;
  y: number;
  z: number;
  ringAngle: number;
  ringRadius: number;
}
export interface FogField {
  densities: Float32Array;
  width: number;
  height: number;
  viewport: Viewport;
}
export interface SceneFrame {
  seconds: number;
  hue: number;
  mode: SceneMode;
}
export interface ScenePresentation {
  revealed: boolean;
  moving: boolean;
}
export interface SceneController {
  setMode(mode: SceneMode): void;
  markEffectsSettled(): void;
  restoreOrbit(): void;
  getMode(): SceneMode;
  refresh(): void;
  resize(viewport: Viewport): void;
  subscribeFrame(listener: (frame: SceneFrame) => void): () => void;
  subscribeFog(listener: (field: FogField) => void): () => void;
  subscribePresentation(
    listener: (state: ScenePresentation) => void,
  ): () => void;
  destroy(): void;
}
