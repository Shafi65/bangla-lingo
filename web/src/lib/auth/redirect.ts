// Safe "return to" paths after sign-in: same-site absolute paths only (no //host, no schemes).

export function safeNextPath(raw: string | null | undefined, fallback = "/settings"): string {
  if (!raw || typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  if (raw.startsWith("/auth/")) return fallback;
  return raw;
}

/**
 * Which kind of auth return a URL is. Email links carry token_hash in the hash (the recommended
 * template, docs/ACCOUNTS.md) or the query; OAuth returns ?code=; errors come in either.
 */
export type CallbackParams =
  | { kind: "token_hash"; tokenHash: string; type: "email" | "magiclink" | "signup"; next: string }
  | { kind: "code"; code: string; next: string }
  | { kind: "error"; message: string; next: string }
  | { kind: "none"; next: string };

const OTP_TYPES = ["email", "magiclink", "signup"] as const;

export function parseCallback(url: URL): CallbackParams {
  const q = url.searchParams;
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const next = safeNextPath(q.get("next"));
  const err = q.get("error_description") ?? hash.get("error_description") ?? q.get("error") ?? hash.get("error");
  if (err) return { kind: "error", message: err.replace(/\+/g, " "), next };
  const tokenHash = hash.get("token_hash") ?? q.get("token_hash");
  const type = (hash.get("token_hash") ? hash.get("type") : q.get("type")) ?? "email";
  if (tokenHash && (OTP_TYPES as readonly string[]).includes(type)) {
    return { kind: "token_hash", tokenHash, type: type as (typeof OTP_TYPES)[number], next };
  }
  const code = q.get("code");
  if (code) return { kind: "code", code, next };
  return { kind: "none", next };
}
