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
  let destroyed = false;

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
        motionTimer = window.setTimeout(() => {
          motionTimer = 0;
          if (!destroyed) startMotion();
        }, sceneTransitionDuration(reducedMotion));
        startReveal();
      });
    });
  };

  return {
    markRendererReady() {
      rendererReady = true;
      reveal();
    },
    markEffectsSettled() {
      effectsSettled = true;
      reveal();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(revealFrame);
      clearTimeout(motionTimer);
      delete host.dataset.planetVisible;
    },
  };
}
