"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  ExternalLink,
  Plus,
  Search,
  SearchX,
  User,
} from "lucide-react";
import { get } from "@/lib/api";
import type { AdminCourseRow, AdminUserRow } from "@/lib/types";
import AdminEmpty from "./AdminEmpty";
import { ADMIN_NAV } from "./nav";

/**
 * ⌘K command palette.
 *
 * Nine sections deep, the fastest route between two admin screens is typing the
 * name of the second one. Pages and create-actions are always available; courses
 * and users are searched live once the query is long enough to be worth a
 * request. The two entity lists are fetched once per session and reused, because
 * the palette gets opened far more often than the catalogue changes.
 */
interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [courses, setCourses] = useState<AdminCourseRow[] | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  // Reset the query each time it opens: a palette that remembers last time's
  // search makes the first keystroke feel broken.
  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
    }
  }, [open]);

  // Entity search warms up lazily, and failures stay silent — the palette is
  // still perfectly useful as a navigator without them.
  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    if (courses === null) get<AdminCourseRow[]>("/admin/courses").then(setCourses).catch(() => setCourses([]));
    if (users === null) get<AdminUserRow[]>("/admin/users").then(setUsers).catch(() => setUsers([]));
  }, [open, q, courses, users]);

  const commands = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];

    for (const group of ADMIN_NAV) {
      for (const item of group.items) {
        out.push({
          id: `nav:${item.href}`,
          group: "Go to",
          label: item.label,
          hint: group.label,
          icon: <item.icon size={15} />,
          run: () => go(item.href),
        });
      }
    }

    const creators: [string, string][] = [
      ["New course", "/admin/courses/new"],
      ["New category", "/admin/categories?new=1"],
      ["New lecturer", "/admin/lecturers?new=1"],
      ["New publisher", "/admin/publishers?new=1"],
    ];
    for (const [label, href] of creators) {
      out.push({ id: `new:${href}`, group: "Create", label, icon: <Plus size={15} />, run: () => go(href) });
    }

    out.push({
      id: "site",
      group: "Create",
      label: "Open the public site",
      icon: <ExternalLink size={15} />,
      run: () => go("/"),
    });

    const term = q.trim().toLowerCase();
    if (term.length >= 2) {
      for (const c of (courses ?? []).slice(0, 200)) {
        if (!c.title.toLowerCase().includes(term)) continue;
        out.push({
          id: `course:${c.id}`,
          group: "Courses",
          label: c.title,
          hint: c.lecturer ?? undefined,
          icon: <BookOpen size={15} />,
          run: () => go(`/admin/courses/detail?slug=${c.slug}`),
        });
      }
      for (const u of (users ?? []).slice(0, 400)) {
        if (!`${u.name} ${u.email} ${u.username}`.toLowerCase().includes(term)) continue;
        out.push({
          id: `user:${u.id}`,
          group: "Users",
          label: u.name,
          hint: u.email,
          icon: <User size={15} />,
          run: () => go(`/admin/users/detail?id=${u.id}`),
        });
      }
    }

    return out;
  }, [q, courses, users, go]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return commands.filter((c) => c.group === "Go to" || c.group === "Create");
    const scored = commands
      .map((c) => {
        const hay = `${c.label} ${c.hint ?? ""}`.toLowerCase();
        const idx = hay.indexOf(term);
        return { c, score: idx < 0 ? -1 : idx === 0 ? 0 : 1 };
      })
      .filter((s) => s.score >= 0);
    // Prefix matches float above mid-string ones; original order breaks ties.
    return scored.sort((a, b) => a.score - b.score).map((s) => s.c).slice(0, 40);
  }, [commands, q]);

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (results.length ? (c + 1) % results.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        results[cursor]?.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, cursor, onClose]);

  // Keep the highlighted row inside the scroll box when arrowing past the edge.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, results]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="admin-palette__backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="admin-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-palette__field">
          <Search size={16} />
          <input
            className="admin-palette__input"
            placeholder="Search pages, courses, users…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            aria-label="Command palette search"
          />
        </div>

        <div className="admin-palette__list" ref={listRef}>
          {results.length === 0 && (
            <AdminEmpty
              icon={<SearchX size={18} />}
              title={`Nothing matches “${q.trim()}”`}
              hint="Pages, courses, resources, users and publishers are all searchable from here."
            />
          )}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <div className="admin-palette__group">{header}</div>}
                <button
                  type="button"
                  className="admin-palette__item"
                  data-active={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={c.run}
                >
                  {c.icon}
                  <span>{c.label}</span>
                  {c.hint && <small>{c.hint}</small>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="admin-palette__foot">
          <span>
            <ArrowRight size={11} style={{ transform: "rotate(90deg)" }} /> navigate
          </span>
          <span>
            <CornerDownLeft size={11} /> open
          </span>
          <span>
            <kbd className="admin-kbd">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
