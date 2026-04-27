import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class BatchHitItemDto {
  @IsString()
  @IsNotEmpty()
  hitId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  usedQty: number;
}

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  gradeId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  condition?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  outwardPartyCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  requiredSize?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  od?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  thickness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  length?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  requiredQuantity: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchHitItemDto)
  hits: BatchHitItemDto[];
}
