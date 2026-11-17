/**
 * Pair an edited list of rows with the rows it replaces, without losing
 * identity.
 *
 * Both the admin course form and the feed importer post a whole tree, so the
 * server has to decide which existing section/lesson each incoming row is.
 * Doing that row by row is subtly wrong: a newly inserted row can claim the
 * position that a later row is about to claim by title, and the later row then
 * looks "new". Its notes, files and download history are deleted as stale.
 *
 * So assign globally, in passes: id first when the client sends one, then
 * title (a module moved up or down keeps its notes), then position (a renamed
 * module keeps them too). Every pass only considers rows no earlier pass took.
 */
export function matchRows<T extends { id: string }, U>(
  incoming: readonly U[],
  existing: readonly T[],
  sameTitle: (row: U, candidate: T) => boolean,
  samePosition: (row: U, candidate: T, index: number) => boolean,
  sameId?: (row: U, candidate: T) => boolean,
): (T | undefined)[] {
  const used = new Set<string>();
  const out: (T | undefined)[] = incoming.map(() => undefined);

  const assign = (matches: (row: U, candidate: T, index: number) => boolean) => {
    for (const [i, row] of incoming.entries()) {
      if (out[i]) continue;
      const hit = existing.find((x) => !used.has(x.id) && matches(row, x, i));
      if (hit) {
        out[i] = hit;
        used.add(hit.id);
      }
    }
  };

  if (sameId) assign(sameId);
  assign((row, candidate) => sameTitle(row, candidate));
  assign(samePosition);

  return out;
}
