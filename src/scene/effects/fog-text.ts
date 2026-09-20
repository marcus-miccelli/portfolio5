import { media } from "../../media";
import { fogPosition } from "../atmosphere/motion";
import { FOG } from "../config";
import type { FogTexture, SceneController } from "../types";
import { activeFogTextPreset } from "./fog-text-presets";

/** Presentation adapter: the menu consumes scene data, never controls the sky. */
export function attachFogText(
  nav: HTMLElement,
  scene: SceneController,
): () => void {
  if (
    !(
      CSS.supports("background-clip", "text") ||
      CSS.supports("-webkit-background-clip", "text")
    )
  ) {
    scene.markEffectsSettled();
    return () => {};
  }
  let disposeDesktop: (() => void) | undefined;
  const unsubscribeMobileEffects = media.subscribe(
    "mobileEffects",
    (mobile) => {
      if (mobile) {
        disposeDesktop?.();
        disposeDesktop = undefined;
        scene.markEffectsSettled();
      } else if (!disposeDesktop) {
        disposeDesktop = attachDesktopFogText(nav, scene);
      }
    },
  );
  return () => {
    unsubscribeMobileEffects();
    disposeDesktop?.();
    disposeDesktop = undefined;
  };
}

function attachDesktopFogText(
  nav: HTMLElement,
  scene: SceneController,
): () => void {
  const events = new AbortController();
  const preset = activeFogTextPreset;
  nav.style.setProperty("--fog-text-blend", preset.blendMode);
  nav.style.setProperty("--fog-text-opacity", String(preset.opacity));
  let field: FogTexture | undefined,
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
  const pendingUrls = new Set<string>();
  const revokePendingUrl = (url: string) => {
    if (pendingUrls.delete(url)) URL.revokeObjectURL(url);
  };
  const clearPendingUrls = () => {
    pendingUrls.forEach((url) => URL.revokeObjectURL(url));
    pendingUrls.clear();
  };
  const clearTexture = () => {
    field = undefined;
    if (textureUrl) URL.revokeObjectURL(textureUrl);
    textureUrl = undefined;
    nav.style.removeProperty("--fog-image");
    nav.style.removeProperty("--fog-size");
  };
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
  const reveal = (immediate = false) => {
    if (
      !presentationRevealed ||
      !field ||
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
        if (!disposed) nav.dataset.fogVisible = "true";
      });
    });
  };
  const renderTexture = async (next: FogTexture, version: number) => {
    let nextUrl: string | undefined;
    try {
      if (disposed || version !== textureVersion) return;
      nextUrl = URL.createObjectURL(next.blob);
      pendingUrls.add(nextUrl);
      const image = new Image();
      image.src = nextUrl;
      await image.decode();
      if (disposed || version !== textureVersion) {
        revokePendingUrl(nextUrl);
        return;
      }
      pendingUrls.delete(nextUrl);
      if (textureUrl) URL.revokeObjectURL(textureUrl);
      textureUrl = nextUrl;
      nextUrl = undefined;
      field = next;
      nav.style.setProperty("--fog-image", `url("${textureUrl}")`);
      nav.style.setProperty(
        "--fog-size",
        `${next.viewport.width * FOG.displayScale}px ${next.viewport.height * FOG.displayScale}px`,
      );
      align();
      position();
      scene.markEffectsSettled();
      reveal();
    } catch (error) {
      if (nextUrl) revokePendingUrl(nextUrl);
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
  const unsubscribeFog = scene.subscribeFog(
    (next) => {
      const version = ++textureVersion;
      clearPendingUrls();
      void renderTexture(next, version);
    },
    preset.raster,
  );
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
    clearPendingUrls();
    clearTexture();
    nav.style.removeProperty("--fog-x");
    nav.style.removeProperty("--fog-y");
    labels.forEach((label) => {
      label.style.removeProperty("--label-x");
      label.style.removeProperty("--label-y");
    });
    observer.disconnect();
    events.abort();
    unsubscribeFrame();
    unsubscribeFog();
    unsubscribePresentation();
  };
}
