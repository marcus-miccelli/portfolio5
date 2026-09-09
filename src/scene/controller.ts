import { artworkFromElement } from "./artwork";
import { createClock } from "./clock";
import { MOTION } from "./config";
import { compose } from "./layout";
import { createGeometry } from "./planet/geometry";
import { createGpuPlanetRenderer } from "./planet/gpu-renderer";
import { createTextRenderer } from "./planet/text-renderer";
import { createFogField } from "./atmosphere/fog-field";
import {
  createPresentationReveal,
  sceneTransitionDuration,
} from "./presentation";
import type {
  FogField,
  SceneController,
  SceneFrame,
  SceneMode,
  ScenePresentation,
  Viewport,
} from "./types";

export function createScene(host: HTMLElement): SceneController {
  const required = <T extends Element>(selector: string): T => {
    const element = host.querySelector<T>(selector);
    if (!element) throw new Error(`Missing scene element: ${selector}`);
    return element;
  };
  const pre = required<HTMLPreElement>(".planet");
  const planetCanvas = required<HTMLCanvasElement>("[data-planet-render]");
  const universe = required<HTMLElement>(".universe");
  const fog = createFogField();
  const cancellation = new AbortController();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobileEffects = matchMedia("(max-width: 600px)");
  const frameListeners = new Set<(frame: SceneFrame) => void>();
  const fogListeners = new Set<(field: FogField) => void>();
  const presentationListeners = new Set<(state: ScenePresentation) => void>();
  let field: FogField | null = null;
  let requestedFogViewport: Viewport | null = null;
  let fogRequestVersion = 0;
  let frame: SceneFrame = {
    seconds: 0,
    hue: 0,
    mode: reducedMotion.matches ? "paused" : "playing",
  };
  let presentationState: ScenePresentation = {
    revealed: false,
    moving: false,
  };
  let viewport: Viewport = { width: 0, height: 0, pixelRatio: 1 };
  let renderPlanet: ((seconds: number) => void) | undefined;
  let resizePlanet:
    | ((viewport: Viewport, composition: ReturnType<typeof compose>) => void)
    | undefined;
  let destroyPlanet: (() => void) | undefined;
  let hueTransitionTimer = 0;
  let hueTransitionActive = false;
  let hueTransitionNeedsTarget = false;
  let preserveRenderedFrameInSource = false;
  let userMode: "playing" | "paused" = "playing";
  let beforeSource: "playing" | "paused" = reducedMotion.matches
    ? "paused"
    : "playing";
  const sameViewport = (a: Viewport, b: Viewport) =>
    a.width === b.width &&
    a.height === b.height &&
    a.pixelRatio === b.pixelRatio;
  const applyHue = (hue: number) => {
    universe.style.filter = hue === 0 ? "none" : `hue-rotate(${hue}deg)`;
    document.documentElement.style.setProperty("--scene-hue", `${hue}deg`);
  };
  function paint(seconds: number, mode: SceneMode) {
    const hue = ((seconds % MOTION.hueSeconds) / MOTION.hueSeconds) * 360;
    frame = { seconds, mode, hue };
    if (mode !== "source" || !preserveRenderedFrameInSource)
      renderPlanet?.(seconds);
    if (!hueTransitionActive || hueTransitionNeedsTarget) {
      applyHue(hue);
      hueTransitionNeedsTarget = false;
    }
    host.dataset.mode = mode;
    frameListeners.forEach((listener) => listener(frame));
  }
  const clock = createClock(paint, frame.mode);
  const publishPresentation = (next: Partial<ScenePresentation>) => {
    presentationState = { ...presentationState, ...next };
    presentationListeners.forEach((listener) => listener(presentationState));
  };
  const presentation = createPresentationReveal({
    host,
    effectsSettled:
      document.body.dataset.composition !== "landing" || mobileEffects.matches,
    reducedMotion,
    startReveal() {
      publishPresentation({ revealed: true });
    },
    startMotion() {
      clock.start();
      publishPresentation({ moving: true });
    },
  });
  const beginHueTransition = () => {
    clearTimeout(hueTransitionTimer);
    hueTransitionTimer = 0;
    hueTransitionActive = true;
    hueTransitionNeedsTarget = true;
    host.dataset.hueTransition = "true";
    document.documentElement.dataset.sceneHueTransition = "true";
    void universe.offsetWidth;
  };
  const finishHueTransition = () => {
    hueTransitionTimer = window.setTimeout(() => {
      hueTransitionTimer = 0;
      if (cancellation.signal.aborted) return;
      hueTransitionActive = false;
      delete host.dataset.hueTransition;
      delete document.documentElement.dataset.sceneHueTransition;
      applyHue(frame.hue);
    }, sceneTransitionDuration(reducedMotion));
  };
  const setSceneMode = (mode: SceneMode) => {
    const transitionHue =
      mode !== clock.mode && (mode === "source" || clock.mode === "source");
    if (transitionHue) beginHueTransition();
    clock.setMode(mode);
    if (transitionHue) finishHueTransition();
  };
  function requestFog() {
    if (
      cancellation.signal.aborted ||
      mobileEffects.matches ||
      fogListeners.size === 0
    )
      return;
    const requestedViewport = viewport;
    if (
      requestedFogViewport &&
      sameViewport(requestedFogViewport, requestedViewport)
    )
      return;
    requestedFogViewport = requestedViewport;
    const requestVersion = ++fogRequestVersion;
    void fog.resize(requestedViewport).then((nextField) => {
      if (cancellation.signal.aborted) return;
      const isLatest = requestVersion === fogRequestVersion;
      if (isLatest) requestedFogViewport = null;
      if (!nextField) {
        if (isLatest) presentation.markEffectsSettled();
        return;
      }
      if (
        !isLatest ||
        mobileEffects.matches ||
        fogListeners.size === 0 ||
        !sameViewport(nextField.viewport, viewport)
      )
        return;
      field = nextField;
      fogListeners.forEach((listener) => listener(nextField));
    });
  }
  function resize(next: Viewport) {
    if (cancellation.signal.aborted || !next.width || !next.height) return;
    if (sameViewport(next, viewport)) return;
    viewport = next;
    if (field && !sameViewport(field.viewport, viewport)) field = null;
    const composition = compose(viewport);
    pre.style.transform = `translate(${composition.sourceX}px,${composition.sourceY}px) scale(${composition.scale})`;
    resizePlanet?.(viewport, composition);
    requestFog();
    paint(clock.seconds, clock.mode);
  }
  const measure = () =>
    resize({
      width: host.clientWidth,
      height: host.clientHeight,
      pixelRatio: window.devicePixelRatio || 1,
    });
  const observer = new ResizeObserver(measure);
  observer.observe(host);
  window.addEventListener("resize", measure, { signal: cancellation.signal });
  document.addEventListener(
    "visibilitychange",
    () => clock.setSuspended(document.hidden),
    { signal: cancellation.signal },
  );
  reducedMotion.addEventListener(
    "change",
    (event) => {
      const nextMode = event.matches ? "paused" : userMode;
      if (clock.mode === "source") beforeSource = nextMode;
      else setSceneMode(nextMode);
    },
    { signal: cancellation.signal },
  );
  mobileEffects.addEventListener(
    "change",
    (event) => {
      field = null;
      requestedFogViewport = null;
      fogRequestVersion++;
      if (event.matches) {
        presentation.markEffectsSettled();
      } else requestFog();
    },
    { signal: cancellation.signal },
  );
  measure();
  // The static HTML is already usable; animation enhances that same DOM in place.
  void (async () => {
    try {
      const { artwork, spans } = artworkFromElement(pre);
      const gpu = createGpuPlanetRenderer(planetCanvas, artwork);
      if (gpu) {
        renderPlanet = gpu.render;
        resizePlanet = gpu.resize;
        destroyPlanet = gpu.destroy;
        if (viewport.width && viewport.height)
          gpu.resize(viewport, compose(viewport));
        gpu.render(clock.seconds);
        if (await gpu.ready) {
          if (cancellation.signal.aborted) {
            gpu.destroy();
            return;
          }
          host.dataset.planetRenderer = "gpu";
          host.dataset.ready = "true";
          preserveRenderedFrameInSource = true;
          presentation.markRendererReady();
          return;
        }
        gpu.destroy();
        renderPlanet = undefined;
        resizePlanet = undefined;
        destroyPlanet = undefined;
      }

      await document.fonts.load('32px "Recovered Planet"');
      if (cancellation.signal.aborted) return;
      const geometry = createGeometry(artwork);
      const render = createTextRenderer(
        spans,
        geometry.cells,
        geometry.animated,
      );
      renderPlanet = (seconds) => render(geometry.frame(seconds));
      host.dataset.planetRenderer = "text";
      host.dataset.ready = "true";
      preserveRenderedFrameInSource = false;
      presentation.markRendererReady();
    } catch (error) {
      if (cancellation.signal.aborted) return;
      host.dataset.ready = "failed";
      clock.setMode("paused");
      host.dispatchEvent(new CustomEvent("scene:error", { bubbles: true }));
      console.error(
        "The static artwork is available, but animation could not start.",
        error,
      );
    }
  })();
  return {
    setMode(mode) {
      if (cancellation.signal.aborted) return;
      if (mode === "source" && clock.mode !== "source")
        beforeSource = clock.mode;
      else if (mode !== "source") {
        userMode = mode;
        beforeSource = mode;
      }
      setSceneMode(mode);
    },
    markEffectsSettled() {
      presentation.markEffectsSettled();
    },
    restoreOrbit() {
      if (!cancellation.signal.aborted) setSceneMode(beforeSource);
    },
    getMode: () => clock.mode,
    refresh() {
      if (!cancellation.signal.aborted) paint(clock.seconds, clock.mode);
    },
    resize,
    subscribeFrame(listener) {
      frameListeners.add(listener);
      listener(frame);
      return () => {
        frameListeners.delete(listener);
      };
    },
    subscribeFog(listener) {
      fogListeners.add(listener);
      if (field) listener(field);
      else requestFog();
      return () => {
        fogListeners.delete(listener);
      };
    },
    subscribePresentation(listener) {
      presentationListeners.add(listener);
      listener(presentationState);
      return () => {
        presentationListeners.delete(listener);
      };
    },
    destroy() {
      cancellation.abort();
      clearTimeout(hueTransitionTimer);
      presentation.destroy();
      delete host.dataset.ready;
      delete host.dataset.mode;
      delete host.dataset.planetRenderer;
      delete host.dataset.hueTransition;
      delete document.documentElement.dataset.sceneHueTransition;
      observer.disconnect();
      clock.destroy();
      fog.destroy();
      destroyPlanet?.();
      renderPlanet = undefined;
      resizePlanet = undefined;
      destroyPlanet = undefined;
      preserveRenderedFrameInSource = false;
      frameListeners.clear();
      fogListeners.clear();
      presentationListeners.clear();
      universe.style.filter = "none";
      document.documentElement.style.removeProperty("--scene-hue");
    },
  };
}
