import { media } from "../../media";

export function attachProjectScrollbar(layout: HTMLElement): () => void {
  const panel = layout.closest<HTMLElement>("[data-panel=projects]");
  const controls = layout.querySelector<HTMLElement>("[data-project-scrollbar]");
  const rail = controls?.querySelector<HTMLElement>("[data-project-scrollbar-track]");
  const thumb = rail?.querySelector<HTMLElement>(".project-scrollbar__thumb");
  if (!panel || !controls || !rail || !thumb) return () => {};
  const arrows = [...controls.querySelectorAll<HTMLButtonElement>("[data-scroll-direction]")];

  const events = new AbortController();
  const options = { signal: events.signal };
  let available = media.matches("projectScrollbar");
  let frame = 0;
  let drag: { pointer: number; offset: number } | null = null;
  let travel = 0;
  let maximum = 0;

  const stopDrag = () => {
    const pointer = drag?.pointer;
    drag = null;
    delete rail.dataset.dragging;
    if (pointer !== undefined && rail.hasPointerCapture(pointer))
      rail.releasePointerCapture(pointer);
  };
  const update = () => {
    frame = 0;
    maximum = Math.max(0, panel.scrollHeight - panel.clientHeight);
    controls.hidden = !available || panel.hidden || maximum <= 1;
    if (controls.hidden) {
      stopDrag();
      return;
    }
    const trackHeight = rail.clientHeight;
    const minimum = Number.parseFloat(
      getComputedStyle(thumb).getPropertyValue("--project-thumb-min-height"),
    ) || 0;
    const height = Math.min(
      trackHeight,
      Math.max(minimum, (panel.clientHeight / panel.scrollHeight) * trackHeight),
    );
    travel = trackHeight - height;
    const progress = Math.max(0, Math.min(1, panel.scrollTop / maximum));
    thumb.style.height = `${height}px`;
    thumb.style.transform = `translateY(${progress * travel}px)`;
    rail.setAttribute("aria-valuemax", String(Math.round(maximum)));
    rail.setAttribute("aria-valuenow", String(Math.round(progress * maximum)));
    arrows.forEach((arrow) => {
      arrow.disabled = Number(arrow.dataset.scrollDirection) < 0
        ? panel.scrollTop <= 1
        : panel.scrollTop >= maximum - 1;
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const seek = (clientY: number, offset: number) => {
    if (travel <= 0) return;
    const position = clientY - rail.getBoundingClientRect().top - offset;
    panel.scrollTop = Math.max(0, Math.min(1, position / travel)) * maximum;
    schedule();
  };

  arrows.forEach((arrow) => {
    arrow.addEventListener("click", () => {
      panel.scrollBy({
        top: Number(arrow.dataset.scrollDirection) * panel.clientHeight * 0.35,
        behavior: media.matches("reducedMotion") ? "auto" : "smooth",
      });
      schedule();
    }, options);
  });

  rail.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    rail.focus({ preventScroll: true });
    const rect = thumb.getBoundingClientRect();
    const insideThumb = event.clientY >= rect.top && event.clientY <= rect.bottom;
    const offset = insideThumb ? event.clientY - rect.top : rect.height / 2;
    drag = { pointer: event.pointerId, offset };
    rail.setPointerCapture(event.pointerId);
    rail.dataset.dragging = "true";
    if (!insideThumb) seek(event.clientY, offset);
  }, options);
  rail.addEventListener("pointermove", (event) => {
    if (drag?.pointer === event.pointerId) seek(event.clientY, drag.offset);
  }, options);
  rail.addEventListener("pointerup", stopDrag, options);
  rail.addEventListener("pointercancel", stopDrag, options);
  rail.addEventListener("lostpointercapture", stopDrag, options);
  rail.addEventListener("keydown", (event) => {
    let next: number;
    switch (event.key) {
      case "ArrowUp":
        next = panel.scrollTop - 48;
        break;
      case "ArrowDown":
        next = panel.scrollTop + 48;
        break;
      case "PageUp":
        next = panel.scrollTop - panel.clientHeight;
        break;
      case "PageDown":
        next = panel.scrollTop + panel.clientHeight;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = maximum;
        break;
      default:
        return;
    }
    event.preventDefault();
    panel.scrollTop = next;
    schedule();
  }, options);
  panel.addEventListener("scroll", schedule, { ...options, passive: true });
  document.addEventListener("portfolio:viewchange", schedule, options);
  const observer = new ResizeObserver(schedule);
  observer.observe(panel);
  observer.observe(layout);
  const unsubscribe = media.subscribe("projectScrollbar", (matches) => {
    available = matches;
    schedule();
  });
  panel.dataset.scrollbarReady = "true";
  schedule();

  return () => {
    stopDrag();
    events.abort();
    observer.disconnect();
    unsubscribe();
    cancelAnimationFrame(frame);
    controls.hidden = true;
    arrows.forEach((arrow) => { arrow.disabled = false; });
    thumb.style.removeProperty("height");
    thumb.style.removeProperty("transform");
    rail.setAttribute("aria-valuemax", "0");
    rail.setAttribute("aria-valuenow", "0");
    delete panel.dataset.scrollbarReady;
  };
}
