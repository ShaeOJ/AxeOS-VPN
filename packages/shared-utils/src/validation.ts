/**
 * Validation utilities
 */

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function isValidDeviceName(name: string): boolean {
  return name.length >= 1 && name.length <= 50;
}

export function isValidPairingCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}
