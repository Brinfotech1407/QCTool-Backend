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

export class CreateHitDto {
  @IsOptional()
  @IsString()
  hitNumber?: string;

  @IsString()
  @IsNotEmpty()
  gradeId: string;

  @Type(() => Number)
  @IsNumber()
  od: number;

  @Type(() => Number)
  @IsNumber()
  thickness: number;

  @Type(() => Number)
  @IsNumber()
  length: number;

  @IsOptional()
  @IsIn(['meter', 'feet'])
  lengthUnit?: 'meter' | 'feet';

  @IsString()
  @IsNotEmpty()
  condition: string;

  @Type(() => Number)
  @IsNumber()
  weight: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  inwardPartyName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  inwardPartyTcNumber?: string;

  @IsObject()
  chemicalComposition: Record<string, unknown>;

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
}
