"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PAGE_H, PAGE_W } from "@/lib/sheet-geometry";
import { Sheet, type SheetCell } from "./sheet";
import { cx } from "./ui";

export type ViewerItem = {
  key: string;
  title: string;
  cells: SheetCell[];
  /** Dashed outlines for empty positions (e.g. the sheet still being gathered). */
  showEmpty?: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const STEPS = [1, 1.5, 2, 3, 4, 5];
const PAD = 32;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Full-screen sheet viewer. Zoom 1 fits the whole A4 page on screen; zoom in with
 * the buttons, +/- keys, double-click, Ctrl + wheel (trackpad pinch) or a
 * two-finger pinch. Arrow keys and the side buttons move between sheets.
 */
export function SheetViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: ViewerItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = index !== null && index < items.length;
  const item = open ? items[index] : null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-[#0d0e10] p-0 text-white backdrop:bg-black/80"
      aria-label={item?.title}
    >
      {item && index !== null && (
        // Keyed by sheet so zoom and scroll reset when moving to another sheet.
        <ViewerBody
          key={item.key}
          item={item}
          index={index}
          count={items.length}
          onIndexChange={onIndexChange}
          onClose={onClose}
        />
      )}
    </dialog>
  );
}

function ViewerBody({
  item,
  index,
  count,
  onIndexChange,
  onClose,
}: {
  item: ViewerItem;
  index: number;
  count: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  /** Point (relative to the scroll viewport) to keep still while zooming. */
  const anchor = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);

  // Fit the whole page in the available area.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - PAD;
      const h = el.clientHeight - PAD;
      setFitW(Math.max(120, Math.min(w, (h * PAGE_W) / PAGE_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const el = scrollRef.current;
    const z = clamp(next);
    if (!el || z === zoomRef.current) return;
    const x = at?.x ?? el.clientWidth / 2;
    const y = at?.y ?? el.clientHeight / 2;
    anchor.current = {
      x,
      y,
      rx: (el.scrollLeft + x) / el.scrollWidth,
      ry: (el.scrollTop + y) / el.scrollHeight,
    };
    zoomRef.current = z;
    setZoom(z);
  }, []);

  // After the sheet is resized, scroll so the anchor point stays under the cursor/fingers.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollLeft = a.rx * el.scrollWidth - a.x;
    el.scrollTop = a.ry * el.scrollHeight - a.y;
    anchor.current = null;
  }, [zoom]);

  const zoomIn = useCallback(() => zoomTo(STEPS.find((s) => s > zoomRef.current + 0.01) ?? MAX_ZOOM), [zoomTo]);
  const zoomOut = useCallback(
    () => zoomTo([...STEPS].reverse().find((s) => s < zoomRef.current - 0.01) ?? MIN_ZOOM),
    [zoomTo],
  );

  // Ctrl + wheel and two-finger pinch need non-passive listeners to stop the page from zooming.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const local = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), local(e.clientX, e.clientY));
    };
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), z: zoomRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const mid = local(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2,
      );
      zoomTo(pinch.z * (dist(e.touches) / pinch.d), mid);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoomTo]);

  const hasPrev = index > 0;
  const hasNext = index < count - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") zoomTo(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, index, onIndexChange, zoomIn, zoomOut, zoomTo]);

  const toolButton =
    "flex size-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-white/10 pl-4 pr-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          {count > 1 && (
            <p className="text-xs tabular-nums text-white/55">
              {index + 1} / {count}
            </p>
          )}
        </div>
        <button className={toolButton} onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Thu nhỏ" title="Thu nhỏ (−)">
          <Minus className="size-5" />
        </button>
        <button
          className="h-9 min-w-16 rounded-full px-2 text-xs font-medium tabular-nums text-white/80 hover:bg-white/10"
          onClick={() => zoomTo(1)}
          title="Vừa màn hình (0)"
        >
          {zoom === 1 ? "Vừa" : `${Math.round(zoom * 100)}%`}
        </button>
        <button className={toolButton} onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Phóng to" title="Phóng to (+)">
          <Plus className="size-5" />
        </button>
        <span className="mx-1 h-6 w-px bg-white/15" aria-hidden />
        <button className={toolButton} onClick={onClose} aria-label="Đóng" title="Đóng (Esc)">
          <X className="size-5" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className={cx(
            "absolute inset-0 overflow-auto [scrollbar-color:rgb(255_255_255/0.3)_transparent]",
            zoom > 1 ? "cursor-zoom-out" : "cursor-zoom-in",
          )}
          onDoubleClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            zoomTo(zoomRef.current > 1 ? 1 : 2.5, { x: e.clientX - r.left, y: e.clientY - r.top });
          }}
        >
          {/* w-max + m-auto: centred when small, scrollable from the edges when zoomed. */}
          <div className="flex min-h-full w-max min-w-full p-4">
            <div className="m-auto shrink-0 shadow-2xl shadow-black/50" style={{ width: fitW * zoom || undefined }}>
              {fitW > 0 && <Sheet mode="preview" cells={item.cells} showEmpty={item.showEmpty ?? false} />}
            </div>
          </div>
        </div>

        {hasPrev && (
          <button
            onClick={() => onIndexChange(index - 1)}
            aria-label="Tờ trước"
            className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onIndexChange(index + 1)}
            aria-label="Tờ sau"
            className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {(item.meta || item.actions) && (
        <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm">
          <div className="min-w-0 flex-1 text-white/75">{item.meta}</div>
          {item.actions && <div className="flex gap-2">{item.actions}</div>}
        </footer>
      )}
    </div>
  );
}
