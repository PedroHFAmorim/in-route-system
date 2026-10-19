import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC, ROLES } from './decorators';

const make = (meta: Record<string, unknown>, headers: Record<string, string>, verify: () => any) => {
  const reflector = { getAllAndOverride: (k: string) => meta[k] } as unknown as Reflector;
  const jwt = { verifyAsync: jest.fn(async () => verify()) } as unknown as JwtService;
  const req: any = { headers };
  const ctx = { getHandler: () => 0, getClass: () => 0, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { guard: new AuthGuard(jwt, reflector), ctx, req };
};
const ok = () => ({ sub: 'u1', email: 'a@b.c', role: 'collector' });

describe('AuthGuard', () => {
  it('libera rota @Public sem token', async () => {
    const { guard, ctx } = make({ [IS_PUBLIC]: true }, {}, ok);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
  it('401 sem token', async () => {
    const { guard, ctx } = make({}, {}, ok);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('401 com token inválido', async () => {
    const { guard, ctx } = make({}, { authorization: 'Bearer x' }, () => { throw new Error('jwt'); });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('token válido preenche req.user', async () => {
    const { guard, ctx, req } = make({}, { authorization: 'Bearer t' }, ok);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'u1', email: 'a@b.c', role: 'collector' });
  });
  it('403 quando o papel não é o exigido', async () => {
    const { guard, ctx } = make({ [ROLES]: ['admin'] }, { authorization: 'Bearer t' }, ok);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('admin passa em rota restrita a admin', async () => {
    const { guard, ctx } = make({ [ROLES]: ['admin'] }, { authorization: 'Bearer t' }, () => ({ ...ok(), role: 'admin' }));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
