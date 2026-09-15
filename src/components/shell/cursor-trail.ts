interface TrailPoint {
  x: number;
  y: number;
  bornAt: number;
}

const TRAIL_LIFETIME = 520;
const MAX_POINTS = 14;
const MIN_POINT_DISTANCE = 5;

export function attachPanelCursorTrail(): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = "panel-cursor-trail";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const events = new AbortController();
  const options = { signal: events.signal };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const compactViewport = matchMedia("(max-width: 600px)");
  const points: TrailPoint[] = [];
  let frame = 0;
  let pixelRatio = 1;

  const isEnabled = () => {
    const view = document.body.dataset.view;
    return (
      !reducedMotion.matches &&
      !compactViewport.matches &&
      (view === "about" || view === "projects")
    );
  };

  const resize = () => {
    pixelRatio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(innerWidth * pixelRatio);
    canvas.height = Math.round(innerHeight * pixelRatio);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const clear = () => {
    points.length = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
  };

  const draw = (now: number) => {
    frame = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
    while (points.length && now - points[0].bornAt >= TRAIL_LIFETIME)
      points.shift();

    points.forEach((point) => {
      const progress = (now - point.bornAt) / TRAIL_LIFETIME;
      const opacity = Math.max(0, 1 - progress);
      const radius = 1.4 + opacity * 2.2;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fillStyle = `rgb(130 175 227 / ${opacity * 0.34})`;
      context.shadowColor = `rgb(130 175 227 / ${opacity * 0.55})`;
      context.shadowBlur = 7;
      context.fill();
    });

    if (points.length) frame = requestAnimationFrame(draw);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isEnabled() || event.pointerType === "touch") return;
    const previous = points.at(-1);
    if (
      previous &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
        MIN_POINT_DISTANCE
    )
      return;
    points.push({
      x: event.clientX,
      y: event.clientY,
      bornAt: performance.now(),
    });
    if (points.length > MAX_POINTS) points.shift();
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const onAvailabilityChange = () => {
    if (!isEnabled()) clear();
  };

  document.body.append(canvas);
  resize();
  window.addEventListener("resize", resize, options);
  window.addEventListener("pointermove", onPointerMove, options);
  document.addEventListener(
    "portfolio:viewchange",
    onAvailabilityChange,
    options,
  );
  reducedMotion.addEventListener("change", onAvailabilityChange, options);
  compactViewport.addEventListener("change", onAvailabilityChange, options);

  return () => {
    clear();
    events.abort();
    canvas.remove();
  };
}
