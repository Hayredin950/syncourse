import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  // Recommendations choose ids and ask this service to render the cards, so
  // there is one definition of a course summary on the whole site.
  exports: [CatalogService],
})
export class CatalogModule {}
