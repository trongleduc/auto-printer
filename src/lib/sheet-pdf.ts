"use client";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import {
  CELL_H,
  CELL_W,
  COLS,
  CUT_MARK_LEN,
  CUT_MARK_OFFSET,
  CUT_XS,
  CUT_YS,
  GRID_X,
  GRID_Y,
  PAGE_H,
  PAGE_W,
  ROWS,
  cellOrigin,
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

const FONT_MM = 2.4;
const LINE_MM = 0.15;

export async function buildSheetPdf(cells: CellDTO[], header: string, signal?: AbortSignal): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([mm(PAGE_W), mm(PAGE_H)]);
  // Standard fonts only cover Latin-1, so header and codes must stay ASCII.
  const font = await doc.embedFont(StandardFonts.Courier);
  const size = mm(FONT_MM);
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
  page.drawText(header, { x: mm(GRID_X), y: top(4.5) - size * 0.8, size, font, color: black });

  // Cut marks, in the margins only.
  const t = mm(LINE_MM);
  const gridTop = GRID_Y - CUT_MARK_OFFSET - CUT_MARK_LEN;
  const gridBottom = GRID_Y + ROWS * CELL_H + CUT_MARK_OFFSET;
  const gridLeft = GRID_X - CUT_MARK_OFFSET - CUT_MARK_LEN;
  const gridRight = GRID_X + COLS * CELL_W + CUT_MARK_OFFSET;
  for (const x of CUT_XS) {
    for (const y0 of [gridTop, gridBottom]) {
      page.drawLine({ start: { x: mm(x), y: top(y0) }, end: { x: mm(x), y: top(y0 + CUT_MARK_LEN) }, thickness: t, color: black });
    }
  }
  for (const y of CUT_YS) {
    for (const x0 of [gridLeft, gridRight]) {
      page.drawLine({ start: { x: mm(x0), y: top(y) }, end: { x: mm(x0 + CUT_MARK_LEN), y: top(y) }, thickness: t, color: black });
    }
  }

  // Order codes per row, rotated 90° clockwise and centred in the right margin.
  const byPos = new Map(cells.map((c) => [c.position, c]));
  const marginCenter = GRID_X + COLS * CELL_W + GRID_X / 2;
  for (let row = 0; row < ROWS; row++) {
    const codes = Array.from({ length: COLS }, (_, col) => byPos.get(row * COLS + col)?.code ?? "-");
    if (codes.every((c) => c === "-")) continue;
    const text = codes.join("  ·  ");
    const w = font.widthOfTextAtSize(text, size);
    const cx = mm(marginCenter);
    const cy = top(GRID_Y + row * CELL_H + CELL_H / 2);
    // Rotating by -90° maps the text's local (u, v) to (x0 + v, y0 - u); centre it on (cx, cy).
    page.drawText(text, { x: cx - size * 0.3, y: cy + w / 2, size, font, color: black, rotate: degrees(-90) });
  }

  return doc.save();
}
