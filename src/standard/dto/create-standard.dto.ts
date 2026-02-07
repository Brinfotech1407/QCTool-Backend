import { IsNotEmpty, IsString } from 'class-validator';

export class CreateStandardDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
