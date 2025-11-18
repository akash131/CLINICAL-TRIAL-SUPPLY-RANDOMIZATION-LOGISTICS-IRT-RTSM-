import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import supplyService from '../services/supply.service';

const router = Router();

router.use(authenticate);

// Get supply forecast
router.post(
  '/forecast',
  asyncHandler(async (req, res) => {
    const { studyId, forecastPeriodDays, algorithm } = req.body;

    const forecast = await supplyService.forecastSupplyDemand({
      studyId,
      forecastPeriodDays,
      algorithm,
    });

    res.json({
      status: 'success',
      data: { forecast },
    });
  })
);

// Allocate kit
router.post(
  '/allocate-kit',
  asyncHandler(async (req, res) => {
    const result = await supplyService.allocateKit(req.body);

    res.json({
      status: 'success',
      message: 'Kit allocated successfully',
      data: result,
    });
  })
);

// Dispense kit
router.post(
  '/dispense-kit',
  asyncHandler(async (req: any, res) => {
    const { patientId, visitId, kitId } = req.body;

    const dispensation = await supplyService.dispenseKit(
      patientId,
      visitId,
      kitId,
      req.user.id
    );

    res.json({
      status: 'success',
      message: 'Kit dispensed successfully',
      data: { dispensation },
    });
  })
);

// Temperature monitoring
router.post(
  '/monitor-temperature/:kitId',
  asyncHandler(async (req, res) => {
    const { kitId } = req.params;

    const result = await supplyService.monitorTemperatureExcursion(kitId);

    res.json({
      status: 'success',
      data: result,
    });
  })
);

// Just-in-time labeling
router.post(
  '/jit-label/:kitId',
  asyncHandler(async (req, res) => {
    const { kitId } = req.params;
    const labelData = req.body;

    const label = await supplyService.performJITLabeling(kitId, labelData);

    res.json({
      status: 'success',
      message: 'Kit labeled successfully',
      data: { label },
    });
  })
);

export default router;
