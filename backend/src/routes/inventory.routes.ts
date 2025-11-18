import { Router } from 'express';
import { prisma } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { studyId, siteId, status } = req.query;

  const where: any = {};
  if (studyId) where.studyId = studyId;
  if (siteId) where.siteId = siteId;
  if (status) where.status = status;

  const inventory = await prisma.inventory.findMany({
    where,
    include: {
      kit: {
        include: { product: true },
      },
      site: true,
    },
  });

  res.json({ status: 'success', data: { inventory } });
}));

export default router;
