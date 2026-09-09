import type { FogField, Viewport } from "../types";
import type { FogResponse } from "./fog-types";

export function createFogField() {
  let worker: Worker | undefined;
  let requestId = 0;
  let active:
    | {
        id: number;
        viewport: Viewport;
        resolve: (field: FogField | null) => void;
      }
    | undefined;
  let queued: typeof active;
  let destroyed = false;
  let unavailable = false;

  const dispatch = (request: NonNullable<typeof active>) => {
    active = request;
    worker?.postMessage({ id: request.id, viewport: request.viewport });
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
      resolve({
        width: event.data.width,
        height: event.data.height,
        viewport: event.data.viewport,
        densities: new Float32Array(event.data.buffer),
      });
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
    resize(viewport: Viewport): Promise<FogField | null> {
      if (destroyed || unavailable) return Promise.resolve(null);
      if (!worker && !startWorker()) return Promise.resolve(null);
      return new Promise((resolve) => {
        const request = { id: ++requestId, viewport, resolve };
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
