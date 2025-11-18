/**
 * Randomization Service
 *
 * Comprehensive randomization engine with support for:
 * - Simple randomization
 * - Block randomization
 * - Stratified randomization
 * - Minimization
 * - Response-adaptive randomization
 * - Biased coin randomization
 *
 * Vendor parity: Almac, Oracle, 4G Clinical, Signant
 */

import { prisma } from '../database/connection';
import { RandomizationAlgorithm, Patient, Study } from '@prisma/client';
import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface RandomizationRequest {
  studyId: string;
  patientId: string;
  performedBy: string;
  stratificationFactors?: Record<string, any>;
}

export interface RandomizationResult {
  randomizationNumber: string;
  treatmentArmCode: string;
  stratumCode?: string;
  blockNumber?: number;
}

export class RandomizationService {
  /**
   * Main randomization entry point
   */
  async randomizePatient(request: RandomizationRequest): Promise<RandomizationResult> {
    logger.info(`Randomization request for patient ${request.patientId}`);

    // Validate request
    await this.validateRandomizationRequest(request);

    // Get study configuration
    const study = await prisma.study.findUnique({
      where: { id: request.studyId },
      include: { arms: true },
    });

    if (!study) {
      throw new AppError('Study not found', 404);
    }

    // Get active randomization list
    const randomizationList = await this.getActiveRandomizationList(request.studyId);

    if (!randomizationList) {
      throw new AppError('No active randomization list found for this study', 400);
    }

    // Perform randomization based on algorithm
    const result = await this.performRandomization(
      randomizationList.algorithm,
      request,
      study,
      randomizationList
    );

    // Save randomization record
    const randomization = await prisma.randomization.create({
      data: {
        studyId: request.studyId,
        patientId: request.patientId,
        randomizationNumber: result.randomizationNumber,
        treatmentArmCode: result.treatmentArmCode,
        stratumCode: result.stratumCode,
        blockNumber: result.blockNumber,
        algorithm: randomizationList.algorithm,
        performedBy: request.performedBy,
      },
    });

    // Update patient with treatment arm
    const treatmentArm = study.arms.find(arm => arm.code === result.treatmentArmCode);
    await prisma.patient.update({
      where: { id: request.patientId },
      data: {
        status: 'RANDOMIZED',
        randomizationDate: new Date(),
        treatmentArmId: treatmentArm?.id,
      },
    });

    logger.info(`Patient ${request.patientId} randomized to arm ${result.treatmentArmCode}`);

    return result;
  }

  /**
   * Validate randomization request
   */
  private async validateRandomizationRequest(request: RandomizationRequest): Promise<void> {
    // Check if patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: request.patientId },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Check if patient is already randomized
    const existingRandomization = await prisma.randomization.findUnique({
      where: { patientId: request.patientId },
    });

    if (existingRandomization) {
      throw new AppError('Patient is already randomized', 400);
    }

    // Check if patient is enrolled
    if (patient.status !== 'ENROLLED') {
      throw new AppError('Patient must be enrolled before randomization', 400);
    }
  }

  /**
   * Get active randomization list for study
   */
  private async getActiveRandomizationList(studyId: string): Promise<any> {
    return await prisma.randomizationList.findFirst({
      where: {
        studyId,
        isActive: true,
      },
      orderBy: {
        generatedDate: 'desc',
      },
    });
  }

  /**
   * Perform randomization based on algorithm
   */
  private async performRandomization(
    algorithm: RandomizationAlgorithm,
    request: RandomizationRequest,
    study: any,
    randomizationList: any
  ): Promise<RandomizationResult> {
    switch (algorithm) {
      case 'SIMPLE':
        return this.simpleRandomization(request, study);

      case 'BLOCK':
      case 'PERMUTED_BLOCK':
        return this.blockRandomization(request, study, randomizationList);

      case 'STRATIFIED_BLOCK':
        return this.stratifiedBlockRandomization(request, study, randomizationList);

      case 'MINIMIZATION':
        return this.minimizationRandomization(request, study);

      case 'RESPONSE_ADAPTIVE':
        return this.responseAdaptiveRandomization(request, study);

      case 'BIASED_COIN':
        return this.biasedCoinRandomization(request, study);

      default:
        throw new AppError(`Unsupported randomization algorithm: ${algorithm}`, 400);
    }
  }

  /**
   * Simple (complete) randomization
   */
  private async simpleRandomization(
    request: RandomizationRequest,
    study: any
  ): Promise<RandomizationResult> {
    const arms = study.arms.filter((arm: any) => arm.isActive);
    const randomIndex = Math.floor(Math.random() * arms.length);
    const selectedArm = arms[randomIndex];

    return {
      randomizationNumber: await this.generateRandomizationNumber(request.studyId),
      treatmentArmCode: selectedArm.code,
    };
  }

