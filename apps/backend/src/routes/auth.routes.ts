import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { validateBody } from '../middleware/validation.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { isValidEmail, isValidPassword } from '@axeos-vpn/shared-utils';

const router = Router();

const registerSchema = z.object({
  email: z.string().refine(isValidEmail, 'Invalid email format'),
  password: z.string().refine(
    (p) => isValidPassword(p).valid,
    (p) => ({ message: isValidPassword(p).errors.join(', ') || 'Invalid password' })
  ),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// POST /api/v1/auth/register
router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const result = await authService.register(email, password);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/auth/login
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/auth/logout
router.post(
  '/logout',
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      await authService.logout(refreshToken);

      res.json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/auth/logout-all (logout from all devices)
router.post(
  '/logout-all',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logoutAll(req.user!.userId);

      res.json({
        success: true,
        data: { message: 'Logged out from all devices' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      id: req.user!.userId,
      email: req.user!.email,
    },
  });
});

export { router as authRoutes };
