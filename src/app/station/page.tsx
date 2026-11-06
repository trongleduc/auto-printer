"use client";

import { AlertTriangle, Check, FileDown, FolderOpen, MonitorOff, PauseCircle, Printer, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Sheet } from "@/components/sheet";
import { buttonStyles, cx } from "@/components/ui";
import { ApiError, api } from "@/lib/client";
import { STATION_PAUSE_WHEN_HIDDEN, STATION_POLL_MS } from "@/lib/poll";
import { buildSheetPdf } from "@/lib/sheet-pdf";
import { outputReady, readOutput, writeSheetFile, type DirHandle, type OutputState } from "@/lib/station-output";
import type { SheetDTO, StationPollDTO } from "@/lib/types";

const RETRY_MS = 5000;
const IMAGE_TIMEOUT_MS = 30_000;
/** window.print() taking longer than this means a dialog was shown, i.e. kiosk printing is off. */
const DIALOG_SUSPECT_MS = 1500;
/** Where this PC's output (printer / PDF folder) is configured. */
const SETTINGS_HREF = "/admin#output";

type Phase =
  | { kind: "connecting" }
  | { kind: "idle" }
  | { kind: "standby"; activeStationName: string | null }
  | { kind: "needs_setup" }
  | { kind: "printing"; number: number }
  | { kind: "offline" }
  | { kind: "image_error"; number: number }
  | { kind: "write_error"; number: number }
  | { kind: "unregistered" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** In dev, a hidden station tab stops polling until it is visible again. */
async function waitUntilVisible() {
  if (!STATION_PAUSE_WHEN_HIDDEN || document.visibilityState === "visible") return;
  await new Promise<void>((resolve) => {
    const on = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", on);
      resolve();
    };
    document.addEventListener("visibilitychange", on);
  });
}

async function waitForImages(root: HTMLElement) {
  const imgs = [...root.querySelectorAll("img")];
  const all = Promise.all(imgs.map((img) => img.decode()));
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), IMAGE_TIMEOUT_MS));
  await Promise.race([all, timeout]);
}

/** Retries a request that must not be lost, e.g. the "printed" ack. */
async function persistent(fn: () => Promise<unknown>, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // station was removed
      await sleep(Math.min(30_000, 1000 * 2 ** i));
    }
  }
}

const p2 = (n: number) => String(n).padStart(2, "0");
const when = (d = new Date()) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
/** Printed header. The PDF version is ASCII because PDF standard fonts lack Vietnamese letters. */
const sheetHeader = (s: SheetDTO) => `Tờ #${s.number} · ${when()} · ${s.cells.length}/9`;
const pdfHeader = (s: SheetDTO) => `To #${s.number} · ${when()} · ${s.cells.length}/9`;

