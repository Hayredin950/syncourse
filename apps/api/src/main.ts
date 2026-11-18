import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Browser origins allowed to call this API.
 *
 * This used to be `origin: true`, which reflected whatever Origin asked for
 * *and* set `credentials: true` — so any site could read authenticated
 * responses. Bearer tokens make that hard to exploit (a browser never attaches
 * them on its own), but there is no reason to hand out the permission.
 *
 * Callers with no Origin at all — the React Native app, curl, Telegram's
 * webhook, server-to-server jobs — are unaffected by this list.
 */
function allowedOrigins(): string[] {
  return [
    process.env.PUBLIC_APP_URL,
    // the Vercel deployments, and the Cloudflare Pages fallback still in service
    'https://syncourse-web.vercel.app',
    'https://syncourse.pages.dev',
    // local dev: Next on 3000, Expo web on 8081
    'http://localhost:3000',
    'http://localhost:8081',
    // escape hatch for extra hosts without a redeploy of this file
    ...(process.env.CORS_ORIGINS ?? '').split(','),
  ]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));
}

/** `syncourse-web-<hash>-<team>.vercel.app` — preview builds of the web app. */
const PREVIEW_ORIGIN = /^https:\/\/syncourse-web-[a-z0-9]+-[a-z0-9-]+\.vercel\.app$/;

/**
 * Refuse to boot production on the development fallbacks.
 *
 * JWT_SECRET signs access tokens, password-reset tokens and the media URLs.
 * The code falls back to a public literal so `npm run start:dev` works with
 * no .env — fine on a laptop, catastrophic on a public host, where anyone could
 * mint a token for any account. Fail closed instead of starting up forgeable.
 */
function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-only-secret-change-me') {
    throw new Error('Refusing to start: set JWT_SECRET in production');
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create(AppModule);
  // Images are uploaded as base64 data URLs — the default 100kb body limit
  // rejected them with "request entity too large". 15mb covers photos/banners.
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins().includes(origin) || PREVIEW_ORIGIN.test(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  // Every request gets an id, echoed back and included in error logs, so a
  // caller can quote one failing request instead of "it broke".
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.trim() ? incoming.trim() : randomUUID();
    res.setHeader('x-request-id', id);
    next();
  });
  // Baseline headers for a JSON API. TLS is terminated at Vercel's edge, so
  // HSTS is safe to send from here. The CSP is deliberately directive-only
  // (`frame-ancestors`/`default-src`) because this app never returns HTML —
  // there is no inline script to allow.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Vercel injects PORT and supervises the listener; API_PORT stays the local
  // default so `npm run start:dev` keeps working unchanged.
  const port = Number(process.env.PORT || process.env.API_PORT || 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Syncourse API listening on http://localhost:${port}/api`);
}
bootstrap();
