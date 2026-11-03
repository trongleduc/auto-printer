import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, cookieOptions, createToken, SESSION_COOKIE, SESSION_MAX_AGE_S, verifyToken } from "@/lib/auth";
import { deleteAdminSession } from "@/lib/sessions";

/** Ends the admin session stored in this browser's cookie, if any. */
async function dropAdminSession(req: NextRequest) {
  const t = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (t?.role === "admin") await deleteAdminSession(t.id);
}

/** Staff login with the shop password. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";

  if (!(await checkPassword(password, "APP_PASSWORD"))) {
    // Small fixed delay to slow down guessing.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  }

  await dropAdminSession(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createToken("user", crypto.randomUUID(), SESSION_MAX_AGE_S), cookieOptions(SESSION_MAX_AGE_S));
  return res;
}

/** Logout (user or admin). Does not touch the station cookie. */
export async function DELETE(req: NextRequest) {
  await dropAdminSession(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
