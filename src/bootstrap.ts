import "./scene/element";
import type { OrbitScene } from "./scene/element";
import { attachAboutSlideshow } from "./components/about/about-slideshow";
import { attachFogText } from "./scene/effects/fog-text";
import {
  attachEscapeHome,
  attachNavigation,
} from "./components/navigation/navigation";
import { attachControls } from "./components/scene/controls";
import { attachGallery } from "./components/gallery/gallery";
import { attachSocialIsland } from "./components/social/social-island";
import { attachPanelPreloads } from "./components/shell/panel-preloads";
import { attachPortfolioShell } from "./components/shell/shell";
import { attachProjectFilters } from "./components/project-card/project-filters";

function mountPage(): () => void {
  const disposers: (() => void)[] = [];
  const events = new AbortController();
  document.addEventListener("scene:error", showSceneError, {
    signal: events.signal,
  });
  disposers.push(() => events.abort());
  const scene = document.querySelector<OrbitScene>("orbit-scene")?.controller;
  const nav = document.querySelector<HTMLElement>(".primary-nav");
  const homeLink = document.querySelector<HTMLAnchorElement>(
    ".panel-back:not([data-shell-back])",
  );
  const shell = document.querySelector<HTMLElement>("[data-portfolio-shell]");
  const shellBack =
    document.querySelector<HTMLButtonElement>("[data-shell-back]");
  const controls = document.querySelector<HTMLElement>(".scene-controls");
  const socialIsland = document.querySelector<HTMLElement>(".social-island");
  const projectFilters = document.querySelector<HTMLElement>(
    "[data-project-filters]",
  );
  const aboutSlideshow = document.querySelector<HTMLTemplateElement>(
    "[data-about-slideshow]",
  );
  try {
    scene?.refresh();
    if (nav) {
      disposers.push(attachNavigation(nav));
      if (scene && document.body.dataset.composition === "landing")
        disposers.push(attachFogText(nav, scene));
    }
    if (homeLink) disposers.push(attachEscapeHome(homeLink));
    if (shell && nav && shellBack)
      disposers.push(attachPortfolioShell(shell, nav, shellBack));
    if (aboutSlideshow)
      disposers.push(attachAboutSlideshow(aboutSlideshow));
    if (shell && scene) disposers.push(attachPanelPreloads(shell, scene));
    if (socialIsland) disposers.push(attachSocialIsland(socialIsland));
    if (projectFilters) disposers.push(attachProjectFilters(projectFilters));
    if (scene && controls) disposers.push(attachControls(controls, scene));
    const gallery = document.querySelector<HTMLElement>("[data-gallery]");
    if (gallery) disposers.push(attachGallery(gallery));
    if (
      document.querySelector("orbit-scene")?.getAttribute("data-ready") ===
      "failed"
    )
      showSceneError();
  } catch (error) {
    [...disposers].reverse().forEach((dispose) => dispose());
    throw error;
  }
  return () => {
    [...disposers].reverse().forEach((dispose) => dispose());
  };
}
function showSceneError() {
  const status = document.querySelector<HTMLElement>(".scene-status");
  if (status)
    status.textContent =
      "Animation is unavailable. The static artwork and pages are still available.";
  document
    .querySelectorAll<HTMLButtonElement>(".scene-controls button")
    .forEach((button) => {
      button.disabled = true;
    });
}
const cleanup = mountPage();
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup();
  });
}
