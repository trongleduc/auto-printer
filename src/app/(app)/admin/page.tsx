"use client";

import { Check, Copy, ExternalLink, Monitor, Pencil, Printer, Ruler, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueue } from "@/components/queue-context";
import { StationOutputSettings } from "@/components/station-output-settings";
import { Button, ConfirmDialog, Dialog, IconButton, Section, buttonStyles, cx, useToast } from "@/components/ui";
import { api, useNow, usePoll } from "@/lib/client";
import { describeUserAgent, formatAgo } from "@/lib/format";
import { ADMIN_POLL_MS } from "@/lib/poll";
import type { AdminSessionDTO, SettingsDTO, StationDTO, StationsDTO } from "@/lib/types";

const FLUSH_OPTIONS = [
  { value: 0, label: "Tắt" },
  { value: 10, label: "10 phút" },
  { value: 30, label: "30 phút" },
  { value: 60, label: "1 giờ" },
  { value: 120, label: "2 giờ" },
];

const CHROME = String.raw`"C:\Program Files\Google\Chrome\Application\chrome.exe"`;
/** Chrome profile used only by the print station. */
const STATION_PROFILE = String.raw`C:\AutoPrinter\chrome`;
const noopSubscribe = () => () => {};

export default function AdminPage() {
  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Quản trị</h1>
      <Stations />
      <StationGuide />
      <AutoFlush />
      <AdminSessions />
    </div>
  );
}

// ─── stations ──────────────────────────────────────────────────────────────

