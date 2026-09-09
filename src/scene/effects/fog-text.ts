import { fogPosition } from "../atmosphere/motion";
import { FOG } from "../config";
import type { FogField, SceneController } from "../types";
import { activeFogTextPreset } from "./fog-text-presets";

/** Presentation adapter: the menu consumes scene data, never controls the sky. */
export function attachFogText(
  nav: HTMLElement,
  scene: SceneController,
): () => void {
  const mobileEffects = matchMedia("(max-width: 600px)");
  if (
    !(
      CSS.supports("background-clip", "text") ||
      CSS.supports("-webkit-background-clip", "text")
    )
  ) {
    scene.markEffectsSettled();
    return () => {};
  }
  const canvas = document.createElement("canvas"),
    context = canvas.getContext("2d");
  if (!context) {
    scene.markEffectsSettled();
    return () => {};
  }
  const events = new AbortController();
  const preset = activeFogTextPreset;
  nav.style.setProperty("--fog-text-blend", preset.blendMode);
  nav.style.setProperty("--fog-text-opacity", String(preset.opacity));
  let field: FogField | undefined,
    seconds = 0,
    sampledAt = performance.now();
  let mode = scene.getMode(),
    animationFrame = 0,
    alignmentFrame = 0,
    revealFrame = 0,
    textureVersion = 0;
  let textureUrl: string | undefined,
    disposed = false,
    presentationRevealed = false,
    presentationMoving = false;
  const labels = [...nav.querySelectorAll<HTMLElement>(".nav-label")];
  const align = () => {
    if (disposed) return;
    labels.forEach((label) => {
      const bounds = label.getBoundingClientRect();
      label.style.setProperty("--label-x", `${bounds.x}px`);
      label.style.setProperty("--label-y", `${bounds.y}px`);
    });
  };
  let alignUntil = 0;
  const animateAlignment = (now: number) => {
    alignmentFrame = 0;
    if (disposed || !field) return;
    align();
    if (now < alignUntil)
      alignmentFrame = requestAnimationFrame(animateAlignment);
  };
  const refreshAlignment = () => {
    if (!field) return;
    alignUntil = performance.now() + 170;
    if (!alignmentFrame)
      alignmentFrame = requestAnimationFrame(animateAlignment);
  };
  const position = (atSeconds = seconds) => {
    if (!field) return;
    const [x, y] = fogPosition(atSeconds, field.viewport);
    nav.style.setProperty("--fog-x", `${x - field.viewport.width * 0.32}px`);
    nav.style.setProperty("--fog-y", `${y - field.viewport.height * 0.32}px`);
  };
  const yieldForTexture = () =>
    new Promise<void>((resolve) => {
      if ("requestIdleCallback" in window)
        window.requestIdleCallback(() => resolve(), { timeout: 32 });
      else window.setTimeout(resolve, 0);
    });
  const reveal = (immediate = false) => {
    if (
      !presentationRevealed ||
      !field ||
      mobileEffects.matches ||
      nav.dataset.fogVisible === "true"
    )
      return;
    cancelAnimationFrame(revealFrame);
    if (immediate) {
      revealFrame = 0;
      nav.dataset.fogVisible = "true";
      return;
    }
    revealFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        revealFrame = 0;
        if (!disposed && !mobileEffects.matches)
          nav.dataset.fogVisible = "true";
      });
    });
  };
  const renderTexture = async (next: FogField, version: number) => {
    try {
      canvas.width = next.width;
      canvas.height = next.height;
      const pixels = context.createImageData(next.width, next.height);
      for (let i = 0; i < next.densities.length; i++) {
        const offset = i * 4;
        preset.writePixel(pixels.data, offset, next.densities[i]);
        if ((i & 16383) === 16383) {
          await yieldForTexture();
          if (disposed || version !== textureVersion) return;
        }
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (disposed || version !== textureVersion || mobileEffects.matches)
        return;
      if (!blob) {
        scene.markEffectsSettled();
        return;
      }
      canvas.width = 1;
      canvas.height = 1;
      const nextUrl = URL.createObjectURL(blob);
      if (textureUrl) URL.revokeObjectURL(textureUrl);
      textureUrl = nextUrl;
      field = next;
      nav.style.setProperty("--fog-image", `url("${nextUrl}")`);
      nav.style.setProperty(
        "--fog-size",
        `${next.viewport.width * FOG.displayScale}px ${next.viewport.height * FOG.displayScale}px`,
      );
      align();
      position();
      scene.markEffectsSettled();
      reveal();
    } catch (error) {
      if (disposed || version !== textureVersion) return;
      console.warn("Navigation fog unavailable", error);
      scene.markEffectsSettled();
    }
  };
  const animate = (now: number) => {
    animationFrame = 0;
    if (disposed || mode !== "playing" || document.body.dataset.view !== "menu")
      return;
    const interpolated = seconds + (now - sampledAt) / 1000;
    position(interpolated);
    animationFrame = requestAnimationFrame(animate);
  };
  const syncAnimation = () => {
    const shouldAnimate =
      presentationMoving &&
      !mobileEffects.matches &&
      mode === "playing" &&
      document.body.dataset.view === "menu";
    if (shouldAnimate) {
      if (!animationFrame) animationFrame = requestAnimationFrame(animate);
    } else if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    if (mode !== "playing" && document.body.dataset.view === "menu") position();
  };
  const unsubscribeFog = scene.subscribeFog((next) => {
    const version = ++textureVersion;
    void renderTexture(next, version);
  });
  const unsubscribeFrame = scene.subscribeFrame((frame) => {
    if (frame.mode !== "source") seconds = frame.seconds;
    sampledAt = performance.now();
    mode = frame.mode;
    syncAnimation();
  });
  document.addEventListener("portfolio:viewchange", syncAnimation, {
    signal: events.signal,
  });
  const unsubscribePresentation = scene.subscribePresentation((state) => {
    const startsReveal = state.revealed && !presentationRevealed;
    presentationRevealed = state.revealed;
    presentationMoving = state.moving;
    if (startsReveal) reveal(true);
    syncAnimation();
  });
  nav.addEventListener("navigation:motion", refreshAlignment, {
    signal: events.signal,
  });
  mobileEffects.addEventListener(
    "change",
    () => {
      if (mobileEffects.matches) {
        cancelAnimationFrame(revealFrame);
        revealFrame = 0;
        field = undefined;
        delete nav.dataset.fogVisible;
      }
      syncAnimation();
    },
    { signal: events.signal },
  );
  syncAnimation();
  const observer = new ResizeObserver(align);
  labels.forEach((label) => observer.observe(label));
  window.addEventListener("resize", align, { signal: events.signal });
  document.fonts.ready.then(align);
  return () => {
    disposed = true;
    textureVersion++;
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(alignmentFrame);
    cancelAnimationFrame(revealFrame);
    delete nav.dataset.fogVisible;
    nav.style.removeProperty("--fog-text-blend");
    nav.style.removeProperty("--fog-text-opacity");
    nav.style.removeProperty("--fog-image");
    nav.style.removeProperty("--fog-size");
    nav.style.removeProperty("--fog-x");
    nav.style.removeProperty("--fog-y");
    labels.forEach((label) => {
      label.style.removeProperty("--label-x");
      label.style.removeProperty("--label-y");
    });
    if (textureUrl) URL.revokeObjectURL(textureUrl);
    observer.disconnect();
    events.abort();
    unsubscribeFrame();
    unsubscribeFog();
    unsubscribePresentation();
  };
}
