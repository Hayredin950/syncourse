import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  // Cloudinary signs browser-direct uploads; Telegram backs the file-linking
  // console, so the bot's commands and the web share one implementation.
  imports: [CloudinaryModule, TelegramModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
