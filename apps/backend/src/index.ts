import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { prisma } from './lib/prisma';
import { authRoutes } from './routes/auth.routes';
import { deviceRoutes } from './routes/device.routes';
import { metricsRoutes } from './routes/metrics.routes';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware';
import { relayServer } from './websocket/server';
import { createLogger } from '@axeos-vpn/shared-utils';

const logger = createLogger('Server');

async function main() {
  // Test database connection
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (error) {
    logger.error('Failed to connect to database', error);
    process.exit(1);
  }

  // Create Express app
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
      credentials: true,
    })
  );
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      wsStats: relayServer.getStats(),
    });
  });

  // API Routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/devices', deviceRoutes);
  app.use('/api/v1/metrics', metricsRoutes);

  // Error handling
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  // Start HTTP server
  app.listen(config.port, () => {
    logger.info(`HTTP server listening on port ${config.port}`);
  });

  // Start WebSocket server
  relayServer.start(config.wsPort);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    relayServer.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
