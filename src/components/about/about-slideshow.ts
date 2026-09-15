const SLIDE_DURATION_MS = 5000;

export function attachAboutSlideshow(root: HTMLElement): () => void {
  const slides = [
    ...root.querySelectorAll<HTMLImageElement>("[data-about-slide]"),
  ];
  const caption = root.querySelector<HTMLElement>(
    "[data-about-slide-caption]",
  );
  if (!caption || slides.length === 0) return () => {};

  const panel = root.closest<HTMLElement>("[data-panel]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  const options = { signal: events.signal };
  let selected = Math.max(
    0,
    slides.findIndex((slide) => slide.classList.contains("is-active")),
  );
  let timeout = 0;

  const show = (index: number) => {
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

  const schedule = () => {
    stop();
    if (
      slides.length < 2 ||
      panel?.hidden ||
      document.hidden ||
      reducedMotion.matches
    )
      return;
    timeout = window.setTimeout(() => {
      show(selected + 1);
      schedule();
    }, SLIDE_DURATION_MS);
  };

  document.addEventListener("portfolio:viewchange", schedule, options);
  document.addEventListener("visibilitychange", schedule, options);
  reducedMotion.addEventListener("change", schedule, options);
  show(selected);
  schedule();

  return () => {
    stop();
    events.abort();
  };
}
