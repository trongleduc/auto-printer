"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { describeUserAgent } from "@/lib/format";

const noopSubscribe = () => () => {};

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Suggested device name; the server snapshot is empty so prerendering stays static.
  const guess = useSyncExternalStore(noopSubscribe, () => describeUserAgent(navigator.userAgent), () => "");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 sm:p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password, name: name.trim() || guess }),
          }).catch(() => null);
          if (res?.ok) {
            const next = new URLSearchParams(location.search).get("next");
            // Only allow same-site paths. The hash survives the redirect here, e.g. /admin#output.
            window.location.href = (next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin") + location.hash;
            return;
          }
          setBusy(false);
          setError(res?.status === 401 ? "Mật khẩu quản trị không đúng." : "Không kết nối được máy chủ.");
        }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-accent" />
          <h1 className="text-lg font-semibold">Quản trị</h1>
        </div>
        <p className="mt-2 text-sm text-muted">Nhập mật khẩu quản trị. Mỗi thiết bị đăng nhập sẽ được ghi lại để quản lý.</p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium">Mật khẩu quản trị</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium">Tên thiết bị</span>
          <input
            value={name}
            maxLength={60}
            placeholder={guess || "VD: Laptop văn phòng"}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-accent"
          />
          <span className="mt-1.5 block text-xs text-muted">Để trống sẽ dùng tên gợi ý.</span>
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" loading={busy} disabled={!password}>
          Đăng nhập quản trị
        </Button>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/login" className="underline underline-offset-2 hover:text-text">
            Đăng nhập nhân viên
          </Link>
        </p>
      </form>
    </main>
  );
}
