import { Router } from 'express';
import { prisma } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'SPONSOR_ADMIN'));

router.get('/', asyncHandler(async (req, res) => {
  const integrations = await prisma.integration.findMany({
    orderBy: { createdAt: 'desc' },
  });

  res.json({ status: 'success', data: { integrations } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const integration = await prisma.integration.create({
    data: req.body,
  });

  res.status(201).json({
    status: 'success',
    message: 'Integration created successfully',
    data: { integration },
  });
}));

export default router;
