import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStaff(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isStaff: true } });
    if (!user?.isStaff) throw new ForbiddenException('Staff access required');
  }

  /** Update a course cover (thumbnail + optional banner) — staff only. */
  async updateCourseCover(
    userId: string,
    slug: string,
    body: { thumbnailUrl?: string; bannerUrl?: string },
  ) {
    await this.assertStaff(userId);

    if (body.thumbnailUrl === undefined && body.bannerUrl === undefined) {
      throw new BadRequestException('Provide thumbnailUrl and/or bannerUrl');
    }
    const url = body.thumbnailUrl ?? body.bannerUrl;
    if (url && !/^https?:\/\//.test(url)) {
      throw new BadRequestException('Image URLs must start with http(s)://');
    }

    const course = await this.prisma.course.findUnique({ where: { slug } });
    if (!course) throw new NotFoundException('Course not found');

    const updated = await this.prisma.course.update({
      where: { slug },
      data: {
        ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl || null } : {}),
        ...(body.bannerUrl !== undefined ? { bannerUrl: body.bannerUrl || null } : {}),
      },
      select: { slug: true, title: true, thumbnailUrl: true, bannerUrl: true },
    });
    return updated;
  }
}