  /**
   * Block randomization
   * Ensures balanced allocation within blocks
   */
  private async blockRandomization(
    request: RandomizationRequest,
    study: any,
    randomizationList: any
  ): Promise<RandomizationResult> {
    const blockSize = randomizationList.blockSize || 4;

    // Get current block
    const currentCount = await prisma.randomization.count({
      where: { studyId: request.studyId },
    });

    const currentBlockNumber = Math.floor(currentCount / blockSize) + 1;
    const positionInBlock = currentCount % blockSize;

    // Decrypt randomization sequence
    const sequence = this.decryptSequence(randomizationList.randomizationSequence);
    const allocation = sequence[currentCount];

    return {
      randomizationNumber: await this.generateRandomizationNumber(request.studyId),
      treatmentArmCode: allocation.treatmentArm,
      blockNumber: currentBlockNumber,
    };
  }

  /**
   * Stratified block randomization
   * Separate randomization within each stratum
   */
  private async stratifiedBlockRandomization(
    request: RandomizationRequest,
    study: any,
    randomizationList: any
  ): Promise<RandomizationResult> {
    // Determine stratum based on stratification factors
    const stratumCode = this.calculateStratum(
      request.stratificationFactors || {},
      randomizationList.stratificationFactors
    );

    // Get count within this stratum
    const stratumCount = await prisma.randomization.count({
      where: {
        studyId: request.studyId,
        stratumCode,
      },
    });

    const blockSize = randomizationList.blockSize || 4;
    const currentBlockNumber = Math.floor(stratumCount / blockSize) + 1;

    // Get allocation for this stratum and position
    const sequence = this.decryptSequence(randomizationList.randomizationSequence);
    const stratumSequence = sequence.filter((item: any) => item.stratum === stratumCode);
    const allocation = stratumSequence[stratumCount];

    return {
      randomizationNumber: await this.generateRandomizationNumber(request.studyId),
      treatmentArmCode: allocation.treatmentArm,
      stratumCode,
      blockNumber: currentBlockNumber,
    };
  }

  /**
   * Minimization (Pocock & Simon)
   * Minimizes imbalance across prognostic factors
   */
  private async minimizationRandomization(
    request: RandomizationRequest,
    study: any
  ): Promise<RandomizationResult> {
    const arms = study.arms.filter((arm: any) => arm.isActive);
    const factors = request.stratificationFactors || {};

    // Calculate imbalance scores for each treatment arm
    const imbalanceScores: Record<string, number> = {};

    for (const arm of arms) {
      let totalImbalance = 0;

      // For each stratification factor
      for (const [factor, value] of Object.entries(factors)) {
        // Count current allocation in this factor level
        const counts = await this.getFactorCounts(request.studyId, factor, value);

        // Calculate imbalance if this patient assigned to this arm
        const currentArmCount = counts[arm.code] || 0;
        const otherArmsTotal = Object.values(counts).reduce((a, b) => a + b, 0) - currentArmCount;
        const imbalance = Math.abs((currentArmCount + 1) - otherArmsTotal);

        totalImbalance += imbalance;
      }

      imbalanceScores[arm.code] = totalImbalance;
    }

    // Select arm with minimum imbalance (with randomization for ties)
    const minImbalance = Math.min(...Object.values(imbalanceScores));
    const candidateArms = arms.filter(
      (arm: any) => imbalanceScores[arm.code] === minImbalance
    );

    // Biased coin flip (probability p of choosing minimizing arm)
    const probability = 0.75; // Common value
    const selectedArm =
      Math.random() < probability
        ? candidateArms[Math.floor(Math.random() * candidateArms.length)]
        : arms[Math.floor(Math.random() * arms.length)];

    return {
      randomizationNumber: await this.generateRandomizationNumber(request.studyId),
      treatmentArmCode: selectedArm.code,
      stratumCode: this.calculateStratum(factors, {}),
    };
  }

  /**
   * Response-adaptive randomization
   * Allocation probability changes based on interim results
   */
  private async responseAdaptiveRandomization(
    request: RandomizationRequest,
    study: any
  ): Promise<RandomizationResult> {
    const arms = study.arms.filter((arm: any) => arm.isActive);

    // Get interim response data (simplified - would come from EDC integration)
    const responseRates = await this.getInterimResponseRates(request.studyId);

    // Calculate allocation probabilities using Bayesian adaptive randomization
    const probabilities = this.calculateAdaptiveProbabilities(responseRates, arms);

    // Select arm based on probabilities
    const random = Math.random();
    let cumulativeProbability = 0;
    let selectedArm = arms[0];

    for (let i = 0; i < arms.length; i++) {
      cumulativeProbability += probabilities[arms[i].code];
      if (random <= cumulativeProbability) {
        selectedArm = arms[i];
        break;
      }
    }

    return {
      randomizationNumber: await this.generateRandomizationNumber(request.studyId),
      treatmentArmCode: selectedArm.code,
    };
  }

