/**
 * Read-only probe: what is actually posted in the source group?
 *
 *   npx tsx --env-file=.env prisma/probe-channel.ts [limit]
 *
 * Prints shape only (no downloads, no writes): text, caption, media class,
 * album grouping and file names. Used to design the parser against real posts.
 */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import bigInt from 'big-integer';

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? '';
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!apiId || !apiHash || !botToken) throw new Error('missing MTProto env');

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: true,
  });
  await client.start({ botAuthToken: botToken, onError: (e) => { throw e; } });

  const entity = await client.getEntity('syncourse');
  const limit = Number(process.argv[2] ?? 60);
  const messages = await client.getMessages(entity, { limit });

  console.log(`entity=${(entity as { title?: string }).title ?? '?'} messages=${messages.length}`);
  for (const m of messages) {
    const media = m.media;
    const cls = media ? (media as { className?: string }).className ?? typeof media : 'none';
    const doc = media && 'document' in media ? (media as { document?: { attributes?: unknown[]; mimeType?: string; size?: unknown } }).document : undefined;
    const attrs = (doc?.attributes ?? []) as Array<{ className?: string; fileName?: string; duration?: number; w?: number; h?: number }>;
    const file = attrs.find((a) => typeof a.fileName === 'string');
    const video = attrs.find((a) => a.className === 'DocumentAttributeVideo');
    const audio = attrs.find((a) => a.className === 'DocumentAttributeAudio');
    const text = (m.message ?? '').replace(/\s+/g, ' ').slice(0, 220);
    console.log(
      [
        `id=${m.id}`,
        `date=${m.date ? new Date(m.date * 1000).toISOString().slice(0, 16) : '?'}`,
        m.groupedId ? `album=${m.groupedId}` : '',
        `media=${cls}`,
        file ? `file=${file.fileName}` : '',
        video ? `video=${video.w}x${video.h} ${video.duration ?? ''}s` : '',
        audio ? `audio=${audio.duration ?? ''}s` : '',
        doc?.mimeType ? `mime=${doc.mimeType}` : '',
        doc?.size ? `size=${doc.size}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    if (text) console.log(`   text: ${text}`);
  }

  await client.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
