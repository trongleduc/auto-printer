"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePoll } from "@/lib/client";
import { QUEUE_POLL_MS } from "@/lib/poll";
import type { QueueDTO } from "@/lib/types";

type QueueState = { queue: QueueDTO | null; error: Error | null; refresh: () => Promise<void> };

const QueueCtx = createContext<QueueState>({ queue: null, error: null, refresh: async () => {} });

/** One poller for the whole app shell: the station chip and the queue page share it. */
export function QueueProvider({ children }: { children: ReactNode }) {
  const { data, error, refresh } = usePoll<QueueDTO>("/api/queue", QUEUE_POLL_MS);
  return <QueueCtx.Provider value={{ queue: data, error, refresh }}>{children}</QueueCtx.Provider>;
}

export const useQueue = () => useContext(QueueCtx);
