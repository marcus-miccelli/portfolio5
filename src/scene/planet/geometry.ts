import { ART, MOTION, TAU, clamp } from "../config";
import type { Artwork, Cell } from "../types";
import { createForeground } from "./foreground-ring";

/** Source-cell assignments only. Geometry has no DOM or browser dependencies. */
export function createGeometry(artwork: Artwork) {
  const { width, height, cellWidth, cellHeight } = artwork;
  const cells: Cell[] = [];
  const grid = new Int32Array(width * height).fill(-1);
  const lanes = new Map<string, Cell[]>();
  const cosine = Math.cos(ART.ring.angle),
    sine = Math.sin(ART.ring.angle);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const char = artwork.rows[row][column];
      if (char === " ") continue;
      const sourceX = (column + 0.5) * cellWidth,
        sourceY = (row + 0.5) * cellHeight;
      const x = (sourceX - ART.globe.x) / ART.globe.radius,
        y = (sourceY - ART.globe.y) / ART.globe.radius;
      const radius = Math.hypot(x, y);
      const dx = sourceX - ART.ring.x,
        dy = sourceY - ART.ring.y;
      const u = (dx * cosine + dy * sine) / ART.ring.major,
        v = (-dx * sine + dy * cosine) / ART.ring.minor;
      const ringRadius = Math.hypot(u, v);
      const kind =
        radius < 0.94
          ? "surface"
          : radius > 1.055 && Math.abs(ringRadius - 1) < 0.2
            ? "ring"
            : "fixed";
      const cell: Cell = {
        index: cells.length,
        row,
        column,
        char,
        kind,
        color: `#${artwork.colors[row][column]}`,
        variant: artwork.variants[row][column],
        x,
        y,
        z: Math.sqrt(Math.max(0, 1 - radius * radius)),
        ringRadius,
        ringAngle: (Math.atan2(v, u) + TAU) % TAU,
      };
      cells.push(cell);
      grid[row * width + column] = cell.index;
      if (kind === "ring") {
        const key = `${".:".includes(char) ? "dust" : "ink"}:${Math.round((ringRadius - 1) * 25)}`;
        const lane = lanes.get(key) ?? [];
        lane.push(cell);
        lanes.set(key, lane);
      }
    }
  }
  const foreground = createForeground(cells, cellWidth, cellHeight);
  const surfaceGrid = grid.slice();
  // The photographed front ring must not also rotate as part of the surface.
  for (const index of foreground.indices) {
    const cell = cells[index];
    search: for (let distance = 1; distance <= 4; distance++) {
      for (const direction of [-1, 1]) {
        const row = cell.row + distance * direction;
        if (row < 0 || row >= height) continue;
        const donor = grid[row * width + cell.column];
        if (
          donor >= 0 &&
          cells[donor].kind === "surface" &&
          !foreground.mask[donor]
        ) {
          surfaceGrid[cell.row * width + cell.column] = donor;
          break search;
        }
      }
    }
  }
  const surface = cells.filter((cell) => cell.kind === "surface");
  const surfaceIds = Int32Array.from(surface, (cell) => cell.index);
  // Double precision preserves sampling around character boundaries.
  const positions = Float64Array.from(
    surface.flatMap((cell) => [cell.x, cell.y, cell.z]),
  );
  const ringLanes = [...lanes.values()].map((lane) =>
    Int32Array.from(
      lane.sort((a, b) => a.ringAngle - b.ringAngle),
      (cell) => cell.index,
    ),
  );
  const animated = Int32Array.from(
    cells.filter(
      (cell) => cell.kind !== "fixed" || foreground.mask[cell.index],
    ),
    (cell) => cell.index,
  );
  const identity = Int32Array.from(cells, (cell) => cell.index);
  const frame = identity.slice();
  const az = ART.ring.minor / ART.ring.major;
  const ax = -sine * Math.sqrt(1 - az * az),
    ay = cosine * Math.sqrt(1 - az * az);
  return {
    cells,
    animated,
    frame(seconds: number) {
      const phase =
        (((seconds % MOTION.orbitSeconds) + MOTION.orbitSeconds) %
          MOTION.orbitSeconds) /
        MOTION.orbitSeconds;
      frame.set(identity);
      if (phase < 1e-9) return frame;
      const c = Math.cos(phase * TAU),
        s = Math.sin(phase * TAU),
        t = 1 - c;
      const m00 = c + ax * ax * t,
        m01 = ax * ay * t - az * s,
        m02 = ax * az * t + ay * s;
      const m10 = ay * ax * t + az * s,
        m11 = c + ay * ay * t,
        m12 = ay * az * t - ax * s;
      for (let i = 0; i < surfaceIds.length; i++) {
        const offset = i * 3,
          x = positions[offset],
          y = positions[offset + 1],
          z = positions[offset + 2];
        let projectedX = m00 * x + m01 * y + m02 * z,
          projectedY = m10 * x + m11 * y + m12 * z;
        const radiusSquared = projectedX ** 2 + projectedY ** 2;
        if (radiusSquared > 0.925 ** 2) {
          const scale = 0.925 / Math.sqrt(radiusSquared);
          projectedX *= scale;
          projectedY *= scale;
        }
        const column = clamp(
          Math.floor((ART.globe.x + projectedX * ART.globe.radius) / cellWidth),
          0,
          width - 1,
        );
        const row = clamp(
          Math.floor(
            (ART.globe.y + projectedY * ART.globe.radius) / cellHeight,
          ),
          0,
          height - 1,
        );
        const donor = surfaceGrid[row * width + column];
        frame[surfaceIds[i]] = donor >= 0 ? donor : surfaceIds[i];
      }
      for (const lane of ringLanes) {
        const shift = Math.floor(phase * lane.length * 2) % lane.length;
        for (let i = 0; i < lane.length; i++)
          frame[lane[i]] = lane[(i - shift + lane.length) % lane.length];
      }
      foreground.render(phase, frame);
      return frame;
    },
  };
}
