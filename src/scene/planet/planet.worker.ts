import { createGeometry } from "./geometry";
import {
  createStarfield,
  MAX_STARS,
  starRandom,
  twinkleAt,
  type Star,
} from "./starfield";
import type {
  PlanetComposition,
  PlanetWorkerInput,
  PlanetWorkerOutput,
} from "./gpu-types";
import type { Cell, Viewport } from "../types";
import { ART } from "../config";

const ATLAS_COLUMNS = 10;
const ATLAS_ROWS = 7;
const BASE_GLYPHS = ".:-=+*#%@";
const CELL_WIDTH = ART.cell.width;
const CELL_HEIGHT = ART.cell.height;
const APPEARANCE_STRIDE = 6;
const STAR_COLOR = [192, 207, 225] as const;
const TWINKLE_COLOR = [228, 242, 255] as const;

const burst = [
  {
    column: 0,
    row: 0,
    glyph: "+",
    strength: 0.78,
    delay: 0,
    span: 1,
  },
  {
    column: 0,
    row: 0,
    glyph: "*",
    strength: 1,
    delay: 0.12,
    span: 0.76,
  },
  {
    column: -1,
    row: 0,
    glyph: "-",
    strength: 0.82,
    delay: 0.08,
    span: 0.84,
  },
  {
    column: 1,
    row: 0,
    glyph: "-",
    strength: 0.82,
    delay: 0.08,
    span: 0.84,
  },
  {
    column: 0,
    row: -0.72,
    glyph: ":",
    strength: 0.82,
    delay: 0.08,
    span: 0.84,
  },
  {
    column: 0,
    row: 0.72,
    glyph: ":",
    strength: 0.82,
    delay: 0.08,
    span: 0.84,
  },
  {
    column: -1,
    row: -0.72,
    glyph: ".",
    strength: 0.58,
    delay: 0.18,
    span: 0.64,
  },
  {
    column: 1,
    row: -0.72,
    glyph: ".",
    strength: 0.58,
    delay: 0.18,
    span: 0.64,
  },
  {
    column: -1,
    row: 0.72,
    glyph: ".",
    strength: 0.58,
    delay: 0.18,
    span: 0.64,
  },
  {
    column: 1,
    row: 0.72,
    glyph: ".",
    strength: 0.58,
    delay: 0.18,
    span: 0.64,
  },
] as const;

// Ink centers measured from the recovered font, in source-artwork pixels.
const glyphCenters: Record<
  (typeof burst)[number]["glyph"],
  readonly [number, number]
> = {
  ".": [9.22, 21],
  ":": [9.2, 16],
  "-": [9.12, 13.5],
  "+": [9.12, 13.5],
  "*": [9.315, 9.5],
};

interface WorkerScope {
  onmessage: ((event: MessageEvent<PlanetWorkerInput>) => void) | null;
  postMessage(message: PlanetWorkerOutput): void;
  requestAnimationFrame?(callback: FrameRequestCallback): number;
  fonts: { add(font: FontFace): void };
}

interface Renderer {
  draw(seconds: number): void;
  resize(viewport: Viewport, composition: PlanetComposition): void;
}

const vertexSource = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aDestination;
layout(location = 2) in vec2 aAtlasCell;
layout(location = 3) in vec3 aColor;
layout(location = 4) in float aOpacity;

uniform vec2 uViewport;
uniform vec2 uSourceOffset;
uniform vec2 uCellSize;
uniform vec2 uAtlasSize;
uniform vec2 uAtlasCellSize;
uniform vec2 uGlyphRasterSize;
uniform float uScale;

out vec2 vUv;
out vec3 vColor;
out float vOpacity;

void main() {
  vec2 source = (aDestination + aCorner) * uCellSize;
  vec2 pixel = uSourceOffset + source * uScale;
  vec2 clip = vec2(
    pixel.x / uViewport.x * 2.0 - 1.0,
    1.0 - pixel.y / uViewport.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = (
    aAtlasCell * uAtlasCellSize + aCorner * uGlyphRasterSize
  ) / uAtlasSize;
  vColor = aColor;
  vOpacity = aOpacity;
}`;

const fragmentSource = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
in vec2 vUv;
in vec3 vColor;
in float vOpacity;
out vec4 outputColor;

void main() {
  float coverage = texture(uAtlas, vUv).a * vOpacity;
  outputColor = vec4(vColor * coverage, coverage);
}`;

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not allocate a planet shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(reason);
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext): WebGLProgram => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not allocate the planet program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const reason = gl.getProgramInfoLog(program) ?? "Unknown link error";
    gl.deleteProgram(program);
    throw new Error(reason);
  }
  return program;
};

