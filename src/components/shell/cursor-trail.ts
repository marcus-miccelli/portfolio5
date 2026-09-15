interface TrailSample {
  x: number;
  y: number;
  width: number;
  opacity: number;
  phase: number;
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
const MAX_WISPS = 48;
const FADE_DELAY = 620;
const FADE_DURATION = 1500;

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
        velocityX: ghost.velocityX * 0.2 + side * (0.4 + spread),
        velocityY: ghost.velocityY * 0.2 - side * (0.4 + spread),
        radius: 2.5 + Math.random() * 4 + spread * 2,
        age: 0,
        lifetime: 820 + Math.random() * 680,
        curl: side * (0.012 + Math.random() * 0.012),
      });
    }
    if (wisps.length > MAX_WISPS)
      wisps.splice(0, wisps.length - MAX_WISPS);
  };

  const update = (now: number, delta: number) => {
    const pull = 1 - Math.pow(0.68, delta / 16.67);
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
        phase: Math.random() * Math.PI * 2,
      });
      if (trail.length > MAX_TRAIL_SAMPLES) trail.shift();
      if (speed > 1.25) addWisps(speed);
    }

    trail.forEach((sample) => {
      sample.opacity *= Math.pow(0.985, delta / 16.67);
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
      context.lineWidth = head.width * [3.2, 1.6, 0.42][pass];
      const gradient = context.createLinearGradient(
        trail[0].x,
        trail[0].y,
        head.x,
        head.y,
      );
      const opacity = [0.014, 0.045, 0.14][pass] * masterOpacity;
      const color = pass === 2 ? "174 204 238" : "130 175 227";
      gradient.addColorStop(0, `rgb(${color} / 0)`);
      gradient.addColorStop(0.58, `rgb(${color} / ${opacity * 0.35})`);
      gradient.addColorStop(1, `rgb(${color} / ${opacity})`);
      context.strokeStyle = gradient;
      context.shadowColor = `rgb(130 175 227 / ${0.12 * masterOpacity})`;
      context.shadowBlur = [26, 16, 7][pass];
      context.stroke();
    }
  };

  const drawMist = (now: number, masterOpacity: number) => {
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < trail.length; index += 2) {
      const sample = trail[index];
      const tail = index / Math.max(1, trail.length - 1);
      const drift = Math.sin(now * 0.0018 + sample.phase) * 4;
      const radius = sample.width * (2.5 + tail * 1.5);
      const gradient = context.createRadialGradient(
        sample.x + drift,
        sample.y - drift * 0.45,
        0,
        sample.x + drift,
        sample.y - drift * 0.45,
        radius,
      );
      const opacity = sample.opacity * masterOpacity * (0.018 + tail * 0.018);
      gradient.addColorStop(0, `rgb(130 175 227 / ${opacity})`);
      gradient.addColorStop(0.42, `rgb(130 175 227 / ${opacity * 0.42})`);
      gradient.addColorStop(1, "rgb(130 175 227 / 0)");
      context.fillStyle = gradient;
      context.fillRect(
        sample.x + drift - radius,
        sample.y - drift * 0.45 - radius,
        radius * 2,
        radius * 2,
      );
    }
  };

  const drawGhostHead = (masterOpacity: number) => {
    const radius = 24;
    const gradient = context.createRadialGradient(
      ghost.x,
      ghost.y,
      0,
      ghost.x,
      ghost.y,
      radius,
    );
    gradient.addColorStop(
      0,
      `rgb(174 204 238 / ${0.085 * masterOpacity})`,
    );
    gradient.addColorStop(
      0.22,
      `rgb(130 175 227 / ${0.055 * masterOpacity})`,
    );
    gradient.addColorStop(1, "rgb(130 175 227 / 0)");
    context.fillStyle = gradient;
    context.fillRect(ghost.x - radius, ghost.y - radius, radius * 2, radius * 2);
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
      context.strokeStyle = `rgb(130 175 227 / ${alpha * 0.045})`;
      context.lineWidth = 1.2;
      context.shadowColor = `rgb(130 175 227 / ${alpha * 0.09})`;
      context.shadowBlur = 14;
      context.stroke();
    });
  };

  const draw = (now: number) => {
    frame = 0;
    const delta = Math.min(32, lastFrameAt ? now - lastFrameAt : 16.67);
    lastFrameAt = now;
    const idleFor = now - lastMoveAt;
    const fadeProgress = Math.min(
      1,
      Math.max(0, (idleFor - FADE_DELAY) / FADE_DURATION),
    );
    const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
    const masterOpacity = Math.pow(1 - easedFade, 1.35);

    update(now, delta);
    context.clearRect(0, 0, innerWidth, innerHeight);
    drawMist(now, masterOpacity);
    drawRibbon(masterOpacity);
    drawWisps(masterOpacity);
    drawGhostHead(masterOpacity);

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
