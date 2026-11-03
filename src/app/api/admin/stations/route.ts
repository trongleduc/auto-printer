import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, route } from "@/lib/api";
import { cookieOptions, createToken, STATION_COOKIE, STATION_MAX_AGE_S } from "@/lib/auth";
import { createStation, listStations } from "@/lib/queue";
import { stationIdFromCookie } from "@/lib/sessions";
import type { StationsDTO } from "@/lib/types";

const Body = z.object({ name: z.string().trim().min(1, "name_required").max(60) });

export const GET = route("admin", async (req): Promise<StationsDTO> => {
  const thisDevice = await stationIdFromCookie(req);
  const stations = await listStations(thisDevice);
  return { stations, thisDeviceStationId: stations.some((s) => s.thisDevice) ? thisDevice : null };
});

/** Registers the browser making the request as a print station. */
export const POST = route("admin", async (req) => {
  const { name } = await parseBody(req, Body);
  const id = await createStation(name);
  const res = NextResponse.json({ id });
  res.cookies.set(STATION_COOKIE, await createToken("station", id, STATION_MAX_AGE_S), cookieOptions(STATION_MAX_AGE_S));
  return res;
});
