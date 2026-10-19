import { IsDateString, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class PlaceDto {
  @IsOptional() @IsString({ message: 'id deve ser texto' }) id?: string;
  @IsString({ message: 'name é obrigatório' }) name: string;
  @IsOptional() @IsString({ message: 'typeId deve ser texto' }) typeId?: string | null;
  @IsOptional() @IsNumber({}, { message: 'lat deve ser número ou null' }) lat?: number | null;
  @IsOptional() @IsNumber({}, { message: 'lng deve ser número ou null' }) lng?: number | null;
  @IsOptional() @IsString({ message: 'address deve ser texto' }) address?: string | null;
  @IsOptional() @IsDateString({}, { message: 'createdAt deve ser data ISO' }) createdAt?: string;
  @IsOptional() @IsObject({ message: 'map deve ser objeto ou null' }) map?: Record<string, unknown> | null;
}
