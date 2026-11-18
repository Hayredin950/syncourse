import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
