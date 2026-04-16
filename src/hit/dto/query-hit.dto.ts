import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const HIT_STATUS_VALUES = [
  'RECEIVED',
  'QC_PENDING',
  'QC_APPROVED',
  'QC_REJECTED',
] as const;

export type HitStatusValue = (typeof HIT_STATUS_VALUES)[number];

export class QueryHitDto {
  @IsOptional()
  @IsIn(HIT_STATUS_VALUES)
  status?: HitStatusValue;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

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
