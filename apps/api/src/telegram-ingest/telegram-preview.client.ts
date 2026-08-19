/**
 * telegram-preview.client.ts
 *
 * Fetches the public web preview of a Telegram channel (https://t.me/s/<name>)
 * and paginates backwards through its message history using the `?before=<id>`
 * cursor (the newest messages first, oldest last page).
 *
 * Only works for channels whose web preview is public (like @zero_to_mastery).
 * Private / restricted channels render a bare "Preview channel" page with no
 * messages — for those use `importPastedText` with the exported transcript.
 */
import { Injectable } from '@nestjs/common';
import { parseTelegramHtml, FeedMessage } from './telegram-feed.parser';

export interface ChannelMeta {
  title: string | null;
  subscribers: number | null;
}

export interface FetchResult {
  messages: FeedMessage[];
  meta: ChannelMeta;
}

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

@Injectable()
export class TelegramPreviewClient {
  async fetchChannel(username: string, opts: { maxPages?: number; delayMs?: number } = {}): Promise<FetchResult> {
    const maxPages = Math.min(Math.max(opts.maxPages ?? 3, 1), 50);
    const delayMs = opts.delayMs ?? 400;

    const all: FeedMessage[] = [];
    const seen = new Set<string>();
    let before: string | null = null;
    let meta: ChannelMeta = { title: null, subscribers: null };

    for (let page = 0; page < maxPages; page++) {
      const url = `https://t.me/s/${encodeURIComponent(username)}${before ? `?before=${before}` : ''}`;
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'text/html' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        if (page === 0) throw new Error(`t.me/s/${username} → HTTP ${res.status}`);
        break;
      }
      const html = await res.text();
      if (page === 0) meta = this.parseMeta(html);

      const msgs = parseTelegramHtml(html);
      if (msgs.length === 0) break; // restricted channel / end of history

      const fresh = msgs.filter((m) => !(m.postId && seen.has(m.postId)));
      if (fresh.length === 0) break;
      for (const m of fresh) if (m.postId) seen.add(m.postId);
      all.push(...fresh);

      // oldest message on this page becomes the cursor for the next page
      let oldest = Infinity;
      for (const m of fresh) {
        const id = Number(m.postId?.split('/')[1]);
        if (Number.isFinite(id) && id < oldest) oldest = id;
      }
      if (!Number.isFinite(oldest)) break;
      before = String(oldest);

      if (page < maxPages - 1) await new Promise((r) => setTimeout(r, delayMs));
    }

    return { messages: all, meta };
  }

  private parseMeta(html: string): ChannelMeta {
    const titleM = html.match(/<meta property="og:title" content="([^"]+)"/);
    const subsM = html.match(/(\d+(?:\.\d+)?)\s*[KM]?\s*subscribers/i);
    let subscribers: number | null = null;
    if (subsM) {
      const raw = subsM[1];
      if (/[KM]/i.test(subsM[0])) {
        const n = Number(raw);
        subscribers = /K/i.test(subsM[0]) ? Math.round(n * 1000) : Math.round(n * 1_000_000);
      } else {
        subscribers = Number(raw);
      }
    }
    return { title: titleM?.[1] ?? null, subscribers };
  }
}
