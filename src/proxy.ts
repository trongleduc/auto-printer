import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, STATION_COOKIE, verifyToken } from "@/lib/auth";

/**
 * Optimistic gate: checks token signatures only. Route handlers re-check against
 * the database (revoked admin sessions, deleted stations) through `route()`.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");

  // The station page decides what to show itself (e.g. "not registered yet").
  if (path === "/station") return NextResponse.next();

  if (path.startsWith("/api/station/")) {
    const station = await verifyToken(request.cookies.get(STATION_COOKIE)?.value);
    return station?.role === "station" ? NextResponse.next() : deny(401);
  }

  const session = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);
  const role = session?.role === "user" || session?.role === "admin" ? session.role : null;

  if (path.startsWith("/admin") || path.startsWith("/api/admin/")) {
    if (role === "admin") return NextResponse.next();
    if (isApi) return deny(role ? 403 : 401);
    return redirectTo(request, "/admin/login");
  }

  if (role) return NextResponse.next();
  if (isApi) return deny(401);
  return redirectTo(request, "/login");
}

function deny(status: 401 | 403) {
  return NextResponse.json({ error: status === 401 ? "unauthorized" : "forbidden" }, { status });
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login flows and static assets.
  matcher: [
    "/((?!login|admin/login|api/login|api/admin/login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)",
  ],
};
