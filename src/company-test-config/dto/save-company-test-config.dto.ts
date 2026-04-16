import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveCompanyTestItemDto {
  @IsString()
  @IsNotEmpty()
  testId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sequence: number;
}

export class SaveCompanyTestConfigDto {
  @IsString()
  @IsNotEmpty()
  standardId: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaveCompanyTestItemDto)
  tests: SaveCompanyTestItemDto[];
}
