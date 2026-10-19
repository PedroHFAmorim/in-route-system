import { ConflictException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias (trabalho de campo)
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const pub = (u: { id: string; email: string; role: string }) => ({ id: u.id, email: u.email, role: u.role });

// Hash falso para igualar o tempo de resposta quando o e-mail não existe.
const DUMMY_HASH = bcrypt.hashSync('senha-inexistente', 10);

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger('Auth');
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  // Primeiro usuário sem cadastro aberto: ADMIN_EMAIL / ADMIN_PASSWORD (idempotente).
  async onModuleInit() {
    const email = process.env.ADMIN_EMAIL ? normalizeEmail(process.env.ADMIN_EMAIL) : '';
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (email && password) {
      if (password.length < 8) {
        this.log.warn('ADMIN_PASSWORD tem menos de 8 caracteres; admin NÃO criado');
      } else if (await this.prisma.user.findUnique({ where: { email } })) {
        this.log.log('admin já existe');
      } else {
        await this.prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), role: 'admin' } });
        this.log.log('admin criado');
      }
    }
    if ((await this.prisma.user.count()) === 0) {
      this.log.warn('API SEM USUÁRIO: defina ADMIN_EMAIL e ADMIN_PASSWORD; sem isso ninguém consegue entrar');
    }
  }

  async login(emailRaw: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('e-mail ou senha inválidos');
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { token, expiresIn: TOKEN_TTL_SECONDS, user: pub(user) };
  }

  async createUser(emailRaw: string, password: string, role: string) {
    const email = normalizeEmail(emailRaw);
    try {
      const u = await this.prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), role } });
      return pub(u);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('e-mail já cadastrado');
      throw e;
    }
  }

  list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }
}
