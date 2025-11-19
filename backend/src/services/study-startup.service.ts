/**
 * Study Startup Workflow Automation Service
 *
 * Automates complex study startup activities across multiple sites
 * Manages: Feasibility, Site Selection, Contracts, Budgets, Training, SIV, IRB/EC
 * Vendor parity: All major CTMS vendors (study startup)
 */

import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';

interface StudyStartupPlan {
  studyId: string;
  milestones: StartupMilestone[];
  timeline: {
    plannedStartDate: Date;
    actualStartDate?: Date;
    estimatedFirstPatientIn: Date;
    estimatedLastPatientIn: Date;
  };
  status: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED';
  overallProgress: number; // 0-100
}

interface StartupMilestone {
  id: string;
  name: string;
  category: 'FEASIBILITY' | 'SITE_SELECTION' | 'CONTRACTS' | 'BUDGET' | 'IRB_EC' | 'TRAINING' | 'SIV' | 'ACTIVATION';
  description: string;
  dueDate: Date;
  completedDate?: Date;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'DELAYED';
  assignee?: string;
  dependencies: string[]; // Milestone IDs that must be completed first
  tasks: StartupTask[];
  documents: Document[];
}

interface StartupTask {
  id: string;
  name: string;
  description: string;
  assignee: string;
  dueDate: Date;
  completedDate?: Date;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  checklist: ChecklistItem[];
}

interface ChecklistItem {
  id: string;
  description: string;
  completed: boolean;
  completedBy?: string;
  completedDate?: Date;
}

interface Document {
  id: string;
  type: string;
  name: string;
  version: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'EXPIRED';
  uploadedDate: Date;
  approvedDate?: Date;
  expiryDate?: Date;
  url: string;
}

interface FeasibilityAssessment {
  siteId: string;
  studyId: string;
  assessmentDate: Date;
  investigatorName: string;
  feasibilityScore: number; // 0-100
  criteriaAssessment: {
    patientPopulation: {
      score: number;
      estimatedEligible: number;
      estimatedEnrollment: number;
      notes: string;
    };
    facilities: {
      score: number;
      adequate: boolean;
      notes: string;
    };
    staffing: {
      score: number;
      coordinators: number;
      adequateStaffing: boolean;
      notes: string;
    };
    experience: {
      score: number;
      previousStudies: number;
      therapeuticAreaExperience: boolean;
      notes: string;
    };
    regulatory: {
      score: number;
      irbApprovalTimeline: number; // days
      notes: string;
    };
  };
  recommendation: 'HIGHLY_RECOMMENDED' | 'RECOMMENDED' | 'CONSIDER' | 'NOT_RECOMMENDED';
  estimatedTimeToActivation: number; // days
}

interface SiteContract {
  id: string;
  siteId: string;
  studyId: string;
  contractType: 'CDA' | 'CTA' | 'BUDGET';
  version: string;
  sentDate: Date;
  returnedDate?: Date;
  fullyExecutedDate?: Date;
  status: 'DRAFT' | 'SENT_FOR_SIGNATURE' | 'UNDER_NEGOTIATION' | 'PARTIALLY_EXECUTED' | 'FULLY_EXECUTED';
  signatories: Signatory[];
  amendments: ContractAmendment[];
}

interface Signatory {
  role: 'SPONSOR' | 'SITE' | 'CRO' | 'IRB';
  name: string;
  title: string;
  signedDate?: Date;
  signed: boolean;
}

interface ContractAmendment {
  id: string;
  date: Date;
  description: string;
  requestedBy: string;
  approved: boolean;
}

interface IRBECSubmission {
  id: string;
  siteId: string;
  studyId: string;
  submissionType: 'INITIAL' | 'AMENDMENT' | 'CONTINUING_REVIEW' | 'SAE_REPORT';
  submissionDate: Date;
  irbName: string;
  irbNumber: string;
  status: 'PREPARING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'CONDITIONALLY_APPROVED' | 'DISAPPROVED';
  approvalDate?: Date;
  expiryDate?: Date;
  reviewType: 'FULL_BOARD' | 'EXPEDITED' | 'EXEMPT';
  documentsSubmitted: Document[];
  conditions?: string[];
  notes?: string;
}

