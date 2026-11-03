"use client";

import { AlertCircle, ImagePlus, Plus, RotateCw, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import { processPhoto } from "@/lib/image";
import { SLOTS_PER_SHEET } from "@/lib/sheet-geometry";
import { useQueue } from "./queue-context";
import { Button, Dialog, Spinner, Stepper, cx, useToast } from "./ui";

type Item = {
  id: string;
  name: string;
  status: "processing" | "ready" | "error";
  error?: string;
  blob?: Blob;
  preview?: string;
  quantity: number;
  /** 0–1 while uploading */
  progress: number | null;
  key?: string;
  uploadError?: boolean;
};

type SignResponse = {
  uploads: { key: string; url: string }[];
  headers: Record<string, string>;
};

const UploadCtx = createContext<{ openPicker: () => void }>({ openPicker: () => {} });
export const useUpload = () => useContext(UploadCtx);

function putWithProgress(url: string, blob: Blob, headers: Record<string, string>, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(blob);
  });
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { queue, refresh } = useQueue();
  const toast = useToast();
  const open = items.length > 0;

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
      if (!images.length) return;
      const fresh: Item[] = images.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        status: "processing",
        quantity: 1,
        progress: null,
      }));
      setItems((list) => [...list, ...fresh]);
      // One at a time: full-size phone photos are large and decoding many at once can crash mobile Safari.
      for (let i = 0; i < images.length; i++) {
        try {
          const blob = await processPhoto(images[i]);
          patch(fresh[i].id, { status: "ready", blob, preview: URL.createObjectURL(blob) });
        } catch (e) {
          patch(fresh[i].id, { status: "error", error: (e as Error).message });
        }
      }
    },
    [patch],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const reset = useCallback(() => {
    setItems((list) => {
      list.forEach((it) => it.preview && URL.revokeObjectURL(it.preview));
      return [];
    });
    setLabel("");
  }, []);

  const remove = (id: string) =>
    setItems((list) => {
      const it = list.find((x) => x.id === id);
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return list.filter((x) => x.id !== id);
    });

  // Desktop: drop files anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => hasFiles(e) && (depth++, setDragging(true));
    const leave = (e: DragEvent) => hasFiles(e) && --depth <= 0 && ((depth = 0), setDragging(false));
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  const ready = items.filter((it) => it.status === "ready");
  const processing = items.some((it) => it.status === "processing");
  const total = ready.reduce((s, it) => s + it.quantity, 0);

  const submit = async () => {
    setSubmitting(true);
    try {
      // Upload whatever has not reached R2 yet (also used for "retry").
      const keys = new Map(ready.filter((it) => it.key).map((it) => [it.id, it.key!]));
      const pending = ready.filter((it) => !it.key);
      if (pending.length) {
        const signed = await api<SignResponse>("/api/uploads/sign", { method: "POST", json: { count: pending.length } });
        let failed = false;
        await mapLimit(
          pending.map((it, i) => ({ it, ...signed.uploads[i] })),
          3,
          async ({ it, key, url }) => {
            patch(it.id, { progress: 0, uploadError: false });
            try {
              await putWithProgress(url, it.blob!, signed.headers, (p) => patch(it.id, { progress: p }));
              patch(it.id, { key, progress: 1 });
              keys.set(it.id, key);
            } catch {
              failed = true;
              patch(it.id, { progress: null, uploadError: true });
            }
          },
        );
        if (failed) {
          toast("Một số ảnh tải lên không thành công. Bấm “Thử lại”.", "error");
          return;
        }
      }
      const order = await api<{ code: string; sheetsCreated: number }>("/api/orders", {
        method: "POST",
        json: { label, photos: ready.map((it) => ({ key: keys.get(it.id)!, quantity: it.quantity })) },
      });
      toast(
        order.sheetsCreated > 0
          ? `Đơn ${order.code}: ${total} tấm. Đã gửi ${order.sheetsCreated} tờ tới máy in.`
          : `Đơn ${order.code}: ${total} tấm đã vào hàng đợi.`,
      );
      reset();
      refresh();
    } catch {
      toast("Không gửi được đơn. Kiểm tra kết nối rồi thử lại.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const queued = queue?.queuedCount ?? 0;
  const willPrint = Math.floor((queued + total) / SLOTS_PER_SHEET);
  const leftover = (queued + total) % SLOTS_PER_SHEET;
  const hasUploadError = items.some((it) => it.uploadError);

  return (
    <UploadCtx.Provider value={{ openPicker }}>
      {children}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80">
          <p className="text-base font-medium text-accent">Thả ảnh vào đây để thêm vào đơn</p>
        </div>
      )}

      <Dialog
        open={open}
        wide
        onClose={() => !submitting && reset()}
        title={`Đơn mới · ${items.length} ảnh`}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              {total > 0 ? (
                willPrint > 0 ? (
                  <>
                    In ngay <b className="text-text">{willPrint} tờ</b>
                    {leftover > 0 && <>, {leftover} tấm chờ ghép tiếp</>}
                  </>
                ) : (
                  <>
                    Cần thêm <b className="text-text">{SLOTS_PER_SHEET - leftover} tấm</b> nữa để đủ một tờ
                  </>
                )
              ) : (
                "Đang xử lý ảnh…"
              )}
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={submit}
              loading={submitting}
              disabled={processing || ready.length === 0}
            >
              {hasUploadError ? <RotateCw className="size-4" /> : null}
              {hasUploadError ? "Thử lại" : `Thêm vào hàng đợi · ${total} tấm`}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="mb-1.5 block text-sm font-medium">Tên khách hoặc ghi chú</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="Không bắt buộc"
                className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base outline-none focus:border-accent sm:text-sm"
              />
            </label>
            {items.length > 1 && (
              <div>
                <span className="mb-1.5 block text-sm font-medium">Số lượng mỗi ảnh</span>
                <Stepper
                  label="Số lượng cho tất cả ảnh"
                  value={items[0].quantity}
                  onChange={(v) => setItems((list) => list.map((it) => ({ ...it, quantity: v })))}
                />
              </div>
            )}
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {items.map((it) => (
              <li key={it.id} className="flex flex-col gap-2">
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-white">
                  {it.preview && (
                    // eslint-disable-next-line @next/next/no-img-element -- local object URL
                    <img src={it.preview} alt={it.name} className="size-full object-contain" />
                  )}
                  {it.status === "processing" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-muted">
                      <Spinner className="size-5" />
                    </div>
                  )}
                  {(it.status === "error" || it.uploadError) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger-soft p-2 text-center text-xs text-danger">
                      <AlertCircle className="size-5" />
                      {it.uploadError ? "Tải lên lỗi" : it.error}
                    </div>
                  )}
                  {it.progress !== null && it.progress < 1 && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
                      <div className="h-full bg-accent transition-[width]" style={{ width: `${it.progress * 100}%` }} />
                    </div>
                  )}
                  {!submitting && (
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      aria-label="Bỏ ảnh này"
                      className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                <Stepper
                  label={`Số lượng in ${it.name}`}
                  value={it.quantity}
                  onChange={(v) => patch(it.id, { quantity: v })}
                />
              </li>
            ))}
            {!submitting && (
              <li>
                <button
                  type="button"
                  onClick={openPicker}
                  className={cx(
                    "flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong",
                    "text-sm text-muted transition-colors hover:border-accent hover:text-accent",
                  )}
                >
                  <ImagePlus className="size-6" />
                  Thêm ảnh
                </button>
              </li>
            )}
          </ul>
        </div>
      </Dialog>
    </UploadCtx.Provider>
  );
}

export function UploadButton({ className }: { className?: string }) {
  const { openPicker } = useUpload();
  return (
    <Button variant="primary" size="lg" onClick={openPicker} className={className}>
      <Plus className="size-5" />
      Tải ảnh lên
    </Button>
  );
}
