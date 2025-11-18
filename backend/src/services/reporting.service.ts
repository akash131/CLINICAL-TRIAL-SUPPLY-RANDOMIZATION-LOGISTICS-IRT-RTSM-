/**
 * Advanced Reporting Service
 *
 * PDF generation, regulatory reports, CFR Part 11 compliant reporting
 * Vendor parity: All vendors (comprehensive reporting capabilities)
 */

import PDFDocument from 'pdfkit';
import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import * as fs from 'fs';
import * as path from 'path';

interface ReportRequest {
  studyId: string;
  reportType: string;
  startDate?: Date;
  endDate?: Date;
  parameters?: Record<string, any>;
  requestedBy: string;
}

class ReportingService {
  private reportsDir = process.env.REPORTS_DIR || './reports';

  constructor() {
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Generate comprehensive study report
   */
  async generateStudyReport(request: ReportRequest): Promise<string> {
    logger.info(`Generating study report for ${request.studyId}`);

    const study = await prisma.study.findUnique({
      where: { id: request.studyId },
      include: {
        sponsor: true,
        arms: true,
        sites: {
          include: { site: true },
        },
        patients: true,
        randomizations: true,
      },
    });

    if (!study) {
      throw new AppError('Study not found', 404);
    }

    const filename = `Study_Report_${study.protocolNumber}_${Date.now()}.pdf`;
    const filepath = path.join(this.reportsDir, filename);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Header
    this.addHeader(doc, 'Study Report');

    // Study Information
    doc.fontSize(16).text('Study Information', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Protocol Number: ${study.protocolNumber}`);
    doc.text(`Title: ${study.title}`);
    doc.text(`Phase: ${study.phase}`);
    doc.text(`Status: ${study.status}`);
    doc.text(`Sponsor: ${study.sponsor.name}`);
    doc.text(`Target Enrollment: ${study.targetEnrollment}`);
    doc.moveDown();

    // Enrollment Statistics
    doc.fontSize(16).text('Enrollment Statistics', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total Patients: ${study.patients.length}`);
    doc.text(`Randomized: ${study.randomizations.length}`);

    const statusCounts = study.patients.reduce((acc: any, p: any) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});

    Object.entries(statusCounts).forEach(([status, count]) => {
      doc.text(`${status}: ${count}`);
    });
    doc.moveDown();

    // Sites
    doc.fontSize(16).text('Participating Sites', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    study.sites.forEach((studySite: any) => {
      doc.text(`${studySite.site.siteNumber} - ${studySite.site.name} (${studySite.site.country})`);
    });
    doc.moveDown();

    // Treatment Arms
    doc.fontSize(16).text('Treatment Arms', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    study.arms.forEach((arm: any) => {
      doc.text(`${arm.code}: ${arm.name}`);
      if (arm.description) doc.text(`  ${arm.description}`);
    });

    // Footer with signatures and metadata
    this.addFooter(doc, {
      generatedBy: request.requestedBy,
      generatedDate: new Date(),
      reportType: 'Study Report',
    });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`Study report generated: ${filename}`);
        resolve(filepath);
      });
      stream.on('error', reject);
    });
  }

  /**
   * Generate randomization report
   */
  async generateRandomizationReport(request: ReportRequest): Promise<string> {
    logger.info(`Generating randomization report for ${request.studyId}`);

    const randomizations = await prisma.randomization.findMany({
      where: {
        studyId: request.studyId,
        ...(request.startDate && request.endDate && {
          randomizationDate: {
            gte: request.startDate,
            lte: request.endDate,
          },
        }),
      },
      include: {
        patient: true,
        study: true,
      },
      orderBy: { randomizationDate: 'asc' },
    });

    const filename = `Randomization_Report_${Date.now()}.pdf`;
    const filepath = path.join(this.reportsDir, filename);

    const doc = new PDFDocument({ size: 'A4', margin: 50, layout: 'landscape' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    this.addHeader(doc, 'Randomization Report');

    doc.fontSize(14).text(`Total Randomizations: ${randomizations.length}`);
    doc.moveDown();

    // Table header
    doc.fontSize(10).font('Helvetica-Bold');
    const tableTop = doc.y;
    const colWidth = 120;

    doc.text('Randomization #', 50, tableTop, { width: colWidth });
    doc.text('Patient #', 50 + colWidth, tableTop, { width: colWidth });
    doc.text('Treatment Arm', 50 + colWidth * 2, tableTop, { width: colWidth });
    doc.text('Date', 50 + colWidth * 3, tableTop, { width: colWidth });
    doc.text('Algorithm', 50 + colWidth * 4, tableTop, { width: colWidth });

    doc.moveDown();
    doc.font('Helvetica');

    // Table rows
    randomizations.forEach((rand: any, index) => {
      const y = doc.y;
      doc.text(rand.randomizationNumber, 50, y, { width: colWidth });
      doc.text(rand.patient.patientNumber, 50 + colWidth, y, { width: colWidth });
      doc.text(rand.treatmentArmCode, 50 + colWidth * 2, y, { width: colWidth });
      doc.text(rand.randomizationDate.toLocaleDateString(), 50 + colWidth * 3, y, { width: colWidth });
      doc.text(rand.algorithm, 50 + colWidth * 4, y, { width: colWidth });
      doc.moveDown(0.5);

      // Add new page if needed
      if (doc.y > 500) {
        doc.addPage();
      }
    });

    this.addFooter(doc, {
      generatedBy: request.requestedBy,
      generatedDate: new Date(),
      reportType: 'Randomization Report',
    });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`Randomization report generated: ${filename}`);
        resolve(filepath);
      });
      stream.on('error', reject);
    });
  }

  /**
   * Generate inventory report
   */
  async generateInventoryReport(request: ReportRequest): Promise<string> {
    logger.info(`Generating inventory report for ${request.studyId}`);

    const inventory = await prisma.inventory.findMany({
      where: { studyId: request.studyId },
      include: {
        kit: {
          include: { product: true },
        },
        site: true,
      },
    });

    const filename = `Inventory_Report_${Date.now()}.pdf`;
    const filepath = path.join(this.reportsDir, filename);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    this.addHeader(doc, 'Inventory Report');

    // Summary by status
    const statusSummary = inventory.reduce((acc: any, inv: any) => {
      acc[inv.status] = (acc[inv.status] || 0) + inv.quantity;
      return acc;
    }, {});

    doc.fontSize(14).text('Inventory Summary');
    doc.moveDown(0.5);
    doc.fontSize(12);
    Object.entries(statusSummary).forEach(([status, quantity]) => {
      doc.text(`${status}: ${quantity} kits`);
    });
    doc.moveDown();

    // By site
    doc.fontSize(14).text('Inventory by Site');
    doc.moveDown(0.5);
    doc.fontSize(10);

    const siteSummary = inventory.reduce((acc: any, inv: any) => {
      if (!inv.site) return acc;
      const key = inv.site.siteNumber;
      if (!acc[key]) {
        acc[key] = { name: inv.site.name, quantity: 0 };
      }
      acc[key].quantity += inv.quantity;
      return acc;
    }, {});

    Object.entries(siteSummary).forEach(([siteNumber, data]: [string, any]) => {
      doc.text(`${siteNumber} - ${data.name}: ${data.quantity} kits`);
    });

    this.addFooter(doc, {
      generatedBy: request.requestedBy,
      generatedDate: new Date(),
      reportType: 'Inventory Report',
    });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`Inventory report generated: ${filename}`);
        resolve(filepath);
      });
      stream.on('error', reject);
    });
  }

  /**
   * Generate regulatory compliance report (21 CFR Part 11)
   */
  async generateComplianceReport(request: ReportRequest): Promise<string> {
    logger.info(`Generating compliance report for ${request.studyId}`);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'study',
        entityId: request.studyId,
        ...(request.startDate && request.endDate && {
          timestamp: {
            gte: request.startDate,
            lte: request.endDate,
          },
        }),
      },
      include: { user: true },
      orderBy: { timestamp: 'desc' },
      take: 1000, // Limit for performance
    });

    const signatures = await prisma.electronicSignature.findMany({
      where: {
        documentType: 'STUDY',
        documentId: request.studyId,
      },
      include: { user: true },
      orderBy: { timestamp: 'desc' },
    });

    const filename = `Compliance_Report_${Date.now()}.pdf`;
    const filepath = path.join(this.reportsDir, filename);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    this.addHeader(doc, '21 CFR Part 11 Compliance Report');

    doc.fontSize(14).text('Audit Trail Summary');
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total Audit Entries: ${auditLogs.length}`);
    doc.text(`Total Electronic Signatures: ${signatures.length}`);
    doc.moveDown();

    doc.fontSize(14).text('Electronic Signatures');
    doc.moveDown(0.5);
    doc.fontSize(10);

    signatures.forEach((sig: any) => {
      doc.text(`User: ${sig.user.email}`);
      doc.text(`Document: ${sig.documentType} (${sig.documentId})`);
      doc.text(`Reason: ${sig.reason}`);
      doc.text(`Timestamp: ${sig.timestamp.toISOString()}`);
      doc.text(`Signature Hash: ${sig.signatureHash.substring(0, 16)}...`);
      doc.moveDown(0.5);
    });

    this.addFooter(doc, {
      generatedBy: request.requestedBy,
      generatedDate: new Date(),
      reportType: '21 CFR Part 11 Compliance Report',
    });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`Compliance report generated: ${filename}`);
        resolve(filepath);
      });
      stream.on('error', reject);
    });
  }

  /**
   * Add header to PDF
   */
  private addHeader(doc: PDFKit.PDFDocument, title: string): void {
    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
  }

  /**
   * Add footer to PDF
   */
  private addFooter(
    doc: PDFKit.PDFDocument,
    metadata: { generatedBy: string; generatedDate: Date; reportType: string }
  ): void {
    const bottom = 750;
    doc.fontSize(8).text(
      `Generated by: ${metadata.generatedBy} | ${metadata.generatedDate.toISOString()} | ${metadata.reportType}`,
      50,
      bottom,
      { align: 'center' }
    );
    doc.text('IRT/RTSM Clinical Trial Platform - Confidential', 50, bottom + 15, {
      align: 'center',
    });
  }
}

export default new ReportingService();
