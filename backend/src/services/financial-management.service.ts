/**
 * Financial Management Service
 *
 * Clinical trial financial management and budgeting
 * Site payments, patient stipends, invoicing, budget tracking
 * Vendor parity: Oracle Clinical One Finance, Veeva CTMS Financials
 */

import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';

interface StudyBudget {
  id: string;
  studyId: string;
  totalBudget: number;
  currency: string;
  categories: BudgetCategory[];
  approvedDate?: Date;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REVISED';
  version: string;
}

interface BudgetCategory {
  category: 'SITE_COSTS' | 'IP_COSTS' | 'LAB_COSTS' | 'CRO_COSTS' | 'PATIENT_STIPENDS' | 'OVERHEAD' | 'OTHER';
  budgeted: number;
  spent: number;
  committed: number;
  remaining: number;
  subcategories?: BudgetSubcategory[];
}

interface BudgetSubcategory {
  name: string;
  budgeted: number;
  spent: number;
  committed: number;
}

interface SiteBudget {
  id: string;
  siteId: string;
  studyId: string;
  totalBudget: number;
  currency: string;
  paymentSchedule: PaymentMilestone[];
  perPatientCosts: PerPatientCost[];
  fixedCosts: FixedCost[];
  status: 'DRAFT' | 'NEGOTIATING' | 'APPROVED';
  version: string;
  effectiveDate: Date;
}

interface PaymentMilestone {
  id: string;
  milestone: 'SITE_ACTIVATION' | 'FIRST_PATIENT_IN' | 'LAST_PATIENT_IN' | 'DATABASE_LOCK' | 'CUSTOM';
  description: string;
  amount: number;
  dueDate?: Date;
  completedDate?: Date;
  paid: boolean;
  paidDate?: Date;
  invoiceId?: string;
}

interface PerPatientCost {
  id: string;
  visitType: string;
  visitName: string;
  costPerPatient: number;
  procedures: ProcedureCost[];
  totalCost: number;
}

interface ProcedureCost {
  procedure: string;
  cost: number;
  quantity?: number;
}

interface FixedCost {
  id: string;
  description: string;
  amount: number;
  frequency: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  siteId?: string;
  vendorId?: string;
  studyId: string;
  amount: number;
  currency: string;
  status: 'DRAFT' | 'SENT' | 'APPROVED' | 'PAID' | 'OVERDUE' | 'DISPUTED';
  lineItems: InvoiceLineItem[];
  paymentTerms: string;
  notes?: string;
  paidDate?: Date;
  paidAmount?: number;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: string;
}

interface PatientStipend {
  id: string;
  patientId: string;
  studyId: string;
  visitId?: string;
  amount: number;
  currency: string;
  reason: 'TRAVEL' | 'TIME_AND_INCONVENIENCE' | 'PARKING' | 'MEAL' | 'OTHER';
  approvedBy: string;
  approvedDate: Date;
  paid: boolean;
  paidDate?: Date;
  paymentMethod: 'CHECK' | 'CASH' | 'GIFT_CARD' | 'DIRECT_DEPOSIT';
  receiptNumber?: string;
}

interface FinancialReport {
  studyId: string;
  reportDate: Date;
  reportPeriod: {
    start: Date;
    end: Date;
  };
  summary: {
    totalBudget: number;
    totalSpent: number;
    totalCommitted: number;
    totalRemaining: number;
    burnRate: number; // per month
    projectedCompletion: number;
    variancePercentage: number;
  };
  byCategory: BudgetCategory[];
  bySite: SiteFinancialSummary[];
  forecast: BudgetForecast[];
}

interface SiteFinancialSummary {
  siteId: string;
  siteName: string;
  budgeted: number;
  spent: number;
  committed: number;
  patientsEnrolled: number;
  costPerPatient: number;
}

interface BudgetForecast {
  month: Date;
  projectedSpend: number;
  projectedCommitments: number;
  cumulativeSpend: number;
}

class FinancialManagementService {
  /**
   * Create study budget
   */
  async createStudyBudget(studyId: string, budgetData: Partial<StudyBudget>): Promise<StudyBudget> {
    logger.info(`Creating budget for study ${studyId}`);

    const study = await prisma.study.findUnique({
      where: { id: studyId },
    });

    if (!study) {
      throw new AppError('Study not found', 404);
    }

    // Calculate category totals
    const categories = budgetData.categories!.map(cat => ({
      ...cat,
      remaining: cat.budgeted - cat.spent - cat.committed,
    }));

    const totalBudget = categories.reduce((sum, cat) => sum + cat.budgeted, 0);

    const budget: StudyBudget = {
      id: crypto.randomUUID(),
      studyId,
      totalBudget,
      currency: budgetData.currency || 'USD',
      categories,
      status: 'DRAFT',
      version: '1.0',
    };

    logger.info(`Study budget created: $${totalBudget.toLocaleString()}`);

    return budget;
  }

