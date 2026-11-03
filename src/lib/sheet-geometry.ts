/**
 * Single source of truth for the printed A4 layout. All values in millimetres.
 *
 *   ┌──────────────── 210 ────────────────┐
 *   │ 13.5 top margin (sheet no. + time)  │
 *   │ 15 ┌──60──┬──60──┬──60──┐ 15 (codes)│
 *   │    │  90  │      │      │           │  297
 *   │    ├──────┼──────┼──────┤           │
 *   │    │      │      │      │           │
 *   │    ├──────┼──────┼──────┤           │
 *   │    │      │      │      │           │
 *   │    └──────┴──────┴──────┘           │
 *   │ 13.5 bottom margin                  │
 *   └─────────────────────────────────────┘
 *
 * Photos touch each other (no gutter); thin cut marks sit in the margins only.
 */

export const PAGE_W = 210;
export const PAGE_H = 297;

export const CELL_W = 60;
export const CELL_H = 90;
export const COLS = 3;
export const ROWS = 3;
export const SLOTS_PER_SHEET = COLS * ROWS;

export const GRID_X = (PAGE_W - CELL_W * COLS) / 2; // 15
export const GRID_Y = (PAGE_H - CELL_H * ROWS) / 2; // 13.5

export const CUT_MARK_LEN = 5;
/** Gap between the photo edge and the start of a cut mark. */
export const CUT_MARK_OFFSET = 1.5;

/** Print resolution for processed photos: 6×9 cm at 300 dpi. */
export const PHOTO_DPI = 300;
export const PHOTO_PX_W = Math.round((CELL_W / 25.4) * PHOTO_DPI); // 709
export const PHOTO_PX_H = Math.round((CELL_H / 25.4) * PHOTO_DPI); // 1063

export function cellOrigin(position: number): { x: number; y: number } {
  const col = position % COLS;
  const row = Math.floor(position / COLS);
  return { x: GRID_X + col * CELL_W, y: GRID_Y + row * CELL_H };
}

/** x positions of vertical cut lines and y positions of horizontal cut lines. */
export const CUT_XS = Array.from({ length: COLS + 1 }, (_, i) => GRID_X + i * CELL_W);
export const CUT_YS = Array.from({ length: ROWS + 1 }, (_, i) => GRID_Y + i * CELL_H);
