import { INITIAL_REVEAL_TIMEOUT_MS } from "./config";

interface PresentationRevealOptions {
  host: HTMLElement;
  effectsSettled: boolean;
  reducedMotion: MediaQueryList;
  startReveal(): void;
  startMotion(): void;
}

export function sceneTransitionDuration(reducedMotion: MediaQueryList): number {
  if (reducedMotion.matches) return 0;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--scene-reveal-duration")
    .trim();
  const duration = Number.parseFloat(value);
  if (!Number.isFinite(duration)) return 0;
  return value.endsWith("ms") ? duration : duration * 1000;
}

export function createPresentationReveal({
  host,
  effectsSettled: initiallySettled,
  reducedMotion,
  startReveal,
  startMotion,
}: PresentationRevealOptions) {
  let rendererReady = false;
  let effectsSettled = initiallySettled;
  let revealFrame = 0;
  let motionTimer = 0;
  let effectsTimer = 0;
  let motionStarted = false;
  let destroyed = false;

  const beginMotion = () => {
    if (destroyed || motionStarted) return;
    motionStarted = true;
    clearTimeout(motionTimer);
    motionTimer = 0;
    startMotion();
  };

  const onReducedMotionChange = (event: MediaQueryListEvent) => {
    if (event.matches && motionTimer) beginMotion();
  };
  reducedMotion.addEventListener("change", onReducedMotionChange);

  const reveal = () => {
    if (
      destroyed ||
      !rendererReady ||
      !effectsSettled ||
      revealFrame ||
      host.dataset.planetVisible === "true"
    )
      return;
    revealFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        revealFrame = 0;
        if (destroyed) return;
        host.dataset.planetVisible = "true";
        motionTimer = window.setTimeout(
          beginMotion,
          sceneTransitionDuration(reducedMotion),
        );
        startReveal();
      });
    });
  };

  if (!effectsSettled)
    effectsTimer = window.setTimeout(() => {
      effectsTimer = 0;
      effectsSettled = true;
      reveal();
    }, INITIAL_REVEAL_TIMEOUT_MS);

  return {
    markRendererReady() {
      rendererReady = true;
      reveal();
    },
    markEffectsSettled() {
      effectsSettled = true;
      clearTimeout(effectsTimer);
      effectsTimer = 0;
      reveal();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(revealFrame);
      clearTimeout(motionTimer);
      clearTimeout(effectsTimer);
      reducedMotion.removeEventListener("change", onReducedMotionChange);
      delete host.dataset.planetVisible;
    },
  };
}
