import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQCTestEntryDto {
  @IsUUID()
  ruleId: string;

  @IsOptional()
  @IsDefined()
  observed?: string | number | boolean;

  @IsOptional()
  @IsObject()
  fieldObservations?: Record<string, string | number | boolean>;
}

export class CreateQCTestDto {
  @IsUUID()
  batchId: string;

  @IsUUID()
  customerId: string;

  @IsUUID()
  itemId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQCTestEntryDto)
  tests: CreateQCTestEntryDto[];
}
