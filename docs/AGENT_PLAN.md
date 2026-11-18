# Syncourse — Agent & Search Integration Plan

Status: **Phases 1–3 done** · Phase 4 next
Owner: Hayredin
Last audited: 2026-11-18

This document is the single source of truth for adding an AI agent, automatic
Telegram ingestion, better search and recommendations to Syncourse — under a
**zero-budget** constraint.

---

## 1. Constraints (measured, not assumed)

| Constraint | Reality |
|---|---|
| Hosting budget | $0. Existing free tiers only. |
| Local AI | Not possible. Intel i3-7100U, 2C/4T, 11 GB RAM, Intel HD 620, no GPU. |
| Production API | Vercel serverless (`syncourse-api.vercel.app`), Telegram webhook mode. |
| Database | Neon Postgres 18.7, 12 MB used, free tier. |
| Repository | Public → GitHub Actions minutes are free and unlimited. |
| Telegram source | Private **supergroup** `syncourse` (3 members, forum topics). No public web preview (`t.me/s/syncourse` → 302). Bot already has message access. |
| Content | 13 courses, 634 Telegram file attachments, **125.8 GB** total, **0 Lesson rows**, 0 Notes. |
| AI allowance | Free tiers only (Gemini / Groq / OpenRouter). Must degrade gracefully on quota exhaustion. |

### File size distribution of the 634 attachments

| Size | Files | Total | Free path |
|---|---|---|---|
| < 20 MB | **329** | **3.6 GB** | Standard Bot API (already usable) |
| 20–200 MB | 66 | 7.3 GB | GitHub Actions worker |
| 200 MB–2 GB | 238 | 115 GB | GitHub Actions worker |
| > 2 GB | 1 | 2.6 GB | Not fetchable on any free path — skip |

Notes:
- 7 duplicate `(fileName, fileSizeMb)` pairs already exist → dedupe required.
- Biggest files: 2649 MB, 1943 MB, 1252 MB.
- Video ZIPs contain `.mp4` + matching `.srt` per lesson (verified). The useful
  text is < 1% of the archive bytes.

---

## 2. What is actually broken today

1. **No lesson-level content exists.** 350 sections, 0 lessons. Course pages are
   rendered from `TelegramCourseLink` grouped by `moduleTitle`. Search only ever
   sees 13 course titles/descriptions.
2. **Search has no ranking beyond `ratingAvg`/`downloadCount`.** It is
   case-insensitive `LIKE`. No stemming, no typo tolerance, no synonyms, no
   semantic matching, no lesson text.
3. **The agent has nothing to read.** No extracted text, no transcripts, no
   notes. An LLM grounded on 13 course descriptions would be a toy.
4. **`TasteProfile` is dead code.** The home page promises personalisation that
   nothing implements.
5. **Ingestion is manual.** The bot can attach files, but it cannot recognise a
   course post and create the course entry.

---

## 3. Target architecture

```
Telegram supergroup (topics = categories)
        │  bot webhook (existing, Vercel)
        ▼
┌─────────────────────────────────────────────────────────┐
│ API (Vercel, free)                                      │
│  • telegram watcher → rules → IngestDraft               │
│  • approve / discard (bot buttons + /admin)             │
│  • search  (Postgres FTS + trigram + lesson chunks)     │
│  • recommendations (SQL, no AI)                         │
│  • assistant (free-tier LLM, tools, citations)          │
└─────────────────────────────────────────────────────────┘
        │                    │
        ▼                    ▼
   Neon Postgres        GitHub Actions worker (free)
   (free tier)          • small files via Bot API
                        • large files via local bot server
                        • extract .srt/.pdf/.json/.txt only
                        • push ContentChunk rows
```

**Core rule:** the agent never reads video. It reads subtitles, PDFs, notes and
filenames. This is both the cheap path and the useful path.

---

## 4. Data model additions

### `ContentChunk` (search + agent grounding)

One row per piece of extracted text. Chunked ~1,200 chars with overlap.

| Field | Purpose |
|---|---|
| `courseId`, `linkId` | which course / Telegram file it came from |
| `sourceKind` | `subtitle`, `pdf`, `text`, `json`, `html`, `readme`, `archive-name`, `announcement` |
| `sourceName` | ZIP entry or attachment name |
| `moduleTitle`, `partIndex` | preserves the course structure |
| `ordinal` | chunk order inside the source |
| `text`, `charCount` | the content |
| `contentHash` | idempotent re-indexing |

