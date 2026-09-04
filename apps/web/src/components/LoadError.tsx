"use client";

/**
 * "We couldn't load this", with a way out.
 *
 * Every list on the site used to swallow its fetch error — `.catch(() => {})` —
 * and then render whichever branch `null`/`[]` happened to select. That meant one
 * of two lies: a skeleton that shimmers forever on /my-learning, or an empty
 * state on /paths and /organizations telling the reader "the first ones are on
 * the way" when in fact the request had failed. Neither offers a retry, so the
 * only recovery was a manual reload.
 *
 * `onRetry` re-runs the fetch where the caller can hand one over; without it the
 * button reloads the page, which is the honest fallback for a component that has
 * no loader of its own to call again.
 */
export function LoadError({
  icon = "📡",
  title = "We couldn't load this",
  body = "The connection dropped on the way to our servers. Nothing is lost — try again.",
  onRetry,
  compact,
}: {
  icon?: string;
  title?: string;
  body?: string;
  onRetry?: () => void;
  /** Inside a rail or a card rather than owning the page. */
  compact?: boolean;
}) {
  return (
    <div className="empty-state" role="alert" style={compact ? undefined : { padding: "54px 26px" }}>
      <div className="empty-icon">{icon}</div>
      <h3 style={{ margin: "0 0 6px" }}>{title}</h3>
      <p style={{ margin: "0 auto", maxWidth: "44ch" }}>{body}</p>
      <button
        className="btn primary"
        style={{ marginTop: compact ? 14 : 18 }}
        onClick={() => (onRetry ? onRetry() : window.location.reload())}
      >
        Try again
      </button>
    </div>
  );
}