const glyphIndex = (cell: Cell): number => {
  const base = BASE_GLYPHS.indexOf(cell.char);
  if (base < 0) return 0;
  const ranges: Record<string, readonly [number, number]> = {
    ".": [0, 26],
    ":": [27, 41],
    "-": [42, 45],
    "=": [46, 47],
    "+": [48, 49],
    "*": [50, 53],
    "#": [54, 55],
    "%": [56, 57],
    "@": [58, 59],
  };
  const range = ranges[cell.char];
  return range && cell.variant >= range[0] && cell.variant <= range[1]
    ? BASE_GLYPHS.length + cell.variant
    : base;
};

async function createRenderer(
  canvas: OffscreenCanvas,
  cells: Cell[],
  frameAt: (seconds: number) => Int32Array,
): Promise<Renderer> {
  const planetInstances = cells.filter(
    (cell) => !(cell.row === 62 && cell.column === 269),
  );
  const burstOffset = MAX_STARS;
  const planetOffset = burstOffset + burst.length;
  const instanceCount = planetOffset + planetInstances.length;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    desynchronized: true,
    powerPreference: "high-performance",
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error("WebGL 2 is unavailable in the rendering worker");

  const program = createProgram(gl);
  const vao = gl.createVertexArray();
  const quadBuffer = gl.createBuffer();
  const destinationBuffer = gl.createBuffer();
  const appearanceBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (
    !vao ||
    !quadBuffer ||
    !destinationBuffer ||
    !appearanceBuffer ||
    !texture
  )
    throw new Error("Could not allocate planet GPU resources");

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const destinations = new Float32Array(instanceCount * 2);
  for (let index = 0; index < planetInstances.length; index++) {
    const target = (planetOffset + index) * 2;
    destinations[target] = planetInstances[index].column;
    destinations[target + 1] = planetInstances[index].row;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, destinationBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, destinations, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);

  const appearance = new Uint8Array(instanceCount * APPEARANCE_STRIDE);
  gl.bindBuffer(gl.ARRAY_BUFFER, appearanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, appearance.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(
    2,
    2,
    gl.UNSIGNED_BYTE,
    false,
    APPEARANCE_STRIDE,
    0,
  );
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(
    3,
    3,
    gl.UNSIGNED_BYTE,
    true,
    APPEARANCE_STRIDE,
    2,
  );
  gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(
    4,
    1,
    gl.UNSIGNED_BYTE,
    true,
    APPEARANCE_STRIDE,
    5,
  );
  gl.vertexAttribDivisor(4, 1);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fontResponse = await fetch("/fonts/planet-gpu.woff2");
  if (!fontResponse.ok) throw new Error("The GPU planet font is unavailable");
  const font = new FontFace(
    "Recovered Planet GPU",
    await fontResponse.arrayBuffer(),
  );
  await font.load();
  scope.fonts.add(font);

  const glyphs = Uint8Array.from(cells, glyphIndex);
  const colors = new Uint8Array(cells.length * 3);
  for (let index = 0; index < cells.length; index++) {
    const color = Number.parseInt(cells[index].color.slice(1), 16);
    colors[index * 3] = color >> 16;
    colors[index * 3 + 1] = (color >> 8) & 255;
    colors[index * 3 + 2] = color & 255;
  }

  const setGlyph = (instance: number, glyph: string) => {
    const index = BASE_GLYPHS.indexOf(glyph);
    const target = instance * APPEARANCE_STRIDE;
    appearance[target] = index % ATLAS_COLUMNS;
    appearance[target + 1] = Math.floor(index / ATLAS_COLUMNS);
  };
  const setColor = (
    instance: number,
    color: readonly [number, number, number],
  ) => {
    const target = instance * APPEARANCE_STRIDE;
    appearance[target + 2] = color[0];
    appearance[target + 3] = color[1];
    appearance[target + 4] = color[2];
  };
  const setOpacity = (instance: number, opacity: number) => {
    appearance[instance * APPEARANCE_STRIDE + 5] = Math.round(
      Math.max(0, Math.min(1, opacity)) * 255,
    );
  };
  for (let index = 0; index < burst.length; index++) {
    setGlyph(burstOffset + index, burst[index].glyph);
    setColor(burstOffset + index, TWINKLE_COLOR);
  }

  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "uAtlas"), 0);
  gl.uniform2f(
    gl.getUniformLocation(program, "uCellSize"),
    CELL_WIDTH,
    CELL_HEIGHT,
  );
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const viewportLocation = gl.getUniformLocation(program, "uViewport");
  const sourceLocation = gl.getUniformLocation(program, "uSourceOffset");
  const scaleLocation = gl.getUniformLocation(program, "uScale");
  const atlasSizeLocation = gl.getUniformLocation(program, "uAtlasSize");
  const atlasCellSizeLocation = gl.getUniformLocation(
    program,
    "uAtlasCellSize",
  );
  const glyphRasterSizeLocation = gl.getUniformLocation(
    program,
    "uGlyphRasterSize",
  );
  let viewport: Viewport = { width: 1, height: 1, pixelRatio: 1 };
  let composition: PlanetComposition = { scale: 1, sourceX: 0, sourceY: 0 };
  let atlasScale = -1;
  const atlasCache = new Map<number, OffscreenCanvas>();
  const sessionSeed = Math.floor(Math.random() * 1e6);
  let stars: Star[] = [];
  let selectedStar: Star | undefined;
  let positionedCycle = -1;

  const rebuildAtlas = () => {
    const sourcePhysicalHeight = CELL_HEIGHT * viewport.pixelRatio;
    const nextScale = Math.max(
      1,
      Math.round(sourcePhysicalHeight * 4) / 4,
    );
    if (nextScale === atlasScale) return;
    atlasScale = nextScale;
    const tileHeight = Math.ceil(nextScale);
    const glyphWidth = nextScale * (CELL_WIDTH / CELL_HEIGHT);
    const tileWidth = Math.max(1, Math.ceil(glyphWidth));
    let atlasCanvas = atlasCache.get(nextScale);
    if (!atlasCanvas) {
      atlasCanvas = new OffscreenCanvas(
        tileWidth * ATLAS_COLUMNS,
        tileHeight * ATLAS_ROWS,
      );
      const context = atlasCanvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Worker text rasterizing is unavailable");
      context.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
      context.fillStyle = "#fff";
      context.font = `${nextScale}px "Recovered Planet GPU"`;
      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      if ("textRendering" in context)
        context.textRendering = "geometricPrecision";
      for (let index = 0; index < BASE_GLYPHS.length + 60; index++) {
        const character =
          index < BASE_GLYPHS.length
            ? BASE_GLYPHS[index]
            : String.fromCodePoint(0xe000 + index - BASE_GLYPHS.length);
        const x = (index % ATLAS_COLUMNS) * tileWidth;
        const y = Math.floor(index / ATLAS_COLUMNS) * tileHeight + nextScale;
        context.fillText(character, x, y);
      }
      atlasCache.set(nextScale, atlasCanvas);
      if (atlasCache.size > 3) {
        const oldest = atlasCache.keys().next().value as number | undefined;
        if (oldest !== undefined) atlasCache.delete(oldest);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlasCanvas,
    );
    gl.useProgram(program);
    gl.uniform2f(atlasSizeLocation, atlasCanvas.width, atlasCanvas.height);
    gl.uniform2f(atlasCellSizeLocation, tileWidth, tileHeight);
    gl.uniform2f(glyphRasterSizeLocation, glyphWidth, nextScale);
  };

  const positionGlyph = (
    instance: number,
    x: number,
    y: number,
    glyph: keyof typeof glyphCenters,
    column = 0,
    row = 0,
  ) => {
    const center = glyphCenters[glyph];
    const sourceX =
      (x - composition.sourceX) / composition.scale +
      column * CELL_WIDTH -
      center[0];
    const sourceY =
      (y - composition.sourceY) / composition.scale +
      row * CELL_HEIGHT -
      center[1];
    destinations[instance * 2] = sourceX / CELL_WIDTH;
    destinations[instance * 2 + 1] = sourceY / CELL_HEIGHT;
  };

  const uploadDestinations = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, destinationBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, destinations);
  };

  const rebuildStars = () => {
    stars = createStarfield(viewport, ART.globe.radius * composition.scale);
    for (let index = 0; index < MAX_STARS; index++) {
      const star = stars[index];
      setGlyph(index, ".");
      setColor(index, STAR_COLOR);
      if (star) {
        positionGlyph(index, star.x, star.y, ".");
        setOpacity(index, star.opacity);
      } else {
        setOpacity(index, 0);
      }
    }
    selectedStar = undefined;
    positionedCycle = -1;
    for (let index = 0; index < burst.length; index++)
      setOpacity(burstOffset + index, 0);
    uploadDestinations();
  };

  const positionTwinkle = (cycle: number) => {
    const candidates = stars.filter((star) => star.canTwinkle);
    selectedStar =
      candidates[
        Math.min(
          candidates.length - 1,
          Math.floor(starRandom(cycle, sessionSeed) * candidates.length),
        )
      ];
    if (selectedStar) {
      for (let index = 0; index < burst.length; index++) {
        const ray = burst[index];
        positionGlyph(
          burstOffset + index,
          selectedStar.x,
          selectedStar.y,
          ray.glyph,
          ray.column,
          ray.row,
        );
      }
      uploadDestinations();
    }
    positionedCycle = cycle;
  };

  const updateTwinkle = (seconds: number) => {
    const { cycle, progress } = twinkleAt(seconds);
    if (cycle !== positionedCycle) positionTwinkle(cycle);
    for (let index = 0; index < burst.length; index++) {
      const ray = burst[index];
      const local = (progress - ray.delay) / ray.span;
      const opacity =
        selectedStar && local > 0 && local < 1
          ? Math.sin(Math.PI * local) ** 2 * ray.strength
          : 0;
      setOpacity(burstOffset + index, opacity);
    }
  };

  return {
    resize(nextViewport, nextComposition) {
      viewport = nextViewport;
      composition = nextComposition;
      const ratio = viewport.pixelRatio;
      canvas.width = Math.max(1, Math.round(viewport.width * ratio));
      canvas.height = Math.max(1, Math.round(viewport.height * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      rebuildAtlas();
      rebuildStars();
    },
    draw(seconds) {
      const frame = frameAt(seconds);
      for (let index = 0; index < planetInstances.length; index++) {
        const donor = frame[planetInstances[index].index];
        const glyph = glyphs[donor];
        const target = (planetOffset + index) * APPEARANCE_STRIDE;
        appearance[target] = glyph % ATLAS_COLUMNS;
        appearance[target + 1] = Math.floor(glyph / ATLAS_COLUMNS);
        appearance[target + 2] = colors[donor * 3];
        appearance[target + 3] = colors[donor * 3 + 1];
        appearance[target + 4] = colors[donor * 3 + 2];
        appearance[target + 5] = 255;
      }
      updateTwinkle(seconds);
      gl.bindBuffer(gl.ARRAY_BUFFER, appearanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, appearance);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(viewportLocation, viewport.width, viewport.height);
      gl.uniform2f(
        sourceLocation,
        composition.sourceX,
        composition.sourceY,
      );
      gl.uniform1f(scaleLocation, composition.scale);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount);
    },
  };
}

