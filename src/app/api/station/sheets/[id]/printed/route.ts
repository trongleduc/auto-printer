import { idParam, route } from "@/lib/api";
import { markPrinted } from "@/lib/queue";

export const POST = route("station", async (_req, ctx: RouteContext<"/api/station/sheets/[id]/printed">, station) => {
  await markPrinted(await idParam(ctx), station.stationId);
});
