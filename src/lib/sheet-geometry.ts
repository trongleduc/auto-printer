/**
 * Single source of truth for the printed A4 layout. All values in millimetres.
 *
 *   ┌───────────────────── 210 ─────────────────────┐
 *   │ header (sheet no. + time)                      │
 *   ┼─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ┼  ← cut line, edge to edge
 *   │ 11 ┌──60──┐  4  ┌──60──┐  4  ┌──60──┐  11    │
 *   │    │  90  │     │      │     │      │ codes  │  297
 *   │    └──────┘     └──────┘     └──────┘        │
 *   ┼─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ┼  ← cut line in the middle of the 4 mm gap
 *   │    ...                                         │
 *   └────────────────────────────────────────────────┘
 *
 * Photos are exactly 60 × 90 mm with a GAP between them. Thin grey cut lines run
 * across the whole sheet through the middle of every gap (and GAP/2 outside the
 * outer photos), so cutting along them by hand leaves each photo with an even
 * GAP/2 white border and never touches the image.
 */

export const PAGE_W = 210;
export const PAGE_H = 297;

export const CELL_W = 60;
export const CELL_H = 90;
export const COLS = 3;
export const ROWS = 3;
export const SLOTS_PER_SHEET = COLS * ROWS;

/** White space between neighbouring photos; the cut line runs through its middle. */
export const GAP = 4;

export const GRID_W = COLS * CELL_W + (COLS - 1) * GAP; // 188
export const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP; // 278
export const GRID_X = (PAGE_W - GRID_W) / 2; // 11
export const GRID_Y = (PAGE_H - GRID_H) / 2; // 9.5

/** Cut line style. Grey so it guides the scissors without looking like part of the photo border. */
export const CUT_LINE_WIDTH = 0.2;
export const CUT_LINE_COLOR = "#8c8c8c";

/** Vertical cut lines (x) and horizontal cut lines (y): GAP/2 outside every photo edge. */
export const CUT_XS = Array.from({ length: COLS + 1 }, (_, i) => GRID_X - GAP / 2 + i * (CELL_W + GAP)); // 9, 73, 137, 201
export const CUT_YS = Array.from({ length: ROWS + 1 }, (_, i) => GRID_Y - GAP / 2 + i * (CELL_H + GAP)); // 7.5, 101.5, 195.5, 289.5

/** Header and order codes. */
export const TEXT_SIZE = 2.4;
export const HEADER_X = GRID_X;
export const HEADER_Y = 4.5;
/**
 * Order codes run rotated in the strip right of the last cut line. Kept close to
 * that line (not the paper edge) so printers with wide unprintable edges still print them.
 */
export const CODES_CENTER_X = CUT_XS[COLS] + 2.5; // 203.5

/** Print resolution for processed photos: 6×9 cm at 300 dpi. */
export const PHOTO_DPI = 300;
export const PHOTO_PX_W = Math.round((CELL_W / 25.4) * PHOTO_DPI); // 709
export const PHOTO_PX_H = Math.round((CELL_H / 25.4) * PHOTO_DPI); // 1063

export function cellOrigin(position: number): { x: number; y: number } {
  const col = position % COLS;
  const row = Math.floor(position / COLS);
  return { x: GRID_X + col * (CELL_W + GAP), y: GRID_Y + row * (CELL_H + GAP) };
}

/** Vertical centre of a photo row, where that row's order codes are printed. */
export function rowCenterY(row: number): number {
  return GRID_Y + row * (CELL_H + GAP) + CELL_H / 2;
}
