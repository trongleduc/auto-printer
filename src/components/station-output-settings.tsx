"use client";

import { FileDown, FolderOpen, Printer } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  exampleFileName,
  folderPermission,
  folderSupported,
  pickFolder,
  readOutput,
  requestFolderPermission,
  savePrefs,
  type OutputPrefs,
  type OutputState,
} from "@/lib/station-output";
import { Button, cx } from "./ui";

const noopSubscribe = () => () => {};

/**
 * Output settings of the print station running in THIS browser (printer or PDF
 * to a folder). Shown in /admin on the station PC; the station page picks up
 * changes on its next poll.
 */
export function StationOutputSettings() {
  const [state, setState] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Server snapshot is false so the prerendered shell matches before hydration.
  const supported = useSyncExternalStore(noopSubscribe, folderSupported, () => false);

  useEffect(() => {
    readOutput().then(setState);
  }, []);

  // This section only exists once loaded, so the browser's own jump to #output finds nothing.
  const loaded = state !== null;
  useEffect(() => {
    if (loaded && location.hash === "#output") document.getElementById("output")?.scrollIntoView();
  }, [loaded]);

  if (!state) return <div className="h-24 animate-pulse rounded-lg bg-surface-2" />;
  const { prefs, folder, folderState } = state;

  const update = (patch: Partial<OutputPrefs>) => {
    const next = { ...prefs, ...patch };
    savePrefs(next);
    setState({ ...state, prefs: next });
  };
  const choose = async () => {
    setError(null);
    try {
      const h = await pickFolder();
      setState({ ...state, folder: h, folderState: await folderPermission(h) });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Không chọn được thư mục này. Hãy chọn thư mục khác.");
    }
  };
  const allow = async () => {
    if (!folder) return;
    const ok = await requestFolderPermission(folder).catch(() => false);
    setState({ ...state, folderState: ok ? "granted" : "denied" });
  };

  const modes = [
    { v: "printer" as const, label: "In ra máy in", Icon: Printer, hint: "In không cần bấm, tới máy in đã chọn trong Chrome (cần mở bằng file “Tram in”)." },
    { v: "pdf" as const, label: "Lưu PDF vào thư mục", Icon: FileDown, hint: "Không cần máy in. Dùng để thử hoặc để in sau." },
  ];

  return (
    <div id="output" className="scroll-mt-20 space-y-3">
      <p className="text-sm font-medium">Đầu ra của máy này</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Chế độ xuất">
        {modes.map(({ v, label, Icon, hint }) => {
          const disabled = v === "pdf" && !supported;
          const on = prefs.mode === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => update({ mode: v })}
              className={cx(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50",
                on ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-surface-2",
              )}
            >
              <Icon className={cx("mt-0.5 size-5 shrink-0", on ? "text-accent" : "text-muted")} />
              <span>
                <span className={cx("block text-sm font-medium", on && "text-accent")}>{label}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {disabled ? "Trình duyệt này không hỗ trợ. Dùng Chrome hoặc Edge." : hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {prefs.mode === "printer" && (
        <div className="flex gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <Printer className="size-5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Máy in được chọn trong Chrome, không chọn ở đây</p>
            <p className="mt-0.5 text-xs text-muted">
              Trang web không xem được danh sách máy in. Mở file “Chon may in” trên Desktop rồi chọn máy in trong hộp thoại. Sau
              đó mở file “Tram in”, trạm sẽ in vào máy đó từ các lần sau.
            </p>
            <a href="#guide" className="mt-1.5 inline-block text-xs underline">
              Xem hướng dẫn cài đặt
            </a>
          </div>
        </div>
      )}

      {prefs.mode === "pdf" && supported && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <FolderOpen className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{folder ? folder.name : "Chưa chọn thư mục"}</p>
              <p className={cx("text-xs", folderState === "granted" ? "text-ok" : folder ? "text-warn" : "text-muted")}>
                {folderState === "granted"
                  ? "Đã cho phép ghi file"
                  : folderState === "denied"
                    ? "Bị từ chối quyền ghi. Bấm “Cho phép” lại hoặc chọn thư mục khác."
                    : folder
                      ? "Chrome cần bạn cho phép lại. Trạm sẽ không nhận tờ cho tới khi được phép."
                      : "Chọn thư mục để lưu các file PDF"}
              </p>
            </div>
            {folder && folderState !== "granted" && (
              <Button size="sm" variant="primary" onClick={allow}>
                Cho phép
              </Button>
            )}
            <Button size="sm" onClick={choose}>
              {folder ? "Đổi thư mục" : "Chọn thư mục"}
            </Button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.perDay}
              onChange={(e) => update({ perDay: e.target.checked })}
              className="size-4 accent-[var(--accent)]"
            />
            Tạo thư mục con theo ngày
          </label>
          <p className="text-xs text-muted">
            Ví dụ: <code className="font-mono">{(folder?.name ?? "Thư mục") + "/" + exampleFileName(prefs.perDay)}</code>
          </p>
          <p className="text-xs text-muted">
            Khi Chrome hỏi quyền, chọn <span className="font-medium text-text">“Cho phép mỗi lần truy cập”</span> (Allow on
            every visit) để sau khi mở lại máy không phải cho phép lại.
          </p>
        </div>
      )}
    </div>
  );
}
