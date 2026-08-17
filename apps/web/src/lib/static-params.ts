/**
 * Build-time helpers for static export of dynamic routes.
 *
 * The SPA fallback cannot resolve dynamic routes in the App Router, so every
 * real slug must exist as an exported file. These helpers fetch the live
 * slugs from the API at build time and fall back to a placeholder so the
 * build never fails when the API is unreachable.
 */
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${API}/api${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function courseSlugs(): Promise<{ slug: string }[]> {
  try {
    const d = (await fetchJson("/courses?limit=100")) as { results?: { slug: string }[] };
    const slugs = (d.results ?? []).map((c) => ({ slug: c.slug }));
    return slugs.length ? slugs : [{ slug: "course" }];
  } catch {
    return [{ slug: "course" }];
  }
}

export async function lecturerSlugs(): Promise<{ slug: string }[]> {
  try {
    const d = (await fetchJson("/lecturers")) as { results?: { slug: string }[] } | { slug: string }[];
    const arr = Array.isArray(d) ? d : (d.results ?? []);
    const slugs = arr.map((l) => ({ slug: l.slug }));
    return slugs.length ? slugs : [{ slug: "lecturer" }];
  } catch {
    return [{ slug: "lecturer" }];
  }
}

export async function organizationSlugs(): Promise<{ slug: string }[]> {
  try {
    const d = (await fetchJson("/organizations")) as { results?: { slug: string }[] } | { slug: string }[];
    const arr = Array.isArray(d) ? d : (d.results ?? []);
    const slugs = arr.map((o) => ({ slug: o.slug }));
    return slugs.length ? slugs : [{ slug: "organization" }];
  } catch {
    return [{ slug: "organization" }];
  }
}

export async function pathIds(): Promise<{ id: string }[]> {
  try {
    const d = (await fetchJson("/learning-paths")) as { id: string }[];
    const ids = d.map((p) => ({ id: p.id }));
    return ids.length ? ids : [{ id: "path" }];
  } catch {
    return [{ id: "path" }];
  }
}

export async function listIds(): Promise<{ id: string }[]> {
  try {
    const d = (await fetchJson("/lists")) as { results?: { id: string }[] } | { id: string }[];
    const arr = Array.isArray(d) ? d : (d.results ?? []);
    const ids = arr.map((l) => ({ id: l.id }));
    return ids.length ? ids : [{ id: "public" }];
  } catch {
    return [{ id: "public" }];
  }
}

export async function lessonParams(): Promise<{ slug: string; lessonId: string }[]> {
  try {
    const courses = await courseSlugs();
    const params: { slug: string; lessonId: string }[] = [];
    for (const { slug } of courses.slice(0, 30)) {
      try {
        const d = (await fetchJson(`/courses/${slug}`)) as { sections?: { lessons?: { id: string }[] }[] };
        for (const s of d.sections ?? []) {
          for (const l of s.lessons ?? []) params.push({ slug, lessonId: l.id });
        }
      } catch {
        // skip courses that fail individually
      }
    }
    return params.length ? params : [{ slug: "course", lessonId: "lesson" }];
  } catch {
    return [{ slug: "course", lessonId: "lesson" }];
  }
}
