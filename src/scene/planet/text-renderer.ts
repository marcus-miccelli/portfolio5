import type { Cell } from "../types";

/** Attach to Astro's real, prerendered text instead of rebuilding it on load. */
export function createTextRenderer(
  spans: HTMLSpanElement[],
  cells: Cell[],
  animated: Int32Array,
) {
  if (spans.length !== cells.length)
    throw new Error("Artwork markup and data disagree");
  const text = spans.map((span) => span.firstChild as Text);
  const current = Int32Array.from(cells, (cell) => cell.index);
  const variants = Array.from(
    { length: 100 },
    (_, i) => `'g${String(i).padStart(3, "0")}' 1`,
  );
  return (frame: Int32Array) => {
    for (const index of animated) {
      const next = frame[index],
        previous = current[index];
      if (previous === next) continue;
      const a = cells[previous],
        b = cells[next];
      if (a.char !== b.char) text[index].data = b.char;
      if (a.color !== b.color) spans[index].style.color = b.color;
      if (a.variant !== b.variant)
        spans[index].style.fontFeatureSettings = variants[b.variant];
      current[index] = next;
    }
  };
}
