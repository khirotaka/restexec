import { Context, Next } from '@oak/oak';
import { config } from '../config.ts';
import { logger } from '../utils/logger.ts';
import { isIPv4, isIPv6, matchSubnets } from '@std/net/unstable-ip';

// 認証不要なパス
const PUBLIC_PATHS = ['/health'];

// Rate limiting state
interface RateLimitInfo {
  attempts: number;
  firstAttempt: number;
  blockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitInfo>();

/**
 * Clean up expired rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, info] of rateLimitStore.entries()) {
    // If blocked and block period is over, or if not blocked but window expired
    if (
      (info.blockedUntil && info.blockedUntil < now) ||
      (!info.blockedUntil && now - info.firstAttempt > config.auth.rateLimit.windowMs)
    ) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Check every minute

/**
 * Validate IP address format (IPv4 or IPv6)
 */
function isValidIP(ip: string): boolean {
  return isIPv4(ip) || isIPv6(ip);
}

function getClientIP(ctx: Context): string {
  const directIP = ctx.request.ip;

  if (!config.auth.rateLimit.trustProxy) {
    return directIP;
  }

  // Check if direct IP is in trusted proxies (CIDR supported)
  const isTrusted = config.auth.trustedProxyIPs.length > 0 &&
    matchSubnets(directIP, config.auth.trustedProxyIPs);

  if (!isTrusted) {
    return directIP;
  }

  const forwardedFor = ctx.request.headers.get('X-Forwarded-For');
  if (!forwardedFor) {
    return directIP;
  }

  const clientIP = forwardedFor.split(',')[0].trim();

  // Validate IP address format
  if (!isValidIP(clientIP)) {
    logger.warn(`Invalid X-Forwarded-For IP: ${clientIP}, using direct IP: ${directIP}`);
    return directIP;
  }

  return clientIP;
}

function isRateLimited(ip: string): boolean {
  if (!config.auth.rateLimit.enabled) return false;

  const now = Date.now();
  const info = rateLimitStore.get(ip);

  if (!info) {
    return false;
  }

  // Check if currently blocked
  if (info.blockedUntil) {
    if (now < info.blockedUntil) {
      return true;
    }
    // Block expired
    rateLimitStore.delete(ip);
    return false;
  }

  // Check if window expired
  if (now - info.firstAttempt > config.auth.rateLimit.windowMs) {
    rateLimitStore.delete(ip);
    return false;
  }

  // Check if attempts exceed max attempts within the window
  return info.attempts >= config.auth.rateLimit.maxAttempts;
}

/**
 * Ensure rate limit store doesn't exceed maximum size
 * Implements LRU-like eviction by removing oldest entries
 */
function ensureRateLimitStoreSize() {
  const maxEntries = config.auth.rateLimit.maxEntries;

  if (rateLimitStore.size >= maxEntries) {
    logger.warn(`Rate limit store reached max size (${maxEntries}), evicting oldest entries`);

    // Sort entries by firstAttempt (oldest first)
    const sortedEntries = Array.from(rateLimitStore.entries())
      .sort(([, a], [, b]) => a.firstAttempt - b.firstAttempt);

    // Remove oldest 10%
    const toDelete = Math.floor(maxEntries * 0.1);
    for (let i = 0; i < toDelete; i++) {
      rateLimitStore.delete(sortedEntries[i][0]);
    }

    logger.info(`Evicted ${toDelete} oldest rate limit entries`);
  }
}

function recordAuthFailure(ip: string) {
  if (!config.auth.rateLimit.enabled) return;

  ensureRateLimitStoreSize();

  const now = Date.now();
  const info = rateLimitStore.get(ip);

  if (!info) {
    rateLimitStore.set(ip, { attempts: 1, firstAttempt: now });
    return;
  }

  // If already blocked (shouldn't happen if isRateLimited checked first, but good for safety)
  if (info.blockedUntil) return;

  info.attempts++;

  if (info.attempts >= config.auth.rateLimit.maxAttempts) {
    // Block for the duration of the window (simplification) or separate block duration.
    // Spec says "Block Period: 60s" which matches windowMs default.
    info.blockedUntil = now + config.auth.rateLimit.windowMs;
  }
}

function getRetryAfter(ip: string): number {
  const info = rateLimitStore.get(ip);
  if (!info || !info.blockedUntil) return 0;
  return Math.ceil((info.blockedUntil - Date.now()) / 1000);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function authMiddleware(ctx: Context, next: Next) {
  const path = ctx.request.url.pathname;

  // Skip auth if disabled or public path
  if (!config.auth.enabled || PUBLIC_PATHS.includes(path)) {
    await next();
    return;
  }

  const clientIP = getClientIP(ctx);

  // Rate limit check
  if (isRateLimited(clientIP)) {
    const retryAfter = getRetryAfter(clientIP);
    ctx.response.status = 429;
    ctx.response.headers.set('Retry-After', String(retryAfter));
    ctx.response.body = {
      success: false,
      error: {
        type: 'RateLimitError',
        message: 'Too many authentication failures',
        details: {
          retryAfter,
          limit: config.auth.rateLimit.maxAttempts,
          window: config.auth.rateLimit.windowMs / 1000,
        },
      },
    };
    return;
  }

  const authHeader = ctx.request.headers.get('Authorization');

  if (!authHeader) {
    recordAuthFailure(clientIP);
    logger.warn(`Authentication failed: ${ctx.request.method} ${path} from ${clientIP} (missing header)`);
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: {
        type: 'UnauthorizedError',
        message: 'Missing Authorization header',
        details: {
          hint: "Include 'Authorization: Bearer <api-key>' header",
        },
      },
    };
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    recordAuthFailure(clientIP);
    logger.warn(`Authentication failed: ${ctx.request.method} ${path} from ${clientIP} (invalid format)`);
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: {
        type: 'UnauthorizedError',
        message: 'Invalid Authorization header format',
        details: {
          expected: 'Bearer <api-key>',
          received: `${authHeader.substring(0, 10)}...`,
        },
      },
    };
    return;
  }

  const providedKey = authHeader.slice(7);

  if (!timingSafeEqual(providedKey, config.auth.apiKey)) {
    recordAuthFailure(clientIP);
    logger.warn(`Authentication failed: ${ctx.request.method} ${path} from ${clientIP} (invalid key)`);
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: {
        type: 'UnauthorizedError',
        message: 'Invalid API key',
      },
    };
    return;
  }

  // Auth success
  // Reset rate limit on success?
  // Usually we don't reset immediately to prevent probing, but legitimate users might typo.
  // For strict security, we don't reset.

  await next();
}
