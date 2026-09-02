import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { LegalService } from './legal.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

class AcceptLegalDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];

  @IsOptional()
  @IsIn(['web', 'mobile', 'telegram'])
  source?: string;
}

/**
 * The signed-in half of legal documents. Reading the text stays public on
 * CatalogController's GET /legal — consent needs to know who is consenting.
 */
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.legal.pending(user.id);
  }

  @Post('accept')
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptLegalDto) {
    return this.legal.accept(user.id, dto);
  }
}
