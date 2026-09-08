import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emailDomain, exchangeCode, ssoEnabled } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!ssoEnabled()) return NextResponse.json({ error: "sso_not_configured" }, { status: 501 });
  const q = req.nextUrl.searchParams;
  const state = req.cookies.get("regressa_oidc_state")?.value, nonce = req.cookies.get("regressa_oidc_nonce")?.value;
  const next = req.cookies.get("regressa_oidc_next")?.value ?? "/overview";
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, req.url));
  if (q.get("error")) return fail(q.get("error_description") ?? q.get("error")!);
  if (!q.get("code") || !state || !nonce || q.get("state") !== state) return fail("invalid_state");

  let identity;
  try { identity = await exchangeCode(q.get("code")!, nonce); } catch (err) { return fail(err instanceof Error ? err.message : "oidc_failed"); }

  const d = db();
  let [user] = await d.select().from(schema.users).where(eq(schema.users.oidcSub, identity.sub)).limit(1);
  if (!user) [user] = await d.select().from(schema.users).where(eq(schema.users.email, identity.email)).limit(1);
  if (!user) [user] = await d.insert(schema.users).values({ email: identity.email, name: identity.name, oidcSub: identity.sub }).returning();
  else await d.update(schema.users).set({ oidcSub: identity.sub, name: user.name ?? identity.name, lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));

  // Auto-join the org that claims this email domain (if the user is not a member anywhere yet).
  const memberships = await d.select({ orgId: schema.orgMembers.orgId }).from(schema.orgMembers).where(eq(schema.orgMembers.userId, user!.id));
  const [org] = await d.select().from(schema.orgs).where(eq(schema.orgs.ssoDomain, emailDomain(identity.email))).limit(1);
  if (org && !memberships.some((m) => m.orgId === org.id)) {
    await d.insert(schema.orgMembers).values({ orgId: org.id, userId: user!.id, role: org.ssoDefaultRole }).onConflictDoNothing();
    await audit({ orgId: org.id, userId: user!.id, email: identity.email }, "member.invite", identity.email, { via: "sso", role: org.ssoDefaultRole });
  }
  const orgId = org?.id ?? memberships[0]?.orgId;
  if (orgId) await audit({ orgId, userId: user!.id, email: identity.email }, "auth.sso_login", identity.email);

  const res = NextResponse.redirect(new URL(memberships.length || org ? next : "/signup?step=org", req.url));
  res.cookies.set("regressa_session", createSessionToken(user!.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600, secure: process.env.NODE_ENV === "production" });
  for (const c of ["regressa_oidc_state", "regressa_oidc_nonce", "regressa_oidc_next"]) res.cookies.delete(c);
  return res;
}
