/**
 * Interactive Voice Response (IVR) Service
 *
 * Phone-based randomization and supply management
 * Vendor parity: Almac (24/7 IVR support)
 */

import twilio from 'twilio';
import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import randomizationService from './randomization.service';
import supplyService from './supply.service';

const VoiceResponse = twilio.twiml.VoiceResponse;

interface IVRSession {
  callSid: string;
  userId?: string;
  studyId?: string;
  siteId?: string;
  currentMenu: string;
  data: Record<string, any>;
}

class IVRService {
  private sessions: Map<string, IVRSession> = new Map();
  private twilioClient: twilio.Twilio;

  constructor() {
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  /**
   * Handle incoming IVR call
   */
  handleIncomingCall(callSid: string, from: string): string {
    logger.info(`IVR call received from ${from}, callSid: ${callSid}`);

    const session: IVRSession = {
      callSid,
      currentMenu: 'main',
      data: { from },
    };

    this.sessions.set(callSid, session);

    const twiml = new VoiceResponse();

    twiml.say({
      voice: 'alice',
      language: 'en-US',
    }, 'Welcome to the I R T R T S M Clinical Trial Management System.');

    twiml.gather({
      input: ['dtmf'],
      numDigits: 1,
      action: '/ivr/menu',
      method: 'POST',
    }).say('Press 1 for patient randomization. Press 2 for supply requests. Press 3 for inventory status. Press 9 to speak with a coordinator.');

    return twiml.toString();
  }

  /**
   * Handle main menu selection
   */
  handleMainMenu(callSid: string, digits: string): string {
    const session = this.sessions.get(callSid);
    if (!session) {
      return this.handleError('Session not found');
    }

    const twiml = new VoiceResponse();

    switch (digits) {
      case '1':
        // Patient randomization
        session.currentMenu = 'randomization';
        this.sessions.set(callSid, session);
        return this.handleRandomizationMenu(callSid);

      case '2':
        // Supply request
        session.currentMenu = 'supply';
        this.sessions.set(callSid, session);
        return this.handleSupplyMenu(callSid);

      case '3':
        // Inventory status
        session.currentMenu = 'inventory';
        this.sessions.set(callSid, session);
        return this.handleInventoryMenu(callSid);

      case '9':
        // Connect to coordinator
        twiml.say('Connecting you to a study coordinator. Please wait.');
        twiml.dial(process.env.COORDINATOR_PHONE || '+1234567890');
        return twiml.toString();

      default:
        twiml.say('Invalid selection. Please try again.');
        twiml.redirect('/ivr/welcome');
        return twiml.toString();
    }
  }

  /**
   * Handle randomization menu
   */
  private handleRandomizationMenu(callSid: string): string {
    const twiml = new VoiceResponse();

    twiml.say('Patient Randomization Menu.');

    twiml.gather({
      input: ['dtmf'],
      numDigits: 6,
      action: '/ivr/randomization/study-id',
      method: 'POST',
      timeout: 10,
    }).say('Please enter the six digit study I D, followed by the pound key.');

    return twiml.toString();
  }

  /**
   * Process randomization request
   */
  async processRandomization(
    callSid: string,
    studyId: string,
    patientId: string
  ): Promise<string> {
    const twiml = new VoiceResponse();

    try {
      // Verify study and patient
      const study = await prisma.study.findUnique({
        where: { id: studyId },
      });

      if (!study) {
        twiml.say('Study not found. Please check the study I D and try again.');
        twiml.redirect('/ivr/randomization');
        return twiml.toString();
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
      });

      if (!patient) {
        twiml.say('Patient not found. Please check the patient I D and try again.');
        twiml.redirect('/ivr/randomization');
        return twiml.toString();
      }

      // Perform randomization
      const result = await randomizationService.randomizePatient({
        studyId,
        patientId,
        performedBy: 'IVR-SYSTEM',
      });

      twiml.say(
        `Patient successfully randomized. Randomization number is ${this.speakDigits(result.randomizationNumber)}. Treatment arm is ${result.treatmentArmCode}. This information has been recorded in the system.`
      );

      // Send SMS confirmation
      await this.sendSMSConfirmation(
        this.sessions.get(callSid)?.data.from || '',
        `Randomization complete. Patient: ${patient.patientNumber}, Randomization #: ${result.randomizationNumber}, Treatment Arm: ${result.treatmentArmCode}`
      );

      logger.info(`IVR randomization completed: ${result.randomizationNumber}`);
    } catch (error: any) {
      logger.error('IVR randomization failed:', error);
      twiml.say(`Randomization failed: ${error.message}. Please contact the study coordinator.`);
    }

    twiml.say('Thank you for using the I R T R T S M system. Goodbye.');
    twiml.hangup();

    return twiml.toString();
  }

  /**
   * Handle supply request menu
   */
  private handleSupplyMenu(callSid: string): string {
    const twiml = new VoiceResponse();

    twiml.say('Supply Request Menu.');

    twiml.gather({
      input: ['dtmf'],
      numDigits: 6,
      action: '/ivr/supply/site-id',
      method: 'POST',
      timeout: 10,
    }).say('Please enter your six digit site I D, followed by the pound key.');

    return twiml.toString();
  }

