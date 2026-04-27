import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { HIT_STATUS_VALUES, type HitStatusValue } from './query-hit.dto';

export class UpdateHitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  inwardPartyName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  inwardPartyTcNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  size?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  quantity?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  inwardDate?: Date;

  @IsOptional()
  @IsIn(HIT_STATUS_VALUES)
  status?: HitStatusValue;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  gradeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  od?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  thickness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  length?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  condition?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsObject()
  chemicalComposition?: Record<string, unknown>;
}
