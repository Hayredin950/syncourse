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
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyDto) {
    return this.auth.verify(dto.email, dto.code);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
  }

  /** Password reset, step 1: email a 6-digit code. */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ResendVerificationDto) {
    return this.auth.forgotPassword(dto.email);
  }

  /** Password reset, step 2: trade the code for a short-lived reset token. */
  @Public()
  @Post('verify-reset')
  @HttpCode(HttpStatus.OK)
  verifyReset(@Body() dto: VerifyResetDto) {
    return this.auth.verifyResetCode(dto.email, dto.code);
  }

  /** Password reset, step 3: set the new password using that token. */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  /** Step 1 (web): bounce the browser to Google's consent screen. */
  @Public()
  @Get('google')
  @Redirect()
  googleAuth(@Query('redirect') redirect?: string) {
    const safeRedirect =
      typeof redirect === 'string' && /^https?:\/\//.test(redirect)
        ? redirect
        : (process.env.PUBLIC_APP_URL ?? '');
    return { url: this.auth.googleAuthUrl(safeRedirect) };
  }

  /** Step 2 (web): Google redirects here with a code; bounce back to the app with a token. */
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
