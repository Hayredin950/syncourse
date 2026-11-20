import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TikurPayClient } from './tikurpay.client';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, TikurPayClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
