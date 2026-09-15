const MAX_TRAIL_POINTS = 38;
const RENDER_SCALE = 0.46;
const FADE_DELAY = 720;
const FADE_DURATION = 1700;

const vertexShaderSource = `#version 300 es
precision highp float;

const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

#define MAX_TRAIL_POINTS ${MAX_TRAIL_POINTS}

uniform vec2 uResolution;
uniform vec2 uTrail[MAX_TRAIL_POINTS];
uniform int uTrailCount;
uniform float uTime;
uniform float uOpacity;
out vec4 outputColor;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), local.x),
    local.y
  );
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8776, 0.4794, -0.4794, 0.8776);
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * noise(point);
    point = turn * point * 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 field = vec2(uv.x * aspect, uv.y);

  vec2 turbulence = vec2(
    fbm(field * 5.2 + vec2(uTime * 0.055, 1.7)),
    fbm(field * 5.2 + vec2(-2.4, uTime * 0.045))
  ) - 0.5;
  vec2 fineTurbulence = vec2(
    noise(field * 13.0 - uTime * 0.08),
    noise(field.yx * 15.0 + uTime * 0.065)
  ) - 0.5;

  float dye = 0.0;
  float bloom = 0.0;
  float wake = 0.0;
  for (int index = 0; index < MAX_TRAIL_POINTS; index++) {
    if (index >= uTrailCount) break;
    float age = float(index) / float(MAX_TRAIL_POINTS - 1);
    float strength = pow(1.0 - age, 1.45);
    vec2 point = vec2(uTrail[index].x * aspect, uTrail[index].y);
    vec2 offset = field - point;

    vec2 previous = point;
    if (index + 1 < uTrailCount)
      previous = vec2(uTrail[index + 1].x * aspect, uTrail[index + 1].y);
    vec2 motion = point - previous;
    vec2 normal = normalize(vec2(-motion.y, motion.x) + vec2(0.0001));
    float motionForce = min(length(motion) * 42.0, 1.0);

    vec2 warped = offset;
    warped += turbulence * (0.025 + age * 0.018);
    warped += fineTurbulence * 0.008;
    warped += normal * sin(age * 18.0 + uTime * 1.35) * motionForce * 0.012;

    float distanceSquared = dot(warped, warped);
    float core = exp(-distanceSquared * mix(1250.0, 620.0, age));
    float mist = exp(-distanceSquared * mix(260.0, 125.0, age));
    dye += core * strength * 0.28 + mist * strength * 0.048;
    bloom += exp(-distanceSquared * 58.0) * strength * 0.012;

    float curlBand = abs(length(warped) - (0.022 + motionForce * 0.018));
    wake += exp(-curlBand * 155.0) * motionForce * strength * 0.013;
  }

  float textureNoise = noise(gl_FragCoord.xy * 0.42 + uTime * 17.0) - 0.5;
  float alpha = clamp((dye + bloom + wake) * uOpacity, 0.0, 0.32);
  vec3 base = vec3(0.51, 0.69, 0.89);
  vec3 highlight = vec3(0.68, 0.80, 0.94);
  vec3 color = mix(base, highlight, clamp(dye * 1.8, 0.0, 1.0));
  color *= 0.88 + textureNoise * 0.045;
  outputColor = vec4(color * alpha, alpha);
}`;

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

export function attachPanelCursorTrail(): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = "panel-cursor-trail";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl) return () => {};

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );
  const program = gl.createProgram();
  if (!vertexShader || !fragmentShader || !program) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return () => {};
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return () => {};
  }

  const resolutionLocation = gl.getUniformLocation(program, "uResolution");
  const trailLocation = gl.getUniformLocation(program, "uTrail[0]");
  const trailCountLocation = gl.getUniformLocation(program, "uTrailCount");
  const timeLocation = gl.getUniformLocation(program, "uTime");
  const opacityLocation = gl.getUniformLocation(program, "uOpacity");
  const vertexArray = gl.createVertexArray();
  const events = new AbortController();
  const options = { signal: events.signal };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const compactViewport = matchMedia("(max-width: 600px)");
  const trail = new Float32Array(MAX_TRAIL_POINTS * 2);
  const target = { x: 0.5, y: 0.5 };
  const ghost = { x: 0.5, y: 0.5 };
  let trailCount = 0;
  let hasPointer = false;
  let lastMoveAt = 0;
  let lastFrameAt = 0;
  let startedAt = 0;
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
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const clear = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    trailCount = 0;
    hasPointer = false;
    lastFrameAt = 0;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  const pushTrailPoint = (x: number, y: number) => {
    const usedLength = Math.min(trailCount, MAX_TRAIL_POINTS - 1) * 2;
    trail.copyWithin(2, 0, usedLength);
    trail[0] = x;
    trail[1] = y;
    trailCount = Math.min(MAX_TRAIL_POINTS, trailCount + 1);
  };

  const draw = (now: number) => {
    frame = 0;
    const delta = Math.min(34, lastFrameAt ? now - lastFrameAt : 16.67);
    lastFrameAt = now;
    const pull = 1 - Math.pow(0.72, delta / 16.67);
    const previousX = ghost.x;
    const previousY = ghost.y;
    ghost.x += (target.x - ghost.x) * pull;
    ghost.y += (target.y - ghost.y) * pull;
    const distance = Math.hypot(ghost.x - previousX, ghost.y - previousY);
    if (now - lastMoveAt < 130 || distance > 0.00018)
      pushTrailPoint(ghost.x, ghost.y);

    const fadeProgress = Math.min(
      1,
      Math.max(0, (now - lastMoveAt - FADE_DELAY) / FADE_DURATION),
    );
    const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
    const opacity = Math.pow(1 - easedFade, 1.4);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform2fv(trailLocation, trail);
    gl.uniform1i(trailCountLocation, trailCount);
    gl.uniform1f(timeLocation, (now - startedAt) / 1000);
    gl.uniform1f(opacityLocation, opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (opacity > 0 && trailCount) frame = requestAnimationFrame(draw);
    else clear();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isEnabled() || event.pointerType === "touch") return;
    target.x = event.clientX / innerWidth;
    target.y = 1 - event.clientY / innerHeight;
    lastMoveAt = performance.now();
    if (!hasPointer) {
      ghost.x = target.x;
      ghost.y = target.y;
      startedAt = lastMoveAt;
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
    gl.bindVertexArray(null);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  };
}
