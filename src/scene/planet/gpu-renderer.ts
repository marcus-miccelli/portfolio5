import { INITIAL_REVEAL_TIMEOUT_MS } from "../config";
import type { Artwork, Viewport } from "../types";
import type {
  PlanetComposition,
  PlanetWorkerInput,
  PlanetWorkerOutput,
} from "./gpu-types";

export interface GpuPlanetRenderer {
  ready: Promise<boolean>;
  failure: Promise<string>;
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
  let failed = false;
  let readyTimer = 0;
  let settle: ((ready: boolean) => void) | undefined;
  let settleFailure: ((reason: string) => void) | undefined;
  const ready = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  const failure = new Promise<string>((resolve) => {
    settleFailure = resolve;
  });
  const finish = (value: boolean) => {
    clearTimeout(readyTimer);
    readyTimer = 0;
    settle?.(value);
    settle = undefined;
  };
  const fail = (reason: string) => {
    if (disposed || failed) return;
    failed = true;
    console.warn(`GPU planet unavailable: ${reason}`);
    settleFailure?.(reason);
    settleFailure = undefined;
    finish(false);
  };
  worker.addEventListener(
    "error",
    (event) => fail(event.message || "The rendering worker failed"),
    { once: true },
  );
  worker.addEventListener(
    "messageerror",
    () => fail("The rendering worker sent an unreadable message"),
    { once: true },
  );
  worker.addEventListener("message", (event: MessageEvent<PlanetWorkerOutput>) => {
    if (event.data.type === "ready") finish(true);
    else if (event.data.type === "failed") fail(event.data.reason);
  });

  try {
    const offscreen = canvas.transferControlToOffscreen();
    const message: PlanetWorkerInput = {
      type: "initialize",
      canvas: offscreen,
      artwork,
    };
    worker.postMessage(message, [offscreen]);
    readyTimer = window.setTimeout(
      () => finish(false),
      INITIAL_REVEAL_TIMEOUT_MS,
    );
  } catch {
    worker.terminate();
    return null;
  }

  const post = (message: PlanetWorkerInput) => {
    if (!disposed) worker.postMessage(message);
  };
  return {
    ready,
    failure,
    render: (seconds) => post({ type: "frame", seconds }),
    resize: (viewport, composition) =>
      post({ type: "resize", viewport, composition }),
    destroy() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      finish(false);
      settleFailure = undefined;
    },
  };
}
