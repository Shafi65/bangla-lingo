import { describe, expect, it } from "vitest";
import { parseCallback, safeNextPath } from "@/lib/auth/redirect";
import { parseProviders } from "@/lib/auth/config";

describe("safeNextPath", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/profile")).toBe("/profile");
    expect(safeNextPath("/settings#account")).toBe("/settings#account");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "javascript:alert(1)", "", null, "/auth/callback"]) {
      expect(safeNextPath(bad)).toBe("/settings");
    }
  });
});

describe("parseCallback", () => {
  const u = (s: string) => new URL(s, "https://app.example");
  it("email link with token_hash", () => {
    expect(parseCallback(u("/auth/callback?token_hash=abc&type=email&next=/profile"))).toEqual({ kind: "token_hash", tokenHash: "abc", type: "email", next: "/profile" });
    expect(parseCallback(u("/auth/callback?token_hash=abc&type=recovery")).kind).toBe("none");
    // The recommended email template puts the token in the hash, after RedirectTo's own query.
    expect(parseCallback(u("/auth/callback?next=%2Fsettings%23account#token_hash=h1&type=email"))).toEqual({
      kind: "token_hash",
      tokenHash: "h1",
      type: "email",
      next: "/settings#account",
    });
  });
  it("OAuth / PKCE code", () => {
    expect(parseCallback(u("/auth/callback?code=xyz"))).toEqual({ kind: "code", code: "xyz", next: "/settings" });
  });
  it("errors in the query or hash", () => {
    expect(parseCallback(u("/auth/callback#error=access_denied&error_description=Email+link+is+invalid"))).toMatchObject({ kind: "error", message: "Email link is invalid" });
  });
});

describe("parseProviders", () => {
  it("keeps known providers only", () => {
    expect(parseProviders(" Google, github,google ")).toEqual(["google"]);
    expect(parseProviders(undefined)).toEqual([]);
  });
});
