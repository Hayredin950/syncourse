import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContentModule } from './content/content.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { ReviewsModule } from './reviews/reviews.module';
import { CollectionsModule } from './collections/collections.module';
import { PaymentsModule } from './payments/payments.module';
import { SearchModule } from './search/search.module';
import { DiscussionsModule } from './discussions/discussions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmailModule } from './email/email.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    ContentModule,
    EnrollmentModule,
    ReviewsModule,
    CollectionsModule,
    PaymentsModule,
    SearchModule,
    DiscussionsModule,
    NotificationsModule,
    EmailModule,
    CloudinaryModule,
  ],
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
