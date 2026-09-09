import type { FogRaster, FogTexture, Viewport } from "../types";
import type { FogResponse } from "./fog-types";

export function createFogField() {
  let worker: Worker | undefined;
  let requestId = 0;
  let active:
    | {
        id: number;
        viewport: Viewport;
        raster: FogRaster;
        resolve: (texture: FogTexture | null) => void;
      }
    | undefined;
  let queued: typeof active;
  let destroyed = false;
  let unavailable = false;

  const dispatch = (request: NonNullable<typeof active>) => {
    active = request;
    worker?.postMessage({
      id: request.id,
      viewport: request.viewport,
      raster: request.raster,
    });
  };
  const startWorker = () => {
    try {
      worker = new Worker(new URL("./fog.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      unavailable = true;
      return false;
    }
    worker.addEventListener("message", (event: MessageEvent<FogResponse>) => {
      if (!active || event.data.id !== active.id || destroyed) return;
      const { resolve } = active;
      active = undefined;
      if (event.data.type === "ready") {
        resolve({
          blob: event.data.blob,
          viewport: event.data.viewport,
        });
      } else {
        console.warn(`Navigation fog unavailable: ${event.data.reason}`);
        unavailable = true;
        resolve(null);
        queued?.resolve(null);
        queued = undefined;
        worker?.terminate();
        worker = undefined;
      }
      if (queued) {
        const next = queued;
        queued = undefined;
        dispatch(next);
      }
    });
    const fail = () => {
      unavailable = true;
      active?.resolve(null);
      queued?.resolve(null);
      active = undefined;
      queued = undefined;
      worker?.terminate();
      worker = undefined;
    };
    worker.addEventListener("error", fail);
    worker.addEventListener("messageerror", fail);
    return true;
  };

  return {
    resize(viewport: Viewport, raster: FogRaster): Promise<FogTexture | null> {
      if (destroyed || unavailable) return Promise.resolve(null);
      if (!worker && !startWorker()) return Promise.resolve(null);
      return new Promise((resolve) => {
        const request = { id: ++requestId, viewport, raster, resolve };
        if (active) {
          queued?.resolve(null);
          queued = request;
        } else dispatch(request);
      });
    },
    destroy() {
      destroyed = true;
      active?.resolve(null);
      queued?.resolve(null);
      active = undefined;
      queued = undefined;
      worker?.terminate();
      worker = undefined;
    },
  };
}
