import { IExecuteFunctions, NodeApiError } from 'n8n-workflow';

// Connection-layer errors that are safe to retry for a READ-ONLY request.
const TRANSIENT_NET_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

const TRANSIENT_NET_MESSAGE_RE = /socket hang up|connection (?:reset|aborted)/i;

// Methods that are SAFE to re-send after the server may have acted: read-only
// by HTTP semantics (RFC 9110 SS9.2.1). Only these are retried on an ambiguous
// failure (a 5xx, ETIMEDOUT, ECONNRESET, socket hang-up).
//
// PUT and DELETE are deliberately ABSENT although RFC 9110 calls them
// idempotent: the handlers are not audited for it, and a re-sent DELETE after
// the first one landed turns a success into a 404. POST and PATCH are absent
// because a re-send double-applies the write.
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

// Failures that happen BEFORE a single request byte reaches the server: the
// TCP connect was refused, or the name never resolved. Only these are retried
// for a non-idempotent method, because only these PROVE the server did nothing.
//
// ⛔ ETIMEDOUT, ECONNRESET, EPIPE and "socket hang up" are NOT here and must
// never be: each can fire after the request was delivered and while (or after)
// the server committed the write, so a re-send double-applies it.
const PRE_SEND_NET_CODES: ReadonlySet<string> = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

const PRE_SEND_MESSAGE_RE = /\bconnect ECONNREFUSED\b|\bgetaddrinfo (?:ENOTFOUND|EAI_AGAIN)\b/;

export function isIdempotentMethod(method?: string): boolean {
  if (typeof method !== 'string' || method.length === 0) return false;
  return IDEMPOTENT_METHODS.has(method.trim().toUpperCase());
}

export function isTransientNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === 'string' && TRANSIENT_NET_CODES.has(e.code)) return true;
  if (e.cause && typeof e.cause.code === 'string' && TRANSIENT_NET_CODES.has(e.cause.code)) return true;
  if (typeof e.message === 'string' && TRANSIENT_NET_MESSAGE_RE.test(e.message)) return true;
  return false;
}

/** True only when the error proves the request never reached the server. */
export function isPreSendNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; cause?: { code?: unknown } };
  // A code, when present, is authoritative: an ETIMEDOUT whose message happens
  // to mention a refused connect is still an ETIMEDOUT.
  const code = typeof e.code === 'string' ? e.code : undefined;
  const causeCode = e.cause && typeof e.cause.code === 'string' ? e.cause.code : undefined;
  if (code !== undefined || causeCode !== undefined) {
    return (
      (code === undefined || PRE_SEND_NET_CODES.has(code)) &&
      (causeCode === undefined || PRE_SEND_NET_CODES.has(causeCode))
    );
  }
  return typeof e.message === 'string' && PRE_SEND_MESSAGE_RE.test(e.message);
}

export class RetryingRequest {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000];

  async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    context: IExecuteFunctions,
    options?: { method?: string },
  ): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        const statusCode = error?.statusCode || error?.response?.status;

        if (statusCode === 401) {
          throw new NodeApiError(context.getNode(), error, {
            message: 'Authentication failed',
            description: 'Check the username, password and client ID in the credential.',
          });
        }
        if (statusCode === 403) {
          throw new NodeApiError(context.getNode(), error, {
            message: 'Access denied',
            description: 'These credentials do not permit this operation.',
          });
        }
        if (statusCode === 429) {
          throw new NodeApiError(context.getNode(), error, {
            message: 'Rate limit exceeded',
            description: 'Wait before retrying.',
          });
        }

        // An HTTP status means the server RESPONDED, so the request was delivered
        // and processed to some degree; ETIMEDOUT, ECONNRESET and socket hang-up
        // can likewise fire after delivery. For a non-idempotent method a re-send
        // double-applies the write, so only GET/HEAD/OPTIONS retry on an
        // ambiguous failure; every other method (and an absent one — fail SAFE)
        // retries ONLY on a pre-send failure (ECONNREFUSED, DNS).
        const retryable = isIdempotentMethod(options?.method)
          ? (typeof statusCode === 'number' && statusCode >= 500) ||
            isTransientNetworkError(error) ||
            isPreSendNetworkError(error)
          : isPreSendNetworkError(error);
        if (retryable && attempt < this.MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, this.RETRY_DELAYS[attempt]));
          continue;
        }
        throw error;
      }
    }
    throw lastError!;
  }
}
