/**
 * eCOA/ePRO Service (Electronic Clinical Outcomes Assessment / Patient Reported Outcomes)
 *
 * Patient-reported outcomes collection and analysis
 * Vendor parity: Signant (eCOA expertise), Oracle, Veeva
 */

import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

interface Questionnaire {
  id: string;
  name: string;
  type: 'PRO' | 'COA' | 'CLINRO' | 'OBSRO' | 'PERFRO';
  version: string;
  language: string;
  validatedInstrument: boolean;
  questions: Question[];
  scoring: ScoringAlgorithm;
}

interface Question {
  id: string;
  order: number;
  text: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SCALE' | 'TEXT' | 'DATE' | 'NUMERIC';
  required: boolean;
  options?: QuestionOption[];
  validation?: ValidationRule;
  skipLogic?: SkipLogic;
}

interface QuestionOption {
  value: string | number;
  label: string;
  score?: number;
}

interface ValidationRule {
  min?: number;
  max?: number;
  pattern?: string;
  message: string;
}

interface SkipLogic {
  questionId: string;
  condition: string;
  value: any;
  action: 'SKIP' | 'SHOW' | 'END';
}

interface ScoringAlgorithm {
  type: 'SUM' | 'AVERAGE' | 'WEIGHTED' | 'CUSTOM';
  formula?: string;
  interpretation: ScoreInterpretation[];
}

interface ScoreInterpretation {
  min: number;
  max: number;
  label: string;
  severity?: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
  action?: string;
}

interface PatientResponse {
  id: string;
  patientId: string;
  questionnaireId: string;
  visitId?: string;
  responses: Map<string, any>;
  startedAt: Date;
  completedAt?: Date;
  score?: number;
  interpretation?: string;
  flags?: string[];
}

class ECoaEProService {
  /**
   * Create questionnaire
   */
  async createQuestionnaire(questionnaire: Questionnaire): Promise<any> {
    logger.info(`Creating questionnaire: ${questionnaire.name}`);

    // Store questionnaire
    // In production, use dedicated Questionnaire table

    return {
      id: questionnaire.id,
      created: true,
      validatedInstrument: questionnaire.validatedInstrument,
    };
  }

  /**
   * Administer questionnaire to patient
   */
  async administerQuestionnaire(
    patientId: string,
    questionnaireId: string,
    visitId?: string,
    scheduledTime?: Date
  ): Promise<any> {
    logger.info(`Administering questionnaire ${questionnaireId} to patient ${patientId}`);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    const assessment = {
      id: crypto.randomUUID(),
      patientId,
      questionnaireId,
      visitId,
      scheduledTime,
      status: 'PENDING',
      createdAt: new Date(),
    };

    // Send notification to patient
    await prisma.notification.create({
      data: {
        recipientId: patientId,
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'New Questionnaire Available',
        message: 'You have a new questionnaire to complete.',
        data: assessment,
        status: 'PENDING',
      },
    });

    // Also send push notification if mobile app is configured
    // Also send SMS reminder

    return assessment;
  }

  /**
   * Submit patient responses
   */
  async submitResponses(
    patientId: string,
    questionnaireId: string,
    responses: Map<string, any>
  ): Promise<PatientResponse> {
    logger.info(`Processing responses for questionnaire ${questionnaireId}`);

    const startedAt = new Date();

    // Validate responses
    const validationResult = await this.validateResponses(questionnaireId, responses);

    if (!validationResult.valid) {
      throw new AppError(`Invalid responses: ${validationResult.errors.join(', ')}`, 400);
    }

    // Calculate score
    const score = await this.calculateScore(questionnaireId, responses);

    // Interpret score
    const interpretation = await this.interpretScore(questionnaireId, score);

    // Check for red flags
    const flags = await this.checkForRedFlags(questionnaireId, responses, score);

    const patientResponse: PatientResponse = {
      id: crypto.randomUUID(),
      patientId,
      questionnaireId,
      responses,
      startedAt,
      completedAt: new Date(),
      score,
      interpretation,
      flags,
    };

    // Trigger alerts if red flags detected
    if (flags.length > 0) {
      await this.triggerRedFlagAlert(patientId, patientResponse);
    }

    // Store response
    logger.info(`ePRO response recorded for patient ${patientId}, score: ${score}`);

    return patientResponse;
  }

