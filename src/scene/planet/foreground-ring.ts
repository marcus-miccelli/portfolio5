import { ART, TAU } from "../config";
import type { Cell } from "../types";

export function createForeground(
  cells: Cell[],
  cellWidth: number,
  cellHeight: number,
) {
  const ring = ART.stroke;
  const cosine = Math.cos(ring.angle),
    sine = Math.sin(ring.angle);
  const visible: { index: number; angle: number }[] = [];
  const material: { index: number; angle: number }[] = [];
  const mask = new Uint8Array(cells.length);
  for (const cell of cells) {
    const x = (cell.column + 0.5) * cellWidth,
      y = (cell.row + 0.5) * cellHeight;
    const dx = x - ring.x,
      dy = y - ring.y;
    const u = (dx * cosine + dy * sine) / ring.major;
    const v = (-dx * sine + dy * cosine) / ring.minor;
    const radius = Math.hypot(u, v);
    const gradient = Math.hypot(
      (u * cosine) / ring.major - (v * sine) / ring.minor,
      (u * sine) / ring.major + (v * cosine) / ring.minor,
    );
    const distance =
      gradient === 0 ? Infinity : ((radius - 1) * radius) / gradient;
    const angle = (Math.atan2(v, u) + TAU) % TAU;
    const globeRadius =
      Math.hypot(x - ART.globe.x, y - ART.globe.y) / ART.globe.radius;
    const ringDepth = v * Math.sqrt(ring.major ** 2 - ring.minor ** 2);
    const surfaceDepth =
      Math.sqrt(Math.max(0, 1 - globeRadius ** 2)) * ART.globe.radius;
    if (
      globeRadius <= 1.055 &&
      Math.abs(distance) <= 18 &&
      ringDepth > surfaceDepth
    ) {
      mask[cell.index] = 1;
      visible.push({ index: cell.index, angle });
    }
    if (
      cell.kind === "ring" &&
      !".:".includes(cell.char) &&
      Math.abs(distance) <= 40
    )
      material.push({ index: cell.index, angle });
  }
  material.sort((a, b) => a.angle - b.angle);
  const indices = Int32Array.from(visible, (point) => point.index);
  const donors = Int32Array.from(material, (point) => point.index);
  const offsets = Int32Array.from(visible, (point) =>
    Math.floor((point.angle / TAU) * donors.length),
  );
  return {
    mask,
    indices,
    render(phase: number, frame: Int32Array) {
      if (phase < 1e-9 || donors.length === 0) return;
      const shift = Math.floor(phase * donors.length * 2) % donors.length;
      for (let i = 0; i < indices.length; i++)
        frame[indices[i]] =
          donors[(offsets[i] - shift + donors.length) % donors.length];
    },
  };
}
