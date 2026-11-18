/**
 * The one place extracted text becomes `ContentChunk` rows.
 *
 * Both indexing waves call this, so the dedupe key and the replace-by-kind rule
 * cannot drift between the Bot API job and the large-file worker.
 */
import type { PrismaClient } from '@prisma/client';
import { ChunkRow, hash } from './text-extract';

export async function writeLinkChunks(
  prisma: PrismaClient,
  linkId: string,
  courseId: string,
  rows: ChunkRow[],
  replaceKinds: string[],
): Promise<number> {
  const data = rows
    .filter((r) => r.text.trim())
    .map((r) => ({
      courseId,
      linkId,
      sourceKind: r.sourceKind,
      sourceName: r.sourceName,
      moduleTitle: r.moduleTitle,
      partIndex: r.partIndex,
      ordinal: r.ordinal,
      text: r.text,
      charCount: r.text.length,
      contentHash: hash(`${r.sourceName}\u0000${r.ordinal}\u0000${r.text}`),
    }));

  await prisma.$transaction([
    prisma.contentChunk.deleteMany({ where: { linkId, sourceKind: { in: replaceKinds } } }),
    ...(data.length ? [prisma.contentChunk.createMany({ data, skipDuplicates: true })] : []),
  ]);
  return data.length;
}
