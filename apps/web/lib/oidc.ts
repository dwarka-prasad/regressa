import { createRemoteJWKSet, jwtVerify } from "jose";

/** Generic OIDC (authorization code) config from env. Works with Okta, Auth0, Entra ID, Google Workspace, Keycloak. */
export function oidcConfig() {
  const issuer = process.env.OIDC_ISSUER, clientId = process.env.OIDC_CLIENT_ID, clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;
  return { issuer: issuer.replace(/\/$/, ""), clientId, clientSecret, redirectUri: `${process.env.NEXTAUTH_URL ?? "http://localhost:3100"}/api/auth/oidc/callback` };
}
export const ssoEnabled = () => oidcConfig() !== null;

interface Discovery { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string }
let discovery: { value: Discovery; expires: number } | null = null;
export async function discover(issuer: string): Promise<Discovery> {
  if (discovery && discovery.expires > Date.now()) return discovery.value;
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const value = (await res.json()) as Discovery;
  discovery = { value, expires: Date.now() + 3600_000 };
  return value;
}

export async function authorizationUrl(state: string, nonce: string): Promise<string> {
  const cfg = oidcConfig()!;
  const d = await discover(cfg.issuer);
  const p = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: "openid email profile", state, nonce });
  return `${d.authorization_endpoint}?${p}`;
}

export interface OidcIdentity { sub: string; email: string; name?: string }

export async function exchangeCode(code: string, nonce: string): Promise<OidcIdentity> {
  const cfg = oidcConfig()!;
  const d = await discover(cfg.issuer);
  const res = await fetch(d.token_endpoint, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret }),
  });
  if (!res.ok) throw new Error(`OIDC token exchange failed: ${res.status}`);
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("OIDC provider returned no id_token");
  const { payload } = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(d.jwks_uri)), { issuer: d.issuer, audience: cfg.clientId });
  if (payload.nonce !== nonce) throw new Error("OIDC nonce mismatch");
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!email) throw new Error("OIDC id_token has no email claim");
  return { sub: String(payload.sub), email, name: typeof payload.name === "string" ? payload.name : undefined };
}

/** Which org an SSO user should auto-join: the org whose sso_domain matches the email domain. */
export function emailDomain(email: string) { return email.split("@")[1]?.toLowerCase() ?? ""; }
