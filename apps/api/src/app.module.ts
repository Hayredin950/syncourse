import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { ResourcesModule } from './resources/resources.module';
import { ContentModule } from './content/content.module';
import { LibraryModule } from './library/library.module';
import { LegalModule } from './legal/legal.module';
import { ReviewsModule } from './reviews/reviews.module';
import { CollectionsModule } from './collections/collections.module';
import { PaymentsModule } from './payments/payments.module';
import { SearchModule } from './search/search.module';
import { DiscussionsModule } from './discussions/discussions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CirclesModule } from './circles/circles.module';
import { EmailModule } from './email/email.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { AdminModule } from './admin/admin.module';
import { TelegramModule } from './telegram/telegram.module';
import { TelegramIngestModule } from './telegram-ingest/telegram-ingest.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    ResourcesModule,
    ContentModule,
    LibraryModule,
    LegalModule,
    ReviewsModule,
    CollectionsModule,
    PaymentsModule,
    SearchModule,
    DiscussionsModule,
    NotificationsModule,
    CirclesModule,
    EmailModule,
    CloudinaryModule,
    AdminModule,
    TelegramModule,
    TelegramIngestModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
