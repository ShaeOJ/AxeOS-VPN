import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@axeos-vpn/shared-utils';

const logger = createLogger('ErrorHandler');

const ERROR_STATUS_MAP: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  EMAIL_EXISTS: 409,
  INVALID_TOKEN: 401,
  TOKEN_EXPIRED: 401,
  DEVICE_NOT_FOUND: 404,
  PAIRING_CODE_EXPIRED: 400,
  PAIRING_CODE_INVALID: 400,
  RATE_LIMIT_EXCEEDED: 429,
};

export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: error.message,
  });

  const errorCode = error.message;
  const statusCode = ERROR_STATUS_MAP[errorCode] ?? 500;

  const errorMessages: Record<string, string> = {
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Invalid request data',
    INVALID_CREDENTIALS: 'Invalid email or password',
    EMAIL_EXISTS: 'Email already registered',
    INVALID_TOKEN: 'Invalid or expired token',
    TOKEN_EXPIRED: 'Token has expired',
    DEVICE_NOT_FOUND: 'Device not found',
    PAIRING_CODE_EXPIRED: 'Pairing code has expired',
    PAIRING_CODE_INVALID: 'Invalid pairing code',
    RATE_LIMIT_EXCEEDED: 'Too many requests',
  };

  res.status(statusCode).json({
    success: false,
    error: {
      code: ERROR_STATUS_MAP[errorCode] ? errorCode : 'INTERNAL_ERROR',
      message: errorMessages[errorCode] ?? 'An unexpected error occurred',
    },
  });
}

export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
