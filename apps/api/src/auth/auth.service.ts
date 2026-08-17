import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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
        isVerified: true, // dev: auto-verify; wire email OTP in production
      },
    });
    await this.prisma.session.create({
      data: { userId: user.id, device: 'registration', ip: 'n/a', active: true },
    });
    // Best-effort welcome email — skipped until BREVO_API_KEY is configured
    void this.email.sendWelcome(user.email, user.name);
    return this.buildAuthResponse(user);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    await this.prisma.session.create({
      data: { userId: user.id, device: 'login', ip: 'n/a', active: true },
    });
    return this.buildAuthResponse(user);
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

  /** Forgot-password: email a short-lived reset link (JWT) to the account owner. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always return the same message whether or not the account exists (no user enumeration).
    if (!user || !user.passwordHash) {
      return { sent: false, message: 'If that account exists, a reset link has been sent.' };
    }
    const token = this.jwt.sign({ sub: user.id, purpose: 'reset' }, { expiresIn: '30m' });
    const appUrl = process.env.PUBLIC_APP_URL || 'https://syncourse.pages.dev';
    const link = `${appUrl}/auth?reset=${encodeURIComponent(token)}`;
    await this.email.send({
      to: user.email,
      subject: 'Reset your Syncourse password',
      text: `Hi ${user.name},\n\nClick the link below to set a new password (valid for 30 minutes):\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `<p>Hi ${user.name},</p><p>Click the link below to set a new password (valid for 30 minutes):</p><p><a href="${link}" style="background:#f39027;color:#211308;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Reset password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
    });
    return { sent: true, message: 'If that account exists, a reset link has been sent.' };
  }

  /** Reset-password: verify the reset JWT and set a new password. */
  async resetPassword(token: string, password: string) {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new BadRequestException('That reset link is invalid or has expired.');
    }
    if (payload.purpose !== 'reset' || !payload.sub) {
      throw new BadRequestException('That reset link is invalid or has expired.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new BadRequestException('That account no longer exists.');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
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