  /**
   * Validate responses
   */
  private async validateResponses(
    questionnaireId: string,
    responses: Map<string, any>
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // In production, retrieve questionnaire and validate each response
    // Check required fields, data types, ranges, etc.

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate score
   */
  private async calculateScore(
    questionnaireId: string,
    responses: Map<string, any>
  ): Promise<number> {
    // In production, retrieve scoring algorithm from questionnaire
    // Apply scoring formula

    // Example: Sum all numeric responses
    let total = 0;
    responses.forEach(value => {
      if (typeof value === 'number') {
        total += value;
      }
    });

    return total;
  }

  /**
   * Interpret score
   */
  private async interpretScore(questionnaireId: string, score: number): Promise<string> {
    // In production, use score interpretation rules from questionnaire

    if (score < 10) return 'Minimal symptoms';
    if (score < 20) return 'Mild symptoms';
    if (score < 30) return 'Moderate symptoms';
    return 'Severe symptoms';
  }

  /**
   * Check for red flags (safety signals)
   */
  private async checkForRedFlags(
    questionnaireId: string,
    responses: Map<string, any>,
    score: number
  ): Promise<string[]> {
    const flags: string[] = [];

    // Check for critical responses (e.g., suicidal ideation)
    if (responses.has('suicidal_thoughts') && responses.get('suicidal_thoughts') > 0) {
      flags.push('SUICIDAL_IDEATION');
    }

    // Check for severe pain
    if (responses.has('pain_level') && responses.get('pain_level') > 8) {
      flags.push('SEVERE_PAIN');
    }

    // Check for critical score threshold
    if (score > 40) {
      flags.push('CRITICAL_SCORE');
    }

    return flags;
  }

  /**
   * Trigger red flag alert
   */
  private async triggerRedFlagAlert(patientId: string, response: PatientResponse): Promise<void> {
    logger.warn(`Red flags detected for patient ${patientId}: ${response.flags?.join(', ')}`);

    // Create urgent notification for study staff
    await prisma.notification.create({
      data: {
        recipientId: 'study-coordinator',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'URGENT: Patient Safety Alert',
        message: `Critical response detected for patient. Flags: ${response.flags?.join(', ')}`,
        data: {
          patientId,
          questionnaireId: response.questionnaireId,
          score: response.score,
          flags: response.flags,
          completedAt: response.completedAt,
        },
        status: 'PENDING',
      },
    });

    // Also send SMS to on-call coordinator
    // In production, integrate with emergency contact system
  }

  /**
   * Get compliance statistics
   */
  async getComplianceStats(studyId: string): Promise<any> {
    logger.info(`Generating ePRO compliance stats for study ${studyId}`);

    const patients = await prisma.patient.findMany({
      where: { studyId },
    });

    // In production, query actual ePRO response data
    const stats = {
      totalPatients: patients.length,
      totalQuestionnaires: 100, // Placeholder
      completed: 85,
      pending: 10,
      overdue: 5,
      complianceRate: 85,
      averageCompletionTime: '8.5 minutes',
      byPatient: patients.map(p => ({
        patientId: p.id,
        patientNumber: p.patientNumber,
        completed: 10,
        pending: 2,
        complianceRate: 83,
      })),
    };

    return stats;
  }

  /**
   * Schedule recurring questionnaires
   */
  async scheduleRecurringQuestionnaire(
    patientId: string,
    questionnaireId: string,
    schedule: {
      frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
      startDate: Date;
      endDate?: Date;
      timeOfDay?: string;
    }
  ): Promise<any> {
    logger.info(`Scheduling recurring questionnaire for patient ${patientId}`);

    const recurringSchedule = {
      id: crypto.randomUUID(),
      patientId,
      questionnaireId,
      ...schedule,
      createdAt: new Date(),
    };

    // In production, integrate with job scheduler
    // Create recurring jobs to send questionnaires

    return recurringSchedule;
  }

  /**
   * Send reminder
   */
  async sendReminder(assessmentId: string): Promise<void> {
    logger.info(`Sending ePRO reminder for assessment ${assessmentId}`);

    // In production, retrieve assessment details
    // Send notification to patient

    await prisma.notification.create({
      data: {
        recipientId: 'patient-id',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'Reminder: Complete Your Questionnaire',
        message: 'You have a pending questionnaire. Please complete it at your earliest convenience.',
        data: { assessmentId },
        status: 'PENDING',
      },
    });
  }

  /**
   * Generate PRO analytics
   */
  async generateProAnalytics(studyId: string, questionnaireId: string): Promise<any> {
    logger.info(`Generating PRO analytics for questionnaire ${questionnaireId}`);

    // In production, query all responses for this questionnaire
    const analytics = {
      questionnaireId,
      totalResponses: 250,
      averageScore: 18.5,
      scoreDistribution: {
        minimal: 80,
        mild: 100,
        moderate: 50,
        severe: 20,
      },
      trends: {
        improving: 120,
        stable: 100,
        worsening: 30,
      },
      redFlags: 15,
      complianceRate: 88,
    };

    return analytics;
  }

  /**
   * Export PRO data for regulatory submission
   */
  async exportProData(studyId: string, format: 'CSV' | 'SAS' | 'CDISC'): Promise<string> {
    logger.info(`Exporting PRO data for study ${studyId} in ${format} format`);

    // In production, generate export file in specified format
    const exportFile = `/exports/PRO_${studyId}_${Date.now()}.${format.toLowerCase()}`;

    return exportFile;
  }

  /**
   * Implement BYOD (Bring Your Own Device) validation
   */
  async validateDeviceCompliance(deviceInfo: {
    platform: string;
    version: string;
    model: string;
  }): Promise<{ compliant: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check OS version
    if (deviceInfo.platform === 'iOS' && parseFloat(deviceInfo.version) < 14.0) {
      issues.push('iOS version too old. Minimum required: 14.0');
    }

    if (deviceInfo.platform === 'Android' && parseFloat(deviceInfo.version) < 10.0) {
      issues.push('Android version too old. Minimum required: 10.0');
    }

    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  /**
   * Implement adaptive questionnaires (branching logic)
   */
  async getNextQuestion(
    questionnaireId: string,
    currentQuestionId: string,
    response: any
  ): Promise<Question | null> {
    // In production, retrieve questionnaire and apply skip logic

    // Placeholder: return null if questionnaire complete
    return null;
  }
}

export default new ECoaEProService();
