import { Router } from 'express';
import { prisma } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const shipments = await prisma.shipment.findMany({
    include: {
      study: true,
      items: true,
      sites: { include: { site: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ status: 'success', data: { shipments } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.create({
    data: req.body,
  });

  res.status(201).json({
    status: 'success',
    message: 'Shipment created successfully',
    data: { shipment },
  });
}));

export default router;
