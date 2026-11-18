import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { RetrievalService } from './retrieval/retrieval.service';

@Module({
  // The assistant answers with the same ranking as the search page, rather
  // than a second definition of relevance.
  imports: [SearchModule],
  controllers: [AssistantController],
  providers: [AssistantService, RetrievalService],
})
export class AssistantModule {}
