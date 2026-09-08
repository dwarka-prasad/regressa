import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "regressa_session";
const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me";
const TTL_S = 30 * 24 * 3600;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload: string) { return createHmac("sha256", SECRET).update(payload).digest("base64url"); }

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + TTL_S })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readSessionToken(token: string | undefined): { uid: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; exp: number };
    return data.exp > Date.now() / 1000 ? { uid: data.uid } : null;
  } catch { return null; }
}

export function setSessionCookie(userId: string) {
  cookies().set(SESSION_COOKIE, createSessionToken(userId), { httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL_S, secure: process.env.NODE_ENV === "production" });
}
export function clearSessionCookie() { cookies().delete(SESSION_COOKIE); }
export function currentUserId(): string | null { return readSessionToken(cookies().get(SESSION_COOKIE)?.value)?.uid ?? null; }
export { SESSION_COOKIE };
