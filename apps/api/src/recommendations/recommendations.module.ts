import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

/**
 * Recommendations read the catalogue and render cards through CatalogService.
 * The dependency points one way (recommendations → catalog), which is why the
 * catalog never imports this module.
 */
@Module({
  imports: [CatalogModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
