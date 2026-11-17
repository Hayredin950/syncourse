import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  /** The session row this token was issued for. Absent on legacy tokens. */
  sessionId?: string;
}

/** The claims an access token carries. `purpose` marks reset tokens. */
interface AccessTokenPayload {
  sub?: string;
  email?: string;
  username?: string;
  sid?: string;
  purpose?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Turn a valid token into a viewer, but only while its session is live.
   *
   * Without this check every "Sign out this device", "sign out everywhere" and
   * the session revocation after a password reset were cosmetic: the JWT kept
   * opening the API for its full 7-day life. Tokens minted before `sid` existed
   * no longer resolve, so that deploy signs everyone out once and starts from
   * a state where revocation actually works.
   */
  private async viewerFrom(payload: AccessTokenPayload): Promise<AuthUser | null> {
    if (!payload?.sub || !payload?.sid) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { userId: true, active: true },
    });
    if (!session || !session.active || session.userId !== payload.sub) return null;
    return {
      id: payload.sub,
      email: payload.email ?? '',
      username: payload.username ?? '',
      sessionId: payload.sid,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const auth = request.headers?.authorization as string | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

    // Public routes still authenticate opportunistically: a bearer token, when
    // present, must populate request.user so per-viewer fields (saved, liked,
    // myRating, joined, isOwner, saved-list) are correct. Returning early on
    // @Public() left every one of those permanently undefined, which is why
    // owners could not open their own private lists and members saw "Join".
    if (isPublic) {
      if (token) {
        try {
          const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
          if (!payload?.purpose) {
            const viewer = await this.viewerFrom(payload);
            if (viewer) request.user = viewer;
          }
        } catch {
          // An invalid token on a public route is simply an anonymous request.
        }
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      // Password-reset tokens are signed with the same secret but are not
      // access tokens. `purpose` marks them, and they must never open a route.
      if (!payload?.sub || payload?.purpose) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      const viewer = await this.viewerFrom(payload);
      if (!viewer) throw new UnauthorizedException('Your session has ended — sign in again');
      request.user = viewer;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
