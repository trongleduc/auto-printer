"use client";

import { AlertTriangle, Printer } from "lucide-react";
import { useState } from "react";
import { CalibrationSheet } from "@/components/sheet";
import { Button } from "@/components/ui";

/**
 * window.print() blocks while the print dialog is open, and nobody picks a printer faster than
 * this. Returning sooner means this Chrome runs with --kiosk-printing, so no dialog was shown.
 */
const NO_DIALOG_MS = 5000;

export default function PrintTestPage() {
  const [noDialog, setNoDialog] = useState(false);

  const print = () => {
    const started = performance.now();
    window.print();
    setNoDialog(performance.now() - started < NO_DIALOG_MS);
  };

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
        <Button variant="primary" size="lg" onClick={print}>
          <Printer className="size-5" />
          In trang kiểm tra
        </Button>
        {noDialog && (
          <div className="flex max-w-md gap-3 rounded-xl bg-warn-soft p-4 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Hộp thoại chọn máy in không hiện hoặc tự đóng?</p>
              <p className="mt-1">
                Cửa sổ này đang chạy chung với trạm in, nên Chrome tự in luôn tới nơi in cũ. Mở trang này bằng file “2 Chon may in”
                trên Desktop: file sẽ tự đóng trạm in trước. Nếu chưa có file, tạo theo hướng dẫn trong mục Cài đặt máy trạm.
              </p>
            </div>
          </div>
        )}
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
