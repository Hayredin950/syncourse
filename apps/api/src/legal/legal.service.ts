import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { legalTitle } from './legal.constants';

export interface AcceptLegalInput {
  /** Which documents to accept. Omitted means "everything currently pending". */
  types?: string[];
  source?: string;
}

/** A document this user has not agreed to in its current version. */
export interface PendingLegalDoc {
  type: string;
  title: string;
  version: string;
  changeSummary: string | null;
  effectiveAt: Date;
  updatedAt: Date;
  /** The version they last agreed to, or null if they never have. */
  previousVersion: string | null;
  previousAcceptedAt: Date | null;
}

export interface AcceptedLegalDoc {
  type: string;
  title: string;
  version: string;
  acceptedAt: Date;
}

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What this user still has to agree to: every acceptance-required document
   * whose *current* version they have no acceptance row for.
   *
   * `previousVersion` is what makes the prompt honest. Someone who has never
   * accepted anything is being asked a sign-up formality; someone who accepted
   * 1.0 and is now looking at 1.1 is being told their agreement changed. The two
   * deserve different wording, so the API distinguishes them instead of leaving
   * the client to guess.
   */
  async pending(userId: string) {
    const docs = await this.prisma.legalDocument.findMany({ orderBy: { type: 'asc' } });
    const acceptances = docs.length
      ? await this.prisma.legalAcceptance.findMany({
          where: { userId, documentId: { in: docs.map((d) => d.id) } },
          orderBy: { acceptedAt: 'desc' },
        })
      : [];

    const pending: PendingLegalDoc[] = [];
    const accepted: AcceptedLegalDoc[] = [];
    for (const doc of docs) {
      const mine = acceptances.filter((a) => a.documentId === doc.id);
      const current = mine.find((a) => a.version === doc.version);
      if (current) {
        accepted.push({
          type: doc.type,
          title: legalTitle(doc.type, doc.title),
          version: current.version,
          acceptedAt: current.acceptedAt,
        });
        continue;
      }
      if (!doc.requiresAcceptance) continue;
      const previous = mine[0]; // newest first — the version they last agreed to
      pending.push({
        type: doc.type,
        title: legalTitle(doc.type, doc.title),
        version: doc.version,
        changeSummary: doc.changeSummary,
        effectiveAt: doc.effectiveAt,
        updatedAt: doc.updatedAt,
        previousVersion: previous?.version ?? null,
        previousAcceptedAt: previous?.acceptedAt ?? null,
      });
    }
    return { pending, accepted };
  }

  /**
   * Record consent for the current version of each requested document, and
   * answer with the reader's fresh standing — same shape as `pending()`, so a
   * client can render the result without a second round trip.
   */
  async accept(userId: string, input: AcceptLegalInput = {}) {
    const wanted = input.types?.map((t) => t.trim().toLowerCase()).filter(Boolean);
    const docs = await this.prisma.legalDocument.findMany({
      where: {
        requiresAcceptance: true,
        ...(wanted?.length ? { type: { in: wanted } } : {}),
      },
    });
    if (docs.length === 0) return this.pending(userId);

    // skipDuplicates makes a double-tap (or a retried request) harmless: the
    // unique key is (user, document, version), so consent is idempotent.
    await this.prisma.legalAcceptance.createMany({
      data: docs.map((doc) => ({
        userId,
        documentId: doc.id,
        type: doc.type,
        version: doc.version,
        source: input.source?.trim() || 'web',
      })),
      skipDuplicates: true,
    });

    const status = await this.pending(userId);
    // Nothing left outstanding: clear the update notices so the bell doesn't keep
    // asking for something the user has already done.
    if (status.pending.length === 0) {
      await this.prisma.notification.updateMany({
        where: { userId, type: 'legal_update', read: false },
        data: { read: true },
      });
    }
    return status;
  }
}