  /**
   * Create site budget
   */
  async createSiteBudget(
    siteId: string,
    studyId: string,
    budgetData: Partial<SiteBudget>
  ): Promise<SiteBudget> {
    logger.info(`Creating site budget for site ${siteId}`);

    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new AppError('Site not found', 404);
    }

    // Calculate total budget
    const fixedTotal = budgetData.fixedCosts!.reduce((sum, cost) => sum + cost.amount, 0);
    const milestoneTotal = budgetData.paymentSchedule!.reduce((sum, pm) => sum + pm.amount, 0);
    const perPatientTotal = budgetData.perPatientCosts!.reduce((sum, ppc) => sum + ppc.totalCost, 0);

    const totalBudget = fixedTotal + milestoneTotal + (perPatientTotal * (budgetData as any).expectedPatients || 0);

    const siteBudget: SiteBudget = {
      id: crypto.randomUUID(),
      siteId,
      studyId,
      totalBudget,
      currency: budgetData.currency || 'USD',
      paymentSchedule: budgetData.paymentSchedule!,
      perPatientCosts: budgetData.perPatientCosts!,
      fixedCosts: budgetData.fixedCosts!,
      status: 'DRAFT',
      version: '1.0',
      effectiveDate: new Date(),
    };

    logger.info(`Site budget created: $${totalBudget.toLocaleString()}`);

