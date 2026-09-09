import type { Artwork, Viewport } from "../types";
import type {
  PlanetComposition,
  PlanetWorkerInput,
  PlanetWorkerOutput,
} from "./gpu-types";

export interface GpuPlanetRenderer {
  ready: Promise<boolean>;
  render(seconds: number): void;
  resize(viewport: Viewport, composition: PlanetComposition): void;
  destroy(): void;
}

export function createGpuPlanetRenderer(
  canvas: HTMLCanvasElement,
  artwork: Artwork,
): GpuPlanetRenderer | null {
  if (!("transferControlToOffscreen" in canvas) || !("Worker" in window))
    return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL("./planet.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
  let disposed = false;
  let settle: ((ready: boolean) => void) | undefined;
  const ready = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  const finish = (value: boolean) => {
    settle?.(value);
    settle = undefined;
  };
  const fail = () => finish(false);
  worker.addEventListener("error", fail, { once: true });
  worker.addEventListener("messageerror", fail, { once: true });
  worker.addEventListener("message", (event: MessageEvent<PlanetWorkerOutput>) => {
    if (event.data.type === "ready") finish(true);
    else if (event.data.type === "failed") {
      console.warn(`GPU planet unavailable: ${event.data.reason}`);
      finish(false);
    }
  });

  try {
    const offscreen = canvas.transferControlToOffscreen();
    const message: PlanetWorkerInput = {
      type: "initialize",
      canvas: offscreen,
      artwork,
    };
    worker.postMessage(message, [offscreen]);
  } catch {
    worker.terminate();
    return null;
  }

  const post = (message: PlanetWorkerInput) => {
    if (!disposed) worker.postMessage(message);
  };
  return {
    ready,
    render: (seconds) => post({ type: "frame", seconds }),
    resize: (viewport, composition) =>
      post({ type: "resize", viewport, composition }),
    destroy() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      finish(false);
    },
  };
}
