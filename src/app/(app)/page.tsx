"use client";

import { AlertTriangle, ChevronDown, ImageIcon, Maximize2, Printer, Trash2, WifiOff } from "lucide-react";
import { useState } from "react";
import { useQueue } from "@/components/queue-context";
import { Sheet } from "@/components/sheet";
import { SheetViewer, type ViewerItem } from "@/components/sheet-viewer";
import {
  Button,
  ConfirmDialog,
  IconButton,
  OrderCode,
  Section,
  Spinner,
  ViewToggle,
  cx,
  useToast,
} from "@/components/ui";
import { UploadButton } from "@/components/upload";
import { api, useNow, useViewMode } from "@/lib/client";
import { formatAgo, formatTime } from "@/lib/format";
import { SLOTS_PER_SHEET } from "@/lib/sheet-geometry";
import type { PendingOrderDTO, QueueDTO, SheetDTO } from "@/lib/types";

/** What the sheet viewer shows: the sheet being gathered, or one of the open sheets. */
type Viewing = { kind: "gathering" } | { kind: "open"; index: number } | null;

export default function QueuePage() {
  const { queue, error, refresh } = useQueue();
  const [viewing, setViewing] = useState<Viewing>(null);

  if (!queue) {
    return error ? (
      <p className="py-20 text-center text-sm text-muted">Không tải được hàng đợi. Đang thử lại…</p>
    ) : (
      <div className="flex justify-center py-20 text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }

  const isAdmin = queue.viewer.role === "admin";
  const viewerItems: ViewerItem[] =
    viewing?.kind === "gathering"
      ? [
          {
            key: "gathering",
            title: `Tờ đang gom · ${queue.gathering.length}/${SLOTS_PER_SHEET}`,
            cells: queue.gathering,
            showEmpty: true,
          },
        ]
      : queue.openSheets.map((s) => ({
          key: s.id,
          title: `Tờ #${s.number} · ${s.cells.length} ảnh`,
          cells: s.cells,
          meta: <OpenSheetMeta sheet={s} />,
        }));
  const viewerIndex = viewing === null ? null : viewing.kind === "gathering" ? 0 : viewing.index;

  return (
    <div className="space-y-8">
      <h1 className="sr-only">Hàng đợi in</h1>
      <GatheringCard queue={queue} isAdmin={isAdmin} onChange={refresh} onView={() => setViewing({ kind: "gathering" })} />
      {queue.openSheets.length > 0 && (
        <OpenSheets queue={queue} isAdmin={isAdmin} onChange={refresh} onView={(index) => setViewing({ kind: "open", index })} />
      )}
      <PendingOrders orders={queue.pendingOrders} isAdmin={isAdmin} onChange={refresh} />
      <SheetViewer
        items={viewerItems}
        index={viewerIndex}
        onIndexChange={(index) => setViewing({ kind: "open", index })}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

/** Thumbnail that opens the full-screen viewer. */
function SheetThumb({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Xem phóng to"
      className={cx(
        "group relative shrink-0 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--border)] transition-shadow hover:shadow-[0_0_0_2px_var(--accent)]",
        className,
      )}
    >
      {children}
      <span className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 className="size-3.5" />
      </span>
    </button>
  );
}

function GatheringCard({
  queue,
  isAdmin,
  onChange,
  onView,
}: {
  queue: QueueDTO;
  isAdmin: boolean;
  onChange: () => void;
  onView: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const n = queue.gathering.length;
  const missing = SLOTS_PER_SHEET - n;

  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-surface p-4 sm:gap-6 sm:p-5">
      <SheetThumb onClick={onView} className="w-28 sm:w-36">
        <Sheet mode="preview" cells={queue.gathering} />
      </SheetThumb>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-medium text-muted">Tờ đang gom</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {n}
          <span className="text-2xl text-muted">/{SLOTS_PER_SHEET}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {n === 0
            ? "Chưa có ảnh nào đang chờ. Tờ sẽ tự in khi đủ 9 tấm."
            : `Còn ${missing} tấm nữa là tự in.`}
          {queue.autoFlushAt && n > 0 && <> Nếu chưa đủ, tự in lúc {formatTime(queue.autoFlushAt)}.</>}
        </p>
        {isAdmin && n > 0 && (
          <div className="mt-auto pt-4">
            <Button size="sm" onClick={() => setConfirm(true)}>
              <Printer className="size-4" />
              In ngay {n} tấm
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="In tờ chưa đủ?"
        message={`Tờ này chỉ có ${n}/9 ảnh, ${missing} ô còn lại sẽ để trống.`}
        confirmLabel="In ngay"
        onConfirm={async () => {
          try {
            await api("/api/queue/flush", { method: "POST" });
            toast("Đã gửi tờ tới máy in.");
            onChange();
          } catch {
            toast("Không gửi được lệnh in.", "error");
          }
        }}
      />
    </div>
  );
}

function OpenSheets({
  queue,
  isAdmin,
  onChange,
  onView,
}: {
  queue: QueueDTO;
  isAdmin: boolean;
  onChange: () => void;
  onView: (index: number) => void;
}) {
  const now = useNow();
  const station = queue.station;
  return (
    <Section title="Đang gửi tới máy in">
      {!station?.online && (
        <div className="flex gap-3 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          <p>
            {!station ? (
              <>Chưa chọn máy in chính. </>
            ) : (
              <>
                Máy in “{station.name}” đang không kết nối
                {station.lastSeenAt && <> (lần cuối {formatAgo(station.lastSeenAt, now)})</>}.{" "}
              </>
            )}
            Các tờ dưới đây sẽ được in khi máy in hoạt động lại.
          </p>
        </div>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {queue.openSheets.map((s, i) => (
          <OpenSheetRow key={s.id} sheet={s} isAdmin={isAdmin} onChange={onChange} onView={() => onView(i)} />
        ))}
      </ul>
    </Section>
  );
}

function SheetStatus({ sheet }: { sheet: SheetDTO }) {
  if (sheet.stuck) {
    return (
      <span className="inline-flex items-center gap-1 text-warn">
        <AlertTriangle className="size-3.5" /> Không nhận được xác nhận in
      </span>
    );
  }
  if (sheet.status === "printing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-accent">
        <Spinner className="size-3" /> Đang in{sheet.stationName && ` ở ${sheet.stationName}`}
      </span>
    );
  }
  return <span>Chờ máy in</span>;
}

function OpenSheetMeta({ sheet }: { sheet: SheetDTO }) {
  const codes = [...new Set(sheet.cells.map((c) => c.code))];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <SheetStatus sheet={sheet} />
      <span aria-hidden>·</span>
      {codes.map((c) => (
        <OrderCode key={c} code={c} className="h-5 text-[11px]" />
      ))}
    </div>
  );
}

function OpenSheetRow({
  sheet,
  isAdmin,
  onChange,
  onView,
}: {
  sheet: SheetDTO;
  isAdmin: boolean;
  onChange: () => void;
  onView: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: "retry" | "mark_printed") => {
    setBusy(action);
    try {
      await api(`/api/sheets/${sheet.id}`, { method: "POST", json: { action } });
      onChange();
    } catch {
      toast("Không thực hiện được.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
      <SheetThumb onClick={onView} className="w-12 rounded-sm">
        <Sheet mode="preview" cells={sheet.cells} showEmpty={false} />
      </SheetThumb>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Tờ #{sheet.number} · {sheet.cells.length} ảnh
        </p>
        <div className="mt-1 text-muted">
          <OpenSheetMeta sheet={sheet} />
        </div>
        {sheet.stuck && !isAdmin && <p className="mt-1 text-xs text-muted">Báo quản trị để kiểm tra máy in.</p>}
      </div>
      {sheet.stuck && isAdmin && (
        <div className="flex w-full gap-2 sm:w-auto">
          <Button size="sm" className="flex-1" loading={busy === "mark_printed"} onClick={() => act("mark_printed")}>
            Đã ra giấy
          </Button>
          <Button size="sm" className="flex-1" loading={busy === "retry"} onClick={() => act("retry")}>
            In lại
          </Button>
        </div>
      )}
    </li>
  );
}

type CancelTarget = { kind: "order"; order: PendingOrderDTO } | { kind: "photo"; order: PendingOrderDTO; photoId: string };

function PendingOrders({ orders, isAdmin, onChange }: { orders: PendingOrderDTO[]; isAdmin: boolean; onChange: () => void }) {
  const [mode, setMode] = useViewMode("pending-orders", "list");
  const [cancel, setCancel] = useState<CancelTarget | null>(null);
  const toast = useToast();
  const canCancel = (o: PendingOrderDTO) => isAdmin || o.mine;

  if (orders.length === 0) {
    return (
      <Section title="Đơn đang chờ">
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center">
          <ImageIcon className="size-8 text-muted" />
          <p className="mt-3 text-sm font-medium">Không có đơn nào đang chờ</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Tải ảnh lên và chọn số lượng. Hệ thống tự ghép 9 tấm vào một tờ A4 rồi in.
          </p>
          <UploadButton className="mt-5" />
        </div>
      </Section>
    );
  }

  const copies = (o: PendingOrderDTO) => o.photos.reduce((s, p) => s + p.queued, 0);

  return (
    <Section title={`Đơn đang chờ · ${orders.length}`} action={<ViewToggle value={mode} onChange={setMode} />}>
      {mode === "list" ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} canCancel={canCancel(o)} onCancel={setCancel} />
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {orders.flatMap((o) =>
            o.photos.map((p) => (
              <li key={p.id} className="relative">
                <PhotoTile src={p.src} queued={p.queued} />
                <OrderCode code={o.code} className="absolute left-1.5 top-1.5 h-5 bg-black/60! text-[11px] text-white!" />
                {canCancel(o) && (
                  <PhotoCancelButton onClick={() => setCancel({ kind: "photo", order: o, photoId: p.id })} />
                )}
              </li>
            )),
          )}
        </ul>
      )}
      {!isAdmin && orders.some((o) => !o.mine) && (
        <p className="text-xs text-muted">Bạn chỉ hủy được những đơn tải lên từ máy này.</p>
      )}

      <ConfirmDialog
        open={cancel !== null}
        onClose={() => setCancel(null)}
        danger
        title={cancel?.kind === "photo" ? "Hủy ảnh này?" : `Hủy đơn ${cancel?.order.code}?`}
        message={
          cancel?.kind === "photo"
            ? "Các bản chưa in của ảnh này sẽ bị bỏ khỏi hàng đợi."
            : `${cancel ? copies(cancel.order) : 0} tấm chưa in sẽ bị bỏ khỏi hàng đợi. Những tờ đã gửi tới máy in không bị ảnh hưởng.`
        }
        confirmLabel="Hủy in"
        onConfirm={async () => {
          if (!cancel) return;
          try {
            await api(cancel.kind === "photo" ? `/api/photos/${cancel.photoId}` : `/api/orders/${cancel.order.id}`, {
              method: "DELETE",
            });
            onChange();
          } catch {
            toast("Không hủy được.", "error");
          }
        }}
      />
    </Section>
  );
}

function PhotoTile({ src, queued }: { src: string; queued: number }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL */}
      <img src={src} alt="" className="aspect-[2/3] w-full rounded-md border border-border bg-white object-contain" />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
        ×{queued}
      </span>
    </>
  );
}

function PhotoCancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Hủy ảnh này"
      className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

function OrderRow({
  order,
  canCancel,
  onCancel,
}: {
  order: PendingOrderDTO;
  canCancel: boolean;
  onCancel: (t: CancelTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const copies = order.photos.reduce((s, p) => s + p.queued, 0);

  return (
    <li>
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <div className="flex shrink-0 -space-x-4">
            {order.photos.slice(0, 3).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL
              <img
                key={p.id}
                src={p.src}
                alt=""
                className="h-12 w-8 rounded-[3px] bg-white object-contain shadow-[0_0_0_2px_var(--surface),0_0_0_3px_var(--border)]"
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <OrderCode code={order.code} />
              <span className="truncate text-sm font-medium">{order.label || "Không có ghi chú"}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {copies} tấm chờ in · {order.photos.length} ảnh · {formatAgo(order.createdAt, now)}
            </p>
          </div>
          <ChevronDown className={cx("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </button>
        {canCancel && (
          <IconButton label="Hủy phần chưa in của đơn" onClick={() => onCancel({ kind: "order", order })}>
            <Trash2 className="size-[18px]" />
          </IconButton>
        )}
      </div>

      {open && (
        <ul className="grid grid-cols-3 gap-3 px-3 pb-4 sm:grid-cols-6">
          {order.photos.map((p) => (
            <li key={p.id} className="relative">
              <PhotoTile src={p.src} queued={p.queued} />
              {canCancel && <PhotoCancelButton onClick={() => onCancel({ kind: "photo", order, photoId: p.id })} />}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
