import { createHash, randomBytes } from "node:crypto";

export type KeyMode = "live" | "test";

/** Generate a Regressa API key. Format: rgsa_<mode>_<32 base62 chars>. */
export function generateApiKey(mode: KeyMode = "live"): { plaintext: string; hash: string; prefix: string; mode: KeyMode } {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(32);
  let body = "";
  for (const b of bytes) body += alphabet[b % alphabet.length];
  const plaintext = `rgsa_${mode}_${body}`;
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, 15) + "...", mode };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function parseKeyMode(plaintext: string): KeyMode | null {
  if (plaintext.startsWith("rgsa_live_")) return "live";
  if (plaintext.startsWith("rgsa_test_")) return "test";
  return null;
}
