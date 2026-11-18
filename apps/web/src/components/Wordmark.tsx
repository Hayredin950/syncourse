/**
 * The Syncourse wordmark — the single source of truth for the logo.
 *
 * It is set in Fraunces: "Sync" in cream, "ourse" in the brand amber and
 * italic. Every surface that shows a logo (top bar, footer, auth, admin, error
 * screens) renders THIS component, so the mark cannot drift between pages
 * again — which is exactly what happened when the auth screen kept an older
 * "sync + dot + ourse" lockup.
 */
export function Wordmark({
  small = false,
  className = "",
  as = "span",
}: {
  small?: boolean;
  className?: string;
  as?: "span" | "div";
}) {
  const Tag = as;
  return (
    <Tag className={`brand-word ${small ? "is-small" : ""} ${className}`.trim()}>
      Sync<span className="brand-ourse">ourse</span>
    </Tag>
  );
}
