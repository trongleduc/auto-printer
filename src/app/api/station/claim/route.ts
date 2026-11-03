import type { NextRequest } from "next/server";
import { route } from "@/lib/api";
import { claimNextSheet } from "@/lib/queue";

/**
 * Polled by every print station. Also serves as its heartbeat. Only the active
 * station gets sheets. Body `{ "claim": false }` sends a heartbeat without claiming.
 */
export const POST = route("station", async (req: NextRequest, _ctx, station) => {
  const body = (await req.json().catch(() => ({}))) as { claim?: unknown };
  return claimNextSheet(station.stationId, { claim: body.claim !== false });
});
