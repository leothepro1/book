const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.tenant.findMany({ select: { id: true, slug: true, settings: true } })
  .then(t => {
    t.forEach(x => console.log(x.id, x.slug, 'hasCards:', !!(x.settings?.home?.cards)));
    prisma.$disconnect();
  });
