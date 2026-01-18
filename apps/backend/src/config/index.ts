import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Database
  databaseUrl: z.string().url(),

  // JWT
  jwtSecret: z.string().min(32),
  jwtAccessExpiry: z.string().default('15m'),
  jwtRefreshExpiry: z.string().default('7d'),

  // Server
  port: z.coerce.number().default(3000),
  wsPort: z.coerce.number().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // CORS
  corsOrigin: z.string().default('*'),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(60000),
  rateLimitMaxRequests: z.coerce.number().default(100),
});

function loadConfig() {
  const result = configSchema.safeParse({
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY,
    jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY,
    port: process.env.PORT,
    wsPort: process.env.WS_PORT,
    nodeEnv: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
  });

  if (!result.success) {
    console.error('Configuration error:', result.error.format());
    throw new Error('Invalid configuration');
  }

  return result.data;
}

export const config = loadConfig();

export type Config = typeof config;
