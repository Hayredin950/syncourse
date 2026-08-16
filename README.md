# 🎓 Syncourse — Course Delivery & Learning Platform

A course-delivery platform with **categories, course cards, course detail pages, lecturers, levels, image-rich notes, video lessons, progress tracking, reviews, lists and premium subscriptions** — built from a full audit of the *PhonoFilm* app (93 mobile screens + 29 web screens) and the *Zero To Mastery* Telegram funnel.

**Architecture: one backend, three clients** — the web app is mobile-first and mirrors the mobile app exactly (same API, same design tokens).

```
┌────────────────────────────────────────────────────────────┐
│  Single NestJS Backend API (REST)                          │
│  auth · catalog · content · enrollment · reviews ·         │
│  collections · downloads · payments · search · admin        │
└──────────┬───────────────────────────────┬─────────────────┘
           ▼                               ▼
   ┌─────────────────┐             ┌──────────────────┐
   │  Flutter Mobile  │             │  Next.js Web      │
   │  (iOS + Android) │             │  (mobile-first)   │
   └─────────────────┘             └──────────────────┘
```

## Repository layout

```
syncourse/
├─ apps/
│  ├─ api/          # NestJS REST API + Prisma (SQLite dev / Postgres prod)
│  ├─ web/          # Next.js 14 (App Router) mobile-first web app
│  └─ mobile/       # Flutter app (scaffold + screens, see its README)
├─ packages/
│  ├─ design-tokens/# shared spacing/color/type tokens (mirrors the dark theme)
│  └─ shared-types/ # shared TypeScript types consumed by api + web
├─ .env.example     # copy to .env, fill in secrets later
└─ package.json     # npm workspaces
```

## Quick start (local, zero cost)

```bash
npm install                 # installs all workspaces
cp .env.example apps/api/.env
npm run db:migrate          # creates SQLite dev DB
npm run db:seed             # seeds demo catalog (categories, courses, notes…)
npm run dev:api             # API on http://localhost:4000
npm run dev:web             # web app on http://localhost:3000
```

Then open **http://localhost:3000** — demo account: `demo@syncourse.app` / `demo1234` (or register with Google).

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS (Node/TypeScript), Prisma ORM |
| Database | PostgreSQL (prod) · SQLite (local dev, out of the box) |
| Web | Next.js 14 App Router + Tailwind, mobile-first, PWA-ready |
| Mobile | Flutter (scaffold in `apps/mobile`) |
| Storage | Cloudflare R2 (video/files) — signed short-lived URLs only |
| Auth | Email/password (JWT) + Google OAuth + Telegram linking |
| Payments | Stripe (cards) + Chapa (Ethiopian mobile money) — webhook-driven, fixed-duration plans |
| Search | Postgres full-text (SQLite LIKE fallback), trending queries |
| Infra | Render/Fly (API), Vercel (web), Cloudflare (DNS/CDN), GitHub Actions (CI) |

## Environment variables

Everything is documented in `.env.example`. The app runs with the local defaults; you said you'll fill in real values later (JWT secret, Stripe/Chapa keys, Telegram bot token, R2 keys, Resend) — none are required to run locally.

## Demo content (seeded)

The seed script creates a realistic catalog mirroring the reference: categories (AI/ML, Web Dev, Data Science…), courses (e.g. "AI — Introduction to AI Automation with n8n & LangChain"), lecturers (e.g. Derek Cheung), organizations (DevPack, Zero To Mastery), levels, learning paths, lessons with **notes-with-images** (the "Top AI Algorithms" cheat-sheet format), and a premium plan.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:api` | Run API in watch mode |
| `npm run dev:web` | Run web app in watch mode |
| `npm run db:seed` | Reset + seed the demo catalog |
| `npm run build` | Type-check & build all workspaces |
| `npm run typecheck` | Type-check api + web |

## Repo

`https://github.com/Hayredin950/syncourse`
