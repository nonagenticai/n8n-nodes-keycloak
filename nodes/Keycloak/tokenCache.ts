import { createHash } from 'crypto';

/**
 * Per-process reuse of password-grant tokens, with single-flight.
 *
 * WHY. Every n8n execution that needs an access token used to run its own password-grant
 * login. With several executions in flight, one shared service account (e.g.
 * `example-service-account`, `system-execution-operator`) logged in up to 6 times in the
 * same second from the same pod. The realm has brute-force protection on, and
 * concurrent logins for one user trip it: Keycloak recorded `user_temporarily_disabled`
 * 6-49 ms after a SUCCESSFUL login for the same user, with no wrong password anywhere
 * (Keycloak issues #33527 / #44474).
 *
 * A cache alone does not fix that, because N simultaneous first callers would all miss
 * and all log in. The fix is single-flight: concurrent callers for one key await ONE
 * in-flight mint.
 *
 * The key is a sha256 over the full request identity, so no raw password or client
 * secret is ever held as a key or logged.
 */

interface CachedToken {
	response: Record<string, unknown>;
	expiresAtMs: number;
	minRemainingMs: number;
}

export interface TokenIdentity {
	baseUrl: string;
	realm: string;
	clientId: string;
	username: string;
	scope: string;
	password: string;
	clientSecret: string;
}

/**
 * REUSE WINDOW. A cached token is handed out only while it still has at least
 * max(60s, 50% of its lifetime) left; for my-realm's 300s tokens that is the first ~150s.
 *
 * Why so conservative: a caller may mint and then do minutes of LLM work before it
 * uses the token. A reused token must never leave it with less runway than a fresh
 * mint reasonably would. The lockout bursts this cache exists to kill happen within
 * the SAME SECOND, so even a short reuse window collapses them.
 */
export const MIN_REMAINING_FLOOR_MS = 60_000;
export const MIN_REMAINING_FRACTION = 0.5;
/** Upper bound on distinct identities held; expired entries are evicted first. */
export const MAX_ENTRIES = 256;

const cache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<Record<string, unknown>>>();

export function tokenCacheKey(id: TokenIdentity): string {
	// JSON array framing, so ('ab','') and ('a','b') cannot collide.
	return createHash('sha256')
		.update(
			JSON.stringify([
				id.baseUrl,
				id.realm,
				id.clientId,
				id.username,
				id.scope,
				id.password,
				id.clientSecret,
			]),
		)
		.digest('hex');
}

/** Minimum remaining lifetime for reuse: max(60s, 50% of expires_in). */
export function minRemainingFor(expiresInSeconds: number): number {
	return Math.max(MIN_REMAINING_FLOOR_MS, expiresInSeconds * 1000 * MIN_REMAINING_FRACTION);
}

function reusable(entry: CachedToken, nowMs: number): boolean {
	return entry.expiresAtMs - nowMs >= entry.minRemainingMs;
}

function evict(nowMs: number): void {
	for (const [key, entry] of cache) {
		if (!reusable(entry, nowMs)) cache.delete(key);
	}
	// Map iterates in insertion order, so this drops the oldest writes first. Called
	// BEFORE an insert, so leave room for the one entry about to be written.
	while (cache.size >= MAX_ENTRIES) {
		const oldest = cache.keys().next().value as string;
		cache.delete(oldest);
	}
}

/**
 * Return a cached token response for `key` if one is still fresh, otherwise join the
 * in-flight mint for `key`, otherwise start one. A failed mint is never cached, and
 * every caller waiting on it receives the same rejection.
 *
 * Callers always receive a shallow copy, so a downstream mutation of `$json` cannot
 * corrupt the cached entry.
 */
export async function getOrMintToken(
	key: string,
	mint: () => Promise<Record<string, unknown>>,
	now: () => number = Date.now,
): Promise<Record<string, unknown>> {
	const hit = cache.get(key);
	if (hit) {
		if (reusable(hit, now())) return { ...hit.response };
		cache.delete(key);
	}

	const pending = inflight.get(key);
	if (pending) return { ...(await pending) };

	const flight = (async () => {
		// Lifetime is counted from BEFORE the request, so the cached expiry is never later
		// than Keycloak's own.
		const startedAtMs = now();
		const response = await mint();
		const expiresIn = Number(response?.expires_in);
		if (response && response.access_token && Number.isFinite(expiresIn) && expiresIn > 0) {
			cache.delete(key);
			evict(startedAtMs);
			cache.set(key, {
				response,
				expiresAtMs: startedAtMs + expiresIn * 1000,
				minRemainingMs: minRemainingFor(expiresIn),
			});
		}
		return response;
	})();

	inflight.set(key, flight);
	try {
		return { ...(await flight) };
	} finally {
		if (inflight.get(key) === flight) inflight.delete(key);
	}
}

/** Test-only: forget every cached and in-flight token. */
export function resetTokenCache(): void {
	cache.clear();
	inflight.clear();
}

/** Test-only: number of cached identities. */
export function tokenCacheSize(): number {
	return cache.size;
}