interface SiteTraining {
  id: string;
  siteId: string;
  studyId: string;
  trainingType: 'PROTOCOL' | 'GCP' | 'IRT_RTSM' | 'EDC' | 'SAFETY' | 'ECOA';
  trainingDate: Date;
  deliveryMethod: 'IN_PERSON' | 'WEBINAR' | 'E_LEARNING';
  trainer: string;
  attendees: TrainingAttendee[];
  materials: Document[];
  completionCriteria: {
    minimumAttendance: number; // percentage
    assessmentRequired: boolean;
    minimumScore?: number; // percentage
  };
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

interface TrainingAttendee {
  userId: string;
  name: string;
  role: string;
  attended: boolean;
  assessmentScore?: number;
  certificateIssued: boolean;
  certificateDate?: Date;
}

class StudyStartupService {
  /**
   * Create study startup plan
   */
  async createStartupPlan(studyId: string): Promise<StudyStartupPlan> {
    logger.info(`Creating startup plan for study ${studyId}`);

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: {
        sponsor: true,
      },
    });

    if (!study) {
      throw new AppError('Study not found', 404);
    }

    // Generate standard milestones based on study type
    const milestones = this.generateStandardMilestones(study);

    const startupPlan: StudyStartupPlan = {
      studyId,
      milestones,
      timeline: {
        plannedStartDate: new Date(),
        estimatedFirstPatientIn: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
        estimatedLastPatientIn: new Date(Date.now() + 545 * 24 * 60 * 60 * 1000), // 545 days (18 months)
      },
      status: 'PLANNING',
      overallProgress: 0,
    };

    logger.info(`Startup plan created with ${milestones.length} milestones`);

