/**
 * Read-only scan of the source group by explicit message id (bots cannot call
 * getHistory, but getMessages with ids works). Prints shape + text so the
 * parser can be designed against real posts.
 *
 *   npx tsx --env-file=.env prisma/scan-channel.ts 1 700
 */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

function attrsOf(m: any): string {
  const doc = m?.media?.document;
  if (!doc) return '';
  const attrs = (doc.attributes ?? []) as Array<Record<string, unknown>>;
  const file = attrs.find((a) => typeof a.fileName === 'string') as { fileName?: string } | undefined;
  const video = attrs.find((a) => a.className === 'DocumentAttributeVideo') as
    | { w?: number; h?: number; duration?: number }
    | undefined;
  const audio = attrs.find((a) => a.className === 'DocumentAttributeAudio') as { duration?: number } | undefined;
  return [
    file ? `file=${file.fileName}` : '',
    video ? `video=${video.w}x${video.h} ${video.duration ?? ''}s` : '',
    audio ? `audio=${audio.duration ?? ''}s` : '',
    doc.mimeType ? `mime=${doc.mimeType}` : '',
    doc.size ? `size=${doc.size}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? '';
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const from = Number(process.argv[2] ?? 1);
  const to = Number(process.argv[3] ?? 700);

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: true,
  });
  await client.start({ botAuthToken: botToken, onError: (e) => { throw e; } });
  const entity = await client.getEntity('syncourse');

  for (let start = from; start <= to; start += 100) {
    const ids: number[] = [];
    for (let id = start; id <= Math.min(start + 99, to); id++) ids.push(id);
    const messages = await client.getMessages(entity, { ids });
    for (const m of messages) {
      if (!m) continue;
      const media = m.media as { className?: string } | undefined;
      const text = (m.message ?? '').replace(/\r/g, '');
      const album = m.groupedId ? ` album=${m.groupedId}` : '';
      console.log(`\n### id=${m.id}${album} media=${media?.className ?? 'none'} ${attrsOf(m)}`);
      if (text) console.log(text.slice(0, 1500));
    }
  }

  await client.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
