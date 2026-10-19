import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async stats() {
    const [places, types, scans, readings, distinct, kinds, byPlace, last] = await Promise.all([
      this.prisma.place.count(),
      this.prisma.placeType.count(),
      this.prisma.scan.count(),
      this.prisma.scanReading.count(),
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT "bssid") AS n FROM "ScanReading"`,
      this.prisma.scan.groupBy({ by: ['kind'], _count: { _all: true } }),
      this.prisma.$queryRaw<{ placeId: string | null; placeName: string | null; scans: bigint; readings: bigint; lastAt: Date }[]>`
        SELECT "placeId", MAX("placeName") AS "placeName", COUNT(*) AS scans,
               COALESCE(SUM("wifiCount" + "bleCount"), 0) AS readings, MAX("createdAt") AS "lastAt"
        FROM "Scan" GROUP BY "placeId" ORDER BY "lastAt" DESC`,
      this.prisma.scan.aggregate({ _max: { createdAt: true } }),
    ]);
    const byKind: Record<string, number> = { sample: 0, locate: 0 };
    for (const k of kinds) byKind[k.kind] = k._count._all;
    return {
      places, types, scans, readings,
      distinctBssids: Number(distinct[0]?.n ?? 0),
      byKind,
      byPlace: byPlace.map((p) => ({
        placeId: p.placeId, placeName: p.placeName, scans: Number(p.scans), readings: Number(p.readings), lastAt: p.lastAt.toISOString(),
      })),
      lastScanAt: last._max.createdAt?.toISOString() ?? null,
    };
  }
}
