"use client";

import { Printer } from "lucide-react";
import { CalibrationSheet } from "@/components/sheet";
import { Button } from "@/components/ui";

export default function PrintTestPage() {
  return (
    <>
      <main className="flex flex-1 flex-col items-center gap-6 px-4 py-10 print:hidden">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Trang in kiểm tra</h1>
          <p className="mt-2 text-sm text-muted">
            In trang này rồi đo bằng thước. Mỗi ô phải đúng 60 × 90 mm và thước ở ô giữa phải dài đúng 50 mm. Nếu lệch, đặt tỉ
            lệ in là 100% trong driver máy in.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => window.print()}>
          <Printer className="size-5" />
          In trang kiểm tra
        </Button>
        <div className="w-full max-w-sm overflow-hidden rounded-md shadow-[0_0_0_1px_var(--border)]">
          <CalibrationSheet mode="preview" />
        </div>
      </main>
      <div className="hidden print:block" style={{ width: "210mm", height: "296mm", overflow: "hidden" }}>
        <CalibrationSheet mode="print" />
      </div>
    </>
  );
}
