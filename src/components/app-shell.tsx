"use client";

import { History, Layers, LogOut, Plus, Printer, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { formatAgo } from "@/lib/format";
import { useNow } from "@/lib/client";
import { QueueProvider, useQueue } from "./queue-context";
import { ConfirmDialog, IconButton, ToastProvider, cx } from "./ui";
import { UploadButton, UploadProvider, useUpload } from "./upload";

const NAV = [
  { href: "/", label: "Hàng đợi", icon: Layers, adminOnly: false },
  { href: "/history", label: "Đã in", icon: History, adminOnly: false },
  { href: "/admin", label: "Quản trị", icon: ShieldCheck, adminOnly: true },
];

function StationChip() {
  const { queue } = useQueue();
  const now = useNow();
  if (!queue) return <span className="h-7 w-28 animate-pulse rounded-full bg-surface-2" />;
  const s = queue.station;
  const online = !!s?.online;
  const text = !s
    ? "Chưa chọn máy in"
    : online
      ? `${s.name} đang chạy`
      : s.lastSeenAt
        ? `${s.name} mất kết nối · ${formatAgo(s.lastSeenAt, now)}`
        : `${s.name} chưa kết nối`;
  const className = cx(
    "inline-flex h-7 min-w-0 max-w-full items-center gap-2 rounded-full px-3 text-xs font-medium",
    online ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn",
  );
  const body = (
    <>
      <span className={cx("size-2 shrink-0 rounded-full", online ? "bg-ok" : "bg-warn")} />
      <span className="truncate">{text}</span>
    </>
  );
  // Only admins can do something about the station.
  return queue.viewer.role === "admin" ? (
    <Link href="/admin#stations" className={className}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

function NavLinks({ variant }: { variant: "side" | "bottom" }) {
  const path = usePathname();
  const isAdmin = useQueue().queue?.viewer.role === "admin";
  return NAV.filter((n) => !n.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    if (variant === "bottom") {
      return (
        <Link
          key={href}
          href={href}
          className={cx(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
            active ? "text-accent" : "text-muted",
          )}
        >
          <span className={cx("flex h-7 w-14 items-center justify-center rounded-full", active && "bg-accent-soft")}>
            <Icon className="size-5" />
          </span>
          {label}
        </Link>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        className={cx(
          "flex h-10 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors",
          active ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2",
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    );
  });
}

function LogoutButton() {
  const [confirm, setConfirm] = useState(false);
  const isAdmin = useQueue().queue?.viewer.role === "admin";
  return (
    <>
      <IconButton label="Đăng xuất" onClick={() => setConfirm(true)}>
        <LogOut className="size-[18px]" />
      </IconButton>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Đăng xuất?"
        message={
          isAdmin
            ? "Máy này sẽ thoát quyền quản trị. Muốn dùng lại phải nhập mật khẩu quản trị."
            : "Muốn dùng lại phải nhập mật khẩu của cửa hàng."
        }
        confirmLabel="Đăng xuất"
        onConfirm={async () => {
          await fetch("/api/login", { method: "DELETE" });
          // Full reload on purpose: drops all client state and lets the proxy re-check the cookie.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
        }}
      />
    </>
  );
}

function MobileFab() {
  const { openPicker } = useUpload();
  return (
    <button
      onClick={openPicker}
      aria-label="Tải ảnh lên"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-lg shadow-black/15 md:hidden"
    >
      <Plus className="size-6" />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <QueueProvider>
        <UploadProvider>
          <div className="flex min-h-dvh flex-1">
            {/* Desktop sidebar */}
            <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 px-3 py-4 md:flex">
              <div className="flex items-center gap-2 px-3 py-1">
                <Printer className="size-5 text-accent" />
                <span className="text-base font-semibold">In ảnh</span>
              </div>
              <UploadButton className="w-fit rounded-2xl shadow-sm" />
              <nav className="flex flex-col gap-0.5">
                <NavLinks variant="side" />
              </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur md:border-none md:px-6">
                <div className="flex items-center gap-2 md:hidden">
                  <Printer className="size-5 text-accent" />
                  <span className="text-base font-semibold">In ảnh</span>
                </div>
                <div className="flex min-w-0 items-center gap-1 md:ml-auto">
                  <StationChip />
                  <LogoutButton />
                </div>
              </header>
              <main className="flex-1 px-4 pb-28 pt-4 md:rounded-tl-2xl md:bg-surface md:px-8 md:pb-10 md:pt-6">
                <div className="mx-auto w-full max-w-4xl">{children}</div>
              </main>
            </div>
          </div>

          {/* Mobile bottom nav */}
          <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
            <NavLinks variant="bottom" />
          </nav>
          <MobileFab />
        </UploadProvider>
      </QueueProvider>
    </ToastProvider>
  );
}
