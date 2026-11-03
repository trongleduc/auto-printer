import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkPassword, cookieOptions, createToken, SESSION_COOKIE, SESSION_MAX_AGE_S, verifyToken } from "@/lib/auth";
import { createAdminSession, deleteAdminSession } from "@/lib/sessions";

const Body = z.object({
  password: z.string(),
  name: z.string().trim().max(60).catch(""),
});

/** Admin login with ADMIN_PASSWORD. Each device gets its own session, listed in /admin. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !(await checkPassword(parsed.data.password, "ADMIN_PASSWORD"))) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  }

  // Logging in again on the same device replaces its old session instead of piling up rows.
  const old = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (old?.role === "admin") await deleteAdminSession(old.id);

  const id = await createAdminSession(parsed.data.name || "Thiết bị chưa đặt tên", req.headers.get("user-agent") ?? "");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createToken("admin", id, SESSION_MAX_AGE_S), cookieOptions(SESSION_MAX_AGE_S));
  return res;
}
