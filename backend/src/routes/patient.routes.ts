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

  const patients = await prisma.patient.findMany({
    where,
    include: {
      site: true,
      cohort: true,
      randomization: true,
    },
    orderBy: { enrollmentDate: 'desc' },
  });

  res.json({ status: 'success', data: { patients } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const patient = await prisma.patient.create({
    data: req.body,
  });

  res.status(201).json({
    status: 'success',
    message: 'Patient created successfully',
    data: { patient },
  });
}));

router.get('/:patientId', asyncHandler(async (req, res) => {
  const { patientId } = req.params;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      site: true,
      study: true,
      cohort: true,
      randomization: true,
      visits: true,
      dispensations: {
        include: {
          kit: true,
        },
      },
    },
  });

  res.json({ status: 'success', data: { patient } });
}));

export default router;