### `SearchSynonym`

Editable phrase expansions (`ml` → `machine learning`, `js` → `javascript`,
`ai` → `artificial intelligence`, local terms too). Used at query time.

### `IngestDraft`

A course the watcher believes it found, before it touches the catalog.
`payload` holds the parsed course; `status` is `pending | approved | discarded |
failed`. Approval calls the existing importer/admin service.

### `SearchClick`

`(query, courseId, userId, createdAt)` — ranking feedback and future
recommendations. No PII beyond the existing user id.

### `TelegramCourseLink` additions

`indexStatus` (`pending | indexed | skipped | failed`), `indexedAt`,
`indexError`. Makes the indexer resumable and observable.

Embeddings are deliberately **not** added in Phase 1. `pgvector 0.8.7` is
available and reserved for Phase 6.

---

## 5. Phases

Each phase ships independently and costs $0.

### Phase 1 — Search foundation ✅

**Goal:** make the existing catalog searchable properly, and prepare the index.

- [x] Audit live DB, Telegram source, file sizes.
- [x] Enable `pg_trgm` + `unaccent`.
- [x] Add `ContentChunk`, `SearchSynonym`, `SearchClick`, `IngestDraft`.
- [x] Add index state to `TelegramCourseLink`.
- [x] Seed synonyms from existing categories/tags (18 rows).
- [x] Rewrite `SearchService` ranking:
  - weighted full-text (`title` > `tags` > `description`)
  - trigram typo tolerance (`similarity` + `word_similarity`)
  - synonym expansion
  - quality/popularity tie-break
  - lesson-chunk matches boost their course
  - identical response shape (web/mobile need no change)
  - safe fallback if extensions are missing
- [ ] Add `GET /search/suggest` (optional, same engine, small limit).

**Acceptance met.**

| Query | Result |
|---|---|
| `python` | 3 courses |
| `pythn` (typo) | 2 courses — Python + ML |
| `ML` (synonym) | 2 courses — ML + n8n |
| `AI` | 6 courses |
| `pinecone` (only inside notes) | n8n course |
| `webhook` (only inside extracted text) | n8n course |

`npm run test:search -w apps/api` → **14/14 golden queries pass.**
Web/mobile need no change; the response shape is untouched.

Migration note: applied with `apps/api/prisma/sql/2026-11-agent-index.sql`, not
`prisma db push`, because the live DB still has `Enrollment`,
`LessonProgress` and `Course.enrollmentCount` outside the schema.

### Phase 2 — Small-file indexer ✅

**Goal:** index the 329 attachments under 20 MB with no new infrastructure.

- [x] `apps/api/prisma/index-telegram.ts` (matches existing `test:*` scripts).
- [x] Bot API `getFile` → download → unzip in memory (< 20 MB is safe).
- [x] Extract only: `.srt`, `.vtt`, `.txt`, `.md`, `.pdf`, `.json`, `.html`,
      `.csv`, `.docx`, plus archive filenames and entry names.
- [x] Clean subtitle timestamps and HTML; keep readable dialogue.
- [x] Chunk + insert `ContentChunk`; update link index state.
- [x] `--dry-run`, `--course <slug>`, `--limit`, `--max-mb`, `--force`, `--stats`.
- [x] Two waves: `--names` (no download) then `--download` (Bot API).
- [x] Idempotent: replace-by-source-kind, plus a per-chunk content hash.

**Result on production data**

| Metric | Value |
|---|---|
| Attachments | 634 |
| Indexed | 34 |
| Skipped (no extractable text) | 1 |
| Pending (large files → Phase 4) | 599 |
| Chunks | **3,498** |
| Characters | **2,046,924** |

By source: `archive-name` 1,267 · `json` 942 · `pdf` 381 · `entry-name` 369 ·
`subtitle` 313 · `text` 204 · `html` 22.

Notes:
- 294 of the 329 small files are `.mp3` (Quran course) with no text; they keep
  name-only indexing.
- 35 small attachments are archives; 34 yielded text, 1 was image-only.
- Re-running `--download` only picks up `pending`/`failed` links, so it is safe
  to repeat.

### Phase 3 — Auto-post from the group ✅

- [x] Watcher in the API (`draft.service.ts`): a course announcement in a group
      topic creates an `IngestDraft`; ZIPs posted after it in that topic attach
      to the same draft for 12 hours.
