import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateBatchItemDto {
  @Type(() => Number)
  @IsNumber()
  od: number;

  @Type(() => Number)
  @IsNumber()
  wt: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  qty: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  pcs: number;

  @IsString()
  @IsNotEmpty()
  condition: string;

  @Type(() => Number)
  @IsNumber()
  length: number;
}

export class CreateBatchCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBatchItemDto)
  items: CreateBatchItemDto[];
}

export class CreateBatchSelectedHitDto {
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
  batchNumber: string;

  @IsString()
  @IsNotEmpty()
  grade: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Smooth Copper Tube', 'Smooth Copper Coil'])
  tubeType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  totalQty: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBatchCustomerDto)
  customers: CreateBatchCustomerDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBatchSelectedHitDto)
  selectedHits?: CreateBatchSelectedHitDto[];
}