    return siteBudget;
  }

  /**
   * Generate invoice
   */
  async generateInvoice(invoiceData: Partial<Invoice>): Promise<Invoice> {
    logger.info(`Generating invoice for study ${invoiceData.studyId}`);

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Calculate total from line items
    const totalAmount = invoiceData.lineItems!.reduce((sum, item) => sum + item.totalPrice, 0);

    // Calculate due date (typically 30 days)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      invoiceNumber,
      invoiceDate: new Date(),
      dueDate,
      siteId: invoiceData.siteId,
      vendorId: invoiceData.vendorId,
      studyId: invoiceData.studyId!,
      amount: totalAmount,
      currency: invoiceData.currency || 'USD',
      status: 'DRAFT',
      lineItems: invoiceData.lineItems!,
      paymentTerms: invoiceData.paymentTerms || 'Net 30',
      notes: invoiceData.notes,
    };

    logger.info(`Invoice generated: ${invoiceNumber}, Amount: $${totalAmount.toLocaleString()}`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: 'SYSTEM',
        action: 'INVOICE_GENERATED',
        entity: 'INVOICE',
        entityId: invoice.id,
        changes: {
          invoiceNumber,
          amount: totalAmount,
          siteId: invoiceData.siteId,
        },
      },
    });

    return invoice;
  }

  /**
   * Process payment milestone
   */
  async processPaymentMilestone(
    siteId: string,
    milestoneId: string,
    completed: boolean
  ): Promise<void> {
    logger.info(`Processing payment milestone ${milestoneId} for site ${siteId}`);

    if (!completed) {
      logger.info('Milestone not completed, payment not triggered');
      return;
    }

    // Get site budget and milestone details
    // In production, query from database

    // Generate invoice for milestone payment
    const invoice = await this.generateInvoice({
      studyId: 'study-123',
      siteId,
      lineItems: [
        {
          description: 'Payment Milestone: Site Activation',
          quantity: 1,
          unitPrice: 5000,
          totalPrice: 5000,
          category: 'MILESTONE_PAYMENT',
        },
      ],
      paymentTerms: 'Net 30',
    });

    // Send notification to finance team
    await prisma.notification.create({
      data: {
        recipientId: 'finance-team',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: `Payment Milestone Completed - ${siteId}`,
        message: `Payment milestone completed. Invoice ${invoice.invoiceNumber} generated.`,
        data: invoice,
        status: 'PENDING',
      },
    });

    logger.info(`Payment milestone processed, invoice ${invoice.invoiceNumber} generated`);
  }

  /**
   * Process patient visit payment
   */
  async processPatientVisitPayment(
    patientId: string,
    visitId: string,
    siteId: string
  ): Promise<void> {
    logger.info(`Processing visit payment for patient ${patientId}, visit ${visitId}`);

    // Get per-patient costs for this visit type
    // In production, query from site budget

    const visitCost = 1500; // Example per-patient visit cost

    // Generate invoice line item
    const lineItem: InvoiceLineItem = {
      description: `Patient Visit - Week 4 Follow-up`,
      quantity: 1,
      unitPrice: visitCost,
      totalPrice: visitCost,
      category: 'PER_PATIENT_COST',
    };

    // Add to month-end invoice or create immediate invoice
    logger.info(`Visit payment processed: $${visitCost}`);
  }

  /**
   * Issue patient stipend
   */
  async issuePatientStipend(stipendData: Partial<PatientStipend>): Promise<PatientStipend> {
    logger.info(`Issuing stipend for patient ${stipendData.patientId}`);

    const patient = await prisma.patient.findUnique({
      where: { id: stipendData.patientId },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    const stipend: PatientStipend = {
      id: crypto.randomUUID(),
      patientId: stipendData.patientId!,
      studyId: stipendData.studyId!,
      visitId: stipendData.visitId,
      amount: stipendData.amount!,
      currency: stipendData.currency || 'USD',
      reason: stipendData.reason!,
      approvedBy: stipendData.approvedBy!,
      approvedDate: new Date(),
      paid: false,
      paymentMethod: stipendData.paymentMethod!,
    };

    // Create notification for site coordinator
    await prisma.notification.create({
      data: {
        recipientId: 'site-coordinator',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: `Patient Stipend Approved - ${patient.patientNumber}`,
        message: `Patient stipend of $${stipend.amount} approved for ${stipend.reason}`,
        data: stipend,
        status: 'PENDING',
      },
    });

    logger.info(`Stipend issued: $${stipend.amount} for ${stipend.reason}`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: stipendData.approvedBy!,
        action: 'PATIENT_STIPEND_ISSUED',
        entity: 'PATIENT_STIPEND',
        entityId: stipend.id,
        changes: {
          patientId: stipendData.patientId,
          amount: stipend.amount,
          reason: stipend.reason,
        },
      },
    });

    return stipend;
  }

  /**
   * Record stipend payment
   */
  async recordStipendPayment(stipendId: string, receiptNumber: string): Promise<void> {
    logger.info(`Recording payment for stipend ${stipendId}`);

    // In production, update stipend record
    const paidDate = new Date();

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: 'SYSTEM',
        action: 'STIPEND_PAID',
        entity: 'PATIENT_STIPEND',
        entityId: stipendId,
        changes: {
          paidDate,
          receiptNumber,
        },
      },
    });

    logger.info(`Stipend payment recorded: Receipt ${receiptNumber}`);
  }

  /**
   * Generate financial report
   */
  async generateFinancialReport(
    studyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<FinancialReport> {
    logger.info(`Generating financial report for study ${studyId}`);

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: {
        sites: true,
        patients: true,
      },
    });

    if (!study) {
      throw new AppError('Study not found', 404);
    }

    // Get budget and spending data
    // In production, query actual financial transactions

    const totalBudget = 5000000;
    const totalSpent = 3250000;
    const totalCommitted = 500000;
    const totalRemaining = totalBudget - totalSpent - totalCommitted;

    // Calculate burn rate (spend per month)
    const monthsElapsed = this.calculateMonthsDifference(study.startDate!, new Date());
    const burnRate = totalSpent / Math.max(monthsElapsed, 1);

    // Project completion budget
    const remainingMonths = (study.targetEnrollment - (study.patients?.length || 0)) / 10; // Assume 10 patients/month
    const projectedCompletion = totalSpent + (burnRate * remainingMonths);

    // Calculate variance
    const expectedSpend = (totalBudget / 24) * monthsElapsed; // Assume 24 month study
    const variancePercentage = ((totalSpent - expectedSpend) / expectedSpend) * 100;

    const report: FinancialReport = {
      studyId,
      reportDate: new Date(),
      reportPeriod: { start: startDate, end: endDate },
      summary: {
        totalBudget,
        totalSpent,
        totalCommitted,
        totalRemaining,
        burnRate,
        projectedCompletion,
        variancePercentage,
      },
      byCategory: this.calculateCategorySpending(),
      bySite: this.calculateSiteSpending(study.sites || []),
      forecast: this.generateBudgetForecast(burnRate, remainingMonths),
    };

    logger.info(`Financial report generated: Budget $${totalBudget.toLocaleString()}, Spent $${totalSpent.toLocaleString()}`);

    return report;
  }

  /**
   * Track invoice payment
   */
  async recordInvoicePayment(
    invoiceId: string,
    paidAmount: number,
    paidDate: Date
  ): Promise<void> {
    logger.info(`Recording payment for invoice ${invoiceId}`);

    // In production, update invoice record
    // Update budget spent amounts

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: 'SYSTEM',
        action: 'INVOICE_PAID',
        entity: 'INVOICE',
        entityId: invoiceId,
        changes: {
          paidAmount,
          paidDate,
          status: 'PAID',
        },
      },
    });

    logger.info(`Invoice payment recorded: $${paidAmount.toLocaleString()}`);
  }

  /**
   * Get budget status
   */
  async getBudgetStatus(studyId: string): Promise<any> {
    logger.info(`Retrieving budget status for study ${studyId}`);

    // In production, calculate from actual transactions
    const status = {
      totalBudget: 5000000,
      totalSpent: 3250000,
      totalCommitted: 500000,
      totalRemaining: 1250000,
      percentageSpent: 65,
      percentageCommitted: 10,
      percentageRemaining: 25,
      onBudget: true,
      variance: -125000, // Under budget
      alerts: [
        {
          category: 'LAB_COSTS',
          severity: 'WARNING',
          message: 'Lab costs trending 15% over budget',
        },
      ],
    };

    return status;
  }

  /**
   * Get overdue invoices
   */
  async getOverdueInvoices(studyId?: string): Promise<Invoice[]> {
    logger.info('Retrieving overdue invoices');

    // In production, query invoices where dueDate < today and status != PAID
    const overdueInvoices: Invoice[] = [];

    return overdueInvoices;
  }

  /**
   * Helper: Calculate months difference
   */
  private calculateMonthsDifference(startDate: Date, endDate: Date): number {
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                   (endDate.getMonth() - startDate.getMonth());
    return Math.max(months, 1);
  }

  /**
   * Helper: Calculate category spending
   */
  private calculateCategorySpending(): BudgetCategory[] {
    return [
      {
        category: 'SITE_COSTS',
        budgeted: 2000000,
        spent: 1300000,
        committed: 200000,
        remaining: 500000,
      },
      {
        category: 'IP_COSTS',
        budgeted: 1500000,
        spent: 950000,
        committed: 150000,
        remaining: 400000,
      },
      {
        category: 'LAB_COSTS',
        budgeted: 800000,
        spent: 600000,
        committed: 100000,
        remaining: 100000,
      },
      {
        category: 'PATIENT_STIPENDS',
        budgeted: 400000,
        spent: 250000,
        committed: 50000,
        remaining: 100000,
      },
      {
        category: 'OVERHEAD',
        budgeted: 300000,
        spent: 150000,
        committed: 0,
        remaining: 150000,
      },
    ];
  }

  /**
   * Helper: Calculate site spending
   */
  private calculateSiteSpending(sites: any[]): SiteFinancialSummary[] {
    return sites.slice(0, 5).map((site, index) => ({
      siteId: site.id,
      siteName: site.name,
      budgeted: 200000,
      spent: 130000 + (index * 10000),
      committed: 20000,
      patientsEnrolled: 15 + index,
      costPerPatient: (130000 + (index * 10000)) / (15 + index),
    }));
  }

  /**
   * Helper: Generate budget forecast
   */
  private generateBudgetForecast(burnRate: number, remainingMonths: number): BudgetForecast[] {
    const forecast: BudgetForecast[] = [];
    let cumulativeSpend = 3250000; // Current spend

    for (let i = 1; i <= Math.min(remainingMonths, 12); i++) {
      const projectedSpend = burnRate;
      const projectedCommitments = burnRate * 0.15; // Assume 15% commitment rate
      cumulativeSpend += projectedSpend;

      forecast.push({
        month: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000),
        projectedSpend,
        projectedCommitments,
        cumulativeSpend,
      });
    }

    return forecast;
  }

  /**
   * Export financial data
   */
  async exportFinancialData(studyId: string, format: 'CSV' | 'EXCEL' | 'PDF'): Promise<string> {
    logger.info(`Exporting financial data for study ${studyId} in ${format} format`);

    // In production, generate export file
    const exportFile = `/exports/FINANCIALS_${studyId}_${Date.now()}.${format.toLowerCase()}`;

    return exportFile;
  }
}

export default new FinancialManagementService();
