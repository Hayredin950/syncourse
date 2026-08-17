import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CloudinaryService } from './cloudinary.service';

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
  constructor(private readonly cloudinary: CloudinaryService) {}

  /** Auth-protected (global JWT guard). Upload a cover/avatar and get back a CDN URL. */
  @Post('upload')
  async upload(@Body() dto: UploadImageDto) {
    if (!dto.dataUrl && !dto.imageUrl) {
      throw new BadRequestException('Provide either dataUrl (base64) or imageUrl');
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