export default function StationPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "connecting" });
  const [name, setName] = useState<string | null>(null);
  const [current, setCurrent] = useState<SheetDTO | null>(null);
  const [printed, setPrinted] = useState<{ number: number; at: Date; count: number; file?: string }[]>([]);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [dialogShown, setDialogShown] = useState(false);
  /** Last output settings read (they are edited in /admin on this PC). */
  const [output, setOutput] = useState<OutputState | null>(null);
  const printRoot = useRef<HTMLDivElement>(null);

  // Keep the screen (and thus the page) awake.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* not supported or denied; the setup guide covers disabling sleep */
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let stopped = false;

    const release = (id: string) =>
      persistent(() => api(`/api/station/sheets/${id}/release`, { method: "POST", noRedirect: true }));
    const ack = (id: string) =>
      persistent(() => api(`/api/station/sheets/${id}/printed`, { method: "POST", noRedirect: true }));
    const done = (sheet: SheetDTO, file?: string) => {
      setPrinted((list) => [{ number: sheet.number, at: new Date(), count: sheet.cells.length, file }, ...list].slice(0, 20));
      setPhase({ kind: "idle" });
    };

    async function printToPrinter(sheet: SheetDTO) {
      flushSync(() => setCurrent(sheet));
      try {
        await waitForImages(printRoot.current!);
      } catch {
        // Images could not load (network/R2). Put the sheet back so it is printed later.
        setPhase({ kind: "image_error", number: sheet.number });
        await release(sheet.id);
        await sleep(10_000);
        return;
      }
      // With Chrome's --kiosk-printing flag this prints without a dialog to the destination last chosen in this profile.
      const started = performance.now();
      window.print();
      // window.print() blocks while a print dialog is open; kiosk printing returns almost at once.
      if (performance.now() - started > DIALOG_SUSPECT_MS) setDialogShown(true);
      await ack(sheet.id);
      done(sheet);
    }

    async function saveToFolder(sheet: SheetDTO, folder: DirHandle, perDay: boolean) {
      let bytes: Uint8Array;
      try {
        bytes = await buildSheetPdf(sheet.cells, pdfHeader(sheet), AbortSignal.timeout(IMAGE_TIMEOUT_MS));
      } catch {
        setPhase({ kind: "image_error", number: sheet.number });
        await release(sheet.id);
        await sleep(10_000);
        return;
      }
      let file: string;
      try {
        file = await writeSheetFile(folder, sheet.number, bytes, perDay);
      } catch {
        // Folder removed, disk full or permission withdrawn: nothing was written, so the sheet can go back.
        setPhase({ kind: "write_error", number: sheet.number });
        await release(sheet.id);
        await sleep(10_000);
        return;
      }
      await ack(sheet.id);
      done(sheet, file);
    }

    async function loop() {
      while (!stopped) {
        await waitUntilVisible();
        // Re-read every time, so changes made in /admin apply without reloading this page.
        const out = await readOutput();
        setOutput(out);
        const ready = outputReady(out);
        let poll: StationPollDTO;
        try {
          // Not ready to output: heartbeat only, so no sheet is claimed and then failed.
          poll = await api<StationPollDTO>("/api/station/claim", {
            method: "POST",
            json: { claim: ready },
            noRedirect: true,
          });
          setLastPoll(new Date());
          setName(poll.name);
        } catch (e) {
          if (stopped) return;
          if (e instanceof ApiError && e.status === 401) {
            // Not registered, or removed by an admin. Check again now and then.
            setPhase({ kind: "unregistered" });
            await sleep(30_000);
            continue;
          }
          setPhase({ kind: "offline" });
          await sleep(RETRY_MS);
          continue;
        }
        if (stopped) {
          // Claimed while unmounting (e.g. React dev double-mount): hand it back.
          if (poll.sheet) await release(poll.sheet.id);
          return;
        }
        if (poll.sheet) {
          setPhase({ kind: "printing", number: poll.sheet.number });
          if (out.prefs.mode === "pdf" && out.folder) await saveToFolder(poll.sheet, out.folder, out.prefs.perDay);
          else await printToPrinter(poll.sheet);
        } else {
          setPhase(
            !poll.active
              ? { kind: "standby", activeStationName: poll.activeStationName }
              : ready
                ? { kind: "idle" }
                : { kind: "needs_setup" },
          );
          await sleep(STATION_POLL_MS);
        }
      }
    }

    loop();
    return () => {
      stopped = true;
    };
  }, []);

  const total = printed.reduce((s, p) => s + p.count, 0);
  const pdf = output?.prefs.mode === "pdf";

  if (phase.kind === "unregistered") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-bg px-6 py-12 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-surface-2 text-muted">
          <MonitorOff className="size-9" />
        </div>
        <p className="text-2xl font-semibold">Máy này chưa được đăng ký làm trạm in</p>
        <p className="max-w-md text-sm text-muted">
          Đăng nhập quản trị trên máy này, vào mục Máy trạm và bấm “Đăng ký máy này”. Sau đó mở lại trang này.
        </p>
        <Link href="/admin#stations" className={buttonStyles("primary", "md")}>
          Đăng nhập quản trị
        </Link>
      </main>
    );
  }

  return (
    <>
      <main className="flex flex-1 flex-col bg-bg print:hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Printer className="size-5 shrink-0 text-accent" />
            <span className="truncate font-semibold">Trạm in{name && ` · ${name}`}</span>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {lastPoll ? `Kiểm tra lúc ${lastPoll.toLocaleTimeString("vi-VN")}` : "Đang kết nối…"}
          </span>
        </header>

        {dialogShown && !pdf && (
          <div className="mx-6 mt-4 flex gap-3 rounded-xl bg-warn-soft p-4 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Chế độ in tự động chưa bật</p>
              <p className="mt-1">
                Hộp thoại in vừa hiện ra, nghĩa là Chrome không được mở bằng file “Tram in”. Mở lại bằng file đó trên Desktop,
                hoặc chuyển đầu ra sang “Lưu PDF vào thư mục” trong{" "}
                <Link href={SETTINGS_HREF} className="underline">
                  cài đặt máy trạm
                </Link>{" "}
                để thử không cần máy in.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <StatusIcon phase={phase} pdf={pdf} />
          <p className="text-2xl font-semibold">
            {phase.kind === "connecting" && "Đang kết nối…"}
            {phase.kind === "idle" && "Đang chờ tờ mới"}
            {phase.kind === "standby" && "Máy chờ"}
            {phase.kind === "needs_setup" && "Chưa sẵn sàng lưu file"}
            {phase.kind === "printing" && (pdf ? `Đang lưu tờ #${phase.number}` : `Đang in tờ #${phase.number}`)}
            {phase.kind === "offline" && "Mất kết nối, đang thử lại"}
            {phase.kind === "image_error" && `Không tải được ảnh của tờ #${phase.number}`}
            {phase.kind === "write_error" && `Không ghi được file của tờ #${phase.number}`}
          </p>
          <p className="max-w-md text-sm text-muted">
            {phase.kind === "image_error" || phase.kind === "write_error"
              ? "Tờ này đã được trả lại hàng đợi và sẽ thử lại sau ít giây."
              : phase.kind === "needs_setup"
                ? output?.folder
                  ? "Chrome cần được cho phép ghi vào thư mục đã chọn. Trong lúc chờ, máy này không nhận tờ nào."
                  : "Chưa chọn thư mục lưu file PDF. Trong lúc chờ, máy này không nhận tờ nào."
                : phase.kind === "standby"
                  ? phase.activeStationName
                    ? `Máy in chính hiện là “${phase.activeStationName}”. Máy này sẽ tự in khi quản trị chọn nó làm máy in chính.`
                    : "Chưa có máy in chính. Quản trị có thể chọn máy này trong mục Máy trạm."
                  : pdf
                    ? "Giữ cửa sổ này mở. Mỗi tờ đủ 9 tấm sẽ tự được lưu thành file PDF vào thư mục đã chọn."
                    : "Giữ cửa sổ này mở. Khi đủ 9 tấm, tờ sẽ được in tự động mà không cần bấm gì."}
          </p>
          {phase.kind === "needs_setup" && (
            <Link href={SETTINGS_HREF} className={buttonStyles("primary", "md")}>
              <FolderOpen className="size-4" />
              Mở cài đặt máy trạm
            </Link>
          )}
        </div>

        <section className="border-t border-border px-6 py-5">
          <div className="mx-auto max-w-2xl">
            <p className="text-sm font-medium text-muted">
              {pdf ? "Đã lưu" : "Đã in"} trong phiên này: {printed.length} tờ · {total} tấm
            </p>
            {printed.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {printed.map((p) => (
                  <li
                    key={`${p.number}-${p.at.getTime()}`}
                    title={p.file}
                    className="rounded-md bg-surface-2 px-2.5 py-1 text-xs tabular-nums"
                  >
                    #{p.number} · {p.at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </li>
                ))}
              </ul>
            )}
            {printed[0]?.file && (
              <p className="mt-2 break-all text-xs text-muted">
                File gần nhất: {output?.folder?.name}/{printed[0].file}
              </p>
            )}
            <p className="mt-4 text-xs text-muted">
              {output && (
                <>
                  Đầu ra: {pdf ? `Lưu PDF${output.folder ? ` vào “${output.folder.name}”` : ""}` : "Máy in"} ·{" "}
                </>
              )}
              <Link href={SETTINGS_HREF} className="underline">
                Cài đặt máy trạm
              </Link>
            </p>
          </div>
        </section>
      </main>

      {/* Only this is visible on paper. */}
      <div ref={printRoot} className="hidden print:block" style={{ width: "210mm", height: "296mm", overflow: "hidden" }}>
        {current && <Sheet mode="print" cells={current.cells} header={sheetHeader(current)} />}
      </div>
    </>
  );
}