const scope = self as unknown as WorkerScope;
let renderer: Renderer | undefined;
let latestViewport:
  | { viewport: Viewport; composition: PlanetComposition }
  | undefined;
let latestSeconds = 0;
let frameRequest = 0;
let initialized = false;
let reportedReady = false;

const schedule = () => {
  if (!renderer || frameRequest) return;
  const draw = () => {
    frameRequest = 0;
    if (!renderer) return;
    renderer.draw(latestSeconds);
    if (!reportedReady) {
      reportedReady = true;
      scope.postMessage({ type: "ready" });
    }
  };
  frameRequest = scope.requestAnimationFrame
    ? scope.requestAnimationFrame(draw)
    : (setTimeout(draw, 0) as unknown as number);
};

scope.onmessage = ({ data }) => {
  if (data.type === "initialize") {
    if (initialized) return;
    initialized = true;
    void (async () => {
      try {
        const geometry = createGeometry(data.artwork);
        renderer = await createRenderer(
          data.canvas,
          geometry.cells,
          geometry.frame,
        );
        if (latestViewport)
          renderer.resize(
            latestViewport.viewport,
            latestViewport.composition,
          );
        schedule();
      } catch (error) {
        scope.postMessage({
          type: "failed",
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })();
    return;
  }
  if (data.type === "resize") {
    latestViewport = {
      viewport: data.viewport,
      composition: data.composition,
    };
    renderer?.resize(data.viewport, data.composition);
    schedule();
    return;
  }
  if (data.type === "frame") {
    latestSeconds = data.seconds;
    schedule();
    return;
  }
};
