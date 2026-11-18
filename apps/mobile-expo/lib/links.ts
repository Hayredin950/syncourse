/**
 * Notification deep links are written by the API as plain strings, so a stale
 * row — or a typo in an admin broadcast — can send the router anywhere,
 * including an external URL. Expo Router treats `router.push("https://…")` as a
 * route and lands on the not-found screen for internal paths too.
 *
 * Only in-app routes that exist today are accepted. An unknown or external
 * target returns null and the UI hides its Open action instead of navigating.
 */
const ALLOWED_PREFIXES = [
  "/courses/",
  "/resources/",
  "/paths/",
  "/lists/",
  "/lecturers/",
  "/organizations/",
  "/legal/",
  "/premium",
  "/notifications",
  "/settings",
  "/downloads",
  "/stats",
  "/changelog",
  "/circles",
  "/auth",
];

export function safeInternalPath(link: string | null | undefined): string | null {
  if (!link) return null;
  const path = link.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  // A scheme, a backslash trick or whitespace has no business in a route.
  if (/[\\\s]/.test(path) || path.includes("://")) return null;

  // Resolve once so encoded schemes (`%2F%2Fevil`) cannot slip through.
  let resolved: URL;
  try {
    resolved = new URL(path, "https://syncourse.invalid");
  } catch {
    return null;
  }
  if (resolved.origin !== "https://syncourse.invalid") return null;

  const pathname = resolved.pathname;
  return ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + "/"),
  )
    ? pathname + resolved.search + resolved.hash
    : null;
}
