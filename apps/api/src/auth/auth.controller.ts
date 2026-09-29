import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Query,
  Redirect,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  GoogleExchangeDto,
  LinkTelegramDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyDto,
  VerifyResetDto,
} from './dto';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

/**
 * Tighter per-IP limits than the global 300/min.
 *
 * These are the only routes an unauthenticated stranger can drive: login and
 * the code endpoints are where credential stuffing, password-reset floods and
 * inbox bombing land. Registered per route rather than globally so ordinary
 * browsing is never throttled by them.
 */
const LIMIT_LOGIN = { default: { limit: 10, ttl: 60_000 } };
const LIMIT_SIGNUP = { default: { limit: 5, ttl: 60_000 } };
const LIMIT_EMAIL = { default: { limit: 3, ttl: 60_000 } };

/** The mobile app's deep-link scheme — see safeRedirect below. */
const APP_SCHEME_PREFIX = 'syncourse://';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LIMIT_SIGNUP)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle(LIMIT_LOGIN)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Throttle(LIMIT_LOGIN)
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyDto) {
    return this.auth.verify(dto.email, dto.code);
  }

  @Public()
  @Throttle(LIMIT_EMAIL)
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
  }

  /** Password reset, step 1: email a 6-digit code. */
  @Public()
  @Throttle(LIMIT_EMAIL)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ResendVerificationDto) {
    return this.auth.forgotPassword(dto.email);
  }

  /** Password reset, step 2: trade the code for a short-lived reset token. */
  @Public()
  @Throttle(LIMIT_LOGIN)
  @Post('verify-reset')
  @HttpCode(HttpStatus.OK)
  verifyReset(@Body() dto: VerifyResetDto) {
    return this.auth.verifyResetCode(dto.email, dto.code);
  }

  /** Password reset, step 3: set the new password using that token. */
  @Public()
  @Throttle(LIMIT_LOGIN)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  /**
   * Where the browser may be sent once Google has signed the user in.
   *
   * An allowlist, not a shape check: `?redirect=` comes from the caller and
   * googleCallback appends the session token to whatever it returns, so the
   * old `/^https?:\/\//` test handed a user's token to any site that asked.
   *
   * `syncourse://` is the mobile app's own scheme. The app opens this route in
   * a system browser and Android hands the deep link back to it — which is the
   * whole reason it works: Google only ever redirects to GOOGLE_REDIRECT_URI
   * (an https URL registered on the Web client), never to a custom scheme. Ask
   * Google to redirect a Web client straight to syncourse:// and it refuses
   * with "Error 400: invalid_request — doesn't comply with Google's OAuth 2.0
   * policy for keeping apps secure".
   */
  private safeRedirect(redirect?: string): string {
    const fallback = process.env.PUBLIC_APP_URL ?? '';
    if (typeof redirect !== 'string' || !redirect) return fallback;
    if (redirect.startsWith(APP_SCHEME_PREFIX)) return redirect;
    try {
      const target = new URL(redirect);
      // `PUBLIC_APP_URL` is the canonical app; `PUBLIC_WEB_ORIGINS` honours any
      // other host serving the same build (the Cloudflare Pages mirror). It is
      // not cosmetic: the session token is appended to whichever origin answers
      // this redirect, and browser storage is per-origin — so a sign-in started
      // on the mirror used to bounce to the canonical host and leave the tab it
      // came from signed out. Still an allowlist: anything not named here keeps
      // falling back to `PUBLIC_APP_URL`.
      const allowed = [
        process.env.PUBLIC_APP_URL,
        ...(process.env.PUBLIC_WEB_ORIGINS ?? '').split(','),
        'http://localhost:3000',
      ]
        .map((u) => u?.trim())
        .filter((u): u is string => !!u);
      if (allowed.some((u) => new URL(u).origin === target.origin)) return redirect;
    } catch {
      // not a parseable URL — fall through to the app's own origin
    }
    return fallback;
  }

  /** Step 1 (web + app): bounce the browser to Google's consent screen. */
  @Public()
  @Get('google')
  @Redirect()
  googleAuth(@Query('redirect') redirect?: string) {
    return { url: this.auth.googleAuthUrl(this.safeRedirect(redirect)) };
  }

  /** Step 2: Google redirects here with a code; bounce back to the caller with a token. */
  @Public()
  @Get('google/callback')
  @Redirect()
  async googleCallback(@Query('code') code?: string, @Query('state') state?: string) {
    if (!code) throw new UnauthorizedException('Missing Google authorization code');
    const { redirect, token } = await this.auth.googleCallback(code, state ?? '');
    const separator = redirect.includes('?') ? '&' : '?';
    return { url: `${redirect}${separator}token=${encodeURIComponent(token)}` };
  }

  /** Mobile flow: exchange the Google code for a session token directly. */
  @Public()
  @Throttle(LIMIT_LOGIN)
  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  googleExchange(@Body() dto: GoogleExchangeDto) {
    return this.auth.googleExchange(dto.code, dto.redirectUri ?? '');
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('link-telegram')
  linkTelegram(@CurrentUser() user: AuthUser, @Body() dto: LinkTelegramDto) {
    return this.auth.linkTelegram(user.id, dto.telegramUsername);
  }
}
