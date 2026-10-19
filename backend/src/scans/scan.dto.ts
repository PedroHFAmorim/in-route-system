import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Max, Min, ValidateNested,
} from 'class-validator';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class ReadingDto {
  // Aceita qualquer formato não vazio (BLE usa ids próprios); só normaliza para minúsculas.
  @Transform(lower) @IsString({ message: 'bssid deve ser texto' }) @IsNotEmpty({ message: 'bssid não pode ser vazio' }) bssid: string;
  @IsOptional() @IsString({ message: 'ssid deve ser texto' }) ssid?: string | null;
  @IsInt({ message: 'rssi deve ser inteiro' }) @Min(-127, { message: 'rssi deve estar entre -127 e 0' }) @Max(0, { message: 'rssi deve estar entre -127 e 0' }) rssi: number;
  @IsOptional() @IsInt({ message: 'frequency deve ser inteiro' }) frequency?: number | null;
}

export class MatchDto {
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsNumber() dist?: number | null;
  @IsOptional() @IsInt() common?: number | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsBoolean() sure?: boolean | null;
}

const num = (campo: string) => ({ message: `${campo} deve ser número ou null` });
const txt = (campo: string) => ({ message: `${campo} deve ser texto` });

export class ScanDto {
  @IsOptional() @IsString(txt('deviceId')) deviceId?: string | null;
  @IsOptional() @IsString(txt('platform')) platform?: string | null;
  @IsIn(['sample', 'locate', 'debug'], { message: 'kind deve ser sample, locate ou debug' }) kind: string;
  @IsOptional() @IsString(txt('placeId')) placeId?: string | null;
  @IsOptional() @IsString(txt('placeName')) placeName?: string | null;
  @IsOptional() @IsString(txt('blockId')) blockId?: string | null;
  @IsOptional() @IsString(txt('blockName')) blockName?: string | null;
  @IsOptional() @IsNumber({}, num('lat')) lat?: number | null;
  @IsOptional() @IsNumber({}, num('lng')) lng?: number | null;
  @IsOptional() @IsNumber({}, num('accuracy')) accuracy?: number | null;
  @IsOptional() @IsNumber({}, num('heading')) heading?: number | null;
  @IsOptional() @IsDateString({}, { message: 'startedAt deve ser data ISO' }) startedAt?: string | null;
  @IsOptional() @IsArray({ message: 'wifi deve ser lista' }) @ArrayMaxSize(300, { message: 'wifi aceita no máximo 300 itens' })
  @ValidateNested({ each: true }) @Type(() => ReadingDto) wifi?: ReadingDto[];
  @IsOptional() @IsArray({ message: 'ble deve ser lista' }) @ArrayMaxSize(300, { message: 'ble aceita no máximo 300 itens' })
  @ValidateNested({ each: true }) @Type(() => ReadingDto) ble?: ReadingDto[];
  @IsOptional() @ValidateNested() @Type(() => MatchDto) match?: MatchDto | null;
  @IsOptional() @IsString(txt('note')) note?: string | null;
}

export class ScanBatchDto {
  @IsArray({ message: 'scans deve ser lista' }) @ArrayMaxSize(50, { message: 'scans aceita no máximo 50 itens por lote' }) scans: unknown[];
}
