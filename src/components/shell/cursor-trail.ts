import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const TRAIL_LENGTH = 30;
const INERTIA = 0.5;
const GRAIN_INTENSITY = 0.05;
const BLOOM_STRENGTH = 0.055;
const BLOOM_RADIUS = 1;
const BLOOM_THRESHOLD = 0.025;
const BRIGHTNESS = 0.9;
const MAX_DEVICE_PIXEL_RATIO = 0.5;
const TARGET_PIXELS = 1_300_000;
const FADE_DELAY = 1000;
const FADE_DURATION = 1500;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float iTime;
  uniform vec3 iResolution;
  uniform vec2 iMouse;
  uniform vec2 iPrevMouse[MAX_TRAIL_LENGTH];
  uniform float iOpacity;
  uniform float iScale;
  uniform vec3 iBaseColor;
  uniform float iBrightness;
  uniform float iEdgeIntensity;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f *= f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  vec3 tint1(vec3 base) { return mix(base, vec3(1.0), 0.04); }
  vec3 tint2(vec3 base) { return mix(base, vec3(0.8, 0.9, 1.0), 0.08); }

  vec4 blob(vec2 p, vec2 mousePosition, float intensity, float activity) {
    vec2 local = p - mousePosition;
    vec2 q = vec2(
      fbm(local * iScale + iTime * 0.1),
      fbm(local * iScale + vec2(5.2, 1.3) + iTime * 0.1)
    );
    vec2 r = vec2(
      fbm(local * iScale + q * 1.5 + iTime * 0.15),
      fbm(local * iScale + q * 1.5 + vec2(8.3, 2.8) + iTime * 0.15)
    );
    float smoke = fbm(local * iScale + r * 0.8);
    float radius = 0.34 + 0.18 * (1.0 / iScale);
    float distanceFactor = 1.0 - smoothstep(
      0.0,
      radius * activity,
      length(local)
    );
    float alpha = pow(smoke, 2.5) * distanceFactor;
    vec3 color = mix(
      tint1(iBaseColor),
      tint2(iBaseColor),
      sin(iTime * 0.5) * 0.5 + 0.5
    );
    return vec4(color * alpha * intensity, alpha * intensity);
  }

  void main() {
    vec2 aspect = vec2(iResolution.x / iResolution.y, 1.0);
    vec2 uv = (gl_FragCoord.xy / iResolution.xy * 2.0 - 1.0) * aspect;
    vec2 mouse = (iMouse * 2.0 - 1.0) * aspect;
    vec3 color = vec3(0.0);
    float alpha = 0.0;

    vec4 head = blob(uv, mouse, 0.72, iOpacity);
    color += head.rgb;
    alpha += head.a;

    for (int i = 0; i < MAX_TRAIL_LENGTH; i++) {
      vec2 previous = (iPrevMouse[i] * 2.0 - 1.0) * aspect;
      float strength = 1.0 - float(i) / float(MAX_TRAIL_LENGTH);
      strength = pow(strength, 2.4);
      if (strength > 0.01) {
        vec4 trail = blob(uv, previous, strength * 0.34, iOpacity);
        color += trail.rgb;
        alpha += trail.a;
      }
    }

    color *= iBrightness;
    vec2 uv01 = gl_FragCoord.xy / iResolution.xy;
    float edgeDistance = min(
      min(uv01.x, 1.0 - uv01.x),
      min(uv01.y, 1.0 - uv01.y)
    );
    float edgeMask = mix(
      1.0 - clamp(iEdgeIntensity, 0.0, 1.0),
      1.0,
      clamp(edgeDistance * 2.0, 0.0, 1.0)
    );
    float outputAlpha = clamp(alpha * iOpacity * edgeMask, 0.0, 1.0);
    gl_FragColor = vec4(color, outputAlpha);
  }
`;

const filmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    iTime: { value: 0 },
    intensity: { value: GRAIN_INTENSITY },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float iTime;
    uniform float intensity;
    varying vec2 vUv;
    float hash1(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float grain = hash1(vUv.x * 1000.0 + vUv.y * 2000.0 + iTime);
      color.rgb += (grain * 2.0 - 1.0) * intensity * color.rgb;
      gl_FragColor = color;
    }
  `,
};

const unpremultiplyShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: filmGrainShader.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float coverage = clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0);
      vec3 straight = coverage > 0.00001 ? color.rgb / coverage : vec3(0.0);
      gl_FragColor = vec4(clamp(straight, 0.0, 1.0), coverage);
    }
  `,
};

export function attachPanelCursorTrail(): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = "panel-cursor-trail";
  canvas.setAttribute("aria-hidden", "true");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });
  } catch {
    return () => {};
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const trail = Array.from(
    { length: TRAIL_LENGTH },
    () => new THREE.Vector2(0.5, 0.5),
  );
  const material = new THREE.ShaderMaterial({
    defines: { MAX_TRAIL_LENGTH: TRAIL_LENGTH },
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      iMouse: { value: new THREE.Vector2(0.5, 0.5) },
      iPrevMouse: { value: trail.map((point) => point.clone()) },
      iOpacity: { value: 0 },
      iScale: { value: 1 },
      iBaseColor: { value: new THREE.Vector3(0.51, 0.69, 0.89) },
      iBrightness: { value: BRIGHTNESS },
      iEdgeIntensity: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(geometry, material));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloom);
  const film = new ShaderPass(filmGrainShader);
  composer.addPass(film);
  composer.addPass(new ShaderPass(unpremultiplyShader));

  const events = new AbortController();
  const options = { signal: events.signal };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const compactViewport = matchMedia("(max-width: 600px)");
  const currentMouse = new THREE.Vector2(0.5, 0.5);
  const velocity = new THREE.Vector2();
  let head = 0;
  let frame = 0;
  let running = false;
  let hasPointer = false;
  let lastMoveAt = 0;
  const startedAt = performance.now();

  const isEnabled = () => {
    const view = document.body.dataset.view;
    return (
      !document.hidden &&
      !reducedMotion.matches &&
      !compactViewport.matches &&
      (view === "about" || view === "projects")
    );
  };

  const resetTrail = (point: THREE.Vector2) => {
    trail.forEach((entry) => entry.copy(point));
    const shaderTrail = material.uniforms.iPrevMouse.value as THREE.Vector2[];
    shaderTrail.forEach((entry) => entry.copy(point));
    material.uniforms.iMouse.value.copy(point);
    velocity.set(0, 0);
    head = 0;
  };

  const resize = () => {
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    const deviceRatio = Math.min(devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const requestedPixels = width * height * deviceRatio * deviceRatio;
    const budgetScale =
      requestedPixels <= TARGET_PIXELS
        ? 1
        : Math.max(0.5, Math.sqrt(TARGET_PIXELS / requestedPixels));
    const pixelRatio = deviceRatio * budgetScale;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    const pixelWidth = Math.max(1, Math.floor(width * pixelRatio));
    const pixelHeight = Math.max(1, Math.floor(height * pixelRatio));
    material.uniforms.iResolution.value.set(pixelWidth, pixelHeight, 1);
    material.uniforms.iScale.value = Math.max(
      0.5,
      Math.min(2, Math.min(width, height) / 600),
    );
    bloom.setSize(pixelWidth, pixelHeight);
  };

  const clear = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    running = false;
    material.uniforms.iOpacity.value = 0;
    renderer.setRenderTarget(null);
    renderer.clear();
  };

  const animate = (now: number) => {
    if (!running || !isEnabled()) {
      clear();
      return;
    }

    const idleFor = now - lastMoveAt;
    const pointerMoving = idleFor < 80;
    const mouse = material.uniforms.iMouse.value as THREE.Vector2;
    if (pointerMoving) {
      velocity.set(currentMouse.x - mouse.x, currentMouse.y - mouse.y);
      mouse.copy(currentMouse);
    } else {
      velocity.multiplyScalar(INERTIA);
      if (velocity.lengthSq() > 0.000001) mouse.add(velocity);
    }

    head = (head + 1) % TRAIL_LENGTH;
    trail[head].copy(mouse);
    const shaderTrail = material.uniforms.iPrevMouse.value as THREE.Vector2[];
    for (let index = 0; index < TRAIL_LENGTH; index += 1) {
      const source = (head - index + TRAIL_LENGTH) % TRAIL_LENGTH;
      shaderTrail[index].copy(trail[source]);
    }

    const fadeProgress = Math.min(
      1,
      Math.max(0, (idleFor - FADE_DELAY) / FADE_DURATION),
    );
    const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
    material.uniforms.iOpacity.value = Math.pow(1 - easedFade, 1.25);
    material.uniforms.iTime.value = (now - startedAt) / 1000;
    film.uniforms.iTime.value = material.uniforms.iTime.value;
    composer.render();

    if (fadeProgress >= 1) {
      clear();
      return;
    }
    frame = requestAnimationFrame(animate);
  };

  const ensureRunning = () => {
    if (running) return;
    running = true;
    frame = requestAnimationFrame(animate);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isEnabled() || event.pointerType === "touch") return;
    currentMouse.set(event.clientX / innerWidth, 1 - event.clientY / innerHeight);
    lastMoveAt = performance.now();
    if (!hasPointer || material.uniforms.iOpacity.value <= 0.001) {
      resetTrail(currentMouse);
      hasPointer = true;
    }
    ensureRunning();
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
  document.addEventListener("visibilitychange", onAvailabilityChange, options);
  reducedMotion.addEventListener("change", onAvailabilityChange, options);
  compactViewport.addEventListener("change", onAvailabilityChange, options);

  return () => {
    clear();
    events.abort();
    scene.clear();
    geometry.dispose();
    material.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
