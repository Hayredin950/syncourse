// One-off maintenance script: drop picsum placeholder images everywhere so
// clients render branded covers / initial avatars until real uploads exist.
// Run from apps/api: node scripts/clear-placeholder-covers.cjs
require("dotenv").config({ path: "../.env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const courses = await prisma.course.updateMany({
    where: { thumbnailUrl: { contains: "picsum" } },
    data: { thumbnailUrl: null, bannerUrl: null },
  });
  const lecturers = await prisma.lecturer.updateMany({
    where: { photoUrl: { contains: "picsum" } },
    data: { photoUrl: null },
  });
  const organizations = await prisma.organization.updateMany({
    where: { logoUrl: { contains: "picsum" } },
    data: { logoUrl: null },
  });
  const paths = await prisma.learningPath.updateMany({
    where: { coverUrl: { contains: "picsum" } },
    data: { coverUrl: null },
  });
  console.log(
    `Cleared placeholders — courses: ${courses.count}, lecturers: ${lecturers.count}, organizations: ${organizations.count}, paths: ${paths.count}`,
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
