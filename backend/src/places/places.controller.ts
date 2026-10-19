import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { PlaceDto } from './place.dto';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get() list() { return this.places.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.places.get(id); }
  @Post() create(@Body() b: PlaceDto, @Req() req: any) { return this.places.create(b, req.user?.id); }
  @Put(':id') @HttpCode(200) put(@Param('id') id: string, @Body() b: PlaceDto, @Req() req: any) { return this.places.upsert(id, b, req.user?.id); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) { return this.places.remove(id); }
}
