# Syncourse — Agent & Search Integration Plan

Status: **Phases 1–3, 5 and the content-based half of 6 done** · Phase 4 built,
waiting for `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`
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

The payload is versioned by convention (`payload.version = 1`) and gained
`kind` (`course | resource`), `images[]` (`cover | lecturer | organization |
gallery`, with Telegram `file_id`s and the album's `mediaGroupId`), `files[]`,
`fields` (explicit operator overrides such as `org`, `level`, `price`), and
`autoPublished`. An auto-published draft stays `approved` and keeps accepting
files for 12 hours; `approvedCourseId` holds the course id, while a resource
stores its slug in `payload.approvedCourseSlug` only. This needed **no schema
change** — additive JSON, no `prisma db push`.

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
| Skipped (name indexed, no text to read) | 290 |
| Pending (305 large / 5 unknown extension) | 310 |
| Too big for a bot download (2.6 GB, 1.9 GB) | 2 |
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
- [x] Every real post type opens its own draft, so later files can never be
      stolen by a newer pending post:
      - `🔰` / `🔅` templates → a course or mini-course;
      - a long text post → a `note` resource;
      - a post saying roadmap / learning path → a `roadmap`;
      - a titled picture, album, video or audio → a resource with its media;
      - a captioned book/PDF/epub → a resource, even with no body;
      - an uncaptioned picture → a placeholder draft flagged `needs-title`,
        completed later by the album's captioned frame.
      Albums are joined by Telegram's `media_group_id`, including frames that
      arrive out of order, and mixed photo + video/audio albums stay one post.
      A title + picture post that later receives module ZIPs is upgraded from a
      resource to a course (`simple-course`).
- [x] Promo removal: `📤 Download Full Course`, `📤 Download All Courses`,
      `🔗 Join … for more courses`, `📱Category` headers and divider rules are
      stripped before the description is read. Both templates keep their real
      body: `📖` on the `🔰` template, `📝` on the `🔅` template.
- [x] Metadata: `⭐`/`🌟` rating, votes, `💰`/`💳` price, `📖`/`📝`
      description, `🔊 Taught By` / `🌐 Author`, `🔰 Level`, `⏰ Duration`
      (`1h 14m` and `41m`), `📋 Topics`, hashtags, and an external source link
      (O'Reilly, GitHub, a paper) instead of a Telegram invite.
- [x] Media delivery: photos are mirrored to Cloudinary, and so are videos,
      recordings and documents up to the Bot API's 19 MB `getFile` ceiling. A
      file past that line (a 149 MB podcast) is not dropped: the page still
      names it and a "Listen/Watch on Telegram" card delivers the original
      through the bot. The gallery no longer repeats the post caption under
      every image — the body below already says it.
- [x] Ratings append instead of overwrite: the post's own number is stored in
      `baseRatingAvg` / `baseRatingCount`, and a learner's star is added to it
      (`count = source + local`, `avg = both`). A 4.5 from 1,646 votes stays
      4.5 / 1,647 after the first tap, and changing your vote replaces only
      your vote. Applied with additive SQL (`prisma/sql/2026-11-rating-baseline.sql`),
      no `db push`.
- [x] Mini-course rules: an explicit `type:` wins; a duration ≤ 90 minutes or
      ≤ 12 lessons is a mini-course; a title carrying *mini-course / crash
      course / quick course* is one; 1–3 module ZIPs are one. A title that
      calls itself a course / bootcamp / masterclass and durations over 90
      minutes stay a full course. A row that published on its first ZIP is
      re-typed to `course` when a fourth part arrives.
- [x] Topic → category mapping: `TELEGRAM_TOPIC_CATEGORIES` override, then
      hashtags, then keyword rules over title/description/filenames. Uses the
      catalogue's real slugs (`ai-machine-learning`, not the importer's old
      `ai-and-machine-learning` alias).
- [x] Dedupe: `chatId + messageId` (Telegram redelivery), repeated
      `fileName + fileSizeMb`, and approval is idempotent.
- [x] Approve / Discard via bot inline buttons, `/drafts`, `/approve <id>`,
      `/discard <id>`, and `/admin/drafts` in the web console.
      The card also has **✏️ Fix a field**: tap a field, type the answer (or
      send a photo for the cover / lecturer / logo), and the card updates in
      place. Nothing is reposted.
- [x] Approval writes Course + `TelegramCourseLink` rows, keeps `file_id` for
      delivery, creates the lecturer, links categories and hashtags, and
      preserves module order and part numbers. Description, cover, lecturer
      photo and bio, organisation (+ logo), level, price, type and tags come
      from the post when present. Fields can still be edited afterwards in the
      normal course editor.
- [x] Resources: anything that is not a course template becomes a
      `Resource` + `ResourceMedia`. That covers text-only, image-only,
      text + image, many images, many images + text, photo + video + text,
      video + text, audio, audio + image/text, book files, and arbitrary
      mixes. Every photo becomes a media row in album order, the first picture
      is the cover, and video/audio/epub rows keep their Telegram `file_id`.
      An explicit `resource: Title` / `resource: roadmap` marker is still
      honoured. Approval reuses the same card and tap-to-fix fields.
- [x] Auto-publish when the post is complete: title, lecturer, description of
      at least 80 characters, at least one file, confidence ≥ 0.7, and no
      existing course with the same slug. A simple course (titled picture +
      ZIPs) only needs its title and files, and a resource needs a body of 60
      characters **or** at least one picture/file. The draft row is kept for
      audit; the review card turns into the receipt.
      `TELEGRAM_AUTOPUBLISH=false` is the kill switch. Files and photos keep
      joining an auto-published draft for 12 hours, and a later approval
      appends only what is new.
- [x] Discarding keeps the row (`status = discarded`), so the same post is
      never proposed twice.

**Posting recipe — no markers, no ceremony:**

| You post | The watcher reads |
|---|---|
| the normal announcement | title, description, lecturer(s), hours, lessons, price, hashtags |
| `org: Udemy` | organisation (+ created once) |
| `category: mobile-development, design` | categories, created when missing |
| `level: Intermediate` · `price: 49` · `type: mini-course` | the matching fields |
| `tags: flutter, dart` · `description: …` | tags and a description override |
| a photo with no caption (first one) | cover |
| a photo captioned `lecturer` / `lecturer: Name` | lecturer photo (+ name if new) |
| a photo captioned `org: Udemy` | organisation logo |
| `resource: Figma shortcuts` + body/files | a Resource, not a Course |
| a long text post | a note resource with its whole body |
| a titled photo / album / video / audio | a resource with its media |
| a book caption + epub/PDF | a resource with cover and file |
| the ZIPs | course parts, grouped into modules by filename |

Every `field: value` line is removed from the prose before the announcement
parser runs, so it never leaks into the description. `#description` on its own
line takes the following paragraph; a known key on any line ends it.

**Acceptance met** by `npm run test:drafts -w apps/api` — 125 checks covering
detection, redelivery, file attach, module/part numbering, duplicate files,
approval, second approval, discard, explicit field overrides, auto-publish,
late-file append, promo cleaning, both real templates, price/rating/duration,
mini-course rules, 20-part courses, picture → course upgrades, books, notes,
four-photo albums, mixed photo/video albums, cover + audiobook + epub, and
placeholder photo posts. The pure suites add `test:draft-fields` (79) and
`test:draft-parser` (30 assertions).

What the watcher is *not*: it does not read inside ZIPs and cannot read text
burned into a picture. An unreadable template becomes a draft; the tap-to-fix
card is there for the rest.

Draft flow:

```
announcement post ──▶ IngestDraft(pending) ──▶ bot card + /admin/drafts
photos            ──▶ payload.images[]     ──┤
ZIP posts         ──▶ payload.files[]      ──┤
                                            ▼
        complete? ──▶ ✅ auto-publish ──▶ Course + TelegramCourseLink[]
        otherwise ──▶ ✅ Approve ────────▶ same, when a human taps
                      ✏️ Fix a field ─────▶ payload updated in place
                      🗑 Discard ─────────▶ audit row, never proposed again
```

### Phase 4 — Large-file worker (built ✅, waiting for the two Telegram keys)

- [x] GitHub Actions workflow, batched, resumable, 6-hour-safe:
      `.github/workflows/index-large.yml`.
- [x] MTProto login **as the same bot** (GramJS) instead of a local Bot API
      server. The local server needs a tdlib build on every run; MTProto gives
      the same 2 GB ceiling with no build and no extra service.
- [x] Download → stream text-only entries → upsert chunks → delete the
      temporary file in `finally`.
- [x] Per-file job state, retry with backoff, and an upper bound that skips the
      2.6 GB file (`--max-mb`, default 1900).
- [x] Streaming archive reader (`yauzl`) so a 1.9 GB ZIP is never read into
      memory and video bytes are never decompressed.
- [ ] First production run — needs `TELEGRAM_API_ID` + `TELEGRAM_API_HASH`.

**Acceptance, partly met offline:** `npm run test:extract -w apps/api` builds a
course-shaped ZIP and proves the reader extracts subtitles, notes, HTML, JSON
and the readme, indexes a 2 MB video by name only, leaks not one video byte,
and stops at the text budget — 18 checks, no Telegram, no network. The real
download half is implemented but cannot be proven until the API id/hash exist.

**Measured backlog:** 303 files in the 19–1900 MB band; 2 above it are
skipped by design (one is 2.6 GB); 34 are already indexed (3,498 chunks,
2.05 M characters); 5 small files have no recognisable extension and are left
pending; 289 small audio files are marked `skipped` once their names are
indexed, so "pending" means "has text we have not read yet".

### Phase 5 — Agent (grounded assistant done ✅ with a no-AI floor)

**Goal:** a grounded learning copilot, not a generic chatbot.

Built in `apps/api/src/assistant/`:

- `assistant.module.ts`, `assistant.controller.ts`, `assistant.service.ts`
- `llm/llm.provider.ts` — one adapter, env-switched (Gemini free tier default;
  Groq/OpenRouter use the OpenAI-compatible shape). No SDK, no vendor lock-in.
  Every configured key joins an ordered fallback chain, each provider retries a
  429/5xx/timeout once, and Gemini 3 thinking is switched off so the token
  budget goes to the answer rather than a hidden monologue.
- `retrieval/retrieval.service.ts` — Postgres FTS + trigram over
  `ContentChunk`, plus lesson titles when a course has no indexed text. It asks
  `SearchService` for ranked **ids only**, so a question does not load every
  section and lesson the way a search-page card would.
- The no-AI path is not an error handler: the same sources are quoted directly,
  so the product keeps working with no key and when a quota runs out.

Endpoints:

```
GET  /api/assistant/status      { enabled, mode, provider, model, dailyCap }
POST /api/assistant/ask         { question, courseSlug?, history? }
     -> { answer, mode: llm | extractive, provider, notice,
          citations[], courses[], premiumActive }
POST /api/assistant/actions/propose   (staff) { instruction }
     -> { kind, summary, fields, token, reply? }
POST /api/assistant/actions/confirm   (staff) { token }
     -> { ok, kind, message, slug, url }
```

`history` is the client-owned thread (`[{ role, content }]`, last 8 turns kept).
A follow-up that leans on the previous question ("and the second one?") also
inherits the earlier subject for retrieval, while the model receives the real
turns as context. No session table: a free database should not be kept warm for
a chat transcript.

Rules, all enforced in code:

- Every answer is built from retrieved rows; citations carry `courseSlug`,
  source name and a real snippet, and the UI links each one to its file.
- The model is told never to invent a lesson, instructor or URL, and citations
  it makes up (`[9]` when only 3 sources exist) are stripped before returning.
- Premium gating happens **at retrieval**: the text of a locked course is
  dropped before the prompt is built, so a free-tier provider never receives
  paid content. The course is still shown, marked `locked`.
- Telegram/PDF text is wrapped as quoted data and the system prompt says to
  ignore instructions inside it.
- Budget: 8 questions/minute per IP (in-process), plus a durable per-day cap of
  25 anonymous / 150 signed-in, stored in `AssistantUsage`. The in-memory burst
  guard alone would reset on every serverless instance.
- Read and write are separate permissions. `/assistant/ask` stays read-only;
  a staff account gets a second mode backed by
  `POST /assistant/actions/propose` and `POST /assistant/actions/confirm`.

### Assistant write mode (staff only)

The **Ask / Add to catalogue** switch on `/assistant` is visible only to a
`isStaff` account. Sentences are parsed deterministically — no model chooses
what gets written:

```
create course Title | Instructor | Category | price | type | description
create course "Title" by Instructor
create resource Title | body | roadmap
attach https://t.me/group/123 to course-slug
publish draft ab12cd34
```

`propose` validates the instruction against the catalogue and returns a
human summary plus an HMAC-signed token (10 minutes, bound to the user id).
Nothing is written. `confirm` verifies the token, re-checks that the caller is
staff, and executes exactly the summarised action. An unrecognised sentence
returns the grammar instead of guessing; a course title, an instructor and a
price are data, and a creative reinterpretation of them is a bug.

Writes reuse the existing pipelines: `attach` calls the bot's
`attachFromMessageLink`, `publish` calls `IngestDraftService.approve`, so an
action from chat produces exactly what the same action in Telegram would.

Frontend: `/assistant` is a threaded chat, not a one-shot box. Each answer keeps
its sources and courses, `[n]` references jump to the cited file, follow-ups
carry the thread back to the API, and the thread survives a reload in
`sessionStorage`. In write mode the same composer prepares a proposal card with
**Confirm / Cancel** and then a receipt linking to the new page. The search page
hands its query over with `?q=`; a course page opens it scoped with `?course=`.
It is reachable from the desktop **Ask** pill, the mobile header icon and the Me
menu — not only by typing the URL.

**Acceptance met** by `npm run test:assistant -w apps/api` — 48 checks against
the real catalogue and a temporary premium course + member, both deleted in
`finally`: a real question returns grounded citations and links; a nonsense
question returns no citations and says so; the premium course is listed but its
unique token never appears in the free reader's answer or snippets; the same
member can read it; the daily cap returns 429 on the second question at a cap of
1; the kill switch returns 503; an anchored question never pulls sources from
another course; and a pronoun-heavy follow-up inherits the previous subject
while a self-contained question keeps its own words.

Deferred on purpose (needs volume or a different product decision):
`POST /assistant/recommend`, lesson-page *Explain/Quiz* buttons, and Telegram
free-text routing into the assistant. Each is additive on the same service.

### Phase 6 — Recommendations & semantic search (content-based part done ✅)

- [x] Content-based recommender: category/tag/lecturer/level overlap plus
      quality, popularity and freshness priors.
      `apps/api/src/recommendations/recommendations.service.ts`
- [x] Reader profile built on the fly from downloads, saves, likes, ratings
      (4–5 positive, 1–2 negative) and recent search clicks. No denormalised
      `TasteProfile` maintenance, so a deleted signal disappears immediately.
- [x] Endpoints:
      `GET /recommendations/similar/:slug` (related courses; never padded with
      unrelated popular ones) and `GET /recommendations/for-you` (popular until
      the reader has a profile). Both are public and use a bearer token when
      present.
- [x] `POST /search/click` records an opened result (one vote per reader, query
      and course per 10 min). Ranking adds a 0.08 tie-break from clicks for the
      same query in the last 90 days; relevance still dominates.
- [x] Web: "More like this" on the course page, a "For you" rail on home for
      signed-in readers, a full `/recommendations` shelf (with a sign-in prompt
      and honest empty state), and fire-and-forget click tracking on search
      results. The Me menu links to both the assistant and the shelf.
- [ ] Co-occurrence recommender once volume justifies it.
- [ ] `pgvector` embeddings for semantic search and "I want to automate my
      business" queries.

**Acceptance met** by `npm run test:recommend -w apps/api` — 22 checks against
the real catalogue: related cards exclude the anchor and share a subject, a
liked course is never recommended back, cold start returns popular, a click is
stored once, and clicks alone produce a personalised list. `npm run test:search`
still passes 14/14 after adding the click tie-break.

Why clicks are a tie-break and not a vote: a popular query can have a clear
best answer by text relevance, and letting clicks outweigh it would let a
bandwagon bury the exact match. 0.08 is enough to reorder near-ties (measured:
rank 4 → 2 for "ai") without moving a course past a genuinely better result.

---

## 6. Cost map

| Component | Choice | Cost |
|---|---|---|
| API + agent endpoints | Vercel hobby | $0 |
| DB + FTS + vectors | Neon free | $0 |
| Small-file indexing | Telegram Bot API | $0 |
| Large-file indexing | GitHub Actions (public repo) | $0 |
| LLM | Gemini free tier / Groq / OpenRouter | $0 within quota |
| Embeddings (later) | Precomputed in Actions, stored in Neon | $0 |

Failure mode: when the LLM quota is exhausted, the assistant quotes the same
retrieved sources in plain text and says the AI writer is at its limit. The
product stays useful, and a question never turns into a 500.

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
| "For you" is empty for a new reader | falls back to the popular rail; the same courses a visitor sees without an account |
| Recommendations turn into a popularity contest | subject overlap (category/tag/lecturer/level) outweighs the rating/download priors; "More like this" is never padded with unrelated bestsellers |
| Clicks bury the exact match | clicks add 0.08 only, count for 90 days, and one reader+query+course can vote once per 10 minutes |
| `SearchClick` grows without bound | low write volume; if it ever matters, keep 180 days and aggregate the rest into `TrendingQuery` |
| Assistant quotes paid content | the text is dropped at retrieval, before the prompt exists; proved with a unique token in `test:assistant` |
| Assistant invents lessons or links | sources are rows with a slug and file name; invented citation numbers are stripped |
| One reader drains the free LLM quota | 8/min burst per IP + durable 25/day anonymous, 150/day signed-in |
| Cold Neon makes the assistant slow | retrieval asks for ranked ids only, then one light projection; no sections/lessons loaded |
| No LLM key or an exhausted quota | the extractive answer is the floor, not an error; `mode` and `notice` say which path was used |

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

# 5b. Large files (needs TELEGRAM_API_ID + TELEGRAM_API_HASH)
# Prove the logins first — this touches no file and no course.
npx tsx --env-file=apps/api/.env apps/api/prisma/large-file-worker.ts --probe
npx tsx --env-file=apps/api/.env apps/api/prisma/large-file-worker.ts --dry-run --limit 3
npx tsx --env-file=apps/api/.env apps/api/prisma/large-file-worker.ts --limit 3
# Or run `.github/workflows/index-large.yml` with probe=true, then dry_run=true,
# then limit=3. Every finished file is marked indexed, so the next run continues.

# 6. Draft watcher — pure rules, then the full DB round-trip
npm run test:draft-parser -w apps/api
npm run test:draft-fields -w apps/api  # field lines, photo roles, auto-publish gate
npm run test:drafts -w apps/api        # creates and removes its own course + resource
npm run test:drafts -w apps/api -- --cleanup   # remove leftovers from a crashed run

# 7. Recommendations + click learning
psql "$DATABASE_URL" -f apps/api/prisma/sql/2026-11-recommendations.sql
npm run test:recommend -w apps/api     # creates and removes its own reader
npm run test:search -w apps/api        # ranking must still pass 14/14

# 8. Assistant
psql "$DATABASE_URL" -f apps/api/prisma/sql/2026-11-assistant.sql
npm run test:actions -w apps/api       # write-mode grammar, pure
npm run test:assistant -w apps/api     # no LLM key needed; creates + removes its own rows
```

Draft review in Telegram: `/drafts`, `/draft <id>`, `/approve <id>`,
`/discard <id>`, or tap **Publish** on the card the watcher posts; **✏️ Fix a
field** corrects any field without reposting. The same actions live at
**Admin → Course drafts** (`/admin/drafts`).

Required env additions (never committed):

```
TELEGRAM_BOT_TOKEN=...          # indexer + delivery
TELEGRAM_WATCHER_ENABLED=true   # Phase 3 kill switch
TELEGRAM_AUTOPUBLISH=true       # false = always wait for a human tap
TELEGRAM_SOURCE_CHATS=syncourse # allowlist: usernames or ids, comma separated
TELEGRAM_TOPIC_CATEGORIES=12:ai-machine-learning,34:programming

# Phase 5. Any one key is enough; omit all of them and the assistant answers
# from quoted text. ASSISTANT_LLM=none forces that path even with a key.
ASSISTANT_ENABLED=true
ASSISTANT_LLM=gemini            # gemini | groq | openrouter | none | unset=auto
GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-flash-latest
# GROQ_API_KEY=...
# OPENROUTER_API_KEY=...
# ASSISTANT_DAILY_ANON=25
# ASSISTANT_DAILY_USER=150

# Signs the 10-minute confirmation token for assistant write mode.
# Falls back to JWT_SECRET / AUTH_SECRET when unset; set it explicitly in
# production so rotating one secret does not invalidate the other.
ASSISTANT_ACTION_SECRET=...
```

Photos posted with a course are mirrored to Cloudinary at approval time, so
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` must
be present for covers, lecturer photos and organisation logos. Without them the
course still publishes; only the images are skipped.

The assistant needs no key to be correct, only to be fluent. Add the key to
`apps/api/.env` **and** to Vercel (`vercel env add GEMINI_API_KEY production`
inside `apps/api`), then redeploy. `GET /api/assistant/status` reports
`mode: "llm"` when a provider is live and `mode: "extractive"` when not.

---

## 9. Definition of done

- Search finds courses by title, tag, typo, synonym and lesson text.
- The agent answers from real lesson content and cites it.
- Posting a course in the group produces a draft that one tap can publish, or
  zero taps when the post already carries title, lecturer, description and a file.
- A photo's caption decides whether it is the cover, the lecturer or the logo,
  and any field can be corrected in the chat without reposting.
- The assistant can add to the catalogue only after a staff account confirms a
  signed, expiring summary — and it cannot be tricked into writing by a reader.
- Video bytes are never stored; the database stays within the free tier.
- Premium content never reaches a non-premium account.
- Every phase is independently revertible.
