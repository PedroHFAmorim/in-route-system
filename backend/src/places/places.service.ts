import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newId } from '../common/ids';
import { PrismaService } from '../prisma.service';
import { PlaceDto } from './place.dto';
import { placeToResponse } from './place.mapper';

@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.place.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(placeToResponse);
  }

  async get(id: string) {
    const row = await this.prisma.place.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('lugar não encontrado');
    return placeToResponse(row);
  }

  // Upsert por id (o app gera o id no cliente e salva por id).
  async upsert(id: string, b: PlaceDto, userId?: string) {
    const name = b.name.trim();
    if (!name) throw new BadRequestException('name é obrigatório');
    const data = {
      name,
      typeId: b.typeId || null,
      lat: b.lat ?? null,
      lng: b.lng ?? null,
      address: b.address || null,
      map: (b.map ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
    };
    const row = await this.prisma.place.upsert({
      where: { id },
      create: { id, ...data, userId: userId ?? null, ...(b.createdAt ? { createdAt: new Date(b.createdAt) } : {}) },
      update: data,
    });
    return placeToResponse(row);
  }

  async create(b: PlaceDto, userId?: string) {
    return this.upsert(b.id || newId(), b, userId);
  }

  async remove(id: string) {
    const r = await this.prisma.place.deleteMany({ where: { id } });
    if (!r.count) throw new NotFoundException('lugar não encontrado');
  }
}
