import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'syncourse-api', time: new Date().toISOString() };
  }

  @Get('home')
  home(@CurrentUser() user?: AuthUser) {
    return this.catalog.home(user?.id);
  }

  @Get('categories')
  categories() {
    return this.catalog.categories();
  }

  @Get('categories/:slug/courses')
  categoryCourses(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.catalog.categoryCourses(slug, user?.id);
  }

  @Get('courses')
  browse(
    @CurrentUser() user?: AuthUser,
    @Query('category') category?: string,
    @Query('level') level?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('minRating') minRating?: string,
    @Query('contentType') contentType?: string,
    @Query('organization') organization?: string,
    @Query('lecturer') lecturer?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.catalog.browse({
      category,
      level,
      q,
      sort,
      minRating: minRating ? Number(minRating) : undefined,
      contentType,
      organization,
      lecturer,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    }, user?.id);
  }

  @Get('courses/:slug')
  courseDetail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.catalog.courseDetail(slug, user?.id);
  }

  @Get('lecturers')
  lecturers() {
    return this.catalog.lecturers();
  }

  @Get('lecturers/:slug')
  lecturerDetail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.catalog.lecturerDetail(slug, user?.id);
  }

  @Get('organizations')
  organizations() {
    return this.catalog.organizations();
  }

  @Get('organizations/:slug')
  organizationDetail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.catalog.organizationDetail(slug, user?.id);
  }

  @Get('levels')
  levels() {
    return this.catalog.levels();
  }

  @Get('learning-paths')
  learningPaths() {
    return this.catalog.learningPaths();
  }

  @Get('learning-paths/:id')
  learningPath(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.catalog.learningPathDetail(id, user?.id);
  }

  @Get('legal')
  legal(@Query('type') type?: string) {
    return this.catalog.legalDocuments(type);
  }

  @Get('app-versions')
  appVersions(@Query('limit') limit?: string) {
    return this.catalog.appVersions(limit ? Number(limit) : undefined);
  }
}