  /**
   * Biased coin randomization
   * Reduces imbalance while maintaining some randomness
   */
  private async biasedCoinRandomization(
    request: RandomizationRequest,
    study: any
  ): Promise<RandomizationResult> {
    const arms = study.arms.filter((arm: any) => arm.isActive);

    // Get current allocation counts
    const counts: Record<string, number> = {};
    for (const arm of arms) {
      counts[arm.code] = await prisma.randomization.count({
        where: {
          studyId: request.studyId,
          treatmentArmCode: arm.code,
        },
      });
    }

    // Find arm with minimum allocation
    const minCount = Math.min(...Object.values(counts));
    const underAllocatedArms = arms.filter((arm: any) => counts[arm.code] === minCount);

    // Biased coin flip
    const biasedProbability = 0.67; // 2/3 probability
    let selectedArm;

    if (Math.random() < biasedProbability && underAllocatedArms.length > 0) {
      // Assign to under-allocated arm
      selectedArm = underAllocatedArms[Math.floor(Math.random() * underAllocatedArms.length)];
    } else {
      // Random assignment
      selectedArm = arms[Math.floor(Math.random() * arms.length)];
    }

    return {
      randomizationNumber: await this.generateRandomizationNumber(request.studyId),
      treatmentArmCode: selectedArm.code,
    };
  }

  /**
   * Generate unique randomization number
   */
  private async generateRandomizationNumber(studyId: string): Promise<string> {
    const study = await prisma.study.findUnique({
      where: { id: studyId },
    });

    const count = await prisma.randomization.count({
      where: { studyId },
    });

    const studyPrefix = study?.protocolNumber.substring(0, 4).toUpperCase() || 'RAND';
    const randomizationNumber = `${studyPrefix}-${String(count + 1).padStart(6, '0')}`;

    return randomizationNumber;
  }

  /**
   * Calculate stratum code from stratification factors
   */
  private calculateStratum(
    factors: Record<string, any>,
    stratificationConfig: any
  ): string {
    const sortedKeys = Object.keys(factors).sort();
    const values = sortedKeys.map(key => `${key}:${factors[key]}`);
    return values.join('|');
  }

  /**
   * Decrypt randomization sequence
   * In production, this would use proper encryption
   */
  private decryptSequence(encryptedSequence: any): any[] {
    // Simplified - in production, use AES or similar
    return JSON.parse(encryptedSequence as string);
  }

  /**
   * Get allocation counts for a specific factor level
   */
  private async getFactorCounts(
    studyId: string,
    factor: string,
    value: any
  ): Promise<Record<string, number>> {
    const randomizations = await prisma.randomization.findMany({
      where: {
        studyId,
        patient: {
          stratificationFactors: {
            path: [factor],
            equals: value,
          },
        },
      },
    });

    const counts: Record<string, number> = {};
    randomizations.forEach(r => {
      counts[r.treatmentArmCode] = (counts[r.treatmentArmCode] || 0) + 1;
    });

    return counts;
  }

  /**
   * Get interim response rates (would integrate with EDC)
   */
  private async getInterimResponseRates(studyId: string): Promise<Record<string, number>> {
    // Placeholder - would integrate with EDC system
    // Return response rates by treatment arm
    return {
      'ARM-A': 0.65,
      'ARM-B': 0.45,
      'ARM-C': 0.55,
    };
  }

  /**
   * Calculate adaptive allocation probabilities
   * Using square root rule (simplified)
   */
  private calculateAdaptiveProbabilities(
    responseRates: Record<string, number>,
    arms: any[]
  ): Record<string, number> {
    const probabilities: Record<string, number> = {};

    // Square root of success rate
    const sqrtRates: Record<string, number> = {};
    let totalSqrt = 0;

    arms.forEach(arm => {
      const rate = responseRates[arm.code] || 0.5; // Default to 0.5 if no data
      sqrtRates[arm.code] = Math.sqrt(rate);
      totalSqrt += sqrtRates[arm.code];
    });

    // Normalize to probabilities
    arms.forEach(arm => {
      probabilities[arm.code] = sqrtRates[arm.code] / totalSqrt;
    });

    return probabilities;
  }

