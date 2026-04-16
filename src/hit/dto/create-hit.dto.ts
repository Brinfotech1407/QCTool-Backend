import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Min,
} from 'class-validator';

export class CreateHitDto {
  @IsString()
  @IsNotEmpty()
  inwardPartyName: string;

  @IsString()
  @IsNotEmpty()
  inwardPartyTcNumber: string;

  @IsObject()
  chemicalComposition: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  size: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  quantity: number;

  @Type(() => Date)
  @IsDate()
  inwardDate: Date;
}
