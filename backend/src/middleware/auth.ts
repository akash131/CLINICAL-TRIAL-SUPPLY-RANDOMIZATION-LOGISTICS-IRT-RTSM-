import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { prisma } from '../database/connection';
import { Role } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    ) as { userId: string; email: string; role: Role };

    // Check if session exists and is valid
    const session = await prisma.userSession.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new AppError('Invalid or expired token', 401);
    }

    if (session.user.status !== 'ACTIVE') {
      throw new AppError('User account is not active', 403);
    }

    // Attach user to request
    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else {
      next(error);
    }
  }
};

// Authorization middleware for role-based access control
export const authorize = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError('Insufficient permissions to access this resource', 403)
      );
    }

    next();
  };
};

// Check if user has access to specific study
export const checkStudyAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studyId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('Authentication required', 401);
    }

    // Super admins have access to all studies
    if (req.user?.role === 'SUPER_ADMIN') {
      return next();
    }

    // Check if user has access to this study
    const userStudy = await prisma.userStudy.findUnique({
      where: {
        userId_studyId: {
          userId,
          studyId,
        },
      },
    });

    if (!userStudy) {
      throw new AppError('Access denied to this study', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Check if user has access to specific site
export const checkSiteAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { siteId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('Authentication required', 401);
    }

    // Super admins and sponsor admins have access to all sites
    if (['SUPER_ADMIN', 'SPONSOR_ADMIN'].includes(req.user?.role || '')) {
      return next();
    }

    // Check if user has access to this site
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId,
          siteId,
        },
      },
    });

    if (!userSite) {
      throw new AppError('Access denied to this site', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};
