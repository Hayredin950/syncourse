/**
 * assistant-check.ts — end-to-end checks for the grounded assistant.
 *
 * Runs with no LLM key on purpose: the extractive path is the product's floor
 * and must be proven on its own. Provider selection is checked in isolation;
 * a real model is never called from a test, so a run costs nothing.
 *
 *   npm run test:assistant -w apps/api
 */
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService } from '../src/search/search.service';
import { RetrievalService, keywordsOf, snippetOf } from '../src/assistant/retrieval/retrieval.service';
import { AssistantService } from '../src/assistant/assistant.service';
import { resolveLlm } from '../src/assistant/llm/llm.provider';
import { warmUp } from './lib/db-warmup';

const prisma = new PrismaClient(
  // The test opens more queries in a row than a single page load. Neon's pooled
  // endpoint multiplexes, so one connection is enough and avoids opening new
  // ones mid-run.
  process.env.DATABASE_URL
    ? {
        datasources: {
          db: { url: (() => {
            const url = new URL(process.env.DATABASE_URL as string);
            url.searchParams.set('connection_limit', '1');
            return url.toString();
          })() },
        },
      }
    : undefined,
);
const db = prisma as unknown as PrismaService;
const search = new SearchService(db);
const retrieval = new RetrievalService(db, search);
const assistant = new AssistantService(db, retrieval);

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const IP = `assistant-check-${Date.now()}`;
const secret = process.env.JWT_SECRET ?? 'syncourse';
const subject = `ip:${createHash('sha1').update(`${IP}|${secret}`).digest('hex').slice(0, 24)}`;