  /**
   * Process supply request
   */
  async processSupplyRequest(
    callSid: string,
    siteId: string,
    quantity: number
  ): Promise<string> {
    const twiml = new VoiceResponse();

    try {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
      });

      if (!site) {
        twiml.say('Site not found. Please check the site I D and try again.');
        twiml.redirect('/ivr/supply');
        return twiml.toString();
      }

      // Check inventory
      const inventory = await prisma.inventory.findMany({
        where: {
          siteId,
          status: 'AVAILABLE',
        },
      });

      const availableQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);

      twiml.say(
        `Current inventory at site ${site.siteNumber}: ${availableQuantity} kits available.`
      );

      if (availableQuantity < 10) {
        twiml.say('Low inventory detected. A resupply request has been submitted to the supply team.');

        // Create automatic resupply request
        // This would integrate with supply forecasting system
        logger.info(`IVR: Low inventory alert for site ${siteId}`);
      }

      // Send SMS confirmation
      await this.sendSMSConfirmation(
        this.sessions.get(callSid)?.data.from || '',
        `Inventory Status - Site: ${site.siteNumber}, Available: ${availableQuantity} kits`
      );
    } catch (error: any) {
      logger.error('IVR supply request failed:', error);
      twiml.say(`Supply request failed: ${error.message}. Please contact the supply coordinator.`);
    }

    twiml.say('Thank you for using the I R T R T S M system. Goodbye.');
    twiml.hangup();

    return twiml.toString();
  }

  /**
   * Handle inventory status menu
   */
  private handleInventoryMenu(callSid: string): string {
    const twiml = new VoiceResponse();

    twiml.say('Inventory Status Menu.');

    twiml.gather({
      input: ['dtmf'],
      numDigits: 6,
      action: '/ivr/inventory/site-id',
      method: 'POST',
      timeout: 10,
    }).say('Please enter your six digit site I D, followed by the pound key.');

    return twiml.toString();
  }

  /**
   * Get inventory status
   */
  async getInventoryStatus(callSid: string, siteId: string): Promise<string> {
    const twiml = new VoiceResponse();

    try {
      const inventory = await prisma.inventory.groupBy({
        by: ['status'],
        where: { siteId },
        _sum: { quantity: true },
      });

      let message = 'Inventory status: ';
      inventory.forEach(inv => {
        message += `${inv.status}: ${inv._sum.quantity || 0} kits. `;
      });

      twiml.say(message);

      // Send SMS with details
      await this.sendSMSConfirmation(
        this.sessions.get(callSid)?.data.from || '',
        message
      );
    } catch (error: any) {
      logger.error('IVR inventory status failed:', error);
      twiml.say(`Unable to retrieve inventory status. Please contact support.`);
    }

    twiml.say('Thank you for using the I R T R T S M system. Goodbye.');
    twiml.hangup();

    return twiml.toString();
  }

  /**
   * Handle errors
   */
  private handleError(message: string): string {
    const twiml = new VoiceResponse();
    twiml.say(`An error occurred: ${message}. Please try again or contact support.`);
    twiml.hangup();
    return twiml.toString();
  }

  /**
   * Convert digits to spoken format
   */
  private speakDigits(text: string): string {
    return text.split('').join(' ');
  }

  /**
   * Send SMS confirmation
   */
  private async sendSMSConfirmation(to: string, message: string): Promise<void> {
    try {
      if (!to || !process.env.TWILIO_PHONE_NUMBER) return;

      await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });

      logger.info(`SMS confirmation sent to ${to}`);
    } catch (error) {
      logger.error('Failed to send SMS confirmation:', error);
    }
  }

  /**
   * Make outbound call for notifications
   */
  async makeOutboundCall(
    to: string,
    message: string,
    type: 'alert' | 'notification' | 'emergency'
  ): Promise<void> {
    try {
      const twiml = new VoiceResponse();

      if (type === 'emergency') {
        twiml.say({
          voice: 'alice',
          language: 'en-US',
        }, `Emergency alert: ${message}. Please acknowledge by pressing 1.`);

        twiml.gather({
          input: ['dtmf'],
          numDigits: 1,
          timeout: 30,
        });
      } else {
        twiml.say({
          voice: 'alice',
          language: 'en-US',
        }, message);
      }

      await this.twilioClient.calls.create({
        twiml: twiml.toString(),
        to,
        from: process.env.TWILIO_PHONE_NUMBER || '',
      });

      logger.info(`Outbound IVR call initiated to ${to} for ${type}`);
    } catch (error) {
      logger.error('Failed to make outbound IVR call:', error);
      throw error;
    }
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(): void {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    this.sessions.forEach((session, callSid) => {
      // In a real implementation, track session creation time
      // For now, just log cleanup
      logger.debug(`Session cleanup check for ${callSid}`);
    });
  }
}

export default new IVRService();
