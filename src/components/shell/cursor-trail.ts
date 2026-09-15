interface TrailSample {
  x: number;
  y: number;
  width: number;
  opacity: number;
}

interface Wisp {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  age: number;
  lifetime: number;
  curl: number;
}

const RENDER_SCALE = 0.55;
const MAX_TRAIL_SAMPLES = 34;
const MAX_WISPS = 42;
const FADE_DELAY = 420;
const FADE_DURATION = 1050;

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
  const trail: TrailSample[] = [];
  const wisps: Wisp[] = [];
  const pointer = { x: 0, y: 0 };
  const ghost = { x: 0, y: 0, velocityX: 0, velocityY: 0 };
  let hasPointer = false;
  let lastMoveAt = 0;
  let lastFrameAt = 0;
  let frame = 0;

  const isEnabled = () => {
    const view = document.body.dataset.view;
    return (
      !reducedMotion.matches &&
      !compactViewport.matches &&
      (view === "about" || view === "projects")
    );
  };

  const resize = () => {
    canvas.width = Math.max(1, Math.round(innerWidth * RENDER_SCALE));
    canvas.height = Math.max(1, Math.round(innerHeight * RENDER_SCALE));
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  };

  const clear = () => {
    trail.length = 0;
    wisps.length = 0;
    hasPointer = false;
    lastFrameAt = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
  };

  const addWisps = (speed: number) => {
    const count = Math.min(4, Math.max(1, Math.round(speed / 13)));
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 ? 1 : -1;
      const spread = Math.min(1, speed / 32);
      wisps.push({
        x: ghost.x,
        y: ghost.y,
        velocityX: ghost.velocityX * 0.14 + side * (0.25 + spread),
        velocityY: ghost.velocityY * 0.14 - side * (0.25 + spread),
        radius: 2.5 + Math.random() * 4 + spread * 2,
        age: 0,
        lifetime: 620 + Math.random() * 520,
        curl: side * (0.012 + Math.random() * 0.012),
      });
    }
    if (wisps.length > MAX_WISPS)
      wisps.splice(0, wisps.length - MAX_WISPS);
  };

  const update = (now: number, delta: number) => {
    const pull = 1 - Math.pow(0.48, delta / 16.67);
    const previousX = ghost.x;
    const previousY = ghost.y;
    ghost.x += (pointer.x - ghost.x) * pull;
    ghost.y += (pointer.y - ghost.y) * pull;
    ghost.velocityX = ghost.x - previousX;
    ghost.velocityY = ghost.y - previousY;
    const speed = Math.hypot(ghost.velocityX, ghost.velocityY);

    if (now - lastMoveAt < 110 || speed > 0.18) {
      trail.push({
        x: ghost.x,
        y: ghost.y,
        width: Math.min(15, 5 + speed * 0.36),
        opacity: 1,
      });
      if (trail.length > MAX_TRAIL_SAMPLES) trail.shift();
      if (speed > 1.25) addWisps(speed);
    }

    trail.forEach((sample) => {
      sample.opacity *= Math.pow(0.958, delta / 16.67);
    });
    while (trail.length && trail[0].opacity < 0.025) trail.shift();

    wisps.forEach((wisp) => {
      wisp.age += delta;
      const angle = wisp.curl * delta;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const velocityX = wisp.velocityX * cosine - wisp.velocityY * sine;
      wisp.velocityY =
        (wisp.velocityX * sine + wisp.velocityY * cosine) * 0.985;
      wisp.velocityX = velocityX * 0.985;
      wisp.x += wisp.velocityX * (delta / 16.67);
      wisp.y += wisp.velocityY * (delta / 16.67);
      wisp.radius += delta * 0.004;
    });
    while (wisps.length && wisps[0].age >= wisps[0].lifetime) wisps.shift();
  };

  const drawRibbon = (masterOpacity: number) => {
    if (trail.length < 2) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalCompositeOperation = "lighter";

    for (let pass = 0; pass < 3; pass += 1) {
      context.beginPath();
      context.moveTo(trail[0].x, trail[0].y);
      for (let index = 1; index < trail.length - 1; index += 1) {
        const current = trail[index];
        const next = trail[index + 1];
        context.quadraticCurveTo(
          current.x,
          current.y,
          (current.x + next.x) / 2,
          (current.y + next.y) / 2,
        );
      }
      const head = trail.at(-1)!;
      context.lineTo(head.x, head.y);
      context.lineWidth = head.width * [2.5, 1.15, 0.34][pass];
      const gradient = context.createLinearGradient(
        trail[0].x,
        trail[0].y,
        head.x,
        head.y,
      );
      const opacity = [0.035, 0.12, 0.42][pass] * masterOpacity;
      const color = pass === 2 ? "215 232 255" : "130 175 227";
      gradient.addColorStop(0, `rgb(${color} / 0)`);
      gradient.addColorStop(0.58, `rgb(${color} / ${opacity * 0.35})`);
      gradient.addColorStop(1, `rgb(${color} / ${opacity})`);
      context.strokeStyle = gradient;
      context.shadowColor = `rgb(130 175 227 / ${0.3 * masterOpacity})`;
      context.shadowBlur = [18, 10, 4][pass];
      context.stroke();
    }
  };

  const drawWisps = (masterOpacity: number) => {
    context.globalCompositeOperation = "lighter";
    wisps.forEach((wisp) => {
      const life = 1 - wisp.age / wisp.lifetime;
      const alpha = life * masterOpacity;
      const rotation = wisp.age * 0.006 * Math.sign(wisp.curl);
      context.beginPath();
      context.arc(
        wisp.x,
        wisp.y,
        wisp.radius,
        rotation,
        rotation + Math.sign(wisp.curl) * 1.7,
        wisp.curl < 0,
      );
      context.strokeStyle = `rgb(130 175 227 / ${alpha * 0.13})`;
      context.lineWidth = 1.2;
      context.shadowColor = `rgb(130 175 227 / ${alpha * 0.25})`;
      context.shadowBlur = 9;
      context.stroke();
    });
  };

  const draw = (now: number) => {
    frame = 0;
    const delta = Math.min(32, lastFrameAt ? now - lastFrameAt : 16.67);
    lastFrameAt = now;
    const idleFor = now - lastMoveAt;
    const masterOpacity =
      idleFor <= FADE_DELAY
        ? 1
        : Math.max(0, 1 - (idleFor - FADE_DELAY) / FADE_DURATION);

    update(now, delta);
    context.clearRect(0, 0, innerWidth, innerHeight);
    drawRibbon(masterOpacity);
    drawWisps(masterOpacity);

    if (masterOpacity > 0 && (trail.length || wisps.length))
      frame = requestAnimationFrame(draw);
    else clear();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isEnabled() || event.pointerType === "touch") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    lastMoveAt = performance.now();
    if (!hasPointer) {
      ghost.x = pointer.x;
      ghost.y = pointer.y;
      hasPointer = true;
    }
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
