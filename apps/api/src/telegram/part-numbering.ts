/**
 * Part numbers as they should read, rather than as they happen to be stored.
 *
 * Every attach path now numbers a file as it arrives (`nextPartIndex`), but rows
 * linked before that landed all took the column default of 1 — a three-ZIP course
 * showed "Part 1" three times, on the website and in the bot's buttons alike.
 * Rather than migrate the column and relabel numbering people may already have
 * seen, both readers repair on the way out.
 *
 * Repair is deliberately narrow: a module whose numbers are already distinct is
 * left exactly as it is, because those came from the filenames (a channel that
 * posted only "Part 03" and "Part 05" should keep saying 3 and 5). Only a module
 * with collisions gets relabelled, and then by delivery position, so the numbers
 * follow the same order the files are sent in.
 */
export function withPartNumbers<T extends { moduleTitle: string | null; partIndex: number }>(
  files: T[],
): T[] {
  const UNGROUPED = '__ungrouped__';
  const modules = new Map<string, T[]>();
  for (const f of files) {
    const key = f.moduleTitle ?? UNGROUPED;
    const list = modules.get(key);
    if (list) list.push(f);
    else modules.set(key, [f]);
  }

  const fixed = new Map<T, number>();
  for (const list of modules.values()) {
    const distinct = new Set(list.map((f) => f.partIndex)).size === list.length;
    if (distinct) continue;
    list.forEach((f, i) => fixed.set(f, i + 1));
  }
  if (fixed.size === 0) return files;

  // Callers order these rows themselves (moduleOrder, partIndex, createdAt) and
  // address files by id, so rewriting the label never moves or re-points a row.
  return files.map((f) => {
    const n = fixed.get(f);
    return n === undefined ? f : { ...f, partIndex: n };
  });
}
