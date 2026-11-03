"use client";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import {
  CELL_H,
  CELL_W,
  CODES_CENTER_X,
  COLS,
  CUT_LINE_COLOR,
  CUT_LINE_WIDTH,
  CUT_XS,
  CUT_YS,
  HEADER_X,
  HEADER_Y,
  PAGE_H,
  PAGE_W,
  ROWS,
  TEXT_SIZE,
  cellOrigin,
  rowCenterY,
} from "./sheet-geometry";
import type { CellDTO } from "./types";

/**
 * Builds the same A4 sheet as `<Sheet mode="print">`, as a PDF, from
 * `sheet-geometry.ts`. Used by the station's "save PDF to folder" mode.
 * PDF space is in points with the origin at the bottom left; `mm()` and `top()`
 * convert from the top-left millimetre layout.
 */
const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;
/** y in PDF space for a distance `v` mm from the top of the page. */
const top = (v: number) => mm(PAGE_H - v);

/** "#8c8c8c" → pdf-lib colour. */
function hexColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function buildSheetPdf(cells: CellDTO[], header: string, signal?: AbortSignal): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([mm(PAGE_W), mm(PAGE_H)]);
  // Standard fonts only cover Latin-1, so header and codes must stay ASCII.
  const font = await doc.embedFont(StandardFonts.Courier);
  const size = mm(TEXT_SIZE);
  const black = rgb(0, 0, 0);

  // Photos: the processed tiles already have the cell's 2:3 ratio, so they fill the cell exactly.
  const images = await Promise.all(
    cells.map(async (c) => {
      const res = await fetch(c.src, { signal });
      if (!res.ok) throw new Error(`image ${res.status}`);
      return { cell: c, img: await doc.embedJpg(await res.arrayBuffer()) };
    }),
  );
  for (const { cell, img } of images) {
    const { x, y } = cellOrigin(cell.position);
    page.drawImage(img, { x: mm(x), y: top(y + CELL_H), width: mm(CELL_W), height: mm(CELL_H) });
  }

  // Header in the top margin.
  page.drawText(header, { x: mm(HEADER_X), y: top(HEADER_Y) - size * 0.8, size, font, color: black });

  // Grey cut lines across the whole sheet, through the middle of every gap.
  const lineOpts = { thickness: mm(CUT_LINE_WIDTH), color: hexColor(CUT_LINE_COLOR) };
  for (const x of CUT_XS) page.drawLine({ start: { x: mm(x), y: 0 }, end: { x: mm(x), y: mm(PAGE_H) }, ...lineOpts });
  for (const y of CUT_YS) page.drawLine({ start: { x: 0, y: top(y) }, end: { x: mm(PAGE_W), y: top(y) }, ...lineOpts });

  // Order codes per row, rotated 90° clockwise and centred in the right margin.
  const byPos = new Map(cells.map((c) => [c.position, c]));
  for (let row = 0; row < ROWS; row++) {
    const codes = Array.from({ length: COLS }, (_, col) => byPos.get(row * COLS + col)?.code ?? "-");
    if (codes.every((c) => c === "-")) continue;
    const text = codes.join("  ·  ");
    const w = font.widthOfTextAtSize(text, size);
    const cx = mm(CODES_CENTER_X);
    const cy = top(rowCenterY(row));
    // Rotating by -90° maps the text's local (u, v) to (x0 + v, y0 - u); centre it on (cx, cy).
    page.drawText(text, { x: cx - size * 0.3, y: cy + w / 2, size, font, color: black, rotate: degrees(-90) });
  }

  return doc.save();
}
