import { Router } from 'express';
import { prisma } from '../database/connection';
import { authenticate, authorize, checkStudyAccess } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all studies
router.get(
  '/',
  asyncHandler(async (req: any, res) => {
    const studies = await prisma.study.findMany({
      include: {
        sponsor: true,
        _count: {
          select: {
            patients: true,
            sites: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ status: 'success', data: { studies } });
  })
);

// Get study by ID
router.get(
  '/:studyId',
  checkStudyAccess,
  asyncHandler(async (req, res) => {
    const { studyId } = req.params;

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: {
        sponsor: true,
        arms: true,
        cohorts: true,
        sites: {
          include: {
            site: true,
          },
        },
        _count: {
          select: {
            patients: true,
            randomizations: true,
          },
        },
      },
    });

    if (!study) {
      throw new AppError('Study not found', 404);
    }

    res.json({ status: 'success', data: { study } });
  })
);

// Create new study
router.post(
  '/',
  authorize('SUPER_ADMIN', 'SPONSOR_ADMIN', 'STUDY_MANAGER'),
  asyncHandler(async (req, res) => {
    const studyData = req.body;

    const study = await prisma.study.create({
      data: studyData,
      include: {
        sponsor: true,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Study created successfully',
      data: { study },
    });
  })
);

// Update study
router.put(
  '/:studyId',
  checkStudyAccess,
  authorize('SUPER_ADMIN', 'SPONSOR_ADMIN', 'STUDY_MANAGER'),
  asyncHandler(async (req, res) => {
    const { studyId } = req.params;
    const updateData = req.body;

    const study = await prisma.study.update({
      where: { id: studyId },
      data: updateData,
    });

    res.json({
      status: 'success',
      message: 'Study updated successfully',
      data: { study },
    });
  })
);

// Get study enrollment statistics
router.get(
  '/:studyId/enrollment-stats',
  checkStudyAccess,
  asyncHandler(async (req, res) => {
    const { studyId } = req.params;

    const stats = await prisma.patient.groupBy({
      by: ['status'],
      where: { studyId },
      _count: true,
    });

    res.json({ status: 'success', data: { stats } });
  })
);

export default router;
