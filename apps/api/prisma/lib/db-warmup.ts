/**
 * Wake the free Neon compute before a test asserts anything.
 *
 * The database suspends when idle, and the first connection can take longer
 * than Prisma's five-second connect budget. Without this, a perfectly good
 * change looks like a regression on the first query of a run.
 */
import type { PrismaClient } from '@prisma/client';

export async function warmUp(prisma: PrismaClient, attempts = 8): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await prisma.$queryRaw`select 1`;
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}
