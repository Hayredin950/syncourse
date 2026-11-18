import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramIngestModule } from '../telegram-ingest/telegram-ingest.module';
import { AssistantActionsController, AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantActionsService } from './actions.service';
import { RetrievalService } from './retrieval/retrieval.service';

@Module({
  // The assistant answers with the same ranking as the search page, rather
  // than a second definition of relevance. The write path borrows the bot's
  // file-linking and the watcher's approval, so an action from chat produces
  // exactly what the same action in Telegram would.
  imports: [SearchModule, TelegramModule, TelegramIngestModule],
  controllers: [AssistantController, AssistantActionsController],
  providers: [AssistantService, RetrievalService, AssistantActionsService],
})
export class AssistantModule {}
