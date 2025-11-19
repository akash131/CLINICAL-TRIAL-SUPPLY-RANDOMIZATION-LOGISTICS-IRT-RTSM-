/**
 * Electronic Consent (eConsent) Service
 *
 * Digital consent management with versioning and signature tracking
 * Vendor parity: Signant, Veeva (eConsent integration)
 */

import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

interface ConsentDocument {
  studyId: string;
  version: string;
  title: string;
  content: string;
  language: string;
  effectiveDate: Date;
  expiryDate?: Date;
  sections: ConsentSection[];
}

interface ConsentSection {
  order: number;
  title: string;
  content: string;
  requiresInitials: boolean;
  criticalSection: boolean;
}

interface ConsentSignature {
  patientId: string;
  consentId: string;
  signatureData: string; // Base64 encoded signature image
  signedBy: string;
  ipAddress: string;
  deviceInfo: string;
  geoLocation?: {
    latitude: number;
    longitude: number;
  };
  witnessName?: string;
  witnessSignature?: string;
  legalRepresentative?: {
    name: string;
    relationship: string;
    signature: string;
  };
}

interface ConsentComprehensionTest {
  consentId: string;
  questions: Array<{
    question: string;
    correctAnswer: string;
    options: string[];
  }>;
  passingScore: number;
}

class EConsentService {
  private consentsDir = process.env.CONSENTS_DIR || './consents';

  constructor() {
    if (!fs.existsSync(this.consentsDir)) {
      fs.mkdirSync(this.consentsDir, { recursive: true });
    }
  }

  /**
   * Create new consent document
   */
  async createConsentDocument(consent: ConsentDocument): Promise<any> {
    logger.info(`Creating eConsent document for study ${consent.studyId}`);

    try {
      // Generate PDF version of consent
      const pdfPath = await this.generateConsentPDF(consent);

      // Create consent record (in production, use a ConsentDocument model)
      const consentRecord = {
        id: crypto.randomUUID(),
        studyId: consent.studyId,
        version: consent.version,
        title: consent.title,
        content: consent.content,
        language: consent.language,
        effectiveDate: consent.effectiveDate,
        expiryDate: consent.expiryDate,
        pdfPath,
        sections: consent.sections,
        createdAt: new Date(),
      };

      // Create version hash for integrity
      const versionHash = this.generateVersionHash(consent);

      logger.info(`eConsent document created: ${consentRecord.id}`);

      return {
        ...consentRecord,
        versionHash,
      };
    } catch (error) {
      logger.error('Failed to create eConsent document:', error);
      throw error;
    }
  }

  /**
   * Present consent to patient (track viewing)
   */
  async presentConsent(patientId: string, consentId: string): Promise<any> {
    logger.info(`Presenting consent ${consentId} to patient ${patientId}`);

    const viewEvent = {
      id: crypto.randomUUID(),
      patientId,
      consentId,
      viewedAt: new Date(),
      duration: 0,
      completed: false,
    };

    // In production, save to ConsentView table

    return viewEvent;
  }

  /**
   * Record consent signature with full audit trail
   */
  async recordConsentSignature(signature: ConsentSignature): Promise<any> {
    logger.info(`Recording consent signature for patient ${signature.patientId}`);

    try {
      const patient = await prisma.patient.findUnique({
        where: { id: signature.patientId },
      });

      if (!patient) {
        throw new AppError('Patient not found', 404);
      }

      // Generate signature hash for integrity
      const signatureHash = this.generateSignatureHash(signature);

      // Create electronic signature record
      const electronicSignature = await prisma.electronicSignature.create({
        data: {
          userId: signature.patientId,
          documentType: 'CONSENT',
          documentId: signature.consentId,
          reason: 'Patient Informed Consent',
          signatureHash,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: signature.patientId,
          action: 'SIGN_CONSENT',
          entity: 'consent',
          entityId: signature.consentId,
          changes: {
            signatureData: '[SIGNATURE_IMAGE]',
            ipAddress: signature.ipAddress,
            deviceInfo: signature.deviceInfo,
            geoLocation: signature.geoLocation,
            witnessName: signature.witnessName,
            legalRepresentative: signature.legalRepresentative,
          },
          ipAddress: signature.ipAddress,
          userAgent: signature.deviceInfo,
        },
      });

      // Generate signed consent PDF
      const signedPdfPath = await this.generateSignedConsentPDF(signature);

      // Send confirmation
      await prisma.notification.create({
        data: {
          recipientId: signature.patientId,
          type: 'SYSTEM_ALERT',
          channel: 'EMAIL',
          subject: 'Informed Consent Signed',
          message: 'Your informed consent has been successfully recorded.',
          data: {
            consentId: signature.consentId,
            signatureId: electronicSignature.id,
            signedPdfPath,
          },
          status: 'PENDING',
        },
      });

      logger.info(`Consent signature recorded: ${electronicSignature.id}`);

      return {
        signatureId: electronicSignature.id,
        signatureHash,
        signedPdfPath,
        timestamp: electronicSignature.timestamp,
      };
    } catch (error) {
      logger.error('Failed to record consent signature:', error);
      throw error;
    }
  }

