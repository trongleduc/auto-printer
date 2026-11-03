import { NextResponse } from "next/server";
import { z } from "zod";
import { idParam, parseBody, route } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";
import { deleteAdminSession, renameAdminSession } from "@/lib/sessions";

const Body = z.object({ name: z.string().trim().min(1, "name_required").max(60) });

export const PATCH = route("admin", async (req, ctx: RouteContext<"/api/admin/sessions/[id]">) => {
  await renameAdminSession(await idParam(ctx), (await parseBody(req, Body)).name);
});

/** Logs a device out of admin. Ending your own session also clears this browser's cookie. */
export const DELETE = route("admin", async (_req, ctx: RouteContext<"/api/admin/sessions/[id]">, admin) => {
  const id = await idParam(ctx);
  await deleteAdminSession(id);
  const res = NextResponse.json({ ok: true, self: id === admin.sid });
  if (id === admin.sid) res.cookies.delete(SESSION_COOKIE);
  return res;
});
