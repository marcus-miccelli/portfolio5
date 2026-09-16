import type { SceneController } from "../../scene/types";

export function attachPanelPreloads(
  root: HTMLElement,
  scene: SceneController,
): () => void {
  const events = new AbortController();
  const images = [
    ...root.querySelectorAll<HTMLImageElement>("[data-preload] img[src]"),
  ].map((image) => ({
    image,
    loading: image.getAttribute("loading"),
    fetchPriority: image.getAttribute("fetchpriority"),
  }));
  let pageLoaded = document.readyState === "complete";
  let presentationComplete = false;
  let started = false;
  let disposed = false;

  const preload = () => {
    if (disposed || started || !pageLoaded || !presentationComplete) return;
    started = true;
    images.forEach(({ image }) => {
      image.fetchPriority = "low";
      image.loading = "eager";
      if (typeof image.decode === "function")
        void image.decode().catch(() => {});
    });
  };

  if (!pageLoaded)
    window.addEventListener(
      "load",
      () => {
        pageLoaded = true;
        preload();
      },
      { once: true, signal: events.signal },
    );

  const unsubscribePresentation = scene.subscribePresentation((state) => {
    presentationComplete = state.moving;
    preload();
  });

  return () => {
    disposed = true;
    events.abort();
    unsubscribePresentation();
    images.forEach(({ image, loading, fetchPriority }) => {
      if (loading === null) image.removeAttribute("loading");
      else image.setAttribute("loading", loading);
      if (fetchPriority === null) image.removeAttribute("fetchpriority");
      else image.setAttribute("fetchpriority", fetchPriority);
    });
  };
}
