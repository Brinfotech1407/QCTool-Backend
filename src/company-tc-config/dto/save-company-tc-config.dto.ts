import { IsOptional, IsString } from 'class-validator';

export class SaveCompanyTcConfigDto {
  @IsString()
  companyName: string;

  @IsOptional()
  @IsString()
  companyAddress?: string | null;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  isoHallmarkUrl?: string | null;
}
