import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { stationFromRequest, viewerFromRequest, type StationAuth, type Viewer } from "./sessions";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * - "user":    staff with the shop password, or an admin.
 * - "admin":   admin only (settings, stations, print controls).
 * - "station": the browser registered as a print station.
 */
export type Access = "user" | "admin" | "station";
type AuthFor<A extends Access> = A extends "station" ? StationAuth : Viewer;

async function authenticate(req: NextRequest, access: Access): Promise<Viewer | StationAuth> {
  if (access === "station") {
    const station = await stationFromRequest(req);
    if (!station) throw new HttpError(401, "unauthorized");
    return station;
  }
  const viewer = await viewerFromRequest(req);
  if (!viewer) throw new HttpError(401, "unauthorized");
  if (access === "admin" && viewer.role !== "admin") throw new HttpError(403, "forbidden");
  return viewer;
}

/**
 * Wraps a route handler: re-checks the session against the database (the proxy
 * only checks signatures) and turns thrown errors into JSON responses.
 */
export function route<A extends Access, C>(
  access: A,
  handler: (req: NextRequest, ctx: C, auth: AuthFor<A>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: C) => {
    try {
      const auth = (await authenticate(req, access)) as AuthFor<A>;
      const result = await handler(req, ctx, auth);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      // Let Next.js internals (e.g. prerender interruption) propagate.
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function idParam(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new HttpError(404, "not_found");
  return id;
}

export async function parseBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const body = await req.json().catch(() => {
    throw new HttpError(400, "invalid_json");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "invalid_body");
  return parsed.data;
}
