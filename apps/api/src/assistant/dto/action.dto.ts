import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** "Create a course called …" — a sentence, not a form. */
export class ProposeActionDto {
  @IsString()
  @MinLength(3, { message: 'Describe what to create or change.' })
  @MaxLength(600)
  instruction!: string;
}

/** The token returned by `propose`, echoed back only after a human taps Confirm. */
export class ConfirmActionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4_000)
  token!: string;
}

/** Optional scope, kept for parity with AskDto so the chat can send its thread. */
export class ActionScopeDto {
  @IsOptional()
  @IsString()
  courseSlug?: string;
}
