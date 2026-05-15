import { IsInt, Min } from 'class-validator';

export class UpdateCategorySequenceDto {
  @IsInt()
  @Min(0)
  sequence: number;
}
