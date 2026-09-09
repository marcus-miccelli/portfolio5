import type { SceneController, SceneMode } from "../../scene/types";
export function attachControls(
  root: HTMLElement,
  scene: SceneController,
): () => void {
  const motion = root.querySelector<HTMLButtonElement>("[data-motion]")!;
  const source = root.querySelector<HTMLButtonElement>("[data-source]")!;
  const events = new AbortController();
  let displayed: SceneMode | undefined;
  root.hidden = false;
  const unsubscribe = scene.subscribeFrame(({ mode }) => {
    if (displayed === mode) return;
    displayed = mode;
    motion.textContent = mode === "playing" ? "Pause" : "Play";
    source.textContent = mode === "source" ? "Back to orbit" : "Source frame";
  });
  motion.addEventListener(
    "click",
    () => scene.setMode(scene.getMode() === "playing" ? "paused" : "playing"),
    { signal: events.signal },
  );
  source.addEventListener(
    "click",
    () => {
      if (scene.getMode() === "source") scene.restoreOrbit();
      else scene.setMode("source");
    },
    { signal: events.signal },
  );
  return () => {
    events.abort();
    unsubscribe();
  };
}
