import { describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, readSessionToken, verifyPassword } from "../auth";

describe("passwords", () => {
  it("hashes with a per-user salt and verifies", () => {
    const h1 = hashPassword("regressa-demo"), h2 = hashPassword("regressa-demo");
    expect(h1).not.toBe(h2);
    expect(verifyPassword("regressa-demo", h1)).toBe(true);
    expect(verifyPassword("wrong", h1)).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a user id", () => {
    expect(readSessionToken(createSessionToken("user-1"))).toEqual({ uid: "user-1" });
  });
  it("rejects tampered or malformed tokens", () => {
    const t = createSessionToken("user-1");
    const [payload, sig] = t.split(".");
    const other = Buffer.from(JSON.stringify({ uid: "user-2", exp: 9999999999 })).toString("base64url");
    expect(readSessionToken(`${other}.${sig}`)).toBeNull();
    expect(readSessionToken(`${payload}.bad`)).toBeNull();
    expect(readSessionToken("nope")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });
});
