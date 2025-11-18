import { Router } from 'express';
import { prisma } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

router.get('/dashboard/:studyId', asyncHandler(async (req, res) => {
  const { studyId } = req.params;

  const [
    totalPatients,
    enrollmentByStatus,
    inventoryStatus,
    recentRandomizations,
  ] = await Promise.all([
    prisma.patient.count({ where: { studyId } }),
    prisma.patient.groupBy({
      by: ['status'],
      where: { studyId },
      _count: true,
    }),
    prisma.inventory.groupBy({
      by: ['status'],
      where: { studyId },
      _sum: { quantity: true },
    }),
    prisma.randomization.findMany({
      where: { studyId },
      orderBy: { randomizationDate: 'desc' },
      take: 10,
    }),
  ]);

  res.json({
    status: 'success',
    data: {
      totalPatients,
      enrollmentByStatus,
      inventoryStatus,
      recentRandomizations,
    },
  });
}));

export default router;
