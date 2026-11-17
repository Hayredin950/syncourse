import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

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
          const payload = await this.jwtService.verifyAsync(token);
          if (payload?.sub && !payload?.purpose) {
            request.user = {
              id: payload.sub,
              email: payload.email,
              username: payload.username,
            } as AuthUser;
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
      const payload = await this.jwtService.verifyAsync(token);
      // Password-reset tokens are signed with the same secret but are not
      // access tokens. `purpose` marks them, and they must never open a route.
      if (!payload?.sub || payload?.purpose) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      request.user = { id: payload.sub, email: payload.email, username: payload.username } as AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