function StatusIcon({ phase, pdf }: { phase: Phase; pdf: boolean }) {
  const base = "flex size-20 items-center justify-center rounded-full";
  if (phase.kind === "offline") {
    return (
      <div className={cx(base, "bg-warn-soft text-warn")}>
        <WifiOff className="size-9" />
      </div>
    );
  }
  if (phase.kind === "image_error" || phase.kind === "write_error") {
    return (
      <div className={cx(base, "bg-danger-soft text-danger")}>
        <AlertTriangle className="size-9" />
      </div>
    );
  }
  if (phase.kind === "needs_setup") {
    return (
      <div className={cx(base, "bg-warn-soft text-warn")}>
        <FolderOpen className="size-9" />
      </div>
    );
  }
  if (phase.kind === "printing") {
    const Icon = pdf ? FileDown : Printer;
    return (
      <div className={cx(base, "bg-accent-soft text-accent")}>
        <Icon className="size-9 animate-pulse" />
      </div>
    );
  }
  if (phase.kind === "standby" || phase.kind === "connecting") {
    return (
      <div className={cx(base, "bg-surface-2 text-muted")}>
        <PauseCircle className="size-9" />
      </div>
    );
  }
  return (
    <div className={cx(base, "bg-ok-soft text-ok")}>
      <Check className="size-9" />
    </div>
  );
}
