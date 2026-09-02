import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminService } from './admin.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

class AdminLessonDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  durationSec?: number;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileLabel?: string;

  @IsOptional()
  @IsNumber()
  fileSizeMb?: number;
}

class AdminSectionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminLessonDto)
  lessons?: AdminLessonDto[];
}

class AdminCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryNames?: string[];

  @IsOptional()
  @IsString()
  levelName?: string;

  @IsOptional()
  @IsString()
  lecturerName?: string;

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsNumber()
  originalPrice?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audience?: string[];

  @IsOptional()
  @IsString()
  prerequisites?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  previewVideoUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminSectionDto)
  sections?: AdminSectionDto[];
}

class UpdateCoverDto {
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;
}

class AdminLecturerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

class AdminPublisherDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  orgType?: string; // university | company | publisher

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class AdminCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

class AdminPaymentActionDto {
  @IsString()
  status: 'approved' | 'rejected';
}

class AdminResourceMediaDto {
  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsNumber()
  fileSizeMb?: number;

  @IsOptional()
  @IsString()
  caption?: string;
}

class AdminResourceDto {
  @IsOptional()
  @IsIn(['cheat-sheet', 'roadmap', 'note'])
  type?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  bodyMd?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @IsString()
  lecturerName?: string;

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsInt()
  readMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminResourceMediaDto)
  media?: AdminResourceMediaDto[];
}

class AdminLegalDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  bodyMd?: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsBoolean()
  requiresAcceptance?: boolean;

  @IsOptional()
  @IsString()
  effectiveAt?: string;

  @IsOptional()
  @IsBoolean()
  minorEdit?: boolean;
}

/** Which Cloudinary bucket the browser is about to upload into. */
class SignUploadDto {
  @IsIn(['image', 'video', 'file'])
  kind: 'image' | 'video' | 'file';
}

class TelegramLinkDto {
  @IsString()
  url: string;
}

class TelegramImportDto {
  @IsString()
  channel: string;

  @IsInt()
  from: number;

  @IsInt()
  to: number;
}

