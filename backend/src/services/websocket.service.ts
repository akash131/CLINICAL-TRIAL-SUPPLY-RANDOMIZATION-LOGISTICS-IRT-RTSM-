import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();

  initialize(wss: WebSocketServer): void {
    this.wss = wss;

    wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      logger.info('New WebSocket connection established');

      // Authenticate connection
      const token = this.extractToken(req.url || '');

      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || 'default-secret'
        ) as { userId: string };

        ws.userId = decoded.userId;
        ws.isAlive = true;
        this.clients.set(decoded.userId, ws);

        logger.info(`WebSocket authenticated for user: ${decoded.userId}`);

        // Handle messages
        ws.on('message', (message: string) => {
          this.handleMessage(ws, message);
        });

        // Handle pong responses
        ws.on('pong', () => {
          ws.isAlive = true;
        });

        // Handle disconnection
        ws.on('close', () => {
          if (ws.userId) {
            this.clients.delete(ws.userId);
            logger.info(`WebSocket disconnected for user: ${ws.userId}`);
          }
        });

        // Send welcome message
        this.sendToClient(ws.userId, {
          type: 'connection',
          message: 'Connected to IRT/RTSM Platform',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('WebSocket authentication failed:', error);
        ws.close(1008, 'Invalid token');
      }
    });

    // Heartbeat to detect broken connections
    const interval = setInterval(() => {
      this.clients.forEach((ws, userId) => {
        if (ws.isAlive === false) {
          this.clients.delete(userId);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Every 30 seconds

    wss.on('close', () => {
      clearInterval(interval);
    });

    logger.info('WebSocket server initialized');
  }

  private extractToken(url: string): string | null {
    const match = url.match(/token=([^&]+)/);
    return match ? match[1] : null;
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: string): void {
    try {
      const data = JSON.parse(message);

      logger.debug(`WebSocket message received from ${ws.userId}:`, data);

      // Handle different message types
      switch (data.type) {
        case 'ping':
          this.sendToClient(ws.userId!, {
            type: 'pong',
            timestamp: new Date().toISOString(),
          });
          break;

        case 'subscribe':
          // Subscribe to specific channels (studies, sites, etc.)
          logger.info(`User ${ws.userId} subscribed to ${data.channel}`);
          break;

        case 'unsubscribe':
          logger.info(`User ${ws.userId} unsubscribed from ${data.channel}`);
          break;

        default:
          logger.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Send message to specific client
   */
  sendToClient(userId: string, data: any): void {
    const client = this.clients.get(userId);

    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(data: any): void {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  /**
   * Send notification to specific users
   */
  notifyUsers(userIds: string[], notification: any): void {
    userIds.forEach(userId => {
      this.sendToClient(userId, {
        type: 'notification',
        data: notification,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Notify study members about events
   */
  notifyStudyEvent(studyId: string, event: any): void {
    // In production, this would query database for study members
    this.broadcast({
      type: 'study_event',
      studyId,
      event,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Real-time randomization notification
   */
  notifyRandomization(userId: string, randomizationData: any): void {
    this.sendToClient(userId, {
      type: 'randomization_complete',
      data: randomizationData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Supply alert notification
   */
  notifySupplyAlert(userIds: string[], alert: any): void {
    this.notifyUsers(userIds, {
      type: 'supply_alert',
      severity: alert.severity,
      message: alert.message,
      data: alert.data,
    });
  }
}

export const websocketService = new WebSocketService();

export const initializeWebSocket = (wss: WebSocketServer): void => {
  websocketService.initialize(wss);
};

export default websocketService;
