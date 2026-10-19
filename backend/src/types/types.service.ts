import { Injectable } from '@nestjs/common';
import { newId } from '../common/ids';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TypesService {
  constructor(private readonly prisma: PrismaService) {}

  list() { return this.prisma.placeType.findMany({ orderBy: { name: 'asc' } }); }

  // Idempotente, sem diferenciar maiúsculas/minúsculas.
  async ensure(name: string): Promise<{ type: { id: string; name: string }; created: boolean }> {
    const find = () => this.prisma.placeType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    const existing = await find();
    if (existing) return { type: existing, created: false };
    try {
      return { type: await this.prisma.placeType.create({ data: { id: newId(), name } }), created: true };
    } catch (e: any) {
      if (e?.code === 'P2002') { // corrida: outro request criou antes
        const again = await find();
        if (again) return { type: again, created: false };
      }
      throw e;
    }
  }
}
