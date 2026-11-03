"use client";

import { History, RotateCw } from "lucide-react";
import { useState } from "react";
import { useQueue } from "@/components/queue-context";
import { Sheet } from "@/components/sheet";
import { SheetViewer, type ViewerItem } from "@/components/sheet-viewer";
import { Button, OrderCode, Spinner, ViewToggle, useToast } from "@/components/ui";
import { api, usePoll, useViewMode } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { HISTORY_POLL_MS } from "@/lib/poll";
import type { HistoryDTO, SheetDTO } from "@/lib/types";

const TRIGGER_LABEL: Record<SheetDTO["trigger"], string> = {
  auto: "Đủ 9 tấm",
  manual: "In sớm",
  reprint: "In lại",
};

const codesOf = (s: SheetDTO) => [...new Set(s.cells.map((c) => c.code))];

export default function HistoryPage() {
  const { data, error, refresh } = usePoll<HistoryDTO>("/api/sheets", HISTORY_POLL_MS);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [mode, setMode] = useViewMode("history", "grid");
  const isAdmin = data?.viewer.role === "admin";

  const items: ViewerItem[] = (data?.sheets ?? []).map((s) => ({
    key: s.id,
    title: `Tờ #${s.number} · ${s.cells.length}/9 ảnh`,
    cells: s.cells,
    meta: <SheetMeta sheet={s} />,
    actions: isAdmin ? (
      <ReprintButton
        sheet={s}
        onDone={() => {
          // Close so the confirmation toast (below the modal layer) is visible.
          setViewIndex(null);
          refresh();
        }}
      />
    ) : undefined,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Đã in</h1>
        {data && data.sheets.length > 0 && <ViewToggle value={mode} onChange={setMode} />}
      </div>
      {!data ? (
        error ? (
          <p className="py-20 text-center text-sm text-muted">Không tải được lịch sử.</p>
        ) : (
          <div className="flex justify-center py-20 text-muted">
            <Spinner className="size-6" />
          </div>
        )
      ) : data.sheets.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center">
          <History className="size-8 text-muted" />
          <p className="mt-3 text-sm font-medium">Chưa in tờ nào</p>
          <p className="mt-1 text-sm text-muted">Các tờ đã in sẽ hiện ở đây để tra mã đơn hoặc xem lại.</p>
        </div>
      ) : mode === "grid" ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.sheets.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => setViewIndex(i)}
                className="group w-full rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:border-border-strong"
              >
                <div className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--border)]">
                  <Sheet mode="preview" cells={s.cells} showEmpty={false} />
                </div>
                <div className="px-1 pb-1 pt-2.5">
                  <p className="text-sm font-medium">Tờ #{s.number}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {s.printedAt && formatDateTime(s.printedAt)} · {TRIGGER_LABEL[s.trigger]}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {data.sheets.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => setViewIndex(i)}
                className="flex w-full items-center gap-4 p-3 text-left transition-colors hover:bg-surface-2"
              >
                <div className="w-12 shrink-0 overflow-hidden rounded-sm shadow-[0_0_0_1px_var(--border)]">
                  <Sheet mode="preview" cells={s.cells} showEmpty={false} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Tờ #{s.number} · {s.cells.length} ảnh
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {s.printedAt && formatDateTime(s.printedAt)} · {TRIGGER_LABEL[s.trigger]}
                    {s.stationName && <> · {s.stationName}</>}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {codesOf(s).map((c) => (
                      <OrderCode key={c} code={c} className="h-5 text-[11px]" />
                    ))}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SheetViewer items={items} index={viewIndex} onIndexChange={setViewIndex} onClose={() => setViewIndex(null)} />
    </div>
  );
}

function SheetMeta({ sheet }: { sheet: SheetDTO }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs">
        {sheet.printedAt && formatDateTime(sheet.printedAt)} · {TRIGGER_LABEL[sheet.trigger]}
        {sheet.stationName && <> · In ở {sheet.stationName}</>}
      </p>
      <div className="flex flex-wrap gap-1">
        {codesOf(sheet).map((c) => (
          <OrderCode key={c} code={c} className="h-5 bg-white/15! text-[11px] text-white!" />
        ))}
      </div>
    </div>
  );
}

function ReprintButton({ sheet, onDone }: { sheet: SheetDTO; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { refresh: refreshQueue } = useQueue();
  return (
    <Button
      variant="primary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/sheets/${sheet.id}`, { method: "POST", json: { action: "reprint" } });
          toast(`Đã gửi lại tờ #${sheet.number} tới máy in.`);
          onDone();
          refreshQueue();
        } catch {
          toast("Không gửi được lệnh in lại.", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <RotateCw className="size-4" />
      In lại tờ này
    </Button>
  );
}
