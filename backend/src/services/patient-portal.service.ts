/**
 * Patient Portal Service
 *
 * Patient-facing portal for self-service capabilities
 * Vendor parity: All major vendors (patient engagement)
 */

import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface PatientRegistration {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  phone?: string;
  preferredLanguage: string;
  siteCode?: string;
  studyCode?: string;
  invitationCode?: string;
}

interface PatientLogin {
  email: string;
  password: string;
  deviceInfo?: {
    platform: string;
    browser: string;
    ipAddress: string;
  };
}

interface PatientSession {
  sessionId: string;
  patientId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

interface VisitSchedule {
  visitId: string;
  visitName: string;
  visitWindow: {
    start: Date;
    end: Date;
  };
  status: 'UPCOMING' | 'DUE' | 'OVERDUE' | 'COMPLETED' | 'MISSED';
  procedures: string[];
  questionnaires: string[];
  location?: string;
}

interface PatientDashboard {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    patientNumber: string;
    enrollmentDate: Date;
    studyArm?: string;
  };
  study: {
    title: string;
    phase: string;
    principalInvestigator: string;
  };
  upcomingVisits: VisitSchedule[];
  pendingQuestionnaires: number;
  completedQuestionnaires: number;
  messages: number;
  lastLogin?: Date;
}

class PatientPortalService {
  private JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
  private JWT_EXPIRY = '24h';
  private REFRESH_TOKEN_EXPIRY = '30d';