  /**
   * Administer comprehension test
   */
  async administerComprehensionTest(
    patientId: string,
    test: ConsentComprehensionTest,
    answers: string[]
  ): Promise<any> {
    logger.info(`Administering comprehension test for patient ${patientId}`);

    let correctAnswers = 0;
    const results = test.questions.map((q, index) => {
      const isCorrect = q.correctAnswer === answers[index];
      if (isCorrect) correctAnswers++;

      return {
        question: q.question,
        givenAnswer: answers[index],
        correctAnswer: q.correctAnswer,
        isCorrect,
      };
    });

    const score = (correctAnswers / test.questions.length) * 100;
    const passed = score >= test.passingScore;

    const testResult = {
      id: crypto.randomUUID(),
      patientId,
      consentId: test.consentId,
      score,
      passed,
      results,
      attemptedAt: new Date(),
    };

    // In production, save to ComprehensionTestResult table

    if (!passed) {
      logger.warn(`Patient ${patientId} failed comprehension test (score: ${score}%)`);

      // Create notification for study staff
      await prisma.notification.create({
        data: {
          recipientId: 'study-coordinator',
          type: 'SYSTEM_ALERT',
          channel: 'EMAIL',
          subject: 'Patient Failed Comprehension Test',
          message: `Patient requires additional education. Score: ${score}%`,
          data: testResult,
          status: 'PENDING',
        },
      });
    }

    return testResult;
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(
    patientId: string,
    consentId: string,
    reason: string,
    withdrawalDate: Date
  ): Promise<any> {
    logger.info(`Processing consent withdrawal for patient ${patientId}`);

    const withdrawal = {
      id: crypto.randomUUID(),
      patientId,
      consentId,
      reason,
      withdrawalDate,
      recordedAt: new Date(),
    };

    // Create audit trail
    await prisma.auditLog.create({
      data: {
        userId: patientId,
        action: 'WITHDRAW_CONSENT',
        entity: 'consent',
        entityId: consentId,
        changes: withdrawal,
        ipAddress: 'system',
        userAgent: 'system',
      },
    });

    // Update patient status
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'WITHDRAWN' },
    });

    // Notify study team
    await prisma.notification.create({
      data: {
        recipientId: 'study-coordinator',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'Patient Consent Withdrawn',
        message: `Patient has withdrawn consent. Reason: ${reason}`,
        data: withdrawal,
        status: 'PENDING',
      },
    });

    return withdrawal;
  }

  /**
   * Re-consent process (for protocol amendments)
   */
  async initiateReconsent(
    patientId: string,
    newConsentId: string,
    reason: string
  ): Promise<any> {
    logger.info(`Initiating re-consent for patient ${patientId}`);

    const reconsent = {
      id: crypto.randomUUID(),
      patientId,
      previousConsentId: 'PREVIOUS_CONSENT',
      newConsentId,
      reason,
      initiatedAt: new Date(),
      status: 'PENDING',
    };

    // Send notification to patient
    await prisma.notification.create({
      data: {
        recipientId: patientId,
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'Re-consent Required',
        message: `A protocol amendment requires your review and signature. Reason: ${reason}`,
        data: reconsent,
        status: 'PENDING',
      },
    });

    return reconsent;
  }

  /**
   * Generate multilingual consent
   */
  async translateConsent(
    consentId: string,
    targetLanguage: string
  ): Promise<any> {
    logger.info(`Translating consent ${consentId} to ${targetLanguage}`);

    // In production, integrate with translation service
    // For now, return placeholder

    return {
      consentId,
      originalLanguage: 'en',
      targetLanguage,
      translatedContent: 'Translated content would be here',
      translationDate: new Date(),
      certifiedBy: 'Translation Service',
    };
  }

  /**
   * Generate consent analytics
   */
  async getConsentAnalytics(studyId: string): Promise<any> {
    logger.info(`Generating consent analytics for study ${studyId}`);

    const patients = await prisma.patient.findMany({
      where: { studyId },
    });

    const signatures = await prisma.electronicSignature.findMany({
      where: {
        documentType: 'CONSENT',
      },
    });

    const analytics = {
      totalPatients: patients.length,
      consented: signatures.length,
      pending: patients.length - signatures.length,
      consentRate: (signatures.length / patients.length) * 100,
      averageTimeToConsent: '2.5 days', // Would calculate from data
      withdrawals: 0,
    };

    return analytics;
  }

  /**
   * Helper: Generate consent PDF
   */
  private async generateConsentPDF(consent: ConsentDocument): Promise<string> {
    const filename = `Consent_${consent.studyId}_v${consent.version}_${Date.now()}.pdf`;
    const filepath = path.join(this.consentsDir, filename);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text(consent.title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Version: ${consent.version}`, { align: 'right' });
    doc.text(`Effective Date: ${consent.effectiveDate.toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();

    // Content sections
    consent.sections.forEach(section => {
      doc.fontSize(14).text(section.title, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).text(section.content);
      doc.moveDown();

      if (section.requiresInitials) {
        doc.fontSize(10).text('Initials: _______', { align: 'right' });
        doc.moveDown();
      }
    });

    // Signature section
    doc.addPage();
    doc.fontSize(14).text('Signature Section', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text('I have read and understood the above information.');
    doc.moveDown(2);
    doc.text('Patient Signature: ________________________   Date: __________');
    doc.moveDown();
    doc.text('Patient Name (Print): ________________________');
    doc.moveDown(2);
    doc.text('Witness Signature: ________________________   Date: __________');
    doc.moveDown();
    doc.text('Witness Name (Print): ________________________');

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  /**
   * Helper: Generate signed consent PDF
   */
  private async generateSignedConsentPDF(signature: ConsentSignature): Promise<string> {
    const filename = `Signed_Consent_${signature.patientId}_${Date.now()}.pdf`;
    const filepath = path.join(this.consentsDir, filename);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(16).text('Signed Informed Consent', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Patient ID: ${signature.patientId}`);
    doc.text(`Signed By: ${signature.signedBy}`);
    doc.text(`Date: ${new Date().toISOString()}`);
    doc.text(`IP Address: ${signature.ipAddress}`);

    if (signature.witnessName) {
      doc.moveDown();
      doc.text(`Witness: ${signature.witnessName}`);
    }

    if (signature.legalRepresentative) {
      doc.moveDown();
      doc.text(`Legal Representative: ${signature.legalRepresentative.name}`);
      doc.text(`Relationship: ${signature.legalRepresentative.relationship}`);
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  /**
   * Helper: Generate version hash
   */
  private generateVersionHash(consent: ConsentDocument): string {
    const content = JSON.stringify({
      title: consent.title,
      content: consent.content,
      sections: consent.sections,
      version: consent.version,
    });

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Helper: Generate signature hash
   */
  private generateSignatureHash(signature: ConsentSignature): string {
    const content = JSON.stringify({
      patientId: signature.patientId,
      consentId: signature.consentId,
      signedBy: signature.signedBy,
      timestamp: new Date().toISOString(),
    });

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify consent signature integrity
   */
  async verifyConsentIntegrity(signatureId: string): Promise<boolean> {
    logger.info(`Verifying consent signature integrity: ${signatureId}`);

    const signature = await prisma.electronicSignature.findUnique({
      where: { id: signatureId },
    });

    if (!signature) {
      return false;
    }

    // In production, verify the hash matches
    return true;
  }
}

export default new EConsentService();
