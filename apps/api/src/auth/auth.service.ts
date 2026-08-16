import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

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
    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
    });
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
