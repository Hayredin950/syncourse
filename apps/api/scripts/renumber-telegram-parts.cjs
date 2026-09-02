// One-off maintenance script: give every attached Telegram file a real part
// number.
//
// `TelegramCourseLink.partIndex` defaults to 1 and only `/import` ever set it,
// so courses built by attaching ZIPs one at a time ended up with every row
// claiming to be part 1 — three files, three identical "Part 1" labels on the
// course page. saveLink() now numbers new rows as it inserts them; this fixes
// the rows that predate that.
//
// Numbering is per (course, module) in delivery order, so nothing is reordered
// and nothing but the label changes. Idempotent — safe to re-run.
//
// Run from apps/api: node scripts/renumber-telegram-parts.cjs
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.telegramCourseLink.findMany({
    orderBy: [{ courseId: "asc" }, { moduleOrder: "asc" }, { partIndex: "asc" }, { createdAt: "asc" }],
    select: { id: true, courseId: true, moduleTitle: true, partIndex: true, fileName: true },
  });

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.courseId}::${r.moduleTitle ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let changed = 0;
  for (const group of groups.values()) {
    for (const [i, r] of group.entries()) {
      if (r.partIndex === i + 1) continue;
      await prisma.telegramCourseLink.update({ where: { id: r.id }, data: { partIndex: i + 1 } });
      changed++;
      console.log(`  part ${r.partIndex} → ${i + 1}  ${r.fileName ?? r.id}`);
    }
  }

  console.log(
    `Renumbered ${changed} of ${rows.length} file${rows.length === 1 ? "" : "s"} across ${groups.size} module group${
      groups.size === 1 ? "" : "s"
    }.`,
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
