// One-off maintenance script: drop picsum placeholder covers so clients
// render branded gradient covers until real uploads exist.
// Run from apps/api: node scripts/clear-placeholder-covers.cjs
require("dotenv").config({ path: "../.env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const res = await prisma.course.updateMany({
    where: { thumbnailUrl: { contains: "picsum" } },
    data: { thumbnailUrl: null, bannerUrl: null },
  });
  console.log(`Cleared placeholder covers on ${res.count} courses`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
