import type { CSSProperties, ReactNode } from "react";
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
  SLOTS_PER_SHEET,
  cellOrigin,
} from "@/lib/sheet-geometry";

/**
 * Renders an A4 sheet. Every length is expressed as `n * --u`:
 * - mode "print":   --u = 1mm, so the sheet is physically exact.
 * - mode "preview": --u = 1/210 of the container width (container query units),
 *   so the same markup scales to any thumbnail size.
 */

export type SheetCell = { position: number; src: string; code: string };

const u = (n: number) => `calc(${n} * var(--u))`;

function Abs({ x, y, w, h, style, children, className }: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  style?: CSSProperties;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: u(x),
        top: u(y),
        width: w === undefined ? undefined : u(w),
        height: h === undefined ? undefined : u(h),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SheetFrame({ mode, children }: { mode: "print" | "preview"; children: ReactNode }) {
  const sheet = (
    <div
      style={
        {
          "--u": mode === "print" ? "1mm" : `calc(100cqw / ${PAGE_W})`,
          position: "relative",
          width: u(PAGE_W),
          height: u(PAGE_H),
          background: "#fff",
          color: "#000",
          overflow: "hidden",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
  if (mode === "print") return sheet;
  return <div style={{ containerType: "inline-size", width: "100%" }}>{sheet}</div>;
}

function CutMarks() {
  const line = { background: "#000" };
  const t = 0.15; // line thickness, mm
  const marks: ReactNode[] = [];
  const top = GRID_Y - CUT_MARK_OFFSET - CUT_MARK_LEN;
  const bottom = GRID_Y + ROWS * CELL_H + CUT_MARK_OFFSET;
  const left = GRID_X - CUT_MARK_OFFSET - CUT_MARK_LEN;
  const right = GRID_X + COLS * CELL_W + CUT_MARK_OFFSET;
  CUT_XS.forEach((x, i) => {
    marks.push(<Abs key={`t${i}`} x={x - t / 2} y={top} w={t} h={CUT_MARK_LEN} style={line} />);
    marks.push(<Abs key={`b${i}`} x={x - t / 2} y={bottom} w={t} h={CUT_MARK_LEN} style={line} />);
  });
  CUT_YS.forEach((y, i) => {
    marks.push(<Abs key={`l${i}`} x={left} y={y - t / 2} w={CUT_MARK_LEN} h={t} style={line} />);
    marks.push(<Abs key={`r${i}`} x={right} y={y - t / 2} w={CUT_MARK_LEN} h={t} style={line} />);
  });
  return <>{marks}</>;
}

export function Sheet({
  cells,
  header,
  mode,
  showEmpty = mode === "preview",
}: {
  cells: SheetCell[];
  header?: string;
  mode: "print" | "preview";
  /** Draw dashed outlines for empty positions (screen only). */
  showEmpty?: boolean;
}) {
  const byPos = new Map(cells.map((c) => [c.position, c]));
  const rightMarginCenter = GRID_X + COLS * CELL_W + GRID_X / 2;

  return (
    <SheetFrame mode={mode}>
      {header && (
        <Abs x={GRID_X} y={4.5} style={{ fontSize: u(2.4), lineHeight: 1, whiteSpace: "nowrap" }}>
          {header}
        </Abs>
      )}

      {Array.from({ length: SLOTS_PER_SHEET }, (_, pos) => {
        const { x, y } = cellOrigin(pos);
        const cell = byPos.get(pos);
        if (!cell) {
          return showEmpty ? (
            <Abs
              key={pos}
              x={x + 1}
              y={y + 1}
              w={CELL_W - 2}
              h={CELL_H - 2}
              style={{ border: `${u(0.5)} dashed #c4c7cc`, borderRadius: u(1) }}
            />
          ) : null;
        }
        return (
          <Abs key={pos} x={x} y={y} w={CELL_W} h={CELL_H}>
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, exact print size */}
            <img
              src={cell.src}
              alt=""
              style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
            />
          </Abs>
        );
      })}

      <CutMarks />

      {/* Order codes per row, rotated in the right margin, listed left → right. */}
      {Array.from({ length: ROWS }, (_, row) => {
        const codes = Array.from({ length: COLS }, (_, col) => byPos.get(row * COLS + col)?.code ?? "–");
        if (codes.every((c) => c === "–")) return null;
        return (
          <Abs
            key={row}
            x={rightMarginCenter}
            y={GRID_Y + row * CELL_H + CELL_H / 2}
            style={{
              transform: "translate(-50%, -50%) rotate(90deg)",
              fontSize: u(2.4),
              lineHeight: 1,
              whiteSpace: "nowrap",
              letterSpacing: u(0.1),
            }}
          >
            {codes.join("  ·  ")}
          </Abs>
        );
      })}
    </SheetFrame>
  );
}

/** Test page: cell outlines with labels plus 100 mm rulers to verify 100% scale. */
export function CalibrationSheet({ mode }: { mode: "print" | "preview" }) {
  const ticks = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
  const rulerX = GRID_X + 10;
  const rulerY = GRID_Y + CELL_H + 30;
  return (
    <SheetFrame mode={mode}>
      <Abs x={GRID_X} y={4.5} style={{ fontSize: u(2.4), lineHeight: 1 }}>
        Trang kiểm tra · mỗi ô phải đo được đúng 60 × 90 mm
      </Abs>
      {Array.from({ length: SLOTS_PER_SHEET }, (_, pos) => {
        const { x, y } = cellOrigin(pos);
        return (
          <Abs
            key={pos}
            x={x}
            y={y}
            w={CELL_W}
            h={CELL_H}
            style={{
              boxShadow: `inset 0 0 0 ${u(0.2)} #000`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: u(4),
            }}
          >
            {pos === 4 ? "" : "60 × 90"}
          </Abs>
        );
      })}
      {/* Horizontal 100 mm ruler inside the centre cell area */}
      <Abs x={rulerX} y={rulerY} w={100} h={0.2} style={{ background: "#000" }} />
      {ticks(100).map((i) => (
        <Abs
          key={`h${i}`}
          x={rulerX + i - 0.075}
          y={rulerY - (i % 10 === 0 ? 4 : i % 5 === 0 ? 2.5 : 1.5)}
          w={0.15}
          h={i % 10 === 0 ? 4 : i % 5 === 0 ? 2.5 : 1.5}
          style={{ background: "#000" }}
        />
      ))}
      <Abs x={rulerX} y={rulerY + 2} style={{ fontSize: u(3) }}>
        0
      </Abs>
      <Abs x={rulerX + 92} y={rulerY + 2} style={{ fontSize: u(3) }}>
        100 mm
      </Abs>
      <CutMarks />
    </SheetFrame>
  );
}
