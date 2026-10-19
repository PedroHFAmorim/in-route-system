import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { IsString } from 'class-validator';
import type { Response } from 'express';
import { TypesService } from './types.service';
import { BadRequestException } from '@nestjs/common';

class TypeDto {
  @IsString({ message: 'name é obrigatório' }) name: string;
}

@Controller('types')
export class TypesController {
  constructor(private readonly types: TypesService) {}

  @Get() list() { return this.types.list(); }

  @Post()
  async ensure(@Body() b: TypeDto, @Res({ passthrough: true }) res: Response) {
    const name = b.name.trim();
    if (!name) throw new BadRequestException('name é obrigatório');
    const { type, created } = await this.types.ensure(name);
    res.status(created ? 201 : 200);
    return type;
  }
}
