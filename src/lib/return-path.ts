/**
 * DP Suite — safe return-path helper (TT-006).
 *
 * Post-login redirects must never send the user to an arbitrary URL —
 * an attacker could craft `/login?redirect=https://evil.example/phish`
 * and bounce a freshly signed-in user off-site. We accept only
 * same-origin, absolute-pathed URLs that stay inside the app.
 */

/** Default landing when no safe return path was preserved. */
export const DEFAULT_RETURN_PATH = "/dashboard";

/**
 * Returns `raw` if it is a safe in-app path, otherwise `DEFAULT_RETURN_PATH`.
 *
 * Rules:
 * - must be a non-empty string;
 * - must start with a single `/` (no `//`, no scheme, no protocol-relative);
 * - must not point at the public auth surface (`/login`, `/forgot-password`,
 *   `/reset-password`, `/auth`, `/access-blocked`) — bouncing back to those
 *   after a successful login creates redirect loops.
 */
export function sanitizeReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return DEFAULT_RETURN_PATH;
  if (!raw.startsWith("/")) return DEFAULT_RETURN_PATH;
  if (raw.startsWith("//")) return DEFAULT_RETURN_PATH;
  if (raw.includes("\\")) return DEFAULT_RETURN_PATH;

  const pathOnly = raw.split(/[?#]/)[0];
  const publicAuthPrefixes = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/auth",
    "/access-blocked",
  ];
  if (publicAuthPrefixes.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) {
    return DEFAULT_RETURN_PATH;
  }
  return raw;
}

/** Builds the search object used when redirecting to `/login`. */
export function buildLoginRedirectSearch(currentPath: string): { redirect?: string } {
  const safe = sanitizeReturnPath(currentPath);
  if (safe === DEFAULT_RETURN_PATH) return {};
  return { redirect: safe };
}
