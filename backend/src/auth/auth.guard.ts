import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, ROLES } from './decorators';

// Guard global: exige Authorization: Bearer <token> em tudo, exceto rotas @Public().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('token ausente');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('token inválido ou expirado');
    }
    req.user = { id: payload.sub, email: payload.email, role: payload.role };

    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException('acesso restrito');
    return true;
  }
}
