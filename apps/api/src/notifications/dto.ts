import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListNotificationsDto {
  // Capped server-side, like every other list (DEVELOPMENT_GUIDE.md). A bell
  // shows the recent ones; the board is where the work is.
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 30;
}

export class MarkNotificationsReadDto {
  /** The ones this reader has seen. Bounded because it arrives from a list that
   *  is itself bounded — a longer array is not a bell being cleared. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids!: string[];
}
