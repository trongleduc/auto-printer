/**
 * Signed tokens. Uses Web Crypto only, so it runs in both proxy and route handlers.
 *
 * A token is `<role>.<id>.<expiresAtMs>.<hmac>` signed with SESSION_SECRET:
 * - `u` user:    id is a random session id, used to know which orders are "mine".
 * - `a` admin:   id is a row in admin_sessions (checked in route handlers, so it can be revoked).
 * - `s` station: id is a row in stations (same).
 * The proxy only checks the signature; `src/lib/sessions.ts` checks the database.
 */

/** User or admin session. */
export const SESSION_COOKIE = "ap_session";
/** Marks this browser as a print station. Separate from the session, so a station PC can also be used by an admin. */
export const STATION_COOKIE = "ap_station";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 365;
export const STATION_MAX_AGE_S = 5 * 60 * 60 * 24 * 365;

export type TokenRole = "user" | "admin" | "station";
const PREFIX: Record<TokenRole, string> = { user: "u", admin: "a", station: "s" };
const ROLE: Record<string, TokenRole> = { u: "user", a: "admin", s: "station" };

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createToken(role: TokenRole, id: string, maxAgeS: number): Promise<string> {
  const payload = `${PREFIX[role]}.${id}.${Date.now() + maxAgeS * 1000}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyToken(token: string | undefined): Promise<{ role: TokenRole; id: string } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [prefix, id, exp, sig] = parts;
  const role = ROLE[prefix];
  if (!role || !id || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  try {
    return safeEqual(sig, await hmac(`${prefix}.${id}.${exp}`)) ? { role, id } : null;
  } catch {
    return null;
  }
}

export async function checkPassword(input: string, env: "APP_PASSWORD" | "ADMIN_PASSWORD"): Promise<boolean> {
  const expected = process.env[env];
  if (!expected) {
    console.error(`${env} is not set`);
    return false;
  }
  // Compare HMACs so the comparison is constant-time regardless of length.
  return safeEqual(await hmac(`pw:${input}`), await hmac(`pw:${expected}`));
}

/** Cookie options shared by every token cookie. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
