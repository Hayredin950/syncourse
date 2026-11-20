import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ResourcesModule } from '../resources/resources.module';

@Module({
  imports: [ResourcesModule],
  controllers: [SearchController],
  providers: [SearchService],
  // The assistant reuses the exact same ranking as the search page, so a
  // question lands on the courses a search for it would.
  exports: [SearchService],
})
export class SearchModule {}
