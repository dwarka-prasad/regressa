"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { clearSessionCookie, hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "org"; }

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) return { error: "Invalid email or password." };
  setSessionCookie(user.id);
  await db().update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  const [m] = await db().select({ orgId: schema.orgMembers.orgId }).from(schema.orgMembers).where(eq(schema.orgMembers.userId, user.id)).limit(1);
  if (m) await audit({ orgId: m.orgId, userId: user.id, email: user.email }, "auth.login", user.email);
  redirect(String(form.get("next") || "/overview"));
}

export async function signup(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const orgName = String(form.get("org") ?? "").trim() || `${name || email.split("@")[0]}'s team`;
  if (!email.includes("@") || password.length < 8) return { error: "Enter a valid email and a password of at least 8 characters." };

  const d = db();
  const existing = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing[0]) return { error: "An account with that email already exists." };

  const [user] = await d.insert(schema.users).values({ email, name, passwordHash: hashPassword(password) }).returning();
  let slug = slugify(orgName);
  const clash = await d.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.slug, slug)).limit(1);
  if (clash[0]) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const [org] = await d.insert(schema.orgs).values({ name: orgName, slug }).returning();
  await d.insert(schema.orgMembers).values({ orgId: org!.id, userId: user!.id, role: "owner" });
  await d.insert(schema.projects).values({ orgId: org!.id, name: "Default", slug: "default" });
  setSessionCookie(user!.id);
  await audit({ orgId: org!.id, userId: user!.id, email }, "auth.signup", email, { org: orgName });
  redirect("/settings?welcome=1");
}

export async function logout() {
  clearSessionCookie();
  redirect("/login");
}
