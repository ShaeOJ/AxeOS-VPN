/**
 * Cryptographic utilities
 */

// Generate a random string of specified length
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);

  // Use crypto API if available (browser/Node.js)
  if (typeof globalThis.crypto !== 'undefined') {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }

  return result;
}

// Generate a pairing code (6 uppercase alphanumeric characters)
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const randomValues = new Uint8Array(6);

  if (typeof globalThis.crypto !== 'undefined') {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < 6; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  for (let i = 0; i < 6; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }

  return result;
}

// Generate a device token (32 characters)
export function generateDeviceToken(): string {
  return generateRandomString(32);
}

// Generate a session ID
export function generateSessionId(): string {
  return generateRandomString(24);
}

// Simple string hashing for non-security purposes (e.g., cache keys)
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
