"use client";

import { LayoutGrid, List, Minus, Plus, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ─── Button ────────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

/** Button look for elements that are not <button>, e.g. <Link>. */
export function buttonStyles(variant: Variant = "secondary", size: "sm" | "md" | "lg" = "md", className?: string) {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" && "h-9 px-3 text-sm",
    size === "md" && "h-11 px-4 text-sm",
    size === "lg" && "h-12 px-5 text-base",
    variants[variant],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  loading,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={buttonStyles(variant, size, className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────────

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface" role="group" aria-label={label}>
      <button
        type="button"
        className="flex h-full w-10 items-center justify-center text-muted hover:text-text disabled:opacity-30"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="Giảm"
      >
        <Minus className="size-4" />
      </button>
      <input
        inputMode="numeric"
        className="h-full w-10 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
          onChange(Number.isNaN(n) ? min : clamp(n));
        }}
      />
      <button
        type="button"
        className="flex h-full w-10 items-center justify-center text-muted hover:text-text disabled:opacity-30"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label="Tăng"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ─── Dialog / bottom sheet ─────────────────────────────────────────────────

/** Bottom sheet on phones, centred dialog from `sm` up. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-2xl bg-surface p-0 text-text backdrop:bg-black/40",
        "sm:m-auto sm:max-h-[85dvh] sm:rounded-2xl",
        wide ? "sm:max-w-2xl" : "sm:max-w-md",
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border py-2 pl-5 pr-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <IconButton label="Đóng" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Thôi</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4 text-sm leading-relaxed text-muted">{message}</div>
    </Dialog>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────

type Toast = { id: number; text: string; tone: "default" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "default") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg",
              t.tone === "error" ? "bg-danger text-white" : "bg-[#2b2f33] text-white",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ─── misc ──────────────────────────────────────────────────────────────────

export function OrderCode({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center rounded-md bg-surface-2 px-1.5 font-mono text-xs font-semibold tracking-wider text-text",
        className,
      )}
    >
      {code}
    </span>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Grid / list switch for a Section's `action` slot. */
export function ViewToggle({ value, onChange }: { value: "grid" | "list"; onChange: (v: "grid" | "list") => void }) {
  const opts = [
    { v: "grid" as const, label: "Dạng lưới", Icon: LayoutGrid },
    { v: "list" as const, label: "Dạng danh sách", Icon: List },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Kiểu hiển thị">
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={cx(
            "flex size-8 items-center justify-center rounded-md transition-colors",
            value === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
