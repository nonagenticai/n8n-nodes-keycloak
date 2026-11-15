// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { KeycloakApi } from '../../credentials/KeycloakApi.credentials';

/**
 * The credential test normalizes the user-supplied base URL by stripping every
 * trailing '/'. That used to be `.replace(/\/+$/, '')`, which CodeQL flagged as
 * js/polynomial-redos: on a long slash run followed by another character, each
 * start position rescans the run. These tests pin the linear replacement.
 */
describe('KeycloakApi credential test — base URL normalization', () => {
  const run = async (baseUrl: string) => {
    const requests: any[] = [];
    const helpers = {
      request: async (opts: any) => {
        requests.push(opts);
        return opts.method === 'POST' ? { access_token: 'at-1' } : {};
      },
    };
    const credential = {
      baseUrl,
      realm: 'my-realm',
      clientId: 'admin-cli',
      username: 'admin',
      password: 'pw',
    };
    const result = await new KeycloakApi().test.call({ helpers }, credential);
    return { result, requests };
  };

  it('strips every trailing slash before building endpoints', async () => {
    const { result, requests } = await run('https://keycloak.test///');
    expect(result.status).toBe('OK');
    expect(requests[0].url).toBe(
      'https://keycloak.test/realms/my-realm/protocol/openid-connect/token',
    );
    expect(requests[1].url).toBe(
      'https://keycloak.test/admin/realms/my-realm/users?max=1',
    );
  });

  it('walks an interior slash run in one pass (ReDoS regression)', async () => {
    const slashRun = '/'.repeat(200_000);
    const started = Date.now();
    const { result, requests } = await run(`https://keycloak.test${slashRun}x`);
    const elapsed = Date.now() - started;
    expect(result.status).toBe('OK');
    expect(requests[0].url).toContain(`${slashRun}x/realms/my-realm/`);
    expect(elapsed).toBeLessThan(1000);
  });
});