- [x] Topic → category mapping: `TELEGRAM_TOPIC_CATEGORIES` override, then
      hashtags, then keyword rules over title/description/filenames. Uses the
      catalogue's real slugs (`ai-machine-learning`, not the importer's old
      `ai-and-machine-learning` alias).
- [x] Dedupe: `chatId + messageId` (Telegram redelivery), repeated
      `fileName + fileSizeMb`, and approval is idempotent.
- [x] Approve / Discard via bot inline buttons, `/drafts`, `/approve <id>`,
      `/discard <id>`, and `/admin/drafts` in the web console.
- [x] Approval writes Course + `TelegramCourseLink` rows, keeps `file_id` for
      delivery, creates the lecturer, links categories and hashtags, and
      preserves module order and part numbers. Fields can still be edited
      afterwards in the normal course editor.
- [x] Discarding keeps the row (`status = discarded`), so the same post is
      never proposed twice.
- [x] No auto-publish. `TELEGRAM_WATCHER_ENABLED=false` is the kill switch.

**Acceptance met** by `npm run test:drafts -w apps/api` — 27 checks covering
detection, redelivery, file attach, module/part numbering, duplicate files,
approval, second approval, discard, and cleanup. `npm run test:draft-parser`
adds 30 pure assertions.

What the watcher is *not*: it does not read ZIP contents, cannot fix a title
that the announcement template got wrong, and will not recognise a course
posted as free-form prose. Those wait for approval, by design.

Draft flow:

```
announcement post ──▶ IngestDraft(pending) ──▶ bot card + /admin/drafts
ZIP posts        ──▶ payload.files[]      ──┐
                                             ▼
                          ✅ Approve ─▶ Course + TelegramCourseLink[]
                          🗑 Discard ─▶ audit row, never proposed again
```

### Phase 4 — Large-file worker

- [ ] GitHub Actions workflow, batched, resumable, 6-hour-safe.
- [ ] Telegram local Bot API server in the job (official, 2 GB limit).
- [ ] Download → extract text-only entries → upsert chunks → delete.
- [ ] Per-file job state; retry with backoff; skip the 2.6 GB file.
- [ ] Optional later: MTProto selective read (tail of ZIP → fetch only small
      entries) to cut transfer from 115 GB to a few hundred MB. Only if needed.

**Acceptance:** one 1.4 GB video ZIP yields its `.srt` transcripts and notes,
no video bytes are stored, and the job can resume after failure.

### Phase 5 — Agent

**Goal:** a grounded learning copilot, not a generic chatbot.

Backend (`apps/api/src/assistant/`):

- `assistant.module.ts`, `assistant.controller.ts`, `assistant.service.ts`
- `llm/llm.provider.ts` — one adapter, env-switched (Gemini free tier default;
  Groq/OpenRouter compatible). No SDK lock-in.
- `retrieval/retrieval.service.ts` — hybrid: Postgres FTS + trigram now;
  `pgvector` later.
- `tools/catalog.tools.ts` — narrow, typed tools over existing services:
  `searchCourses`, `getCourse`, `getLesson`, `getLessonText`, `listCategories`.
- `tools/library.tools.ts` — `saveCourse`, `likeCourse` (confirmation-gated).

Endpoints:

```
POST /api/assistant/chat        { threadId?, message, context?: { courseId?, lessonId? } }
GET  /api/assistant/threads/:id
POST /api/assistant/recommend   { goal, level?, minutesPerWeek? } -> course ids + reasons
```

Rules:

- Every recommendation must resolve to a real `Course.id`; the model cannot
  invent one.
- Every claim about a lesson must carry a citation (`courseSlug`, `lessonLinkId`,
  `sourceName`).
- Premium gating is enforced **at retrieval**, not in the prompt.
- Telegram/PDF text is untrusted input: wrapped as data, never as instructions.
- Hard limits: 20 messages/min/user, daily cap, capped context, per-message
  token/cost logging.
- No write actions from retrieved text. Writes require explicit user intent and
  a confirmation round-trip.

Frontend:

- Web: floating "Ask Syncourse" in `Shell.tsx`; lesson-page buttons
  *Explain*, *Quiz me*, *Translate*.
- Mobile (Expo): same endpoint, same SSE parser.
- Telegram: free-text intent router in front of the existing wizard — never
  replaces the state machine.
- Admin: "Draft with AI" in the course form (fills, never saves).

