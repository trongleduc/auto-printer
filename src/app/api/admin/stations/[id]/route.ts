import { NextResponse } from "next/server";
import { z } from "zod";
import { idParam, parseBody, route } from "@/lib/api";
import { STATION_COOKIE } from "@/lib/auth";
import { deleteStation, updateStation } from "@/lib/queue";
import { stationIdFromCookie } from "@/lib/sessions";

const Body = z.object({
  name: z.string().trim().min(1, "name_required").max(60).optional(),
  /** Make this the station that prints. */
  active: z.literal(true).optional(),
});

export const PATCH = route("admin", async (req, ctx: RouteContext<"/api/admin/stations/[id]">) => {
  await updateStation(await idParam(ctx), await parseBody(req, Body));
});

export const DELETE = route("admin", async (req, ctx: RouteContext<"/api/admin/stations/[id]">) => {
  const id = await idParam(ctx);
  await deleteStation(id);
  const res = NextResponse.json({ ok: true });
  if ((await stationIdFromCookie(req)) === id) res.cookies.delete(STATION_COOKIE);
  return res;
});