    return startupPlan;
  }

  /**
   * Conduct feasibility assessment
   */
  async conductFeasibilityAssessment(
    siteId: string,
    studyId: string,
    assessmentData: Partial<FeasibilityAssessment>
  ): Promise<FeasibilityAssessment> {
    logger.info(`Conducting feasibility assessment for site ${siteId}`);

    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new AppError('Site not found', 404);
    }

    // Calculate weighted feasibility score
    const scores = assessmentData.criteriaAssessment!;
    const feasibilityScore = (
      scores.patientPopulation.score * 0.35 +
      scores.facilities.score * 0.15 +
      scores.staffing.score * 0.20 +
      scores.experience.score * 0.15 +
      scores.regulatory.score * 0.15
    );

    // Determine recommendation
    let recommendation: 'HIGHLY_RECOMMENDED' | 'RECOMMENDED' | 'CONSIDER' | 'NOT_RECOMMENDED';
    if (feasibilityScore >= 85) recommendation = 'HIGHLY_RECOMMENDED';
    else if (feasibilityScore >= 70) recommendation = 'RECOMMENDED';
    else if (feasibilityScore >= 50) recommendation = 'CONSIDER';
    else recommendation = 'NOT_RECOMMENDED';

    // Estimate time to activation
    const estimatedTimeToActivation = this.calculateActivationTimeline(scores);

    const assessment: FeasibilityAssessment = {
      siteId,
      studyId,
      assessmentDate: new Date(),
      investigatorName: assessmentData.investigatorName!,
      feasibilityScore,
      criteriaAssessment: scores,
      recommendation,
      estimatedTimeToActivation,
    };

    // Store assessment
    logger.info(`Feasibility assessment complete: ${recommendation} (score: ${feasibilityScore.toFixed(1)})`);

    // Create notification for study team
    await prisma.notification.create({
      data: {
        recipientId: 'study-manager',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: `Feasibility Assessment Complete - ${site.name}`,
        message: `Feasibility assessment completed. Recommendation: ${recommendation}`,
        data: assessment,
        status: 'PENDING',
      },
    });

    return assessment;
  }

  /**
   * Initiate site contract process
   */
  async initiateContract(
    siteId: string,
    studyId: string,
    contractType: 'CDA' | 'CTA' | 'BUDGET'
  ): Promise<SiteContract> {
    logger.info(`Initiating ${contractType} contract for site ${siteId}`);

    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new AppError('Site not found', 404);
    }

    // Define required signatories
    const signatories: Signatory[] = [
      { role: 'SPONSOR', name: 'Sponsor Representative', title: 'Clinical Operations Director', signed: false },
      { role: 'SITE', name: 'Principal Investigator', title: 'MD, PhD', signed: false },
    ];

    if (contractType === 'CTA') {
      signatories.push({ role: 'IRB', name: 'IRB Chair', title: 'IRB Chairperson', signed: false });
    }

    const contract: SiteContract = {
      id: crypto.randomUUID(),
      siteId,
      studyId,
      contractType,
      version: '1.0',
      sentDate: new Date(),
      status: 'SENT_FOR_SIGNATURE',
      signatories,
      amendments: [],
    };

    // Send notification to site
    await prisma.notification.create({
      data: {
        recipientId: siteId,
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: `${contractType} Contract - Signature Required`,
        message: `${contractType} contract has been sent for your review and signature.`,
        data: contract,
        status: 'PENDING',
      },
    });

    logger.info(`Contract initiated: ${contract.id}`);

    return contract;
  }

  /**
   * Submit to IRB/EC
   */
  async submitToIRB(
    siteId: string,
    studyId: string,
    submissionType: 'INITIAL' | 'AMENDMENT' | 'CONTINUING_REVIEW' | 'SAE_REPORT'
  ): Promise<IRBECSubmission> {
    logger.info(`Submitting ${submissionType} to IRB for site ${siteId}`);

    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new AppError('Site not found', 404);
    }

    // Required documents based on submission type
    const requiredDocuments = this.getRequiredIRBDocuments(submissionType);

    const submission: IRBECSubmission = {
      id: crypto.randomUUID(),
      siteId,
      studyId,
      submissionType,
      submissionDate: new Date(),
      irbName: 'Site IRB', // Would come from site configuration
      irbNumber: 'IRB-2024-001',
      status: 'SUBMITTED',
      reviewType: submissionType === 'INITIAL' ? 'FULL_BOARD' : 'EXPEDITED',
      documentsSubmitted: requiredDocuments,
    };

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: 'SYSTEM',
        action: 'IRB_SUBMISSION',
        entity: 'IRB_SUBMISSION',
        entityId: submission.id,
        changes: {
          siteId,
          submissionType,
          status: 'SUBMITTED',
        },
      },
    });

    logger.info(`IRB submission created: ${submission.id}`);

    return submission;
  }

  /**
   * Schedule site training
   */
  async scheduleTraining(
    siteId: string,
    studyId: string,
    trainingType: 'PROTOCOL' | 'GCP' | 'IRT_RTSM' | 'EDC' | 'SAFETY' | 'ECOA',
    trainingDate: Date,
    deliveryMethod: 'IN_PERSON' | 'WEBINAR' | 'E_LEARNING'
  ): Promise<SiteTraining> {
    logger.info(`Scheduling ${trainingType} training for site ${siteId}`);

    const siteUsers = await prisma.user.findMany({
      where: {
        siteId,
        role: { in: ['INVESTIGATOR', 'SUB_INVESTIGATOR', 'STUDY_COORDINATOR'] },
      },
    });

    const attendees: TrainingAttendee[] = siteUsers.map(user => ({
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      attended: false,
      certificateIssued: false,
    }));

    const training: SiteTraining = {
      id: crypto.randomUUID(),
      siteId,
      studyId,
      trainingType,
      trainingDate,
      deliveryMethod,
      trainer: 'Clinical Training Specialist',
      attendees,
      materials: [],
      completionCriteria: {
        minimumAttendance: 80,
        assessmentRequired: trainingType === 'PROTOCOL' || trainingType === 'GCP',
        minimumScore: 80,
      },
      status: 'SCHEDULED',
    };

    // Send training invitations
    for (const attendee of attendees) {
      await prisma.notification.create({
        data: {
          recipientId: attendee.userId,
          type: 'SYSTEM_ALERT',
          channel: 'EMAIL',
          subject: `Training Scheduled: ${trainingType}`,
          message: `You are required to attend ${trainingType} training on ${trainingDate.toLocaleDateString()}.`,
          data: training,
          status: 'PENDING',
        },
      });
    }

    logger.info(`Training scheduled: ${training.id}, ${attendees.length} attendees`);

    return training;
  }

  /**
   * Track milestone progress
   */
  async updateMilestoneStatus(
    milestoneId: string,
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'DELAYED',
    notes?: string
  ): Promise<void> {
    logger.info(`Updating milestone ${milestoneId} to ${status}`);

    // In production, update milestone in database

    // If completed, check dependencies and trigger next milestones
    if (status === 'COMPLETED') {
      await this.triggerDependentMilestones(milestoneId);
    }

    // If blocked or delayed, send alerts
    if (status === 'BLOCKED' || status === 'DELAYED') {
      await this.alertMilestoneIssue(milestoneId, status, notes);
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: 'SYSTEM',
        action: 'MILESTONE_STATUS_UPDATE',
        entity: 'MILESTONE',
        entityId: milestoneId,
        changes: {
          status,
          notes,
        },
      },
    });
  }

  /**
   * Get startup progress dashboard
   */
  async getStartupProgress(studyId: string): Promise<any> {
    logger.info(`Retrieving startup progress for study ${studyId}`);

    // In production, query actual startup plan and milestones
    const progress = {
      overallProgress: 65,
      status: 'IN_PROGRESS',
      milestones: {
        total: 12,
        completed: 8,
        inProgress: 3,
        notStarted: 1,
        blocked: 0,
      },
      sites: {
        total: 15,
        activated: 8,
        inActivation: 5,
        feasibility: 2,
      },
      contracts: {
        cdaSigned: 15,
        ctaSigned: 10,
        budgetApproved: 12,
      },
      irb: {
        approved: 9,
        submitted: 4,
        preparing: 2,
      },
      training: {
        completed: 8,
        scheduled: 5,
        pending: 2,
      },
      estimatedFirstPatientIn: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      daysToFirstPatient: 45,
      onTrack: true,
    };

    return progress;
  }

  /**
   * Generate standard milestones
   */
  private generateStandardMilestones(study: any): StartupMilestone[] {
    const milestones: StartupMilestone[] = [
      {
        id: '1',
        name: 'Feasibility Assessment',
        category: 'FEASIBILITY',
        description: 'Conduct feasibility assessment for all candidate sites',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: [],
        tasks: [],
        documents: [],
      },
      {
        id: '2',
        name: 'Site Selection',
        category: 'SITE_SELECTION',
        description: 'Finalize site selection based on feasibility',
        dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['1'],
        tasks: [],
        documents: [],
      },
      {
        id: '3',
        name: 'CDA Execution',
        category: 'CONTRACTS',
        description: 'Execute Confidential Disclosure Agreements with all sites',
        dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['2'],
        tasks: [],
        documents: [],
      },
      {
        id: '4',
        name: 'Budget Negotiation',
        category: 'BUDGET',
        description: 'Negotiate and finalize site budgets',
        dueDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['3'],
        tasks: [],
        documents: [],
      },
      {
        id: '5',
        name: 'IRB/EC Submission',
        category: 'IRB_EC',
        description: 'Submit study protocol to all site IRBs/ECs',
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['4'],
        tasks: [],
        documents: [],
      },
      {
        id: '6',
        name: 'IRB/EC Approval',
        category: 'IRB_EC',
        description: 'Obtain IRB/EC approval from all sites',
        dueDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['5'],
        tasks: [],
        documents: [],
      },
      {
        id: '7',
        name: 'CTA Execution',
        category: 'CONTRACTS',
        description: 'Execute Clinical Trial Agreements with all sites',
        dueDate: new Date(Date.now() + 135 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['6'],
        tasks: [],
        documents: [],
      },
      {
        id: '8',
        name: 'Site Training',
        category: 'TRAINING',
        description: 'Conduct protocol and system training for all site staff',
        dueDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['7'],
        tasks: [],
        documents: [],
      },
      {
        id: '9',
        name: 'Site Initiation Visit',
        category: 'SIV',
        description: 'Complete SIV for all sites',
        dueDate: new Date(Date.now() + 165 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['8'],
        tasks: [],
        documents: [],
      },
      {
        id: '10',
        name: 'Site Activation',
        category: 'ACTIVATION',
        description: 'Activate all sites for patient enrollment',
        dueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        status: 'NOT_STARTED',
        dependencies: ['9'],
        tasks: [],
        documents: [],
      },
    ];

    return milestones;
  }

  /**
   * Calculate activation timeline
   */
  private calculateActivationTimeline(scores: any): number {
    // Base timeline: 120 days
    let timeline = 120;

    // Adjust based on regulatory efficiency
    if (scores.regulatory.score >= 80) {
      timeline -= 15; // Efficient IRB process
    } else if (scores.regulatory.score < 50) {
      timeline += 30; // Slow IRB process
    }

    // Adjust based on experience
    if (scores.experience.score >= 80) {
      timeline -= 10; // Experienced site
    }

    return Math.max(timeline, 60); // Minimum 60 days
  }

  /**
   * Get required IRB documents
   */
  private getRequiredIRBDocuments(submissionType: string): Document[] {
    const baseDocuments: Document[] = [
      {
        id: crypto.randomUUID(),
        type: 'PROTOCOL',
        name: 'Study Protocol',
        version: '2.0',
        status: 'APPROVED',
        uploadedDate: new Date(),
        url: '/documents/protocol-v2.pdf',
      },
      {
        id: crypto.randomUUID(),
        type: 'ICF',
        name: 'Informed Consent Form',
        version: '2.0',
        status: 'APPROVED',
        uploadedDate: new Date(),
        url: '/documents/icf-v2.pdf',
      },
    ];

    if (submissionType === 'INITIAL') {
      baseDocuments.push(
        {
          id: crypto.randomUUID(),
          type: 'IB',
          name: "Investigator's Brochure",
          version: '4.0',
          status: 'APPROVED',
          uploadedDate: new Date(),
          url: '/documents/ib-v4.pdf',
        },
        {
          id: crypto.randomUUID(),
          type: 'CV',
          name: 'Principal Investigator CV',
          version: '1.0',
          status: 'APPROVED',
          uploadedDate: new Date(),
          url: '/documents/pi-cv.pdf',
        }
      );
    }

    return baseDocuments;
  }

  /**
   * Trigger dependent milestones
   */
  private async triggerDependentMilestones(completedMilestoneId: string): Promise<void> {
    logger.info(`Checking for dependent milestones of ${completedMilestoneId}`);

    // In production, query milestones that depend on completed milestone
    // Update their status to IN_PROGRESS if all dependencies are met
  }

  /**
   * Alert milestone issue
   */
  private async alertMilestoneIssue(milestoneId: string, status: string, notes?: string): Promise<void> {
    await prisma.notification.create({
      data: {
        recipientId: 'study-manager',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: `Milestone ${status}: Attention Required`,
        message: `A critical study startup milestone is ${status}. ${notes || ''}`,
        data: {
          milestoneId,
          status,
          notes,
        },
        status: 'PENDING',
      },
    });
  }
}

export default new StudyStartupService();
