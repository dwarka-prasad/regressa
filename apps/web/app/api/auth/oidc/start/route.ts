import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizationUrl, ssoEnabled } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!ssoEnabled()) return NextResponse.json({ error: "sso_not_configured", hint: "Set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET" }, { status: 501 });
  const state = randomBytes(16).toString("hex"), nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(await authorizationUrl(state, nonce), 302);
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" };
  res.cookies.set("regressa_oidc_state", state, opts);
  res.cookies.set("regressa_oidc_nonce", nonce, opts);
  res.cookies.set("regressa_oidc_next", req.nextUrl.searchParams.get("next") ?? "/overview", opts);
  return res;
}
