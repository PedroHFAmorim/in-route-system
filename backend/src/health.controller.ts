import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators';
import { PrismaService } from './prisma.service';
import { placeToResponse } from './places/place.mapper';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public() @Get('health') health() { return { ok: true }; }

  // Tudo que o app precisa ao abrir, em um round-trip.
  @Get('bootstrap')
  async bootstrap() {
    const [places, types] = await Promise.all([
      this.prisma.place.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.placeType.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return { places: places.map(placeToResponse), types };
  }
}
