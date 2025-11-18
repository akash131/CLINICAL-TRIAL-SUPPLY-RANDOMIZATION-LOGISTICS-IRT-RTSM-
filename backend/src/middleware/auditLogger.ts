import { Request, Response, NextFunction } from 'express';
import { auditLog } from '../utils/logger';
import { prisma } from '../database/connection';

export const auditLogger = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();

  // Capture original methods
  const originalJson = res.json;
  const originalSend = res.send;

  let responseBody: any;

  // Override res.json
  res.json = function (body: any) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Override res.send
  res.send = function (body: any) {
    responseBody = body;
    return originalSend.call(this, body);
  };

  // Wait for response to finish
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const user = (req as any).user;

    const auditData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userId: user?.id,
      userEmail: user?.email,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.get('user-agent') || 'unknown',
      requestBody: sanitizeData(req.body),
      responseStatus: res.statusCode,
    };

    // Log to file
    auditLog.info('API Request', auditData);

    // Save critical operations to database
    if (shouldPersistToDatabase(req)) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: user?.id || 'system',
            action: `${req.method} ${req.path}`,
            entity: extractEntityFromPath(req.path),
            entityId: extractEntityIdFromPath(req.path),
            changes: req.body,
            ipAddress: auditData.ipAddress,
            userAgent: auditData.userAgent,
            timestamp: new Date(),
          },
        });
      } catch (error) {
        // Don't fail request if audit logging fails
        console.error('Failed to save audit log to database:', error);
      }
    }
  });

  next();
};

// Sanitize sensitive data from logs
const sanitizeData = (data: any): any => {
  if (!data) return data;

  const sanitized = { ...data };
  const sensitiveFields = ['password', 'passwordHash', 'token', 'refreshToken', 'secret'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
};

// Determine if request should be persisted to database
const shouldPersistToDatabase = (req: Request): boolean => {
  // Persist all mutations (POST, PUT, PATCH, DELETE)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return true;
  }

  // Persist specific critical read operations
  const criticalPaths = [
    '/randomization',
    '/unblinding',
    '/electronic-signature',
  ];

  return criticalPaths.some(path => req.path.includes(path));
};

// Extract entity type from path
const extractEntityFromPath = (path: string): string => {
  const match = path.match(/\/api\/v\d+\/(\w+)/);
  return match ? match[1] : 'unknown';
};

// Extract entity ID from path
const extractEntityIdFromPath = (path: string): string => {
  const match = path.match(/\/([a-f0-9-]{36})(?:\/|$)/i);
  return match ? match[1] : 'unknown';
};
