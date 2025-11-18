import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

// Import routes
import authRoutes from './routes/auth.routes';
import studyRoutes from './routes/study.routes';
import randomizationRoutes from './routes/randomization.routes';
import supplyRoutes from './routes/supply.routes';
import siteRoutes from './routes/site.routes';
import patientRoutes from './routes/patient.routes';
import inventoryRoutes from './routes/inventory.routes';
import shipmentRoutes from './routes/shipment.routes';
import analyticsRoutes from './routes/analytics.routes';
import integrationRoutes from './routes/integration.routes';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { auditLogger } from './middleware/auditLogger';

// Import utils
import { logger } from './utils/logger';
import { initializeDatabase } from './database/connection';
import { initializeWebSocket } from './services/websocket.service';
import { initializeQueue } from './services/queue.service';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Clinical Trial IRT/RTSM Platform API',
      version: '1.0.0',
      description: 'Comprehensive API for Interactive Response Technology and Randomization & Trial Supply Management',
      contact: {
        name: 'API Support',
        email: 'support@irt-rtsm.com'
      },
      license: {
        name: 'Proprietary',
        url: 'https://irt-rtsm.com/license'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}/api/${API_VERSION}`,
        description: 'Development server'
      },
      {
        url: `https://api.irt-rtsm.com/api/${API_VERSION}`,
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./src/routes/*.ts', './src/models/*.ts']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(compression()); // Compress responses
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Rate limiting
app.use(rateLimiter);

// Audit logging for all requests
app.use(auditLogger);

// API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'IRT/RTSM API Documentation'
}));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// API Routes
const apiPrefix = `/api/${API_VERSION}`;

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/studies`, studyRoutes);
app.use(`${apiPrefix}/randomization`, randomizationRoutes);
app.use(`${apiPrefix}/supply`, supplyRoutes);
app.use(`${apiPrefix}/sites`, siteRoutes);
app.use(`${apiPrefix}/patients`, patientRoutes);
app.use(`${apiPrefix}/inventory`, inventoryRoutes);
app.use(`${apiPrefix}/shipments`, shipmentRoutes);
app.use(`${apiPrefix}/analytics`, analyticsRoutes);
app.use(`${apiPrefix}/integrations`, integrationRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server: httpServer });
initializeWebSocket(wss);

// Initialize services
const initializeServices = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('✓ Database connected successfully');

    // Initialize queue system
    await initializeQueue();
    logger.info('✓ Queue system initialized');

    logger.info('✓ All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    await initializeServices();

    httpServer.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Clinical Trial IRT/RTSM Platform API Server            ║
║                                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Port:        ${PORT}                                        ║
║   API Version: ${API_VERSION}                                        ║
║                                                           ║
║   API Docs:    http://localhost:${PORT}/api/docs          ║
║   Health:      http://localhost:${PORT}/health            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default app;
