import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Singleton Prisma Client
export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

// Log queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e: any) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

export const initializeDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('Database connection established');

    // Run a simple query to verify connection
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database health check passed');
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
    throw error;
  }
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});
