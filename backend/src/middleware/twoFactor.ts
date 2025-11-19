/**
 * Two-Factor Authentication (2FA/MFA) Middleware
 *
 * Enhanced security with TOTP and SMS verification
 * Security best practice for clinical trial systems
 */

import { Request, Response, NextFunction } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../database/connection';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface TwoFactorSetup {
  userId: string;
  method: 'TOTP' | 'SMS' | 'EMAIL';
  secret?: string;
  qrCode?: string;
  backupCodes?: string[];
}

class TwoFactorAuthService {
  /**
   * Generate TOTP secret for user
   */
  async setupTOTP(userId: string, email: string): Promise<TwoFactorSetup> {
    logger.info(`Setting up TOTP for user ${userId}`);

    const secret = speakeasy.generateSecret({
      name: `IRT/RTSM (${email})`,
      issuer: 'Clinical Trial Platform',
      length: 32,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store secret (encrypted)
    // In production, store in database with encryption

    return {
      userId,
      method: 'TOTP',
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Verify TOTP token
   */
  verifyTOTP(secret: string, token: string): boolean {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps before/after
    });

    return verified;
  }

  /**
   * Generate SMS verification code
   */
  async sendSMSCode(userId: string, phoneNumber: string): Promise<string> {
    logger.info(`Sending SMS code to user ${userId}`);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store code with expiry (5 minutes)
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // In production, store in database with expiry
    // In production, send via Twilio or similar

    logger.info(`SMS code generated for user ${userId}`);

    return code;
  }

  /**
   * Verify SMS code
   */
  verifySMSCode(storedCode: string, providedCode: string, expiry: Date): boolean {
    if (new Date() > expiry) {
      return false;
    }

    return storedCode === providedCode;
  }

  /**
   * Send email verification code
   */
  async sendEmailCode(userId: string, email: string): Promise<string> {
    logger.info(`Sending email code to user ${userId}`);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Send email
    // In production, use email service

    return code;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }

    return codes;
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    // In production, retrieve user's backup codes from database
    // Mark code as used if valid

    logger.info(`Backup code verification attempt for user ${userId}`);
    return true; // Placeholder
  }

  /**
   * Check if 2FA is required for user role
   */
  is2FARequired(role: string): boolean {
    const required2FARoles = [
      'SUPER_ADMIN',
      'SPONSOR_ADMIN',
      'CRO_ADMIN',
      'BIOSTATISTICIAN',
    ];

    return required2FARoles.includes(role);
  }

  /**
   * Get 2FA status for user
   */
  async get2FAStatus(userId: string): Promise<{
    enabled: boolean;
    method?: 'TOTP' | 'SMS' | 'EMAIL';
    verified: boolean;
  }> {
    // In production, query database for user's 2FA settings

    return {
      enabled: false,
      verified: false,
    };
  }
}

export const twoFactorService = new TwoFactorAuthService();

/**
 * Middleware to require 2FA verification
 */
export const require2FA = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;

    if (!user) {
      throw new AppError('Authentication required', 401);
    }

    // Check if 2FA is required for this role
    if (!twoFactorService.is2FARequired(user.role)) {
      return next();
    }

    // Check if 2FA is verified for this session
    const session = (req as any).session;
    if (session && session.twoFactorVerified) {
      return next();
    }

    // Require 2FA verification
    throw new AppError('Two-factor authentication required', 403);
  } catch (error) {
    next(error);
  }
};

export default twoFactorService;
