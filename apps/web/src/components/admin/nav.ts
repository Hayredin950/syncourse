import {
  BarChart3,
  BookOpen,
  Building2,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Scale,
  ScrollText,
  Send,
  Settings,
  Star,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * One nav definition, three consumers: the sidebar, the mobile tab strip and the
 * ⌘K palette. Keeping it in a single list is what stops the palette drifting out
 * of sync with the sidebar every time a section is added.
 *
 * Grouping is by *what you are doing*, not by database table — "is this a
 * catalogue job or a community job" is the question an operator actually has.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra search terms for the palette; never shown. */
  keywords?: string;
  /** Which stat feeds the count chip beside the label, if any. */
  badge?: "pendingPayments";
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, keywords: "home stats overview" },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, keywords: "revenue growth charts trends cohort" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/courses", label: "Courses", icon: BookOpen, keywords: "catalog lessons sections content" },
      { href: "/admin/categories", label: "Categories", icon: Tag, keywords: "groups topics browse" },
      { href: "/admin/lecturers", label: "Lecturers", icon: GraduationCap, keywords: "instructors teachers authors" },
      { href: "/admin/publishers", label: "Publishers", icon: Building2, keywords: "organizations schools companies" },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/admin/users", label: "Users", icon: Users, keywords: "accounts members people staff roles" },
      { href: "/admin/reviews", label: "Reviews", icon: Star, keywords: "comments discussion moderation spam" },
    ],
  },
  {
    label: "Revenue",
    items: [
      {
        href: "/admin/payments",
        label: "Payments",
        icon: CreditCard,
        keywords: "subscriptions premium telebirr approve",
        badge: "pendingPayments",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/admin/telegram",
        label: "Telegram bot",
        icon: Send,
        keywords: "bot files link import unlink broadcast channel zip connect pair download",
      },
      { href: "/admin/activity", label: "Activity log", icon: ScrollText, keywords: "audit history events trail" },
      {
        href: "/admin/legal",
        label: "Legal",
        icon: Scale,
        keywords: "terms privacy refund policy consent acceptance version",
      },
      { href: "/admin/settings", label: "Settings", icon: Settings, keywords: "config support telegram plans" },
    ],
  },
];

export const ADMIN_NAV_FLAT: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items);

/**
 * Which nav entry owns the current URL. Longest match wins, so
 * /admin/courses/foo/edit resolves to Courses rather than to Dashboard — and
 * bare /admin only ever matches exactly.
 */
export function activeNavItem(pathname: string): AdminNavItem | undefined {
  if (pathname === "/admin") return ADMIN_NAV_FLAT[0];
  return ADMIN_NAV_FLAT.filter((i) => i.href !== "/admin" && pathname.startsWith(i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
