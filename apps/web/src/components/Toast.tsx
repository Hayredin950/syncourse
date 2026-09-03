"use client";

/**
 * The one toast on the site.
 *
 * Seven pages each carried their own copy of a `.sheet` overlay with an inline
 * amber panel inside it, in a seventh shade of amber (`#f6a437`) — and since
 * `.sheet` blurs whatever is behind it, "Link copied" blurred the whole page
 * for a second and a half. This is one fixed element, no overlay, announced to
 * screen readers, and it cannot swallow a click.
 *
 * Pair it with `useToast()`, which owns the message and its lifetime.
 */
export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