async function main() {
  // The free Neon compute suspends when idle; wake it before asserting, so a
  // cold start is not reported as a product failure.
  await warmUp(prisma);

  console.log('assistant: keywords and snippets');
  {
    const kw = keywordsOf('How do I build a RAG pipeline with Python?');
    check('drops question words and keeps subjects', kw.includes('rag') && kw.includes('pipeline') && kw.includes('python'), kw);
    check('does not keep "how"/"do"/"i"', !kw.includes('how') && !kw.includes('do') && !kw.includes('i'), kw);

    const text = 'The first lesson explains embeddings. ' + 'Padding '.repeat(80) + 'Then we build a RAG pipeline end to end.';
    const snip = snippetOf(text, ['rag'], 120);
    check('snippet is a window around the match', snip.toLowerCase().includes('rag') && snip.length <= 130, snip.length);
  }

  console.log('assistant: provider selection (no network)');
  {
    check('no keys → extractive', resolveLlm({}).provider === null);
    check('kill switch wins over a key', resolveLlm({ ASSISTANT_LLM: 'none', GEMINI_API_KEY: 'k' }).provider === null);
    const gem = resolveLlm({ GEMINI_API_KEY: 'k' });
    check('gemini selected when its key exists', gem.provider?.name === 'gemini' && gem.provider?.model.length ? true : false, gem);
    const groq = resolveLlm({ GROQ_API_KEY: 'k' });
    check('groq is the fallback', groq.provider?.name === 'groq', groq);
  }

  console.log('assistant: status');
  {
    const s = assistant.status();
    check('enabled by default', s.enabled === true, s);
    check('extractive without a key', s.mode === 'extractive' && s.provider === null, s);
    check('daily caps are positive', s.dailyCap.anonymous > 0 && s.dailyCap.member > s.dailyCap.anonymous, s.dailyCap);
  }

  console.log('assistant: a real question');
  {
    const res = await assistant.ask('How do I build a RAG pipeline?', { ip: IP });
    check('answers in extractive mode', res.mode === 'extractive', res.mode);
    check('answer is substantial', res.answer.length > 60, res.answer.length);
    check('has citations', res.citations.length > 0, res.citations.length);
    check('has courses', res.courses.length > 0, res.courses.length);
    check(
      'every citation links to a course page',
      res.citations.every((c) => c.url.startsWith('/courses/') && c.snippet.length > 0),
      res.citations.map((c) => c.url),
    );
    check(
      'citation indexes are 1..n with no gaps',
      res.citations.every((c, i) => c.index === i + 1),
      res.citations.map((c) => c.index),
    );
    check(
      'no course exceeds three cited sources',
      (() => {
        const counts = new Map<string, number>();
        for (const c of res.citations) counts.set(c.courseId, (counts.get(c.courseId) ?? 0) + 1);
        return [...counts.values()].every((n) => n <= 3);
      })(),
      res.citations.map((c) => c.courseTitle),
    );
    check('answer is not raw chunk dumping', res.answer.length < 4000, res.answer.length);
    check(
      'one citation per file',
      new Set(res.citations.map((c) => `${c.courseId}\u0000${c.name}`)).size === res.citations.length,
      res.citations.map((c) => `${c.courseTitle} :: ${c.name}`),
    );
    check(
      'real text outranks bare filenames',
      res.citations.some((c) => c.kind !== 'entry-name' && c.kind !== 'archive-name'),
      res.citations.map((c) => c.kind),
    );
  }

  console.log('assistant: honest empty answer');
  {
    const res = await assistant.ask('quantum chromodynamics for basket weavers', { ip: IP });
    check('does not invent sources', res.citations.length === 0, res.citations.length);
    check('says it could not find it', /couldn't find|no course/i.test(res.answer), res.answer.slice(0, 120));
    check('still returns 200-shaped payload', res.mode === 'extractive' && Array.isArray(res.courses));
  }

  console.log('assistant: premium text never leaks');
  {
    // A temporary premium course, deleted in `finally`. Using a real course
    // would mean toggling `isPremium` on live data, which is worse.
    const stamp = Date.now();
    const slug = `assistant-check-premium-${stamp}`;
    const token = `PREMIUM-SECRET-${stamp}`;
    const course = await prisma.course.create({
      data: {
        title: `Assistant check premium ${stamp}`,
        slug,
        description: 'Temporary course created by assistant-check.ts.',
        isPremium: true,
        publishedAt: new Date(),
      },
      select: { id: true, slug: true },
    });

    try {
      const sourceName = `assistant-check-${stamp}.txt`;
      await prisma.contentChunk.create({
        data: {
          courseId: course.id,
          sourceKind: 'text',
          sourceName,
          ordinal: 0,
          text: `Lesson one. ${token}. ${'The premium workbook walks through advanced patterns for the summarise question. '.repeat(6)}`,
          charCount: 500,
          contentHash: `assistant-check-${token}`,
        },
      });

      const question = 'summarise what the premium workbook covers';

      const res = await assistant.ask(question, { courseSlug: slug, ip: IP });
      check('premium course is listed as locked', res.courses.some((c) => c.id === course.id && c.locked), res.courses);
      check(
        'no citation quotes the premium course',
        res.citations.every((c) => c.courseId !== course.id && !c.snippet.includes(token)),
        res.citations.map((c) => c.courseTitle),
      );
      check('the answer never contains premium text', !res.answer.includes(token), res.answer.slice(0, 120));
      check('the answer explains the lock', /premium/i.test(res.answer), res.answer.slice(0, 160));
      check('reader is not premium', res.premiumActive === false);

      // A temporary member, so both sides of the gate are proven in one run.
      const member = await prisma.user.create({
        data: {
          name: 'Assistant Check Member',
          username: `assistant-check-${stamp}`,
          email: `assistant-check-${stamp}@example.invalid`,
          passwordHash: null,
          isVerified: true,
          planType: 'premium',
          planExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      try {
        const asMember = await assistant.ask(question, { courseSlug: slug, ip: IP, userId: member.id });
        check('an active member may read it', asMember.premiumActive === true, asMember.premiumActive);
        check(
          'member gets sources from the premium course',
          asMember.citations.some((c) => c.courseId === course.id),
          asMember.citations.map((c) => c.courseTitle),
        );
        check(
          'member answer contains the premium text',
          asMember.answer.includes(token) || asMember.citations.some((c) => c.snippet.includes(token)),
          asMember.answer.slice(0, 120),
        );
      } finally {
        await prisma.assistantUsage.deleteMany({ where: { subject: `u:${member.id}` } });
        await prisma.user.delete({ where: { id: member.id } }).catch(() => undefined);
      }
    } finally {
      // Cascades to the chunk.
      await prisma.course.delete({ where: { id: course.id } }).catch(() => undefined);
    }
  }

  console.log('assistant: input guards');
  {
    const rejection = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return 0;
      } catch (err) {
        return err instanceof HttpException ? err.getStatus() : -1;
      }
    };
    check('too-short question → 400', (await rejection(() => assistant.ask('hi', { ip: IP }))) === 400);
    check(
      'over-long question → 400',
      (await rejection(() => assistant.ask('x'.repeat(600), { ip: IP }))) === 400,
    );
  }

  console.log('assistant: daily cap is durable');
  {
    const capIp = `${IP}-cap`;
    const capSubject = `ip:${createHash('sha1').update(`${capIp}|${secret}`).digest('hex').slice(0, 24)}`;
    const previous = process.env.ASSISTANT_DAILY_ANON;
    process.env.ASSISTANT_DAILY_ANON = '1';
    try {
      await prisma.assistantUsage.deleteMany({ where: { subject: capSubject } });
      const first = await assistant.ask('what is flutter used for', { ip: capIp });
      check('first question within budget succeeds', first.answer.length > 0);
      let status = 0;
      try {
        await assistant.ask('what is docker used for', { ip: capIp });
      } catch (err) {
        status = err instanceof HttpException ? err.getStatus() : -1;
      }
      check('second question over the cap → 429', status === 429, status);

      const row = await prisma.assistantUsage.findUnique({
        where: { day_subject: { day: new Date().toISOString().slice(0, 10), subject: capSubject } },
      });
      check('the budget row recorded the attempts', (row?.count ?? 0) === 2, row?.count);
    } finally {
      if (previous === undefined) delete process.env.ASSISTANT_DAILY_ANON;
      else process.env.ASSISTANT_DAILY_ANON = previous;
      await prisma.assistantUsage.deleteMany({ where: { subject: capSubject } });
    }
  }

  console.log('assistant: kill switch');
  {
    const previous = process.env.ASSISTANT_ENABLED;
    process.env.ASSISTANT_ENABLED = 'false';
    try {
      check('status reports disabled', assistant.status().enabled === false);
      let status = 0;
      try {
        await assistant.ask('how do I build a RAG pipeline', { ip: IP });
      } catch (err) {
        status = err instanceof HttpException ? err.getStatus() : -1;
      }
      check('ask → 503 while disabled', status === 503, status);
    } finally {
      if (previous === undefined) delete process.env.ASSISTANT_ENABLED;
      else process.env.ASSISTANT_ENABLED = previous;
    }
  }

  console.log('assistant: retrieval never crosses courses on an anchor');
  {
    const course = await prisma.course.findFirst({
      where: { deletedAt: null, isPremium: false, contentChunks: { some: {} } },
      select: { slug: true, id: true, title: true },
    });
    if (!course) {
      console.log('  · no free course with indexed text (skipped)');
    } else {
      const r = await retrieval.retrieve('what is covered in the first lessons', { courseSlug: course.slug });
      check('every source belongs to the anchored course', r.sources.every((s) => s.courseId === course.id), r.sources.map((s) => s.courseTitle));
      check('the anchored course is the first suggestion', r.courses[0]?.id === course.id, r.courses.map((c) => c.title));
    }
  }

  await prisma.assistantUsage.deleteMany({ where: { subject } });

  console.log(`\nassistant: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
