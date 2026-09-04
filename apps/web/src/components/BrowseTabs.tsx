"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText } from "lucide-react";

/**
 * Courses and Resources, as two tabs on one Browse surface.
 *
 * The desktop top bar lists both as separate destinations, but a phone has five
 * slots in the tab bar and spending two of them on "the catalogue" and "the other
 * catalogue" left Collections with no way in. So on a phone they are one tab —
 * Browse — and this strip is how you get from one half to the other.
 *
 * Two routes rather than one page with a state variable: both are prerendered by
 * the static export, both keep their own filters in the URL, and a link to a
 * filtered resource view stays a link to a filtered resource view.
 *
 * The strip hides itself above the phone breakpoint. It deliberately does not use
 * `.mobile-only`: that class sets `display: block` inside the phone media query,
 * which would override the grid that makes the two tabs equal halves.
 */
const TABS = [
  { href: "/browse", label: "Courses", icon: BookOpen },
  { href: "/resources", label: "Resources", icon: FileText },
];

export function BrowseTabs() {
  const pathname = usePathname();
  return (
    <div className="browse-tabs" role="tablist" aria-label="Browse">
      {TABS.map((t) => {
        const on = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={on}
            className={`browse-tab ${on ? "active" : ""}`}
          >
            <t.icon size={14} /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
