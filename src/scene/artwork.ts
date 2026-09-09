import type { Artwork } from "./types";
import { ART } from "./config";

/** Build-time markup and client-side DOM recovery validate the same asset contract. */
export function parseArtwork(input: unknown): Artwork {
  if (!input || typeof input !== "object") throw new Error("Missing artwork");
  const data = input as Partial<Artwork>;
  if (
    data.width !== ART.columns ||
    data.height !== ART.rows ||
    data.cellWidth !== ART.cell.width ||
    data.cellHeight !== ART.cell.height ||
    !Array.isArray(data.rows) ||
    !Array.isArray(data.colors) ||
    !Array.isArray(data.variants) ||
    data.rows.length !== data.height ||
    data.colors.length !== data.height ||
    data.variants.length !== data.height
  ) {
    throw new Error("Invalid artwork dimensions");
  }
  for (let row = 0; row < data.height; row++) {
    const text = data.rows[row],
      colors = data.colors[row],
      variants = data.variants[row];
    if (
      typeof text !== "string" ||
      text.length !== data.width ||
      !/^[ .:\-=+*#%@]+$/.test(text) ||
      !Array.isArray(colors) ||
      colors.length !== data.width ||
      !Array.isArray(variants) ||
      variants.length !== data.width
    ) {
      throw new Error(`Invalid artwork row ${row}`);
    }
    for (let column = 0; column < data.width; column++) {
      if (text[column] === " ") continue;
      if (
        !/^[\da-f]{6}$/i.test(colors[column]) ||
        !Number.isInteger(variants[column]) ||
        variants[column] < 0 ||
        variants[column] > 99
      ) {
        throw new Error(`Invalid artwork cell ${row}:${column}`);
      }
    }
  }
  return data as Artwork;
}

export function sourceMarkup(data: Artwork): string {
  // Input alphabet and style values are validated above; no arbitrary HTML.
  return data.rows
    .map((row, y) =>
      [...row]
        .map((char, x) => {
          if (char === " ") return char;
          const color = data.colors[y][x];
          const variant = String(data.variants[y][x]).padStart(2, "0");
          const hidden = y === 62 && x === 269 ? ";visibility:hidden" : "";
          return `<span data-cell="${color}${variant}" style="color:#${color};font-feature-settings:'g0${variant}' 1${hidden}">${char}</span>`;
        })
        .join(""),
    )
    .join("\n");
}

/** Recover animation data from the prerendered source instead of downloading it twice. */
export function artworkFromElement(element: HTMLPreElement): {
  artwork: Artwork;
  spans: HTMLSpanElement[];
} {
  const rows = (element.textContent ?? "").split("\n");
  if (
    rows.length !== ART.rows ||
    rows.some((row) => row.length !== ART.columns)
  )
    throw new Error("Invalid prerendered artwork dimensions");
  const colors = rows.map((row) => Array<string>(row.length).fill("000000"));
  const variants = rows.map((row) => Array<number>(row.length).fill(0));
  const spans = [...element.querySelectorAll<HTMLSpanElement>("span")];
  let spanIndex = 0;
  for (let row = 0; row < rows.length; row++) {
    for (let column = 0; column < rows[row].length; column++) {
      if (rows[row][column] === " ") continue;
      const span = spans[spanIndex++];
      const values = /^([\da-f]{6})(\d{2})$/i.exec(span?.dataset.cell ?? "");
      if (!values)
        throw new Error(`Invalid prerendered artwork cell ${row}:${column}`);
      colors[row][column] = values[1];
      variants[row][column] = Number(values[2]);
    }
  }
  if (spanIndex !== spans.length)
    throw new Error("Prerendered artwork cell count disagrees");
  const artwork: Artwork = {
    width: ART.columns,
    height: ART.rows,
    cellWidth: ART.cell.width,
    cellHeight: ART.cell.height,
    rows,
    colors,
    variants,
  };
  return { artwork, spans };
}
