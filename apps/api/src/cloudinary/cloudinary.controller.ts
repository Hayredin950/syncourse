import { BadRequestException, ForbiddenException, Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CloudinaryService } from './cloudinary.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

class UploadImageDto {
  @IsOptional()
  @IsString()
  dataUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

@Controller('images')
export class CloudinaryController {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly prisma: PrismaService,
  ) {}

  /** Auth-protected (global JWT guard). Upload a cover/avatar and get back a CDN URL. */
  @Post('upload')
  async upload(@CurrentUser() user: AuthUser, @Body() dto: UploadImageDto) {
    if (!dto.dataUrl && !dto.imageUrl) {
      throw new BadRequestException('Provide either dataUrl (base64) or imageUrl');
    }
    // A pasted URL makes this API fetch on the caller's behalf. Keep that
    // staff-only: it is an admin authoring convenience, while avatars (the
    // other caller) always arrive as dataUrl bytes from the client.
    if (dto.imageUrl) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { isStaff: true },
      });
      if (!dbUser?.isStaff) throw new ForbiddenException('Staff access required');
    }
    try {
      const result = dto.dataUrl
        ? await this.cloudinary.uploadDataUrl(dto.dataUrl)
        : await this.cloudinary.uploadFromUrl(dto.imageUrl as string);
      return { url: result.url, publicId: result.publicId };
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Upload failed');
    }
  }
}
