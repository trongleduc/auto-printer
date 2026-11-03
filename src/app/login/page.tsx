"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 sm:p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          }).catch(() => null);
          if (res?.ok) {
            const next = new URLSearchParams(location.search).get("next");
            // Only allow same-site paths.
            window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
            return;
          }
          setBusy(false);
          setError(res?.status === 401 ? "Mật khẩu không đúng." : "Không kết nối được máy chủ.");
        }}
      >
        <div className="flex items-center gap-2">
          <Printer className="size-6 text-accent" />
          <h1 className="text-lg font-semibold">In ảnh</h1>
        </div>
        <p className="mt-2 text-sm text-muted">Nhập mật khẩu của cửa hàng để tiếp tục.</p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium">Mật khẩu</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" loading={busy} disabled={!password}>
          Đăng nhập
        </Button>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/admin/login" className="underline underline-offset-2 hover:text-text">
            Đăng nhập quản trị
          </Link>
        </p>
      </form>
    </main>
  );
}
