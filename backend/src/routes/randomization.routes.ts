import { Router } from 'express';
import { authenticate, checkStudyAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import randomizationService from '../services/randomization.service';
import websocketService from '../services/websocket.service';

const router = Router();

router.use(authenticate);

// Randomize patient
router.post(
  '/randomize',
  asyncHandler(async (req: any, res) => {
    const { studyId, patientId, stratificationFactors } = req.body;

    const result = await randomizationService.randomizePatient({
      studyId,
      patientId,
      performedBy: req.user.id,
      stratificationFactors,
    });

    // Notify via WebSocket
    websocketService.notifyRandomization(req.user.id, result);

    res.json({
      status: 'success',
      message: 'Patient randomized successfully',
      data: result,
    });
  })
);

// Generate randomization list
router.post(
  '/generate-list',
  asyncHandler(async (req: any, res) => {
    const { studyId, algorithm, config } = req.body;

    const randomizationList = await randomizationService.generateRandomizationList(
      studyId,
      algorithm,
      config,
      req.user.id
    );

    res.status(201).json({
      status: 'success',
      message: 'Randomization list generated successfully',
      data: { randomizationList },
    });
  })
);

// Get randomization details
router.get(
  '/:randomizationId',
  asyncHandler(async (req, res) => {
    const { randomizationId } = req.params;

    const randomization = await randomizationService.getRandomizationDetails(randomizationId);

    res.json({
      status: 'success',
      data: { randomization },
    });
  })
);

export default router;
