import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ScanBatchDto, ScanDto } from './scan.dto';
import { ScansService } from './scans.service';

@Controller('scans')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  create(@Body() dto: ScanDto, @Req() req: Request, @Headers('x-device-id') dev?: string) {
    if (!dto.deviceId && dev) dto.deviceId = dev;
    const raw = dev && !req.body?.deviceId ? { ...req.body, deviceId: dev } : req.body;
    return this.scans.create(dto, raw, (req as any).user?.id);
  }

  @Post('batch')
  batch(@Body() b: ScanBatchDto, @Req() req: Request, @Headers('x-device-id') dev?: string) {
    return this.scans.createBatch(b.scans, dev, (req as any).user?.id);
  }

  @Get()
  list(@Query() q: Record<string, string>) { return this.scans.list(q); }

  // Declarado antes de :id para não ser capturado por ele.
  @Get('export')
  async export(@Query() q: Record<string, string>, @Res() res: Response) {
    const format = q.format ?? 'ndjson';
    if (format !== 'json' && format !== 'ndjson') throw new BadRequestException('format deve ser json ou ndjson');
    const since = this.scans.parseSince(q.since);
    const nd = format === 'ndjson';

    let closed = false;
    res.on('close', () => { closed = true; });
    const write = async (s: string) => {
      if (!res.write(s)) await new Promise<void>((ok) => res.once('drain', ok).once('close', ok));
    };

    res.status(200).setHeader('Content-Type', nd ? 'application/x-ndjson; charset=utf-8' : 'application/json; charset=utf-8');
    try {
      if (!nd) await write('[');
      let first = true;
      for await (const s of this.scans.exportIter(q.placeId || undefined, since)) {
        if (closed) return;
        const json = JSON.stringify(s);
        await write(nd ? json + '\n' : (first ? '' : ',') + json);
        first = false;
      }
      if (!nd) await write(']');
    } catch (e) {
      console.error('Falha no export:', e);
    } finally {
      res.end();
    }
  }

  @Get(':id') get(@Param('id') id: string) { return this.scans.get(id); }
}
