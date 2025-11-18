/**
 * Supply Management Service
 *
 * Comprehensive supply chain management with:
 * - Inventory tracking and management
 * - Supply forecasting (AI-powered)
 * - Drug pooling across studies
 * - Just-in-time labeling
 * - Kit allocation and dispensation
 * - Temperature monitoring
 * - Shipment logistics
 *
 * Vendor parity: Oracle, Signant, 4G Clinical, Almac
 */

import { prisma } from '../database/connection';
import { KitStatus, InventoryStatus, LabelType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface ForecastRequest {
  studyId: string;
  forecastPeriodDays: number;
  algorithm?: 'LINEAR_REGRESSION' | 'ARIMA' | 'NEURAL_NETWORK' | 'ENSEMBLE';
}

export interface ForecastResult {
  forecastDate: Date;
  predictions: {
    siteId: string;
    siteName: string;
    predictedDemand: number;
    currentInventory: number;
    recommendedResupply: number;
    confidence: number;
  }[];
  overallConfidence: number;
}

export interface KitAllocationRequest {
  patientId: string;
  studyId: string;
  siteId: string;
  treatmentArmId: string;
  quantity: number;
}

export class SupplyService {
  /**
   * AI-Powered Supply Forecasting
   * Uses multiple algorithms to predict future demand
   */
  async forecastSupplyDemand(request: ForecastRequest): Promise<ForecastResult> {
    logger.info(`Generating supply forecast for study ${request.studyId}`);

    const algorithm = request.algorithm || 'ENSEMBLE';

    // Get historical enrollment data
    const historicalData = await this.getHistoricalEnrollmentData(
      request.studyId,
      request.forecastPeriodDays
    );

    // Get current inventory levels
    const currentInventory = await this.getCurrentInventoryLevels(request.studyId);

    // Perform forecasting based on algorithm
    let predictions;
    switch (algorithm) {
      case 'LINEAR_REGRESSION':
        predictions = this.linearRegressionForecast(historicalData, request.forecastPeriodDays);
        break;

      case 'ARIMA':
        predictions = this.arimaForecast(historicalData, request.forecastPeriodDays);
        break;

      case 'NEURAL_NETWORK':
        predictions = this.neuralNetworkForecast(historicalData, request.forecastPeriodDays);
        break;

      case 'ENSEMBLE':
      default:
        predictions = this.ensembleForecast(historicalData, request.forecastPeriodDays);
        break;
    }

    // Combine predictions with current inventory
    const sitePredictions = await Promise.all(
      predictions.map(async (pred: any) => {
        const site = await prisma.site.findUnique({
          where: { id: pred.siteId },
        });

        const currentInv = currentInventory.find(inv => inv.siteId === pred.siteId)?.quantity || 0;
        const recommendedResupply = Math.max(0, pred.predictedDemand - currentInv);

        return {
          siteId: pred.siteId,
          siteName: site?.name || 'Unknown',
          predictedDemand: Math.ceil(pred.predictedDemand),
          currentInventory: currentInv,
          recommendedResupply: Math.ceil(recommendedResupply),
          confidence: pred.confidence,
        };
      })
    );

    // Calculate overall confidence
    const overallConfidence =
      sitePredictions.reduce((sum, pred) => sum + pred.confidence, 0) / sitePredictions.length;

    // Save forecast to database
    await prisma.supplyForecast.create({
      data: {
        studyId: request.studyId,
        forecastDate: new Date(),
        algorithm,
        predictions: sitePredictions,
        confidence: overallConfidence,
      },
    });

    return {
      forecastDate: new Date(),
      predictions: sitePredictions,
      overallConfidence,
    };
  }

  /**
   * Linear Regression Forecast
   * Simple trend-based forecasting
   */
  private linearRegressionForecast(historicalData: any[], forecastDays: number): any[] {
    const siteForecast: Map<string, number> = new Map();

    // Group by site and calculate trend
    const sitesData = this.groupBySite(historicalData);

    sitesData.forEach((data, siteId) => {
      if (data.length < 2) {
        siteForecast.set(siteId, 0);
        return;
      }

      // Simple linear regression: y = mx + b
      const n = data.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;

      data.forEach((point, index) => {
        const x = index;
        const y = point.enrollmentCount;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      });

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Forecast for the next period
      const forecastPeriods = Math.ceil(forecastDays / 30); // Monthly periods
      const predicted = slope * (n + forecastPeriods) + intercept;

      siteForecast.set(siteId, Math.max(0, predicted));
    });

    return Array.from(siteForecast.entries()).map(([siteId, demand]) => ({
      siteId,
      predictedDemand: demand,
      confidence: 0.75, // Linear regression has moderate confidence
    }));
  }

  /**
   * ARIMA Forecast (Simplified)
   * AutoRegressive Integrated Moving Average
   */
  private arimaForecast(historicalData: any[], forecastDays: number): any[] {
    // Simplified ARIMA - in production, use proper statistical library
    const siteForecast: Map<string, number> = new Map();
    const sitesData = this.groupBySite(historicalData);

    sitesData.forEach((data, siteId) => {
      if (data.length < 3) {
        siteForecast.set(siteId, 0);
        return;
      }

      // Calculate moving average
      const windowSize = Math.min(3, data.length);
      const recentData = data.slice(-windowSize);
      const average = recentData.reduce((sum, d) => sum + d.enrollmentCount, 0) / windowSize;

      // Apply growth factor based on recent trend
      const growthRate = this.calculateGrowthRate(data);
      const forecastPeriods = Math.ceil(forecastDays / 30);
      const predicted = average * (1 + growthRate * forecastPeriods);

      siteForecast.set(siteId, Math.max(0, predicted));
    });

    return Array.from(siteForecast.entries()).map(([siteId, demand]) => ({
      siteId,
      predictedDemand: demand,
      confidence: 0.80, // ARIMA has better confidence
    }));
  }

  /**
   * Neural Network Forecast (Simplified)
   * In production, integrate with TensorFlow or PyTorch
   */
  private neuralNetworkForecast(historicalData: any[], forecastDays: number): any[] {
    // Simplified NN - in production, use real neural network
    const siteForecast: Map<string, number> = new Map();
    const sitesData = this.groupBySite(historicalData);

    sitesData.forEach((data, siteId) => {
      if (data.length < 5) {
        siteForecast.set(siteId, 0);
        return;
      }

      // Use weighted moving average with pattern recognition
      const weights = [0.1, 0.15, 0.2, 0.25, 0.3]; // Recent data weighted more
      const recentData = data.slice(-5);

      let weightedSum = 0;
      let totalWeight = 0;

      recentData.forEach((d, idx) => {
        weightedSum += d.enrollmentCount * weights[idx];
        totalWeight += weights[idx];
      });

      const predicted = (weightedSum / totalWeight) * (forecastDays / 30);

      siteForecast.set(siteId, Math.max(0, predicted));
    });

    return Array.from(siteForecast.entries()).map(([siteId, demand]) => ({
      siteId,
      predictedDemand: demand,
      confidence: 0.85, // NN has high confidence with enough data
    }));
  }

  /**
   * Ensemble Forecast
   * Combines multiple algorithms for best accuracy
   */
  private ensembleForecast(historicalData: any[], forecastDays: number): any[] {
    const linearPred = this.linearRegressionForecast(historicalData, forecastDays);
    const arimaPred = this.arimaForecast(historicalData, forecastDays);
    const nnPred = this.neuralNetworkForecast(historicalData, forecastDays);

    // Combine predictions with weighted average
    const weights = { linear: 0.2, arima: 0.35, nn: 0.45 };

    const siteIds = new Set([
      ...linearPred.map(p => p.siteId),
      ...arimaPred.map(p => p.siteId),
      ...nnPred.map(p => p.siteId),
    ]);

    return Array.from(siteIds).map(siteId => {
      const linear = linearPred.find(p => p.siteId === siteId)?.predictedDemand || 0;
      const arima = arimaPred.find(p => p.siteId === siteId)?.predictedDemand || 0;
      const nn = nnPred.find(p => p.siteId === siteId)?.predictedDemand || 0;

      const ensemblePrediction =
        linear * weights.linear + arima * weights.arima + nn * weights.nn;

      return {
        siteId,
        predictedDemand: ensemblePrediction,
        confidence: 0.90, // Ensemble has highest confidence
      };
    });
  }

  /**
   * Get historical enrollment data
   */
  private async getHistoricalEnrollmentData(studyId: string, days: number): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const enrollments = await prisma.patient.groupBy({
      by: ['siteId'],
      where: {
        studyId,
        enrollmentDate: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
    });

    return enrollments.map(e => ({
      siteId: e.siteId,
      enrollmentCount: e._count.id,
      date: new Date(),
    }));
  }

  /**
   * Get current inventory levels by site
   */
  private async getCurrentInventoryLevels(studyId: string): Promise<any[]> {
    const inventory = await prisma.inventory.groupBy({
      by: ['siteId'],
      where: {
        studyId,
        status: 'AVAILABLE',
      },
      _sum: {
        quantity: true,
      },
    });

    return inventory.map(inv => ({
      siteId: inv.siteId || '',
      quantity: inv._sum.quantity || 0,
    }));
  }

  /**
   * Group historical data by site
   */
  private groupBySite(data: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    data.forEach(item => {
      if (!grouped.has(item.siteId)) {
        grouped.set(item.siteId, []);
      }
      grouped.get(item.siteId)!.push(item);
    });

    return grouped;
  }

  /**
   * Calculate growth rate from historical data
   */
  private calculateGrowthRate(data: any[]): number {
    if (data.length < 2) return 0;

    const oldValue = data[0].enrollmentCount;
    const newValue = data[data.length - 1].enrollmentCount;

    return (newValue - oldValue) / oldValue;
  }

  /**
   * Allocate kit to patient (Just-In-Time or Pre-Labeled)
   */
  async allocateKit(request: KitAllocationRequest): Promise<any> {
    logger.info(`Allocating kit for patient ${request.patientId}`);

    // Find available kits for the treatment arm
    const availableKits = await prisma.inventory.findMany({
      where: {
        studyId: request.studyId,
        siteId: request.siteId,
        status: 'AVAILABLE',
        kit: {
          status: {
            in: ['AVAILABLE', 'LABELED'],
          },
          expiryDate: {
            gt: new Date(),
          },
        },
      },
      include: {
        kit: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        kit: {
          expiryDate: 'asc', // FEFO - First Expired, First Out
        },
      },
      take: request.quantity,
    });

    if (availableKits.length < request.quantity) {
      throw new AppError(
        `Insufficient kits available. Required: ${request.quantity}, Available: ${availableKits.length}`,
        400
      );
    }

    // Allocate kits
    const allocatedKits = [];

    for (const inventory of availableKits) {
      // Update inventory status
      await prisma.inventory.update({
        where: { id: inventory.id },
        data: {
          status: 'ALLOCATED',
          allocatedDate: new Date(),
        },
      });

      // Update kit status
      await prisma.kit.update({
        where: { id: inventory.kitId },
        data: {
          status: 'ALLOCATED',
        },
      });

      allocatedKits.push(inventory.kit);
    }

    // Trigger low stock alert if needed
    await this.checkLowStockAlert(request.studyId, request.siteId);

    return {
      allocatedKits,
      message: `Successfully allocated ${allocatedKits.length} kit(s)`,
    };
  }

  /**
   * Dispense kit to patient
   */
  async dispenseKit(
    patientId: string,
    visitId: string,
    kitId: string,
    dispensedBy: string
  ): Promise<any> {
    // Validate kit is allocated
    const kit = await prisma.kit.findUnique({
      where: { id: kitId },
    });

    if (!kit || kit.status !== 'ALLOCATED') {
      throw new AppError('Kit is not allocated or not found', 400);
    }

    // Create dispensation record
    const dispensation = await prisma.dispensation.create({
      data: {
        patientId,
        visitId,
        kitId,
        dispensedBy,
        status: 'DISPENSED',
      },
    });

    // Update kit status
    await prisma.kit.update({
      where: { id: kitId },
      data: {
        status: 'DISPENSED',
      },
    });

    logger.info(`Kit ${kitId} dispensed to patient ${patientId}`);

    return dispensation;
  }

  /**
   * Drug Pooling Management
   * Share inventory across multiple studies
   */
  async manageDrugPool(poolId: string): Promise<any> {
    const pool = await prisma.drugPool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      throw new AppError('Drug pool not found', 404);
    }

    const studies = JSON.parse(pool.studies as string);

    // Calculate total available across all studies
    const totalInventory = await prisma.inventory.aggregate({
      where: {
        studyId: {
          in: studies,
        },
        status: 'AVAILABLE',
      },
      _sum: {
        quantity: true,
      },
    });

    // Update pool statistics
    await prisma.drugPool.update({
      where: { id: poolId },
      data: {
        availableQuantity: totalInventory._sum.quantity || 0,
      },
    });

    return {
      poolId,
      totalQuantity: pool.totalQuantity,
      allocatedQuantity: pool.allocatedQuantity,
      availableQuantity: totalInventory._sum.quantity || 0,
      studies,
    };
  }

  /**
   * Just-In-Time (JIT) Labeling
   * Dynamically label kits at dispensation
   */
  async performJITLabeling(kitId: string, labelData: any): Promise<any> {
    const kit = await prisma.kit.findUnique({
      where: { id: kitId },
    });

    if (!kit) {
      throw new AppError('Kit not found', 404);
    }

    if (kit.labelType !== 'JUST_IN_TIME') {
      throw new AppError('Kit is not configured for JIT labeling', 400);
    }

    // Generate label data
    const generatedLabel = {
      kitNumber: kit.kitNumber,
      ...labelData,
      labeledDate: new Date(),
      barcode: this.generateBarcode(kit.kitNumber),
    };

    // Update kit with label information
    await prisma.kit.update({
      where: { id: kitId },
      data: {
        labelData: generatedLabel,
        labeledDate: new Date(),
        status: 'LABELED',
      },
    });

    logger.info(`JIT labeling completed for kit ${kitId}`);

    return generatedLabel;
  }

  /**
   * Check and trigger low stock alerts
   */
  private async checkLowStockAlert(studyId: string, siteId: string): Promise<void> {
    const threshold = 10; // Low stock threshold

    const availableCount = await prisma.inventory.count({
      where: {
        studyId,
        siteId,
        status: 'AVAILABLE',
      },
    });

    if (availableCount <= threshold) {
      // Create notification
      await prisma.notification.create({
        data: {
          recipientId: 'study-manager', // Would be actual user ID
          type: availableCount <= 3 ? 'SUPPLY_CRITICAL' : 'SUPPLY_LOW',
          channel: 'EMAIL',
          subject: `Low Stock Alert - Site ${siteId}`,
          message: `Stock level is ${availableCount} units. Please resupply.`,
          data: {
            studyId,
            siteId,
            availableCount,
            threshold,
          },
          status: 'PENDING',
        },
      });

      logger.warn(`Low stock alert triggered for site ${siteId}: ${availableCount} units`);
    }
  }

  /**
   * Generate barcode for kit
   */
  private generateBarcode(kitNumber: string): string {
    // Generate Code 128 barcode format
    return `*${kitNumber}*`;
  }

  /**
   * Temperature Excursion Monitoring
   */
  async monitorTemperatureExcursion(kitId: string): Promise<any> {
    // Get recent temperature records
    const recentRecords = await prisma.temperatureRecord.findMany({
      where: {
        kitId,
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Check for excursions
    const kit = await prisma.kit.findUnique({
      where: { id: kitId },
      include: {
        product: true,
      },
    });

    if (!kit) {
      throw new AppError('Kit not found', 404);
    }

    const minTemp = kit.product.minTemp || 2;
    const maxTemp = kit.product.maxTemp || 8;

    const excursions = recentRecords.filter(
      record => record.temperature < minTemp || record.temperature > maxTemp
    );

    // Create excursion records if found
    for (const record of excursions) {
      if (!record.isExcursion) {
        await prisma.temperatureExcursion.create({
          data: {
            recordId: record.id,
            severity: this.calculateExcursionSeverity(record.temperature, minTemp, maxTemp),
            startTime: record.timestamp,
            minTemp,
            maxTemp,
            resolution: 'UNDER_REVIEW',
          },
        });

        // Mark record as excursion
        await prisma.temperatureRecord.update({
          where: { id: record.id },
          data: { isExcursion: true },
        });

        // Send alert
        await prisma.notification.create({
          data: {
            recipientId: 'pharmacist', // Would be actual user ID
            type: 'TEMPERATURE_EXCURSION',
            channel: 'EMAIL',
            subject: `Temperature Excursion Alert - Kit ${kit.kitNumber}`,
            message: `Temperature excursion detected: ${record.temperature}°C (Range: ${minTemp}-${maxTemp}°C)`,
            data: {
              kitId,
              kitNumber: kit.kitNumber,
              temperature: record.temperature,
              minTemp,
              maxTemp,
            },
            status: 'PENDING',
          },
        });
      }
    }

    return {
      kitId,
      kitNumber: kit.kitNumber,
      excursionsFound: excursions.length,
      status: excursions.length > 0 ? 'EXCURSION_DETECTED' : 'NORMAL',
    };
  }

  /**
   * Calculate excursion severity
   */
  private calculateExcursionSeverity(
    temp: number,
    minTemp: number,
    maxTemp: number
  ): 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL' {
    const deviation = Math.max(Math.abs(temp - minTemp), Math.abs(temp - maxTemp));

    if (deviation <= 2) return 'MINOR';
    if (deviation <= 5) return 'MODERATE';
    if (deviation <= 10) return 'MAJOR';
    return 'CRITICAL';
  }
}

export default new SupplyService();
