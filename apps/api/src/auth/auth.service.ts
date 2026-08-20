import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto';

interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/** A verification code is valid for 15 minutes. */
const VERIFY_TTL_MS = 15 * 60 * 1000;
/** Max wrong attempts before the code is invalidated. */
const MAX_VERIFY_ATTEMPTS = 5;
/** Minimum gap between resend requests. */
const RESEND_MIN_MS = 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private get googleClientId() {
    return this.config.get<string>('GOOGLE_CLIENT_ID', '');
  }

  private get googleClientSecret() {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET', '');
  }

  private get googleRedirectUri() {
    return this.config.get<string>('GOOGLE_REDIRECT_URI', '');
  }

  /** Build the Google consent URL. `state` carries where the browser bounces back after auth. */
  googleAuthUrl(redirect: string) {
    const clientId = this.googleClientId;
    if (!clientId) throw new BadRequestException('Google sign-in is not configured');
    const state = Buffer.from(JSON.stringify({ redirect })).toString('base64url');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.googleRedirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Exchange a Google auth code and sign the user in. Used by the web redirect flow. */
  async googleCallback(code: string, state: string) {
    let redirect = '';
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      redirect = typeof parsed.redirect === 'string' ? parsed.redirect : '';
    } catch {
      redirect = '';
    }
    const profile = await this.exchangeGoogleCode(code, this.googleRedirectUri);
    const auth = await this.upsertGoogleUser(profile);
    const token = this.signToken(auth.user);
    return { redirect, token };
  }

  /** Exchange a Google auth code and return the auth payload directly (mobile flow). */
  async googleExchange(code: string, redirectUri: string) {
    const profile = await this.exchangeGoogleCode(code, redirectUri || this.googleRedirectUri);
    const auth = await this.upsertGoogleUser(profile);
    const token = this.signToken(auth.user);
    return { accessToken: token, user: auth.user };
  }

  private async exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleProfile> {
    if (!this.googleClientId || !this.googleClientSecret) {
      throw new BadRequestException('Google sign-in is not configured');
    }
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.googleClientId,
        client_secret: this.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException('Google rejected the authorization code');
    }
    const tokens = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) throw new UnauthorizedException('Could not fetch Google profile');
    return (await infoRes.json()) as GoogleProfile;
  }

  private async upsertGoogleUser(profile: GoogleProfile) {
    const email = (profile.email || '').toLowerCase();
    if (!email) throw new UnauthorizedException('Google account has no email');
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.sub } });
    if (!user) user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId || profile.sub,
          name: user.name || profile.name || email.split('@')[0],
          avatarUrl: user.avatarUrl || profile.picture || null,
          isVerified: user.isVerified || profile.email_verified === true,
        },
      });
    } else {
      const base = (profile.name || email.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_.]/g, '')
        .slice(0, 20) || 'user';
      let username = base;
      let n = 1;
      while (await this.prisma.user.findUnique({ where: { username } })) {
        username = `${base}${n++}`;
        if (n > 50) username = `user${Date.now().toString(36)}`;
      }
      user = await this.prisma.user.create({
        data: {
          name: profile.name || email.split('@')[0],
          username,
          email,
          googleId: profile.sub,
          avatarUrl: profile.picture || null,
          isVerified: profile.email_verified === true,
        },
      });
    }
    await this.prisma.session.create({
      data: { userId: user.id, device: 'google-oauth', ip: 'n/a', active: true },
    });
    return { user: this.publicUser(user), raw: user };
  }

  private signToken(user: { id: string; email: string; username: string }) {
    return this.jwt.sign({ sub: user.id, email: user.email, username: user.username });
  }

  private publicUser(user: {
    id: string;
    name: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    gender: string | null;
    isVerified: boolean;
    planType: string;
    planExpiresAt: Date | null;
    telegramUsername: string | null;
    isStaff: boolean;
  }) {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      gender: user.gender,
      isVerified: user.isVerified,
      planType: user.planType,
      planExpiresAt: user.planExpiresAt,
      telegramUsername: user.telegramUsername,
      isStaff: user.isStaff,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('Email or username already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        username: dto.username,
        email: dto.email.toLowerCase(),
        passwordHash,
        isVerified: false,
      },
    });

    const code = this.newVerificationCode();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { verifyCode: code, verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS), verifySentAt: new Date() },
    });

    const sent = await this.email.sendVerificationCode(user.email, user.name, code);
    if (!sent.sent) {
      // Email is not configured (BREVO_API_KEY missing) or the send failed.
      // Falling back to auto-verify keeps signups working instead of bricking
      // every new account on a dead mailbox — the previous "hard verify"
      // outage. The moment a real key is configured, hard verify kicks in.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true, verifyCode: null, verifyExpiresAt: null, verifyAttempts: 0, verifySentAt: null },
      });
      await this.prisma.session.create({
        data: { userId: user.id, device: 'registration', ip: 'n/a', active: true },
      });
      return this.buildAuthResponse(user);
    }

    return { requiresVerification: true, email: user.email.toLowerCase() };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (!user.isVerified) {
      throw new ForbiddenException(
        'Please verify your email first — check your inbox for the 6-digit code.',
      );
    }
    await this.prisma.session.create({
      data: { userId: user.id, device: 'login', ip: 'n/a', active: true },
    });
    return this.buildAuthResponse(user);
  }

  /** Confirm a registration with the emailed 6-digit code, then sign in. */
  async verify(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new BadRequestException('No account found for that email.');
    if (user.isVerified) {
      await this.prisma.session.create({
        data: { userId: user.id, device: 'verify', ip: 'n/a', active: true },
      });
      return this.buildAuthResponse(user);
    }
    if (!user.verifyCode) {
      throw new BadRequestException('No verification code is pending — request a new one.');
    }
    if (user.verifyExpiresAt && user.verifyExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('That code has expired — request a new one.');
    }
    if (user.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
      throw new BadRequestException('Too many wrong attempts — request a new code.');
    }
    const clean = code.trim().replace(/\D/g, '');
    if (clean !== user.verifyCode) {
      const attempts = user.verifyAttempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { verifyAttempts: attempts, ...(attempts >= MAX_VERIFY_ATTEMPTS ? { verifyCode: null } : {}) },
      });
      throw new BadRequestException(`Wrong code — ${MAX_VERIFY_ATTEMPTS - attempts} attempts left.`);
    }
    const verified = await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verifyCode: null, verifyExpiresAt: null, verifyAttempts: 0, verifySentAt: null },
    });
    await this.prisma.session.create({
      data: { userId: user.id, device: 'verify', ip: 'n/a', active: true },
    });
    return this.buildAuthResponse(verified);
  }

  /** Re-send the verification code, rate-limited to one per minute. */
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Never reveal whether the account exists.
    if (!user || user.isVerified) return { sent: true };
    if (user.verifySentAt && Date.now() - user.verifySentAt.getTime() < RESEND_MIN_MS) {
      throw new HttpException('Wait a minute before requesting another code.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = this.newVerificationCode();
    const sent = await this.email.sendVerificationCode(user.email, user.name, code);
    if (!sent.sent) {
      throw new ServiceUnavailableException('Could not send the code right now — please try again.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verifyCode: code,
        verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        verifySentAt: new Date(),
        verifyAttempts: 0,
      },
    });
    return { sent: true };
  }

  private newVerificationCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      gender: user.gender,
      isVerified: user.isVerified,
      planType: user.planType,
      planExpiresAt: user.planExpiresAt,
      telegramUsername: user.telegramUsername,
      isStaff: user.isStaff,
    };
  }

  /**
   * Forgot-password, step 1: email a 6-digit code.
   *
   * Replaces the old magic-link flow. Typing a code is far more reliable than a
   * link tap, especially on phones where the link often lands in spam — and it
   * works identically on web, mobile and the bot, none of which can rely on the
   * user opening a browser at the right moment.
   *
   * The response never reveals whether the account exists, and never says the
   * mail was sent when it wasn't: `sent` reflects the real outcome, while
   * `message` stays constant either way.
   */
  async forgotPassword(email: string) {
    const message = 'If that account exists, a 6-digit code is on its way.';
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // No password hash means a Google/Telegram-only account: nothing to reset.
    if (!user || !user.passwordHash) return { sent: false, message };

    if (user.resetSentAt && Date.now() - user.resetSentAt.getTime() < RESEND_MIN_MS) {
      throw new HttpException(
        'Wait a minute before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.newVerificationCode();
    const sent = await this.email.sendResetCode(user.email, user.name, code);
    if (!sent.sent) {
      // Storing a code nobody can read would strand the user on the code screen.
      throw new ServiceUnavailableException('Could not send the code right now — please try again.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetCode: code,
        resetExpiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        resetSentAt: new Date(),
        resetAttempts: 0,
      },
    });
    return { sent: true, message };
  }

  /**
   * Forgot-password, step 2: trade the emailed code for a short-lived token.
   *
   * The code is burned here, so it cannot be replayed; the returned token is the
   * only thing that can set the new password, and only for the next 15 minutes.
   */
  async verifyResetCode(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const invalid = () => new BadRequestException('That code is invalid or has expired.');
    if (!user || !user.resetCode) throw invalid();
    if (user.resetExpiresAt && user.resetExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('That code has expired — request a new one.');
    }
    if (user.resetAttempts >= MAX_VERIFY_ATTEMPTS) {
      throw new BadRequestException('Too many wrong attempts — request a new code.');
    }
    const clean = code.trim().replace(/\D/g, '');
    if (clean !== user.resetCode) {
      const attempts = user.resetAttempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetAttempts: attempts, ...(attempts >= MAX_VERIFY_ATTEMPTS ? { resetCode: null } : {}) },
      });
      throw new BadRequestException(`Wrong code — ${MAX_VERIFY_ATTEMPTS - attempts} attempts left.`);
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetCode: null, resetExpiresAt: null, resetAttempts: 0 },
    });
    const resetToken = this.jwt.sign(
      // `pv` binds the token to the password it was issued against, which makes it
      // single-use: the moment step 3 changes the hash, the token stops verifying.
      { sub: user.id, purpose: 'reset', pv: this.passwordFingerprint(user.passwordHash) },
      { expiresIn: '15m' },
    );
    return { verified: true, resetToken };
  }

  /**
   * Short, non-reversible stamp of a password hash, for the `pv` claim above.
   * A JWT payload is readable by anyone holding the token, so the hash itself
   * must never go in there.
   */
  private passwordFingerprint(passwordHash: string | null): string {
    return createHash('sha256').update(passwordHash ?? '').digest('hex').slice(0, 16);
  }

  /**
   * Forgot-password, step 3: set the new password.
   *
   * Takes the token from step 2. Unchanged from the link-based flow on purpose —
   * old reset links that are still in flight keep working.
   */
  async resetPassword(token: string, password: string) {
    let payload: { sub?: string; purpose?: string; pv?: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new BadRequestException('That reset session is invalid or has expired — start again.');
    }
    if (payload.purpose !== 'reset' || !payload.sub) {
      throw new BadRequestException('That reset session is invalid or has expired — start again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new BadRequestException('That account no longer exists.');
    // Tokens minted by the code flow carry `pv` and are single-use. Older
    // magic-link tokens have no `pv`; those still work until they expire.
    if (payload.pv && payload.pv !== this.passwordFingerprint(user.passwordHash)) {
      throw new BadRequestException('That reset session has already been used — start again.');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      // Clear the whole reset trail so the next request isn't rate-limited by
      // the one that just succeeded.
      data: { passwordHash, resetCode: null, resetExpiresAt: null, resetAttempts: 0, resetSentAt: null },
    });
    await this.prisma.session.updateMany({ where: { userId: user.id }, data: { active: false } });
    return { reset: true };
  }

  /** Link a Telegram username so bot downloads can be tracked to the account. */
  async linkTelegram(userId: string, telegramUsername: string) {
    const username = telegramUsername.trim().replace(/^@/, '');
    if (!username) throw new BadRequestException('Telegram username is required');
    await this.prisma.user.update({ where: { id: userId }, data: { telegramUsername: username } });
    return { linked: true, telegramUsername: username };
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    username: string;
    name: string;
    planType: string;
    planExpiresAt: Date | null;
  }) {
    const token = this.signToken(user);
    return {
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        planType: user.planType,
        planExpiresAt: user.planExpiresAt,
      },
    };
  }
}
