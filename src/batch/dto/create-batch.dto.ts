import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  outwardPartyCode: string;

  @IsString()
  @IsNotEmpty()
  requiredSize: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  requiredQuantity: number;

  @IsString()
  @IsNotEmpty()
  hitId: string;
}