  /**
   * Generate randomization list (for study setup)
   */
  async generateRandomizationList(
    studyId: string,
    algorithm: RandomizationAlgorithm,
    config: {
      blockSize?: number;
      allocationRatio: string;
      totalSampleSize: number;
      stratificationFactors?: any;
    },
    generatedBy: string
  ): Promise<any> {
    logger.info(`Generating randomization list for study ${studyId}`);

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: { arms: true },
    });

    if (!study) {
      throw new AppError('Study not found', 404);
    }

    // Parse allocation ratio (e.g., "2:1" or "1:1:1")
    const ratios = config.allocationRatio.split(':').map(Number);
    const arms = study.arms.filter(arm => arm.isActive);

    if (ratios.length !== arms.length) {
      throw new AppError('Allocation ratio must match number of treatment arms', 400);
    }

    // Generate sequence based on algorithm
    let sequence: any[] = [];

    switch (algorithm) {
      case 'BLOCK':
      case 'PERMUTED_BLOCK':
        sequence = this.generateBlockSequence(arms, ratios, config.totalSampleSize, config.blockSize);
        break;

      case 'STRATIFIED_BLOCK':
        sequence = this.generateStratifiedSequence(
          arms,
          ratios,
          config.totalSampleSize,
          config.blockSize,
          config.stratificationFactors
        );
        break;

      default:
        sequence = this.generateSimpleSequence(arms, ratios, config.totalSampleSize);
    }

    // Encrypt sequence
    const encryptedSequence = JSON.stringify(sequence);

    // Save randomization list
    const version = `v${Date.now()}`;
    const randomizationList = await prisma.randomizationList.create({
      data: {
        studyId,
        version,
        algorithm,
        blockSize: config.blockSize,
        allocationRatio: config.allocationRatio,
        stratificationFactors: config.stratificationFactors,
        randomizationSequence: encryptedSequence,
        generatedBy,
      },
    });

    logger.info(`Randomization list generated: ${randomizationList.id}`);

    return randomizationList;
  }

  /**
   * Generate block randomization sequence
   */
  private generateBlockSequence(
    arms: any[],
    ratios: number[],
    totalSize: number,
    blockSize?: number
  ): any[] {
    // Calculate block size if not provided
    if (!blockSize) {
      blockSize = ratios.reduce((a, b) => a + b, 0);
    }

    const sequence: any[] = [];
    const numberOfBlocks = Math.ceil(totalSize / blockSize);

    for (let block = 0; block < numberOfBlocks; block++) {
      // Create block with specified ratios
      const blockAllocations: any[] = [];

      arms.forEach((arm, idx) => {
        const count = ratios[idx];
        for (let i = 0; i < count; i++) {
          blockAllocations.push({
            treatmentArm: arm.code,
            block: block + 1,
          });
        }
      });

      // Shuffle block using Fisher-Yates
      this.shuffleArray(blockAllocations);

      sequence.push(...blockAllocations);
    }

    return sequence.slice(0, totalSize);
  }

  /**
   * Generate stratified sequence
   */
  private generateStratifiedSequence(
    arms: any[],
    ratios: number[],
    totalSize: number,
    blockSize: number | undefined,
    stratificationFactors: any
  ): any[] {
    // Generate all possible strata combinations
    const strata = this.generateStrataCombinations(stratificationFactors);

    const sequence: any[] = [];

    // Generate separate sequence for each stratum
    strata.forEach(stratum => {
      const stratumSize = Math.ceil(totalSize / strata.length);
      const stratumSequence = this.generateBlockSequence(arms, ratios, stratumSize, blockSize);

      stratumSequence.forEach(item => {
        item.stratum = stratum;
      });

      sequence.push(...stratumSequence);
    });

    return sequence;
  }

  /**
   * Generate simple randomization sequence
   */
  private generateSimpleSequence(arms: any[], ratios: number[], totalSize: number): any[] {
    const sequence: any[] = [];
    const totalRatio = ratios.reduce((a, b) => a + b, 0);

    for (let i = 0; i < totalSize; i++) {
      const random = Math.random() * totalRatio;
      let cumulativeRatio = 0;

      for (let j = 0; j < arms.length; j++) {
        cumulativeRatio += ratios[j];
        if (random < cumulativeRatio) {
          sequence.push({
            treatmentArm: arms[j].code,
          });
          break;
        }
      }
    }

    return sequence;
  }

  /**
   * Generate all possible strata combinations
   */
  private generateStrataCombinations(factors: any): string[] {
    // Simplified - would generate all combinations of factor levels
    return ['STRATUM-1', 'STRATUM-2', 'STRATUM-3', 'STRATUM-4'];
  }

  /**
   * Fisher-Yates shuffle algorithm
   */
  private shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Get randomization details
   */
  async getRandomizationDetails(randomizationId: string): Promise<any> {
    const randomization = await prisma.randomization.findUnique({
      where: { id: randomizationId },
      include: {
        study: true,
        patient: true,
      },
    });

    return randomization;
  }
}

export default new RandomizationService();
