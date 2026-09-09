import { MOTION } from "./config";
import type { SceneMode } from "./types";

/** The only animation loop. UI state never ticks at the animation frame rate. */
export function createClock(
  paint: (seconds: number, mode: SceneMode) => void,
  initialMode: SceneMode,
) {
  let mode = initialMode,
    elapsed = 0,
    request = 0;
  let previous: number | null = null,
    lastPaint = -Infinity,
    suspended = document.hidden;
  let disposed = false,
    started = false;
  function cancel() {
    cancelAnimationFrame(request);
    request = 0;
    previous = null;
  }
  function tick(now: number) {
    request = 0;
    if (disposed || mode !== "playing" || suspended) return;
    if (previous !== null) elapsed += Math.min(100, now - previous) / 1000;
    previous = now;
    if (now - lastPaint >= 1000 / MOTION.fps) {
      paint(elapsed, mode);
      lastPaint = now;
    }
    request = requestAnimationFrame(tick);
  }
  function schedule() {
    cancel();
    if (started && !disposed && mode === "playing" && !suspended)
      request = requestAnimationFrame(tick);
  }
  return {
    get mode() {
      return mode;
    },
    get seconds() {
      return mode === "source" ? 0 : elapsed;
    },
    start() {
      started = true;
      paint(mode === "source" ? 0 : elapsed, mode);
      schedule();
    },
    setMode(next: SceneMode) {
      if (disposed) return;
      mode = next;
      paint(mode === "source" ? 0 : elapsed, mode);
      schedule();
    },
    setSuspended(value: boolean) {
      suspended = value;
      schedule();
    },
    destroy() {
      disposed = true;
      cancel();
    },
  };
}
