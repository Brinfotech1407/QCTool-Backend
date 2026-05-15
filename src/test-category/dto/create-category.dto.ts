import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  standardId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}
