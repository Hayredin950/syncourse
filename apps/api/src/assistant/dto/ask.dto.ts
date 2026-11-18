import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** One earlier turn, sent by the client so a follow-up keeps its thread. */
export class HistoryTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  content!: string;
}

export class AskDto {
  /** A sentence, not a search box: the retrieval needs enough words to ground on. */
  @IsString()
  @MinLength(3, { message: 'Ask a question with at least a few words.' })
  @MaxLength(500, { message: 'Keep the question under 500 characters.' })
  question!: string;

  /** Optional: ask inside one course ("what does this lesson assume I know?"). */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  courseSlug?: string;

  /**
   * Optional conversation, oldest first. The client owns the thread — there is
   * no session table to keep warm on a free database — so it sends the last few
   * turns back and the service keeps only what fits the prompt budget.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => HistoryTurnDto)
  history?: HistoryTurnDto[];
}
