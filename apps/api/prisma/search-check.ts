/**
 * search-check.ts
 *
 * Golden queries for the search engine. Run it after changing ranking, the
 * synonym table, or the content index:
 *
 *   npm run test:search -w apps/api
 *
 * It prints what each query returns and flags a query whose expected word is
 * absent from the top results. It is a smoke test, not a benchmark — the
 * catalogue is small enough that a human should still read the output.
 */
import { PrismaClient } from '@prisma/client';
import { SearchService } from '../src/search/search.service';
import { ResourcesService } from '../src/resources/resources.service';
import { warmUp } from './lib/db-warmup';

const prisma = new PrismaClient();
const search = new SearchService(prisma as never, new ResourcesService(prisma as never));

interface Case {
  q: string;
  /** At least one top result's title/description should contain this (case-insensitive). */
  expect?: string;
  note: string;
}

const CASES: Case[] = [
  { q: 'python', expect: 'python', note: 'plain keyword' },
  { q: 'pythn', expect: 'python', note: 'typo tolerance (trigram)' },
  { q: 'ML', expect: 'machine learning', note: 'synonym expansion' },
  { q: 'AI', expect: 'ai', note: 'two-letter query + synonym' },
  { q: 'rag', expect: 'rag', note: 'acronym that is also a word' },
  { q: 'crewai', expect: 'rag', note: 'module name inside a ZIP (archive-name chunk)' },
  { q: 'pinecone', expect: 'n8n', note: 'word that exists only inside notes (ContentChunk)' },
  { q: 'webhook', expect: 'n8n', note: 'word that exists only inside extracted text' },
  { q: 'n8n', expect: 'n8n', note: 'product name' },
  { q: 'flutter', expect: 'flutter', note: 'mobile course' },
  { q: 'javascript', note: 'broad topic' },
  { q: 'machine learning', expect: 'machine learning', note: 'multi-word phrase' },
  { q: 'object oriented', note: 'synonym of OOP' },
  { q: 'quran', expect: 'quran', note: 'non-English catalogue entry' },
];

async function main() {
  await warmUp(prisma);
  let misses = 0;

  for (const c of CASES) {
    const res = await search.search(c.q, { limit: 5 });
    const titles = res.courses.map((x) => x.title);
    const haystack = res.courses
      .map((x) => `${x.title} ${x.description ?? ''}`)
      .join(' ')
      .toLowerCase();
    const hit = !c.expect || haystack.includes(c.expect.toLowerCase());
    if (!hit) misses++;

    console.log(
      `${hit ? 'ok  ' : 'MISS'} ${JSON.stringify(c.q).padEnd(20)} ` +
        `total=${String(res.total).padStart(3)}  ${c.note}`,
    );
    for (const t of titles) console.log(`       · ${t}`);
  }

  console.log(`\n${CASES.length - misses}/${CASES.length} queries matched their expectation`);
  if (misses > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
