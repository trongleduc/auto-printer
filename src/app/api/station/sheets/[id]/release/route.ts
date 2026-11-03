import { idParam, route } from "@/lib/api";
import { releaseSheet } from "@/lib/queue";

/** The station could not print a sheet it claimed (images failed to load) and hands it back. */
export const POST = route("station", async (_req, ctx: RouteContext<"/api/station/sheets/[id]/release">, station) => {
  await releaseSheet(await idParam(ctx), station.stationId);
});