**Acceptance:** on a lesson with subtitles, "explain this simply" cites that
lesson; "quiz me" produces questions answerable from the text; a premium lesson
is refused for a free user; quota exhaustion returns search results instead of
an error.

### Phase 6 — Recommendations & semantic search

- [ ] Content-based recommender: tags/topics/level + quality + freshness.
- [ ] Write `TasteProfile` weights on download/like/rate.
- [ ] Co-occurrence recommender once volume justifies it.
- [ ] `pgvector` embeddings for semantic search and "I want to automate my
      business" queries.
- [ ] Learn from `SearchClick`.

---

## 6. Cost map

| Component | Choice | Cost |
|---|---|---|
| API + agent endpoints | Vercel hobby | $0 |
| DB + FTS + vectors | Neon free | $0 |
| Small-file indexing | Telegram Bot API | $0 |
| Large-file indexing | GitHub Actions (public repo) | $0 |
| LLM | Gemini free tier / Groq / OpenRouter | $0 within quota |
| Embeddings | Precomputed in Actions, stored in Neon | $0 |

Failure mode: when the LLM quota is exhausted, the assistant returns ranked
search results and lesson snippets. The product stays useful.

---

## 7. Risks and limits

| Risk | Mitigation |
|---|---|
| Premium content leaks through the agent | gate retrieval by `isPremium` + active plan; test it |
| Prompt injection from Telegram text | data-only wrapping; no tool calls from retrieved text |
| 2.6 GB file cannot be fetched free | skip and mark `skipped`; split manually if ever needed |
| GitHub Actions 6 h / 14 GB limits | one file per job step; batch + resume; delete after extract |
| Neon free storage (0.5 GB) | store text only; current estimate tens of MB |
| Free LLM quota | fallback mode; cache answers per chunk set |
| Telegram rate limits | existing 900 ms pacing; batch jobs run off-peak |
| Duplicate imports | dedupe by message id and filename+size; idempotent hashes |
| Watcher mistakes chatter for a course | strict template rules, a confidence score with visible signals, and human approval before anything is written |
| Files posted before the announcement | not collected (updates are not retained); use `/link`, or re-post the announcement and files |
| A draft approved with the wrong metadata | fix it in the normal course editor afterwards; approval only creates the row, it does not freeze it |
| Search regression | fallback path + golden-query test |

---

## 8. Operations

```bash
# 1. Schema + extensions (additive, safe)
npm run db:generate -w apps/api
psql "$DATABASE_URL" -f apps/api/prisma/sql/2026-11-agent-index.sql

# 2. Index module and file names (no download, no bot token needed)
npm run index:names -w apps/api

# 3. Inspect what the download wave would fetch
npx tsx --env-file=apps/api/.env apps/api/prisma/index-telegram.ts \
  --download --dry-run

# 4. Extract text from files under 20 MB (needs TELEGRAM_BOT_TOKEN)
npm run index:download -w apps/api

# 5. Status, and the golden-query check
npm run index:stats -w apps/api
npm run test:search -w apps/api

# 6. Draft watcher — pure rules, then the full DB round-trip
npm run test:draft-parser -w apps/api
npm run test:drafts -w apps/api        # creates and removes its own course
npm run test:drafts -w apps/api -- --cleanup   # remove leftovers from a crashed run
```

Draft review in Telegram: `/drafts`, `/draft <id>`, `/approve <id>`,
`/discard <id>`, or tap **Create course** on the card the watcher posts.
The same actions live at **Admin → Course drafts** (`/admin/drafts`).

Required env additions (never committed):

```
TELEGRAM_BOT_TOKEN=...          # indexer + delivery
TELEGRAM_WATCHER_ENABLED=true   # Phase 3 kill switch
TELEGRAM_SOURCE_CHATS=syncourse # allowlist: usernames or ids, comma separated
TELEGRAM_TOPIC_CATEGORIES=12:ai-machine-learning,34:programming
GEMINI_API_KEY=...              # Phase 5 only
ASSISTANT_ENABLED=false         # kill switch
ASSISTANT_MODEL=gemini-2.0-flash
```

---

## 9. Definition of done

- Search finds courses by title, tag, typo, synonym and lesson text.
- The agent answers from real lesson content and cites it.
- Posting a course in the group produces a draft that one tap can publish.
- Video bytes are never stored; the database stays within the free tier.
- Premium content never reaches a non-premium account.
- Every phase is independently revertible.
