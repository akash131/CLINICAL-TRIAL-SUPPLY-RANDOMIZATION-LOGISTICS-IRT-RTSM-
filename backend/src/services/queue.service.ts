import Bull, { Queue, Job } from 'bull';
import { logger } from '../utils/logger';
import supplyService from './supply.service';
import { prisma } from '../database/connection';

interface QueueJobs {
  supplyForecast: Queue;
  emailNotification: Queue;
  temperatureMonitoring: Queue;
  reportGeneration: Queue;
}

class QueueService {
  private queues: QueueJobs | null = null;

  async initialize(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // Initialize queues
    this.queues = {
      supplyForecast: new Bull('supply-forecast', redisUrl),
      emailNotification: new Bull('email-notification', redisUrl),
      temperatureMonitoring: new Bull('temperature-monitoring', redisUrl),
      reportGeneration: new Bull('report-generation', redisUrl),
    };

    // Set up processors
    this.setupProcessors();

    // Set up event listeners
    this.setupEventListeners();

    logger.info('Queue service initialized');
  }

  private setupProcessors(): void {
    if (!this.queues) return;

    // Supply forecast processor
    this.queues.supplyForecast.process(async (job: Job) => {
      logger.info(`Processing supply forecast job: ${job.id}`);

      const { studyId, forecastPeriodDays } = job.data;

      try {
        const forecast = await supplyService.forecastSupplyDemand({
          studyId,
          forecastPeriodDays,
          algorithm: 'ENSEMBLE',
        });

        logger.info(`Supply forecast completed for study ${studyId}`);

        return forecast;
      } catch (error) {
        logger.error(`Supply forecast failed for study ${studyId}:`, error);
        throw error;
      }
    });

    // Email notification processor
    this.queues.emailNotification.process(async (job: Job) => {
      logger.info(`Processing email notification: ${job.id}`);

      const { to, subject, message, data } = job.data;

      // In production, integrate with email service (SendGrid, SES, etc.)
      logger.info(`Sending email to ${to}: ${subject}`);

      return { sent: true, to, subject };
    });

    // Temperature monitoring processor
    this.queues.temperatureMonitoring.process(async (job: Job) => {
      logger.info(`Processing temperature monitoring: ${job.id}`);

      const { kitId } = job.data;

      try {
        const result = await supplyService.monitorTemperatureExcursion(kitId);

        if (result.status === 'EXCURSION_DETECTED') {
          logger.warn(`Temperature excursion detected for kit ${kitId}`);
        }

        return result;
      } catch (error) {
        logger.error(`Temperature monitoring failed for kit ${kitId}:`, error);
        throw error;
      }
    });

    // Report generation processor
    this.queues.reportGeneration.process(async (job: Job) => {
      logger.info(`Processing report generation: ${job.id}`);

      const { reportType, studyId, parameters } = job.data;

      // Generate report based on type
      logger.info(`Generating ${reportType} report for study ${studyId}`);

      return { reportType, studyId, generated: true };
    });
  }

  private setupEventListeners(): void {
    if (!this.queues) return;

    Object.entries(this.queues).forEach(([name, queue]) => {
      queue.on('completed', (job: Job, result: any) => {
        logger.info(`Job completed in queue ${name}: ${job.id}`);
      });

      queue.on('failed', (job: Job, err: Error) => {
        logger.error(`Job failed in queue ${name}: ${job.id}`, err);
      });

      queue.on('stalled', (job: Job) => {
        logger.warn(`Job stalled in queue ${name}: ${job.id}`);
      });
    });
  }

  /**
   * Add supply forecast job
   */
  async addSupplyForecastJob(studyId: string, forecastPeriodDays: number = 90): Promise<Job> {
    if (!this.queues) throw new Error('Queue service not initialized');

    return this.queues.supplyForecast.add(
      {
        studyId,
        forecastPeriodDays,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );
  }

  /**
   * Add email notification job
   */
  async addEmailNotificationJob(notification: {
    to: string;
    subject: string;
    message: string;
    data?: any;
  }): Promise<Job> {
    if (!this.queues) throw new Error('Queue service not initialized');

    return this.queues.emailNotification.add(notification, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }

  /**
   * Add temperature monitoring job
   */
  async addTemperatureMonitoringJob(kitId: string): Promise<Job> {
    if (!this.queues) throw new Error('Queue service not initialized');

    return this.queues.temperatureMonitoring.add(
      { kitId },
      {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 5000,
        },
      }
    );
  }

  /**
   * Schedule recurring supply forecasts
   */
  async scheduleRecurringForecast(studyId: string): Promise<void> {
    if (!this.queues) throw new Error('Queue service not initialized');

    // Run forecast weekly
    await this.queues.supplyForecast.add(
      {
        studyId,
        forecastPeriodDays: 90,
      },
      {
        repeat: {
          cron: '0 0 * * 0', // Every Sunday at midnight
        },
      }
    );

    logger.info(`Scheduled recurring forecast for study ${studyId}`);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    if (!this.queues) throw new Error('Queue service not initialized');

    const stats: any = {};

    for (const [name, queue] of Object.entries(this.queues)) {
      const counts = await queue.getJobCounts();
      stats[name] = counts;
    }

    return stats;
  }
}

export const queueService = new QueueService();

export const initializeQueue = async (): Promise<void> => {
  await queueService.initialize();
};

export default queueService;
