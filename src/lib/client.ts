"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown; /** Throw on 401 instead of going to the login page. */ noRedirect?: boolean },
): Promise<T> {
  const { json, noRedirect, ...rest } = init ?? {};
  const res = await fetch(path, {
    cache: "no-store",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !noRedirect) {
    // Full reload on purpose: the session is gone, so all client state is stale.
    const login = location.pathname.startsWith("/admin") ? "/admin/login" : "/login";
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${login}?next=${encodeURIComponent(location.pathname)}`;
    throw new ApiError(401, "unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  return data as T;
}

/**
 * Polls a JSON endpoint. Pauses while the tab is hidden and refetches as soon
 * as it becomes visible again.
 */
export function usePoll<T>(path: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      inflight.current = false;
    }
  }, [path]);

  useEffect(() => {
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") await refresh();
      timer.current = setTimeout(loop, intervalMs);
    };
    loop();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}

// Shared clock: one interval for all subscribers. The server snapshot is 0 so
// prerendering never reads the current time (Cache Components forbids it).
let clockNow = 0;
const clockSubs = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(cb: () => void) {
  clockSubs.add(cb);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockSubs.forEach((f) => f());
    }, 15_000);
  }
  return () => {
    clockSubs.delete(cb);
    if (!clockSubs.size) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** Current time, refreshed every 15 s so relative times ("3 phút trước") stay fresh. */
export function useNow() {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow || Date.now(),
    () => 0,
  );
}

// Grid/list choice per list, remembered in this browser. localStorage can throw
// (private mode, blocked storage), so an in-memory copy keeps the toggle working.
export type ViewMode = "grid" | "list";
const viewMemory = new Map<string, ViewMode>();
const viewSubs = new Set<() => void>();

function readView(key: string, fallback: ViewMode): ViewMode {
  const mem = viewMemory.get(key);
  if (mem) return mem;
  try {
    const v = localStorage.getItem(`view:${key}`);
    if (v === "grid" || v === "list") return v;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

function subscribeView(cb: () => void) {
  viewSubs.add(cb);
  return () => {
    viewSubs.delete(cb);
  };
}

export function useViewMode(key: string, fallback: ViewMode) {
  const mode = useSyncExternalStore(
    subscribeView,
    () => readView(key, fallback),
    () => fallback,
  );
  const setMode = useCallback(
    (m: ViewMode) => {
      viewMemory.set(key, m);
      try {
        localStorage.setItem(`view:${key}`, m);
      } catch {
        /* storage unavailable */
      }
      viewSubs.forEach((f) => f());
    },
    [key],
  );
  return [mode, setMode] as const;
}
