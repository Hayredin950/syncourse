/**
 * Read-only probe #2: bots cannot call `messages.getHistory`, but explicit id
 * lookups often work. Resolve a handful of ids from the database and print the
 * real shape of those posts (text, caption, photo/video/document, album).
 *
 *   npx tsx --env-file=.env prisma/probe-ids.ts [--range 1000-1100]
 */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? '';
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';

  const rangeArg = process.argv.find((a) => a.startsWith('--range='));
  let ids: number[] = [];
  if (rangeArg) {
    const [from, to] = rangeArg.split('=')[1].split('-').map(Number);
    for (let id = from; id <= to; id++) ids.push(id);
  } else {
    const rows = await prisma.telegramCourseLink.findMany({
      where: { chatId: { not: BigInt(0) } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { chatId: true, fileMessageId: true, fileName: true, course: { select: { title: true } } },
    });
    ids = rows.map((r) => Number(r.fileMessageId));
    console.log(rows.map((r) => `${r.fileMessageId} ${r.fileName}`).join('\n'));
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: true,
  });
  await client.start({ botAuthToken: botToken, onError: (e) => { throw e; } });
  const entity = await client.getEntity('syncourse');
  const messages = await client.getMessages(entity, { ids });

  for (const m of messages) {
    if (!m) {
      console.log('missing');
      continue;
    }
    const media = m.media as { className?: string; document?: { attributes?: unknown[]; mimeType?: string }; photo?: unknown } | undefined;
    console.log(`\nid=${m.id} media=${media?.className ?? 'none'} album=${m.groupedId ?? '-'}`);
    if (m.message) console.log(`text: ${m.message.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  await client.disconnect();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
