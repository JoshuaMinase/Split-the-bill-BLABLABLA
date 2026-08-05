/**
 * Returns a stable device token stored in localStorage.
 * This is the only "identity" for anonymous participants —
 * same token means same person even after page refresh.
 * Safe to call only in the browser (not during SSR).
 */

/** Generate a UUID with a fallback for browsers that don't support crypto.randomUUID */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random — not cryptographic, sufficient for device identity
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}

// In-memory fallback if localStorage is disabled (private browsing, iOS restrictions)
let _memoryToken: string | null = null;

export function getDeviceToken(): string {
  const KEY = 'splitreceipt_device_token';
  try {
    let token = localStorage.getItem(KEY);
    if (!token) {
      token = generateUUID();
      localStorage.setItem(KEY, token);
    }
    return token;
  } catch {
    // localStorage unavailable — use an in-memory token for this session
    if (!_memoryToken) {
      _memoryToken = generateUUID();
    }
    return _memoryToken;
  }
}
