// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Keycloak } from '../../nodes/Keycloak/Keycloak.node';
import {
	getOrMintToken,
	resetTokenCache,
	minRemainingFor,
	tokenCacheKey,
	tokenCacheSize,
	MAX_ENTRIES,
} from '../../nodes/Keycloak/tokenCache';

/**
 * These tests pin the fix for the my-realm-realm lockout: concurrent password-grant
 * logins for one shared service account trip Keycloak's brute-force protection. The
 * load-bearing property is single-flight (N concurrent calls produce ONE HTTP request),
 * not just caching.
 */

const PARAMS = {
	resource: 'token',
	operation: 'mintPasswordGrant',
	tokenRealm: 'my-realm',
	tokenClientId: 'my-client',
	tokenUsername: 'example-service-account',
	tokenPassword: 'pw-s3cret',
	tokenScope: 'openid',
	tokenClientSecret: '',
};

const TOKEN_RESPONSE = {
	access_token: 'at-1',
	expires_in: 300,
	refresh_token: 'rt-1',
	refresh_expires_in: 1800,
	token_type: 'Bearer',
	scope: 'openid',
};

// Same shape as tests/unit/keycloak.test.ts, but the request mock is SHARED so that
// several contexts (= several executions in one n8n process) hit one HTTP counter.
function ctx(parameters: any, request: jest.Mock) {
	return {
		getNodeParameter: (name: string, _i: number, defaultValue?: any) => parameters[name] ?? defaultValue,
		helpers: { request },
		getNode: jest.fn(() => ({ name: 'Keycloak', type: 'keycloak.keycloak', typeVersion: 1, position: [0, 0], parameters: {} })),
		continueOnFail: jest.fn(() => false),
		getCredentials: jest.fn(async () => ({
			baseUrl: 'https://keycloak.test',
			realm: 'my-realm',
			username: 'admin',
			password: 'admin',
			clientId: 'admin-cli',
			ignoreSSL: true,
		})),
		getInputData: jest.fn(() => [{ json: {} }]),
	} as any;
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('password-grant token reuse', () => {
	let node: Keycloak;

	beforeEach(() => {
		resetTokenCache();
		node = new Keycloak();
	});

	it('returns the SAME output shape as an uncached mint (no field added or dropped)', async () => {
		const request = jest.fn().mockResolvedValue({ ...TOKEN_RESPONSE });
		const first = await node.execute.call(ctx(PARAMS, request));
		const second = await node.execute.call(ctx(PARAMS, request));
		expect(first[0][0].json).toEqual(TOKEN_RESPONSE);
		expect(second[0][0].json).toEqual(TOKEN_RESPONSE);
	});

	it('cache hit: a second execution reuses the token without a second login', async () => {
		const request = jest.fn().mockResolvedValue({ ...TOKEN_RESPONSE });
		await node.execute.call(ctx(PARAMS, request));
		await node.execute.call(ctx(PARAMS, request));
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('single-flight: 6 concurrent executions for one user produce exactly ONE HTTP request', async () => {
		const gate = deferred<any>();
		const request = jest.fn().mockImplementation(() => gate.promise);
		const runs = Array.from({ length: 6 }, () => node.execute.call(ctx(PARAMS, request)));
		// Let every execution reach the mint before Keycloak "answers".
		await new Promise((r) => setImmediate(r));
		gate.resolve({ ...TOKEN_RESPONSE });
		const results = await Promise.all(runs);
		expect(request).toHaveBeenCalledTimes(1);
		for (const r of results) expect(r[0][0].json.access_token).toBe('at-1');
	});

	it('a different user or scope is a different key (no cross-identity reuse)', async () => {
		const request = jest.fn()
			.mockResolvedValueOnce({ ...TOKEN_RESPONSE, access_token: 'at-a' })
			.mockResolvedValueOnce({ ...TOKEN_RESPONSE, access_token: 'at-b' })
			.mockResolvedValueOnce({ ...TOKEN_RESPONSE, access_token: 'at-c' });
		const a = await node.execute.call(ctx(PARAMS, request));
		const b = await node.execute.call(ctx({ ...PARAMS, tokenUsername: 'system-execution-operator' }, request));
		const c = await node.execute.call(ctx({ ...PARAMS, tokenScope: 'openid profile' }, request));
		expect([a, b, c].map((r) => r[0][0].json.access_token)).toEqual(['at-a', 'at-b', 'at-c']);
		expect(request).toHaveBeenCalledTimes(3);
	});

	it('a failed mint is not cached, and the next call logs in again', async () => {
		const request = jest.fn()
			.mockRejectedValueOnce({ statusCode: 401, error: { error: 'invalid_client', error_description: 'bad' } })
			.mockResolvedValueOnce({ ...TOKEN_RESPONSE });
		await expect(node.execute.call(ctx(PARAMS, request))).rejects.toThrow(/Token mint failed/);
		const ok = await node.execute.call(ctx(PARAMS, request));
		expect(ok[0][0].json.access_token).toBe('at-1');
		expect(request).toHaveBeenCalledTimes(2);
		expect(tokenCacheSize()).toBe(1);
	});

	it('concurrent callers of a FAILING mint share one request and all see the failure', async () => {
		const gate = deferred<any>();
		const request = jest.fn().mockImplementation(() => gate.promise);
		const runs = Array.from({ length: 4 }, () => node.execute.call(ctx(PARAMS, request)).then(() => 'ok', (e) => e.message));
		await new Promise((r) => setImmediate(r));
		gate.reject({ statusCode: 400, error: { error: 'invalid_grant', error_description: 'Invalid user credentials' } });
		const outcomes = await Promise.all(runs);
		expect(request).toHaveBeenCalledTimes(1);
		for (const o of outcomes) expect(o).toMatch(/Token mint failed: HTTP 400 invalid_grant/);
		expect(tokenCacheSize()).toBe(0);
	});

	it('opt-out: reuseToken=false always logs in and never reads the cache', async () => {
		const request = jest.fn()
			.mockResolvedValueOnce({ ...TOKEN_RESPONSE, access_token: 'cached' })
			.mockResolvedValueOnce({ ...TOKEN_RESPONSE, access_token: 'fresh-1' })
			.mockResolvedValueOnce({ ...TOKEN_RESPONSE, access_token: 'fresh-2' });
		await node.execute.call(ctx(PARAMS, request));
		const f1 = await node.execute.call(ctx({ ...PARAMS, reuseToken: false }, request));
		const f2 = await node.execute.call(ctx({ ...PARAMS, reuseToken: false }, request));
		expect(f1[0][0].json.access_token).toBe('fresh-1');
		expect(f2[0][0].json.access_token).toBe('fresh-2');
		expect(request).toHaveBeenCalledTimes(3);
	});

	it('reuseToken is a declared property of mintPasswordGrant, default ON (n8n drops undeclared params)', () => {
		const prop = node.description.properties.find((p: any) => p.name === 'reuseToken');
		expect(prop).toBeDefined();
		expect(prop.type).toBe('boolean');
		expect(prop.default).toBe(true);
		expect(prop.displayOptions.show).toEqual({ resource: ['token'], operation: ['mintPasswordGrant'] });
	});

	it('a downstream mutation of the returned json cannot corrupt the cached token', async () => {
		const request = jest.fn().mockResolvedValue({ ...TOKEN_RESPONSE });
		const first = await node.execute.call(ctx(PARAMS, request));
		first[0][0].json.access_token = 'MUTATED';
		const second = await node.execute.call(ctx(PARAMS, request));
		expect(second[0][0].json.access_token).toBe('at-1');
	});
});

describe('token reuse window', () => {
	beforeEach(() => resetTokenCache());

	it('reuse needs remaining >= max(60s, 50% of expires_in)', () => {
		expect(minRemainingFor(300)).toBe(150_000);
		expect(minRemainingFor(3600)).toBe(1_800_000);
		expect(minRemainingFor(100)).toBe(60_000);
		expect(minRemainingFor(60)).toBe(60_000);
	});

	it('reuses inside the first half, mints fresh once remaining drops under half', async () => {
		let now = 1_000_000;
		const clock = () => now;
		const mint = jest.fn()
			.mockResolvedValueOnce({ access_token: 'first', expires_in: 300 })
			.mockResolvedValueOnce({ access_token: 'second', expires_in: 300 });

		expect((await getOrMintToken('k', mint, clock)).access_token).toBe('first');

		now += 149_000; // 151s of 300s left: still in the first half, reuse
		expect((await getOrMintToken('k', mint, clock)).access_token).toBe('first');
		expect(mint).toHaveBeenCalledTimes(1);

		// 149s left. The old 30s-skew policy would still have handed this out (and so
		// would a token with 31s left); a caller about to do minutes of LLM work must
		// get a fresh one instead.
		now += 2_000;
		expect((await getOrMintToken('k', mint, clock)).access_token).toBe('second');
		expect(mint).toHaveBeenCalledTimes(2);
	});

	it('never hands out a token with only ~31s left (the old skew window)', async () => {
		let now = 0;
		const mint = jest.fn()
			.mockResolvedValueOnce({ access_token: 'first', expires_in: 300 })
			.mockResolvedValueOnce({ access_token: 'second', expires_in: 300 });
		await getOrMintToken('k', mint, () => now);
		now = 269_000;
		expect((await getOrMintToken('k', mint, () => now)).access_token).toBe('second');
	});

	it('single-flight also applies to the fresh mint after the window closes', async () => {
		let now = 0;
		const clock = () => now;
		let release!: (v: any) => void;
		const mint = jest.fn()
			.mockResolvedValueOnce({ access_token: 'first', expires_in: 300 })
			.mockImplementationOnce(() => new Promise((r) => { release = r; }));
		await getOrMintToken('k', mint, clock);
		now = 200_000; // 100s left: under half
		const waiters = Array.from({ length: 6 }, () => getOrMintToken('k', mint, clock));
		await new Promise((r) => setImmediate(r));
		release({ access_token: 'second', expires_in: 300 });
		const got = await Promise.all(waiters);
		expect(mint).toHaveBeenCalledTimes(2);
		for (const g of got) expect(g.access_token).toBe('second');
	});

	it('refreshes after hard expiry', async () => {
		let now = 0;
		const mint = jest.fn()
			.mockResolvedValueOnce({ access_token: 'first', expires_in: 60 })
			.mockResolvedValueOnce({ access_token: 'second', expires_in: 60 });
		await getOrMintToken('k', mint, () => now);
		now = 61_000;
		expect((await getOrMintToken('k', mint, () => now)).access_token).toBe('second');
	});

	it('a response without a usable expires_in is returned but never cached', async () => {
		const mint = jest.fn().mockResolvedValue({ access_token: 'x' });
		await getOrMintToken('k', mint);
		await getOrMintToken('k', mint);
		expect(mint).toHaveBeenCalledTimes(2);
		expect(tokenCacheSize()).toBe(0);
	});

	it('the map is bounded', async () => {
		for (let n = 0; n < MAX_ENTRIES + 10; n++) {
			await getOrMintToken(`k${n}`, async () => ({ access_token: 't', expires_in: 300 }));
		}
		expect(tokenCacheSize()).toBeLessThanOrEqual(MAX_ENTRIES);
	});

	it('the key is a hash: it never contains the raw password or client secret', () => {
		const key = tokenCacheKey({
			baseUrl: 'https://kc', realm: 'my-realm', clientId: 'c', username: 'u', scope: 'openid',
			password: 'pw-s3cret', clientSecret: 'cs-s3cret',
		});
		expect(key).toMatch(/^[0-9a-f]{64}$/);
		expect(key).not.toContain('s3cret');
	});

	it('password and client secret framing cannot collide', () => {
		const base = { baseUrl: 'b', realm: 'r', clientId: 'c', username: 'u', scope: 's' };
		expect(tokenCacheKey({ ...base, password: 'ab', clientSecret: '' }))
			.not.toBe(tokenCacheKey({ ...base, password: 'a', clientSecret: 'b' }));
	});
});

describe('mint error text', () => {
	let node: Keycloak;
	beforeEach(() => {
		resetTokenCache();
		node = new Keycloak();
	});

	async function failWith(rejection: any) {
		const request = jest.fn().mockRejectedValue(rejection);
		try {
			await node.execute.call(ctx(PARAMS, request));
		} catch (e) {
			return e;
		}
		throw new Error('expected the mint to fail');
	}

	it('passes Keycloak error, error_description and HTTP status through', async () => {
		const e = await failWith({
			statusCode: 400,
			error: { error: 'invalid_grant', error_description: 'Account disabled' },
			options: { body: 'grant_type=password&password=pw-s3cret' },
		});
		expect(e.message).toBe('Token mint failed: HTTP 400 invalid_grant "Account disabled"');
		expect(e.httpCode).toBe('400');
		expect(e.description).toMatch(/locked/);
		expect(e.description).toMatch(/NOT a wrong password/);
	});

	it('flags the lockout ambiguity of "Invalid user credentials" (what Keycloak 26 returns for a locked user)', async () => {
		const e = await failWith({
			statusCode: 400,
			error: '{"error":"invalid_grant","error_description":"Invalid user credentials"}',
		});
		expect(e.message).toBe('Token mint failed: HTTP 400 invalid_grant "Invalid user credentials"');
		expect(e.description).toMatch(/USER_TEMPORARILY_DISABLED/);
	});

	it('reads the body from response.data too (axios-shaped error)', async () => {
		const e = await failWith({
			response: { status: 401, data: { error: 'unauthorized_client', error_description: 'Invalid client secret' } },
		});
		expect(e.message).toBe('Token mint failed: HTTP 401 unauthorized_client "Invalid client secret"');
		expect(e.description).toMatch(/Check realm, client_id, credentials, and scope/);
	});

	it('never leaks the password or a token into the thrown error, even when the raw error carries them', async () => {
		const e = await failWith({
			statusCode: 400,
			message: '400 - {"error":"invalid_grant"}',
			error: { error: 'invalid_grant', error_description: 'Invalid user credentials' },
			options: { body: 'grant_type=password&password=pw-s3cret', headers: { Authorization: 'Bearer at-leak' } },
		});
		const serialised = JSON.stringify({ m: e.message, d: e.description, c: e.context, cause: e.cause, x: e.errorResponse });
		expect(serialised).not.toContain('pw-s3cret');
		expect(serialised).not.toContain('at-leak');
	});

	it('client_credentials errors go through the same sanitised builder (no client_secret leak)', async () => {
		const request = jest.fn().mockRejectedValue({
			statusCode: 401,
			message: '401 - {"error":"unauthorized_client"}',
			error: { error: 'unauthorized_client', error_description: 'Invalid client or Invalid client credentials' },
			options: { data: 'grant_type=client_credentials&client_id=svc&client_secret=cs-s3cret' },
		});
		let e: any;
		try {
			await node.execute.call(ctx({
				resource: 'token', operation: 'mintClientCredentials',
				ccRealm: 'my-realm', ccClientId: 'svc', ccClientSecret: 'cs-s3cret', ccScope: '',
			}, request));
		} catch (err) {
			e = err;
		}
		expect(e.message).toBe('Service token mint failed: HTTP 401 unauthorized_client "Invalid client or Invalid client credentials"');
		expect(e.httpCode).toBe('401');
		expect(e.description).toMatch(/CONFIDENTIAL/);
		const serialised = JSON.stringify({ m: e.message, d: e.description, c: e.context, cause: e.cause, x: e.errorResponse, ms: e.messages });
		expect(serialised).not.toContain('cs-s3cret');
	});

	it('no response at all still yields a readable message', async () => {
		// n8n's NodeError swaps a message containing a common network code (ECONNREFUSED,
		// ETIMEDOUT, ...) for its own descriptive text and keeps the original in `messages`.
		const e = await failWith(new Error('connect ECONNREFUSED 10.0.0.1:443'));
		expect(e.message).toMatch(/refused the connection/);
		expect(e.messages.join('\n')).toContain('Token mint failed: connect ECONNREFUSED 10.0.0.1:443');
	});
});
