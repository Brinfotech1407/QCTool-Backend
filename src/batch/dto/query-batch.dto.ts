import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const BATCH_STATUS_VALUES = [
  'CREATED',
  'QC_PENDING',
  'QC_IN_PROGRESS',
  'QC_COMPLETED',
  'TC_GENERATED',
] as const;

export type BatchStatusValue = (typeof BATCH_STATUS_VALUES)[number];

export class QueryBatchDto {
  @IsOptional()
  @IsIn(BATCH_STATUS_VALUES)
  status?: BatchStatusValue;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