function Stations() {
  const { data, refresh } = usePoll<StationsDTO>("/api/admin/stations", ADMIN_POLL_MS);
  const { refresh: refreshQueue } = useQueue();
  const toast = useToast();
  const [renaming, setRenaming] = useState<StationDTO | null>(null);
  const [deleting, setDeleting] = useState<StationDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const changed = () => {
    refresh();
    refreshQueue();
  };

  const makeActive = async (s: StationDTO) => {
    setBusy(s.id);
    try {
      await api(`/api/admin/stations/${s.id}`, { method: "PATCH", json: { active: true } });
      toast(`Từ giờ tờ in sẽ ra ở “${s.name}”.`);
      changed();
    } catch {
      toast("Không đổi được máy in chính.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Máy trạm">
      <div id="stations" className="scroll-mt-20 space-y-4">
        <p className="text-sm text-muted">
          Máy trạm là máy tính nối với máy in và luôn mở trang trạm in. Có thể đăng ký nhiều máy, nhưng chỉ{" "}
          <span className="font-medium text-text">máy in chính</span> nhận tờ để in; các máy khác đứng chờ cho tới khi
          được chọn.
        </p>

        {!data ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
        ) : data.stations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
            Chưa có máy trạm nào. Mở trang này trên máy tính nối với máy in và đăng ký máy đó ở bên dưới.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {data.stations.map((s) => (
              <StationRow
                key={s.id}
                station={s}
                busy={busy === s.id}
                onActivate={() => makeActive(s)}
                onRename={() => setRenaming(s)}
                onDelete={() => setDeleting(s)}
              />
            ))}
          </ul>
        )}

        {data && <ThisDevice data={data} onChange={changed} />}
      </div>

      <NameDialog
        open={renaming !== null}
        title="Đổi tên máy trạm"
        initial={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          await api(`/api/admin/stations/${renaming!.id}`, { method: "PATCH", json: { name } });
          changed();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        title={`Xóa máy trạm “${deleting?.name}”?`}
        message={
          <>
            Máy này sẽ không in được nữa cho tới khi đăng ký lại.
            {deleting?.active && " Đây là máy in chính, nên sẽ không có máy nào in cho tới khi bạn chọn máy khác."}
          </>
        }
        confirmLabel="Xóa máy trạm"
        onConfirm={async () => {
          try {
            await api(`/api/admin/stations/${deleting!.id}`, { method: "DELETE" });
            changed();
          } catch {
            toast("Không xóa được.", "error");
          }
        }}
      />
    </Section>
  );
}

function StationRow({
  station: s,
  busy,
  onActivate,
  onRename,
  onDelete,
}: {
  station: StationDTO;
  busy: boolean;
  onActivate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const now = useNow();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <span
        className={cx(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          s.active ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
        )}
      >
        <Printer className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{s.name}</span>
          {s.active && <Badge tone="accent">Máy in chính</Badge>}
          {s.thisDevice && <Badge>Máy này</Badge>}
        </div>
        <p className={cx("mt-0.5 flex items-center gap-1.5 text-xs", s.online ? "text-ok" : "text-muted")}>
          <span className={cx("size-1.5 rounded-full", s.online ? "bg-ok" : "bg-border-strong")} />
          {s.online
            ? s.active
              ? "Đang chạy"
              : "Đang chờ"
            : s.lastSeenAt
              ? `Mất kết nối · ${formatAgo(s.lastSeenAt, now)}`
              : "Chưa mở trang trạm in"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {!s.active && (
          <Button size="sm" loading={busy} onClick={onActivate}>
            Chọn làm máy in chính
          </Button>
        )}
        <IconButton label="Đổi tên" onClick={onRename}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton label="Xóa máy trạm" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  );
}

/** Registering the browser you are using right now as a station. */
function ThisDevice({ data, onChange }: { data: StationsDTO; onChange: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const mine = data.stations.find((s) => s.thisDevice);

  if (mine) {
    return (
      <div className="space-y-4 rounded-xl bg-surface-2 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Monitor className="size-5 shrink-0 text-muted" />
          <p className="min-w-0 flex-1 text-sm">
            Máy bạn đang dùng là trạm in <span className="font-medium">“{mine.name}”</span>.
          </p>
          <Link href="/station" className={buttonStyles("secondary", "sm")}>
            <ExternalLink className="size-4" />
            Mở trang trạm in
          </Link>
        </div>
        <div className="border-t border-border pt-4">
          <StationOutputSettings />
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          await api("/api/admin/stations", { method: "POST", json: { name: name.trim() } });
          setName("");
          toast("Đã đăng ký máy này làm trạm in.");
          onChange();
        } catch {
          toast("Không đăng ký được.", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="text-sm font-medium">Đăng ký máy này làm trạm in</p>
        <p className="mt-1 text-sm text-muted">
          Làm bước này trên chính máy tính nối với máy in. Máy được đăng ký chỉ mở được trang trạm in, không vào được
          phần quản trị (trừ khi đăng nhập quản trị).
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Tên máy, VD: Máy quầy 1"
          aria-label="Tên máy trạm"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-accent"
        />
        <Button type="submit" variant="primary" size="sm" className="h-10" loading={busy} disabled={!name.trim()}>
          Đăng ký máy này
        </Button>
      </div>
      {data.stations.length === 0 && (
        <p className="text-xs text-muted">Máy trạm đầu tiên sẽ tự được chọn làm máy in chính.</p>
      )}
    </form>
  );
}

function StationGuide() {
  const origin = useSyncExternalStore(noopSubscribe, () => location.origin, () => "https://<tên-miền>");
  // A dedicated profile always starts a fresh Chrome process, so the flags apply even if
  // another Chrome window is open. Its cookies are separate: register the station inside it.
  const profile = `--user-data-dir="${STATION_PROFILE}" --no-first-run`;
  const stationCmd = `${CHROME} ${profile} --kiosk-printing --disable-background-timer-throttling --app=${origin}/station`;
  const setupCmd = `${CHROME} ${profile} --app=${origin}/print-test`;

  return (
    <Section title="Cài đặt máy trạm">
      <div className="space-y-5 rounded-xl border border-border bg-surface p-4">
        <ol className="space-y-5 text-sm">
          <Step n={1} title="Tạo shortcut “Trạm in”">
            Trên máy nối với máy in: chuột phải màn hình → New → Shortcut, dán lệnh sau vào ô vị trí, đặt tên “Trạm in”.
            <CommandBox command={stationCmd} />
            <p className="mt-2">
              Lệnh dùng một hồ sơ Chrome riêng, nên chế độ in tự động luôn có tác dụng, kể cả khi đang mở Chrome khác.
            </p>
          </Step>
          <Step n={2} title="Đăng ký máy">
            Mở shortcut “Trạm in”. Trang sẽ báo máy chưa được đăng ký: bấm “Đăng nhập quản trị”, rồi ở mục Máy trạm bấm
            “Đăng ký máy này” và “Mở trang trạm in”. Phải làm trong chính cửa sổ này, vì hồ sơ riêng có đăng nhập riêng.
          </Step>
          <Step n={3} title="Chọn nơi in (làm một lần)">
            Chế độ tự động in vào nơi in được chọn gần nhất, nên cần chọn một lần bằng shortcut thứ hai có hộp thoại. Đóng
            cửa sổ “Trạm in”, tạo shortcut “Chọn máy in” với lệnh:
            <CommandBox command={setupCmd} />
            <p className="mt-2">
              Mở nó, bấm “In trang kiểm tra” và ở mục <span className="font-medium text-text">Destination</span> chọn:
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium text-text">Máy in thật</span>: chọn máy in, Paper size A4, Scale 100%
                (Default), rồi in.
              </li>
              <li>
                <span className="font-medium text-text">Chưa có máy in, chỉ thử</span>: chọn “Save as PDF” (Lưu dưới dạng
                PDF), không chọn “Microsoft Print to PDF” vì cái đó luôn hỏi tên file. Từ đó mỗi tờ được lưu thẳng vào
                thư mục Downloads với tên <code className="font-mono text-xs">To-&lt;số tờ&gt;.pdf</code>.
              </li>
            </ul>
            <p className="mt-2">Đóng cửa sổ rồi mở lại shortcut “Trạm in”. Khi có máy in thật, làm lại bước này.</p>
          </Step>
          <Step n={4} title="Giữ máy luôn bật">
            Settings → System → Power: đặt “Sleep” thành Never. Để cửa sổ trạm in mở, không thu nhỏ.
          </Step>
          <Step n={5} title="Kiểm tra kích thước">
            Đo trang kiểm tra (hoặc file PDF mở ở 100%): mỗi ô phải đúng 60 × 90 mm. Nếu bị lệch, kiểm tra trong driver
            máy in rằng tỉ lệ là 100% (không bật “Fit to page”).
          </Step>
        </ol>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Link href="/print-test" target="_blank" className={buttonStyles("secondary", "sm")}>
            <Ruler className="size-4" />
            Trang in kiểm tra
          </Link>
        </div>
        <p className="text-xs text-muted">
          Nếu trang trạm in báo “Chế độ in tự động chưa bật”, cửa sổ đó không được mở bằng shortcut “Trạm in”. Hệ thống chỉ
          biết lệnh in đã được gửi tới Windows; nếu máy in hết giấy hoặc kẹt giấy, hãy xử lý tại máy in rồi dùng “In lại”
          trong mục Đã in nếu cần.
        </p>
      </div>
    </Section>
  );
}

function CommandBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg bg-surface-2 p-3">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-text">{command}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text"
        aria-label="Sao chép lệnh"
      >
        {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <div className="mt-1 text-muted">{children}</div>
      </div>
    </li>
  );
}

// ─── auto flush ────────────────────────────────────────────────────────────

function AutoFlush() {
  const [value, setValue] = useState<number | null>(null);
  const toast = useToast();
  const { refresh } = useQueue();

  useEffect(() => {
    api<SettingsDTO>("/api/settings").then((s) => setValue(s.autoFlushMinutes), () => setValue(0));
  }, []);

  const save = async (v: number) => {
    const prev = value;
    setValue(v);
    try {
      await api("/api/settings", { method: "PUT", json: { autoFlushMinutes: v } });
      refresh();
    } catch {
      setValue(prev);
      toast("Không lưu được cài đặt.", "error");
    }
  };

  return (
    <Section title="Tự in phần lẻ">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">
          Nếu ảnh chờ quá lâu mà chưa đủ 9 tấm, tự in luôn tờ thiếu. Thời gian tính từ tấm chờ lâu nhất.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Tự in phần lẻ sau">
          {FLUSH_OPTIONS.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={value === o.value}
              disabled={value === null}
              onClick={() => save(o.value)}
              className={cx(
                "h-9 rounded-full border px-4 text-sm font-medium transition-colors",
                value === o.value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border-strong text-text hover:bg-surface-2",
              )}
            >
              {value === o.value && <Check className="-ml-1 mr-1 inline size-4" />}
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── admin sessions ────────────────────────────────────────────────────────

function AdminSessions() {
  const { data, refresh } = usePoll<{ sessions: AdminSessionDTO[] }>("/api/admin/sessions", ADMIN_POLL_MS * 2);
  const [renaming, setRenaming] = useState<AdminSessionDTO | null>(null);
  const [ending, setEnding] = useState<AdminSessionDTO | null>(null);
  const toast = useToast();
  const now = useNow();

  return (
    <Section title="Thiết bị đăng nhập quản trị">
      <p className="text-sm text-muted">
        Mỗi máy đăng nhập bằng mật khẩu quản trị có một phiên riêng. Đặt tên để dễ nhận ra, và đăng xuất từ xa những máy
        không còn dùng.
      </p>
      {!data ? (
        <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {data.sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                <Monitor className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  {s.current && <Badge tone="accent">Máy này</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {describeUserAgent(s.userAgent)} · {s.current ? "đang dùng" : `hoạt động ${formatAgo(s.lastSeenAt, now)}`}
                </p>
              </div>
              <IconButton label="Đổi tên" onClick={() => setRenaming(s)}>
                <Pencil className="size-4" />
              </IconButton>
              <Button size="sm" onClick={() => setEnding(s)}>
                Đăng xuất
              </Button>
            </li>
          ))}
        </ul>
      )}

      <NameDialog
        open={renaming !== null}
        title="Đổi tên thiết bị"
        initial={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          await api(`/api/admin/sessions/${renaming!.id}`, { method: "PATCH", json: { name } });
          refresh();
        }}
      />
      <ConfirmDialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        danger
        title={ending?.current ? "Đăng xuất máy này?" : `Đăng xuất “${ending?.name}”?`}
        message={
          ending?.current
            ? "Máy này sẽ thoát quyền quản trị ngay."
            : "Thiết bị đó sẽ mất quyền quản trị ở lần thao tác tiếp theo và phải nhập lại mật khẩu quản trị."
        }
        confirmLabel="Đăng xuất"
        onConfirm={async () => {
          try {
            const res = await api<{ self: boolean }>(`/api/admin/sessions/${ending!.id}`, { method: "DELETE" });
            if (res.self) {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/admin/login";
              return;
            }
            refresh();
          } catch {
            toast("Không đăng xuất được thiết bị.", "error");
          }
        }}
      />
    </Section>
  );
}

// ─── shared ────────────────────────────────────────────────────────────────

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

function NameDialog({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {/* Keyed so the field starts from the current name each time it opens. */}
      {open && <NameForm key={initial} initial={initial} onClose={onClose} onSave={onSave} />}
    </Dialog>
  );
}

function NameForm({
  initial,
  onClose,
  onSave,
}: {
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <form
      className="space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          await onSave(name.trim());
          onClose();
        } catch {
          toast("Không lưu được tên.", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus
        aria-label="Tên"
        className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          Thôi
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
          Lưu
        </Button>
      </div>
    </form>
  );
}
