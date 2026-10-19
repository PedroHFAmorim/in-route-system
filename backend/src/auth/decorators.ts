import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

// Rota sem token (somente GET /health e POST /auth/login).
export const Public = () => SetMetadata(IS_PUBLIC, true);
// Restringe a rota a certos papéis.
export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);

export type AuthUser = { id: string; email: string; role: string };
