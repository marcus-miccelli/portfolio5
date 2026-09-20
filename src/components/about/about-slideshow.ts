import { media } from "../../media";

const SLIDE_DURATION_MS = 5000;

interface AboutSlide {
  src: string;
  alt: string;
  width: number;
  height: number;
}

function isAboutSlide(value: unknown): value is AboutSlide {
  if (!value || typeof value !== "object") return false;
  const slide = value as Record<string, unknown>;
  return (
    typeof slide.src === "string" &&
    typeof slide.alt === "string" &&
    typeof slide.width === "number" &&
    Number.isInteger(slide.width) &&
    slide.width > 0 &&
    typeof slide.height === "number" &&
    Number.isInteger(slide.height) &&
    slide.height > 0
  );
}

function slidesFrom(template: HTMLTemplateElement): AboutSlide[] {
  try {
    const value: unknown = JSON.parse(template.dataset.slides ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isAboutSlide);
  } catch {
    return [];
  }
}

export function attachAboutSlideshow(
  template: HTMLTemplateElement,
): () => void {
  const authoredSlides = slidesFrom(template);
  if (authoredSlides.length === 0) return () => {};

  const panel = template.closest<HTMLElement>("[data-panel]");
  const events = new AbortController();
  const options = { signal: events.signal };
  let available = media.matches("aboutSlideshow");
  let reducedMotion = media.matches("reducedMotion");
  let root: HTMLElement | undefined;
  let slides: HTMLImageElement[] = [];
  let caption: HTMLElement | undefined;
  let selected = 0;
  let timeout = 0;

  const show = (index: number) => {
    if (!caption || slides.length === 0) return;
    selected = index % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === selected;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });
    caption.textContent = slides[selected].alt;
  };

  const stop = () => {
    window.clearTimeout(timeout);
    timeout = 0;
  };

  const mount = () => {
    if (root) return;
    const figure = document.createElement("figure");
    figure.className = "about-slideshow";
    figure.setAttribute("aria-label", "About me photo slideshow");

    const stage = document.createElement("div");
    stage.className = "about-slideshow__stage";
    slides = authoredSlides.map((slide, index) => {
      const image = document.createElement("img");
      image.className = "about-slideshow__image";
      image.src = slide.src;
      image.width = slide.width;
      image.height = slide.height;
      image.alt = slide.alt;
      image.loading = "lazy";
      image.decoding = "async";
      const active = index === selected;
      image.classList.toggle("is-active", active);
      image.setAttribute("aria-hidden", String(!active));
      stage.append(image);
      return image;
    });

    caption = document.createElement("figcaption");
    caption.textContent = authoredSlides[selected].alt;
    figure.append(stage, caption);
    template.before(figure);
    root = figure;
  };

  const unmount = () => {
    stop();
    root?.remove();
    root = undefined;
    slides = [];
    caption = undefined;
  };

  const schedule = () => {
    stop();
    if (
      !root ||
      slides.length < 2 ||
      panel?.hidden ||
      document.hidden ||
      reducedMotion
    )
      return;
    timeout = window.setTimeout(() => {
      show(selected + 1);
      schedule();
    }, SLIDE_DURATION_MS);
  };

  const syncMount = () => {
    if (available && panel && !panel.hidden) mount();
    else unmount();
    schedule();
  };

  document.addEventListener("portfolio:viewchange", syncMount, options);
  document.addEventListener("visibilitychange", schedule, options);
  const unsubscribeAvailability = media.subscribe(
    "aboutSlideshow",
    (matches) => {
      available = matches;
      syncMount();
    },
  );
  const unsubscribeReducedMotion = media.subscribe(
    "reducedMotion",
    (matches) => {
      reducedMotion = matches;
      schedule();
    },
  );

  return () => {
    events.abort();
    unsubscribeAvailability();
    unsubscribeReducedMotion();
    unmount();
  };
}
