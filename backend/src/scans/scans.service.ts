import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { keep } from '../common/keep';
import { PrismaService } from '../prisma.service';
import { ScanDto } from './scan.dto';

const EXPORT_PAGE = 200;

export type ScanFilter = { placeId?: string; blockId?: string; kind?: string; deviceId?: string };

@Injectable()
export class ScansService {
  private readonly log = new Logger('Scans');
  constructor(private readonly prisma: PrismaService) {}

  // Grava Scan + todas as leituras (inclusive as descartadas, kept=false) numa transação.
  async create(dto: ScanDto, raw: unknown, userId?: string): Promise<{ id: string; wifi: number; ble: number }> {
    const wifi = dto.wifi ?? [];
    const ble = dto.ble ?? [];
    const m = dto.match;
    const id = await this.prisma.$transaction(async (tx) => {
      const scan = await tx.scan.create({
        data: {
          userId: userId ?? null,
          deviceId: dto.deviceId ?? null,
          platform: dto.platform ?? null,
          kind: dto.kind,
          placeId: dto.placeId ?? null,
          placeName: dto.placeName ?? null,
          blockId: dto.blockId ?? null,
          blockName: dto.blockName ?? null,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          accuracy: dto.accuracy ?? null,
          heading: dto.heading ?? null,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
          wifiCount: wifi.length,
          bleCount: ble.length,
          matchName: m?.name ?? null,
          matchDist: m?.dist ?? null,
          matchCommon: m?.common ?? null,
          matchSource: m?.source ?? null,
          matchSure: m?.sure ?? null,
          note: dto.note ?? null,
          raw: (raw ?? {}) as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      const rows = [
        ...wifi.map((r) => ({ kind: 'wifi', r })),
        ...ble.map((r) => ({ kind: 'ble', r })),
      ].map(({ kind, r }) => ({
        scanId: scan.id,
        kind,
        bssid: r.bssid,
        ssid: r.ssid ?? null,
        rssi: r.rssi,
        frequency: r.frequency ?? null,
        kept: keep(r),
      }));
      if (rows.length) await tx.scanReading.createMany({ data: rows });
      return scan.id;
    });
    return { id, wifi: wifi.length, ble: ble.length };
  }

  // Lote da fila offline: ids na mesma ordem/tamanho de `scans`; null nos rejeitados.
  async createBatch(items: unknown[], headerDeviceId?: string, userId?: string) {
    const ids: (string | null)[] = [];
    for (const raw of items) {
      try {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('scan inválido');
        const dto = plainToInstance(ScanDto, raw);
        const errs = await validate(dto, { whitelist: true });
        if (errs.length) throw new Error(errs.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; '));
        if (!dto.deviceId && headerDeviceId) dto.deviceId = headerDeviceId;
        ids.push((await this.create(dto, raw, userId)).id);
      } catch (e: any) {
        this.log.warn(`scan do lote rejeitado: ${e?.message ?? e}`);
        ids.push(null);
      }
    }
    return { ids, failed: ids.filter((i) => i === null).length };
  }

  private where(f: ScanFilter): Prisma.ScanWhereInput {
    return {
      ...(f.placeId ? { placeId: f.placeId } : {}),
      ...(f.blockId ? { blockId: f.blockId } : {}),
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.deviceId ? { deviceId: f.deviceId } : {}),
    };
  }

  private parseDate(v: string | undefined, campo: string): Date | undefined {
    if (!v) return undefined;
    const d = new Date(v);
    if (isNaN(d.getTime())) throw new BadRequestException(`${campo} deve ser data ISO`);
    return d;
  }

  async list(f: ScanFilter & { limit?: string; before?: string }) {
    let limit = f.limit === undefined || f.limit === '' ? 50 : Number(f.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new BadRequestException('limit deve ser inteiro positivo');
    limit = Math.min(limit, 200);
    const before = this.parseDate(f.before, 'before');
    const scans = await this.prisma.scan.findMany({
      where: { ...this.where(f), ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      omit: { raw: true },
    });
    const nextBefore = scans.length === limit ? scans[scans.length - 1].createdAt.toISOString() : null;
    return { scans, nextBefore };
  }

  async get(id: string) {
    const scan = await this.prisma.scan.findUnique({ where: { id }, include: { readings: true } });
    if (!scan) throw new NotFoundException('scan não encontrado');
    return scan;
  }

  // Itera todos os scans (com readings) por cursor, sem carregar tudo na memória.
  async *exportIter(placeId: string | undefined, since: Date | undefined) {
    const where: Prisma.ScanWhereInput = { ...(placeId ? { placeId } : {}), ...(since ? { createdAt: { gte: since } } : {}) };
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.scan.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: EXPORT_PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { readings: true },
      });
      for (const s of page) yield s;
      if (page.length < EXPORT_PAGE) return;
      cursor = page[page.length - 1].id;
    }
  }

  parseSince(v?: string) { return this.parseDate(v, 'since'); }
}