class BroadcastDto {
  @IsString()
  text: string;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.admin.stats(user.id);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthUser) {
    return this.admin.activity(user.id);
  }

  @Get('courses')
  list(@CurrentUser() user: AuthUser) {
    return this.admin.listCourses(user.id);
  }

  @Get('courses/:slug')
  get(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.getCourse(user.id, slug);
  }

  @Post('courses')
  create(@CurrentUser() user: AuthUser, @Body() dto: AdminCourseDto) {
    return this.admin.createCourse(user.id, dto);
  }

  @Patch('courses/:slug')
  update(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: AdminCourseDto) {
    return this.admin.updateCourse(user.id, slug, dto);
  }

  @Delete('courses/:slug')
  remove(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.deleteCourse(user.id, slug);
  }

  /** Staff-only. Attach a Cloudinary (or any https) image URL as the course cover. */
  @Post('courses/:slug/cover')
  updateCover(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: UpdateCoverDto) {
    return this.admin.updateCourseCover(user.id, slug, dto);
  }

  /** Staff-only. All users with admin/plan metadata — powers the Users tab. */
  @Get('users')
  listUsers(@CurrentUser() user: AuthUser) {
    return this.admin.listUsers(user.id);
  }

  /** Staff-only. Promote or demote a user to/from staff (admins can't demote themselves). */
  @Patch('users/:id/role')
  setUserRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { isStaff: boolean },
  ) {
    return this.admin.setUserRole(user.id, id, body);
  }

  // --- Reviews moderation ---

  @Get('reviews')
  listReviews(@CurrentUser() user: AuthUser) {
    return this.admin.listReviews(user.id);
  }

  @Delete('reviews/:id')
  removeReview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.removeReview(user.id, id);
  }

  // --- Payments queue ---

  @Get('payments')
  listPayments(@CurrentUser() user: AuthUser) {
    return this.admin.listPayments(user.id);
  }

  @Patch('payments/:id')
  reviewPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminPaymentActionDto,
  ) {
    return this.admin.reviewPayment(user.id, id, dto.status);
  }

  // --- Lecturers / Publishers / Categories management ---

  @Get('lecturers')
  listLecturers(@CurrentUser() user: AuthUser) {
    return this.admin.listLecturers(user.id);
  }

  @Post('lecturers')
  createLecturer(@CurrentUser() user: AuthUser, @Body() dto: AdminLecturerDto) {
    return this.admin.createLecturer(user.id, dto);
  }

  @Patch('lecturers/:id')
  updateLecturer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminLecturerDto,
  ) {
    return this.admin.updateLecturer(user.id, id, dto);
  }

  @Delete('lecturers/:id')
  removeLecturer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.removeLecturer(user.id, id);
  }

  @Get('publishers')
  listPublishers(@CurrentUser() user: AuthUser) {
    return this.admin.listPublishers(user.id);
  }

  @Post('publishers')
  createPublisher(@CurrentUser() user: AuthUser, @Body() dto: AdminPublisherDto) {
    return this.admin.createPublisher(user.id, dto);
  }

  @Patch('publishers/:id')
  updatePublisher(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminPublisherDto,
  ) {
    return this.admin.updatePublisher(user.id, id, dto);
  }

  @Delete('publishers/:id')
  removePublisher(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.removePublisher(user.id, id);
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AuthUser) {
    return this.admin.listCategories(user.id);
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: AdminCategoryDto) {
    return this.admin.createCategory(user.id, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminCategoryDto,
  ) {
    return this.admin.updateCategory(user.id, id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.removeCategory(user.id, id);
  }

  // -----------------------------------------------------------------
  // Resources — cheat-sheets, roadmaps, notes
  // -----------------------------------------------------------------

  @Get('resources')
  listResources(@CurrentUser() user: AuthUser) {
    return this.admin.listResources(user.id);
  }

  @Get('resources/:slug')
  getResource(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.getResource(user.id, slug);
  }

  @Post('resources')
  createResource(@CurrentUser() user: AuthUser, @Body() dto: AdminResourceDto) {
    return this.admin.createResource(user.id, dto);
  }

  @Patch('resources/:slug')
  updateResource(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: AdminResourceDto,
  ) {
    return this.admin.updateResource(user.id, slug, dto);
  }

  /** Soft delete, and the same call restores it. */
  @Delete('resources/:slug')
  removeResource(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.deleteResource(user.id, slug);
  }

  @Get('legal')
  listLegal(@CurrentUser() user: AuthUser) {
    return this.admin.listLegal(user.id);
  }

  @Post('legal')
  createLegal(@CurrentUser() user: AuthUser, @Body() dto: AdminLegalDto) {
    return this.admin.createLegal(user.id, dto);
  }

  @Patch('legal/:type')
  updateLegal(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: AdminLegalDto,
  ) {
    return this.admin.updateLegal(user.id, type, dto);
  }

  // -----------------------------------------------------------------
  // Direct uploads
  // -----------------------------------------------------------------

  /**
   * Staff-only. Signature for a browser-to-Cloudinary upload, so a video or a
   * lesson attachment never has to fit through this API's 15 MB JSON body.
   */
  @Post('uploads/sign')
  signUpload(@CurrentUser() user: AuthUser, @Body() dto: SignUploadDto) {
    return this.admin.signUpload(user.id, dto.kind);
  }

  // -----------------------------------------------------------------
  // Telegram — the bot's file commands, from the console
  // -----------------------------------------------------------------

  /** Staff-only. Bot health, this operator's pairing state and the connect link. */
  @Get('telegram')
  telegram(@CurrentUser() user: AuthUser) {
    return this.admin.telegramConsole(user.id);
  }

  /** Staff-only. `/broadcast` — reaches accounts that completed pairing. */
  @Post('telegram/broadcast')
  broadcast(@CurrentUser() user: AuthUser, @Body() dto: BroadcastDto) {
    return this.admin.broadcastTelegram(user.id, dto.text);
  }

  /** Staff-only. The files attached to a course, grouped into modules. */
  @Get('courses/:slug/telegram')
  courseFiles(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.courseTelegramFiles(user.id, slug);
  }

  /** Staff-only. `/link <t.me link>` — attach one file by its message link. */
  @Post('courses/:slug/telegram/link')
  linkFile(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: TelegramLinkDto,
  ) {
    return this.admin.attachTelegramLink(user.id, slug, dto.url);
  }

  /** Staff-only. Attach whatever the operator last forwarded to the bot. */
  @Post('courses/:slug/telegram/forwarded')
  linkForwarded(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.attachForwardedFile(user.id, slug);
  }

  /** Staff-only. `/import <channel> <from>-<to>` — bulk attach a message range. */
  @Post('courses/:slug/telegram/import')
  importFiles(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: TelegramImportDto,
  ) {
    return this.admin.importTelegramRange(user.id, slug, dto);
  }

  /** Staff-only. Send the course's files to the operator's own DM. */
  @Post('courses/:slug/telegram/test')
  testDelivery(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.testTelegramDelivery(user.id, slug);
  }

  /** Staff-only. Detach every file from the course. */
  @Delete('courses/:slug/telegram')
  unlinkAll(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.removeTelegramFile(user.id, slug);
  }

  /** Staff-only. Detach one file. */
  @Delete('courses/:slug/telegram/:linkId')
  unlinkOne(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('linkId') linkId: string,
  ) {
    return this.admin.removeTelegramFile(user.id, slug, linkId);
  }
}
