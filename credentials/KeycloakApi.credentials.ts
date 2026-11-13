import type {
	ICredentialType,
	INodeProperties,
	ICredentialDataDecryptedObject,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

/**
 * KeycloakApi Credential
 *
 * Credentials for the Keycloak Admin API and the realm token endpoint.
 *
 * Service: Keycloak Admin API
 * Base URL: supplied by the user via the baseUrl field. The admin endpoint is
 *           normally not internet-facing, so there is no sensible default
 *           beyond a local development server.
 * Authentication: realm admin username/password (password grant). A client
 *                 secret is additionally accepted for the client-credentials
 *                 grant used by Token → Mint Client Credentials.
 */
export class KeycloakApi implements ICredentialType {
	name = 'keycloakApi';
	displayName = 'Keycloak API';
	icon = 'file:keycloak.svg' as const;
	documentationUrl = 'https://www.keycloak.org/documentation';

	properties: INodeProperties[] = [
		{
			displayName: 'Keycloak Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:8080',
			required: true,
			description:
				'Base URL of your Keycloak server, without a trailing slash (e.g. https://keycloak.example.com).',
		},
		{
			displayName: 'Realm',
			name: 'realm',
			type: 'string',
			default: 'master',
			required: true,
			description: 'Realm to authenticate against',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			description: 'Admin username for Keycloak',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Admin password for Keycloak',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: 'admin-cli',
			description: 'Client ID for authentication (default: admin-cli)',
		},
		{
			displayName: 'Client Secret (Client Credentials Grant)',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: false,
			description:
				'Optional client_secret used ONLY by Token → Mint Client Credentials when that operation\'s own Client Secret field is empty. Keeps the secret encrypted in the credential store instead of in plaintext workflow JSON or env. Setting both is refused as ambiguous. Never sent on admin API calls.',
		},

		// ========================================
		// SECTION 2: SSL/TLS Certificate Options
		// ========================================
		{
			displayName: 'SSL Certificate Options',
			name: 'sslOptions',
			type: 'collection',
			placeholder: 'Add SSL Option',
			default: {},
			options: [
				{
					displayName: 'Ignore SSL Issues',
					name: 'ignoreSSL',
					type: 'boolean',
					default: false,
					description: 'Whether to accept self-signed SSL certificates. Only enable for development/testing.',
				},
				{
					displayName: 'CA Certificate Path',
					name: 'caCertPath',
					type: 'string',
					default: '',
					placeholder: '/path/to/ca-cert.pem',
					description: 'Path to custom CA certificate file for SSL verification',
				},
			],
		},
	];

	/**
	 * Credential test — proves the URL is reachable AND that these credentials
	 * can obtain an admin token, using the same password grant the node itself
	 * uses. A bare health probe would pass for a server that has no such realm,
	 * and a probe carrying an unrelated bearer token would prove nothing about
	 * these credentials.
	 */
	// @ts-expect-error - n8n runtime supports async test function but types declare ICredentialTestRequest
	async test(this: ICredentialTestFunctions, credential: ICredentialDataDecryptedObject): Promise<INodeCredentialTestResult> {
		const baseUrl = String(credential.baseUrl ?? '').replace(/\/+$/, '');
		const realm = credential.realm as string;
		const sslOptions = (credential.sslOptions ?? {}) as { ignoreSSL?: boolean };
		const rejectUnauthorized = !(credential.ignoreSSL || sslOptions.ignoreSSL);

		if (!baseUrl) {
			return { status: 'Error', message: 'Keycloak Base URL is required.' };
		}

		try {
			const form = new URLSearchParams({
				grant_type: 'password',
				client_id: (credential.clientId as string) || 'admin-cli',
				username: credential.username as string,
				password: credential.password as string,
			});

			const tokenResponse = (await this.helpers.request({
				method: 'POST',
				url: `${baseUrl}/realms/${realm}/protocol/openid-connect/token`,
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: form.toString(),
				json: true,
				rejectUnauthorized,
			})) as { access_token?: string };

			const accessToken = tokenResponse?.access_token;
			if (!accessToken) {
				return { status: 'Error', message: 'The token endpoint returned no access_token.' };
			}

			await this.helpers.request({
				method: 'GET',
				url: `${baseUrl}/admin/realms/${realm}/users?max=1`,
				headers: { Authorization: `Bearer ${accessToken}` },
				json: true,
				rejectUnauthorized,
			});

			return { status: 'OK', message: 'Admin token obtained and the realm is readable.' };
		} catch (error: any) {
			const message = error?.message || String(error);
			return { status: 'Error', message: `Credential test failed: ${message}` };
		}
	}
}
