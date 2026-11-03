/**
 * Polling intervals. During `next dev` they are much longer, so a tab left open
 * while coding does not burn Neon compute hours or bandwidth. Every client poller
 * also pauses while its tab is hidden (see `usePoll`).
 */
const DEV = process.env.NODE_ENV === "development";

/** App shell: queue, station chip. */
export const QUEUE_POLL_MS = DEV ? 30_000 : 5_000;
export const HISTORY_POLL_MS = DEV ? 60_000 : 15_000;
/** Admin page: station list and online status. */
export const ADMIN_POLL_MS = DEV ? 30_000 : 10_000;
/** Print station asking for the next sheet. Also its heartbeat. */
export const STATION_POLL_MS = DEV ? 15_000 : 3_000;
/**
 * A real station keeps printing in the background (Chrome is started with
 * --disable-background-timer-throttling). In dev a hidden station tab pauses.
 */
export const STATION_PAUSE_WHEN_HIDDEN = DEV;

/** A station that has not polled for this long is shown as offline. */
export const STATION_ONLINE_MS = Math.max(15_000, STATION_POLL_MS * 3);