  /**
   * Register new patient account
   */
  async registerPatient(registration: PatientRegistration): Promise<any> {
    logger.info(`Patient registration attempt: ${registration.email}`);

    // Validate invitation code if provided
    if (registration.invitationCode) {
      const invitation = await this.validateInvitationCode(registration.invitationCode);

      if (!invitation.valid) {
        throw new AppError('Invalid or expired invitation code', 400);
      }
    }

    // Check if patient already exists
    const existingPatient = await prisma.patient.findFirst({
      where: {
        email: registration.email,
      },
    });

    if (existingPatient) {
      throw new AppError('Patient account already exists', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(registration.password, 12);

    // Create patient account
    const patient = await prisma.patient.create({
      data: {
        email: registration.email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        dateOfBirth: registration.dateOfBirth,
        phone: registration.phone,
        status: 'SCREENING',
        enrollmentDate: new Date(),
        preferredLanguage: registration.preferredLanguage,
        // In production, link to site and study from invitation
        // siteId, studyId would come from invitation
      },
    });

    // Create user account for portal login
    const user = await prisma.user.create({
      data: {
        email: registration.email,
        username: registration.email,
        password: passwordHash,
        firstName: registration.firstName,
        lastName: registration.lastName,
        role: 'PATIENT',
        status: 'ACTIVE',
        // Link to patient record
        patientId: patient.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PATIENT_REGISTRATION',
        entity: 'PATIENT',
        entityId: patient.id,
        changes: {
          email: registration.email,
          registeredAt: new Date(),
        },
      },
    });

    // Send welcome email
    await prisma.notification.create({
      data: {
        recipientId: patient.id,
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'Welcome to the Patient Portal',
        message: `Welcome ${registration.firstName}! Your patient portal account has been created.`,
        status: 'PENDING',
      },
    });

    logger.info(`Patient registered successfully: ${patient.id}`);

    return {
      patientId: patient.id,
      userId: user.id,
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  /**
   * Patient login
   */
  async login(credentials: PatientLogin): Promise<PatientSession> {
    logger.info(`Patient login attempt: ${credentials.email}`);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
      include: {
        patient: true,
      },
    });

    if (!user || user.role !== 'PATIENT') {
      throw new AppError('Invalid credentials', 401);
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError('Account is not active', 403);
    }

    // Verify password
    const passwordValid = await bcrypt.compare(credentials.password, user.password);

    if (!passwordValid) {
      // Log failed attempt
      await this.logFailedLogin(user.id, credentials.deviceInfo);
      throw new AppError('Invalid credentials', 401);
    }

    // Generate tokens
    const token = jwt.sign(
      {
        userId: user.id,
        patientId: user.patientId,
        email: user.email,
        role: user.role,
      },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRY }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        type: 'refresh',
      },
      this.JWT_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );

    const sessionId = crypto.randomUUID();

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PATIENT_LOGIN',
        entity: 'USER',
        entityId: user.id,
        changes: {
          loginAt: new Date(),
          deviceInfo: credentials.deviceInfo,
        },
      },
    });

    logger.info(`Patient logged in successfully: ${user.id}`);

    return {
      sessionId,
      patientId: user.patientId!,
      token,
      refreshToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  /**
   * Get patient dashboard
   */
  async getDashboard(patientId: string): Promise<PatientDashboard> {
    logger.info(`Loading dashboard for patient ${patientId}`);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        study: true,
        site: true,
        treatmentArm: true,
      },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Get upcoming visits (placeholder - would come from visit schedule table)
    const upcomingVisits: VisitSchedule[] = this.generateUpcomingVisits(patient);

    // Get questionnaire stats (placeholder - would query eCOA system)
    const questionnaireStats = {
      pending: 3,
      completed: 15,
    };

    // Get unread messages (placeholder - would query messaging system)
    const unreadMessages = 2;

    const dashboard: PatientDashboard = {
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        patientNumber: patient.patientNumber,
        enrollmentDate: patient.enrollmentDate,
        studyArm: patient.treatmentArm?.name,
      },
      study: {
        title: patient.study?.title || '',
        phase: patient.study?.phase || '',
        principalInvestigator: 'Dr. Principal Investigator', // Would come from study
      },
      upcomingVisits,
      pendingQuestionnaires: questionnaireStats.pending,
      completedQuestionnaires: questionnaireStats.completed,
      messages: unreadMessages,
      lastLogin: patient.lastVisitDate,
    };

    return dashboard;
  }

  /**
   * Get patient visit schedule
   */
  async getVisitSchedule(patientId: string): Promise<VisitSchedule[]> {
    logger.info(`Loading visit schedule for patient ${patientId}`);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        study: true,
      },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // In production, query actual visit schedule table
    const visits = this.generateUpcomingVisits(patient);

    return visits;
  }

  /**
   * Request appointment change
   */
  async requestAppointmentChange(
    patientId: string,
    visitId: string,
    requestedDate: Date,
    reason: string
  ): Promise<any> {
    logger.info(`Appointment change request from patient ${patientId} for visit ${visitId}`);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Create appointment change request
    const request = {
      id: crypto.randomUUID(),
      patientId,
      visitId,
      requestedDate,
      reason,
      status: 'PENDING',
      createdAt: new Date(),
    };

    // Notify site coordinator
    await prisma.notification.create({
      data: {
        recipientId: 'site-coordinator', // Would be actual coordinator ID
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'Patient Appointment Change Request',
        message: `Patient ${patient.patientNumber} has requested to change appointment for visit ${visitId}`,
        data: request,
        status: 'PENDING',
      },
    });

    logger.info(`Appointment change request created: ${request.id}`);

    return request;
  }

  /**
   * Get patient consent documents
   */
  async getConsentDocuments(patientId: string): Promise<any[]> {
    logger.info(`Loading consent documents for patient ${patientId}`);

    // In production, query eConsent service
    const consents = [
      {
        id: '1',
        documentName: 'Informed Consent Form',
        version: '2.0',
        signedDate: new Date('2024-01-15'),
        status: 'SIGNED',
        language: 'English',
        downloadUrl: '/consents/1/download',
      },
      {
        id: '2',
        documentName: 'Privacy Notice',
        version: '1.0',
        signedDate: new Date('2024-01-15'),
        status: 'SIGNED',
        language: 'English',
        downloadUrl: '/consents/2/download',
      },
    ];

    return consents;
  }

  /**
   * Update patient profile
   */
  async updateProfile(
    patientId: string,
    updates: {
      phone?: string;
      email?: string;
      preferredLanguage?: string;
      address?: any;
      emergencyContact?: any;
    }
  ): Promise<any> {
    logger.info(`Updating profile for patient ${patientId}`);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Update patient record
    const updatedPatient = await prisma.patient.update({
      where: { id: patientId },
      data: {
        phone: updates.phone,
        email: updates.email,
        preferredLanguage: updates.preferredLanguage,
        // address and emergencyContact would be in separate tables in production
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: patientId,
        action: 'PATIENT_PROFILE_UPDATE',
        entity: 'PATIENT',
        entityId: patientId,
        changes: updates,
      },
    });

    logger.info(`Profile updated for patient ${patientId}`);

    return updatedPatient;
  }

  /**
   * Get patient messages
   */
  async getMessages(patientId: string, unreadOnly: boolean = false): Promise<any[]> {
    logger.info(`Loading messages for patient ${patientId}`);

    // In production, query messaging table
    const messages = [
      {
        id: '1',
        from: 'Study Coordinator',
        subject: 'Upcoming Visit Reminder',
        preview: 'Your next visit is scheduled for...',
        sentDate: new Date(),
        read: false,
      },
      {
        id: '2',
        from: 'Study Team',
        subject: 'New Questionnaire Available',
        preview: 'Please complete the weekly health...',
        sentDate: new Date(Date.now() - 86400000),
        read: false,
      },
    ];

    if (unreadOnly) {
      return messages.filter(m => !m.read);
    }

    return messages;
  }

  /**
   * Request study withdrawal
   */
  async requestWithdrawal(
    patientId: string,
    reason: string,
    withdrawalType: 'FULL' | 'TREATMENT_ONLY'
  ): Promise<any> {
    logger.info(`Withdrawal request from patient ${patientId}`);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        study: true,
      },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Create withdrawal request
    const request = {
      id: crypto.randomUUID(),
      patientId,
      studyId: patient.studyId,
      reason,
      withdrawalType,
      status: 'PENDING_REVIEW',
      requestedAt: new Date(),
    };

    // Notify principal investigator and study coordinator
    await prisma.notification.create({
      data: {
        recipientId: 'principal-investigator', // Would be actual PI ID
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'URGENT: Patient Withdrawal Request',
        message: `Patient ${patient.patientNumber} has requested ${withdrawalType} withdrawal from study ${patient.study?.protocolNumber}`,
        data: request,
        status: 'PENDING',
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: patientId,
        action: 'WITHDRAWAL_REQUEST',
        entity: 'PATIENT',
        entityId: patientId,
        changes: request,
      },
    });

    logger.info(`Withdrawal request created: ${request.id}`);

    return request;
  }

  /**
   * Validate invitation code
   */
  private async validateInvitationCode(code: string): Promise<{ valid: boolean; invitation?: any }> {
    // In production, query invitation table
    // Check if code exists, not expired, not already used

    return {
      valid: true,
      invitation: {
        code,
        studyId: 'study-123',
        siteId: 'site-456',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    };
  }

  /**
   * Log failed login attempt
   */
  private async logFailedLogin(userId: string, deviceInfo?: any): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'FAILED_LOGIN',
        entity: 'USER',
        entityId: userId,
        changes: {
          timestamp: new Date(),
          deviceInfo,
        },
      },
    });

    // In production, implement account lockout after N failed attempts
  }

  /**
   * Generate upcoming visits (placeholder)
   */
  private generateUpcomingVisits(patient: any): VisitSchedule[] {
    const now = new Date();

    return [
      {
        visitId: '1',
        visitName: 'Week 4 Follow-up',
        visitWindow: {
          start: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
        status: 'UPCOMING',
        procedures: ['Blood Draw', 'Vital Signs', 'Physical Exam'],
        questionnaires: ['Weekly Health Assessment', 'Adverse Events'],
        location: patient.site?.name || 'Study Site',
      },
      {
        visitId: '2',
        visitName: 'Week 8 Follow-up',
        visitWindow: {
          start: new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000),
        },
        status: 'UPCOMING',
        procedures: ['Blood Draw', 'ECG', 'Physical Exam'],
        questionnaires: ['Monthly Health Assessment'],
        location: patient.site?.name || 'Study Site',
      },
    ];
  }

  /**
   * Change password
   */
  async changePassword(
    patientId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    logger.info(`Password change request for patient ${patientId}`);

    const user = await prisma.user.findFirst({
      where: { patientId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const passwordValid = await bcrypt.compare(currentPassword, user.password);

    if (!passwordValid) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newPasswordHash,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGE',
        entity: 'USER',
        entityId: user.id,
        changes: {
          changedAt: new Date(),
        },
      },
    });

    // Send confirmation notification
    await prisma.notification.create({
      data: {
        recipientId: patientId,
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'Password Changed Successfully',
        message: 'Your patient portal password has been changed.',
        status: 'PENDING',
      },
    });

    logger.info(`Password changed successfully for patient ${patientId}`);
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    logger.info(`Password reset requested for email: ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.role !== 'PATIENT') {
      // Don't reveal whether email exists
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token (in production, use dedicated table)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        // resetToken: resetTokenHash,
        // resetTokenExpiry,
      },
    });

    // Send reset email
    await prisma.notification.create({
      data: {
        recipientId: user.id,
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: 'Password Reset Request',
        message: `Click the link to reset your password: https://portal.example.com/reset-password?token=${resetToken}`,
        status: 'PENDING',
      },
    });

    logger.info(`Password reset email sent to: ${email}`);
  }
}

export default new PatientPortalService();
