# 🎓 Syncourse — Course Delivery & Learning Platform

A course-delivery platform with **categories, course cards, course detail pages, lecturers, levels, image-rich notes, video lessons, reviews, lists, circles, search and premium subscriptions** — delivered through a web app, an Expo app, and a Telegram bot that sends the actual course archives.

**Architecture: one backend, three clients** — the web app is mobile-first and mirrors the mobile app exactly (same API, same design tokens).

```
┌────────────────────────────────────────────────────────────┐
│  Single NestJS Backend API (REST)                          │
│  auth · catalog · content · library · reviews ·            │
│  collections · circles · resources · payments · search ·   │
│  telegram · admin                                          │
└──────────┬───────────────────────────────┬─────────────────┘
           ▼                               ▼
   ┌─────────────────┐             ┌──────────────────┐
   │  Expo Mobile     │             │  Next.js Web      │
   │  (iOS + Android) │             │  (mobile-first)   │
   └─────────────────┘             └──────────────────┘
           └───────────────┬───────────────┘
                           ▼
                 ┌───────────────────┐
                 │  Telegram bot     │
                 │  course delivery  │
                 └───────────────────┘
```

## Repository layout

```
syncourse/
├─ apps/
│  ├─ api/          # NestJS REST API + Prisma (PostgreSQL)
│  ├─ web/          # Next.js (App Router) mobile-first web app
│  ├─ mobile-expo/  # Expo app (the shipped mobile client)
│  └─ mobile/       # Legacy Flutter scaffold — does not build, not deployed
├─ packages/
│  ├─ design-tokens/# shared spacing/color/type tokens (mirrors the dark theme)
│  └─ shared-types/ # shared TypeScript types consumed by api + web
├─ .env.example     # copy to .env, fill in secrets later
└─ package.json     # npm workspaces
```

> `apps/mobile` is kept for reference only: it is an incomplete Flutter port that no longer compiles against the API. The active mobile client is `apps/mobile-expo`. Do not advertise or ship it.

## Quick start (local)

```bash
npm install                 # installs all workspaces
cp .env.example apps/api/.env
# point DATABASE_URL at a local PostgreSQL (or a Neon branch) first
npm run db:migrate          # applies the Prisma schema
npm run db:seed             # seeds demo catalog (categories, courses, notes…)
npm run dev:api             # API on http://localhost:4000
npm run dev:web             # web app on http://localhost:3000
```

Then open **http://localhost:3000** — demo account: `demo@syncourse.app` / `demo1234` (or register with Google).

The Expo app runs with `cd apps/mobile-expo && npm start`; set `EXPO_PUBLIC_API_URL` (or the API base in `lib/api.ts`) to a reachable host — `localhost` on a phone points at the phone itself.

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS (Node/TypeScript), Prisma ORM |
| Database | PostgreSQL (Neon in production) |
| Web | Next.js 16 App Router + Tailwind, mobile-first |
| Mobile | Expo SDK 57 + expo-router (`apps/mobile-expo`) |
| Delivery | Telegram bot sends course archives and file downloads |
| Storage | Cloudinary for images/media — admin uploads are signed direct-to-Cloudinary; lesson media URLs are short-lived |
| Auth | Email/password (JWT bound to server-side sessions) + Google OAuth + Telegram linking |
| Payments | Fixed-duration plans; a subscription records a payment reference and staff confirm it in the admin console, with a signed webhook path for providers |
| Search | Postgres full-text + trigram + synonym expansion + indexed Telegram content |
| Email | Brevo |
| Infra | Vercel (API + web), Neon (database), EAS (mobile builds), GitHub Actions (CI) |

## Environment variables

Everything is documented in `.env.example`. The app runs with the local defaults; fill in real values later (JWT secret, Google/Telegram/Cloudinary/Brevo keys) — none are required to run locally, but production refuses to boot without `JWT_SECRET`.

## Demo content (seeded)

The seed script creates a realistic catalog mirroring the reference: categories (AI/ML, Web Dev, Data Science…), courses (e.g. "AI — Introduction to AI Automation with n8n & LangChain"), lecturers (e.g. Derek Cheung), organizations (DevPack, Zero To Mastery), levels, learning paths, lessons with **notes-with-images**, and a premium plan.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:api` | Run API in watch mode |
| `npm run dev:web` | Run web app in watch mode |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Reset + seed the demo catalog |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | Type-check api + web |
| `npm run test:plans -w apps/api` | Plan pricing/expiry tests |
| `npm run test:parser -w apps/api` | Telegram post parser tests |
| `npm run test:search -w apps/api` | Search quality checks (needs `.env`) |

Expo: `npm run typecheck -w apps/mobile-expo`.

## Deployment

- **API** — `https://syncourse-api.vercel.app` (serverless NestJS; `GET /api/health` reports database connectivity).
- **Web** — `https://syncourse-web.vercel.app`.
- **Mobile** — EAS builds; OTA updates through `expo-updates`.
- **CI** — `.github/workflows/ci.yml` installs, generates the Prisma client, type-checks api/web/Expo, runs the plan/parser tests, and builds.
- `render.yaml` is a fallback/self-host blueprint, not the production path.

Never run `prisma db push` against production: the live database still holds legacy `Enrollment`, `LessonProgress` and `Course.enrollmentCount` columns that the current schema would drop.

## Repo

`https://github.com/Hayredin950/syncourse`
