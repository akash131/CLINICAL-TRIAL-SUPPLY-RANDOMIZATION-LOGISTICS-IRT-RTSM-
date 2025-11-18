import { Router } from 'express';
import { prisma } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const sites = await prisma.site.findMany({
    include: {
      organization: true,
      _count: {
        select: { patients: true },
      },
    },
  });

  res.json({ status: 'success', data: { sites } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const site = await prisma.site.create({ data: req.body });
  res.status(201).json({
    status: 'success',
    message: 'Site created successfully',
    data: { site },
  });
}));

router.get('/:siteId', asyncHandler(async (req, res) => {
  const site = await prisma.site.findUnique({
    where: { id: req.params.siteId },
    include: {
      organization: true,
      studies: { include: { study: true } },
    },
  });

  res.json({ status: 'success', data: { site } });
}));

export default router;
