import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import { getOrMintToken, tokenCacheKey } from './tokenCache';
import { mergeSameNameCollections } from "../../helpers/mergeSameNameCollections";

export class Keycloak implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Keycloak',
		name: 'keycloak',
		icon: 'file:keycloak.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Manage users and clients in Keycloak',
		defaults: {
			name: 'Keycloak',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'keycloakApi',
				required: true,
			},
		],
		properties: mergeSameNameCollections([
			// Resource selector
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'User',
						value: 'user',
					},
					{
						name: 'Client',
						value: 'client',
					},
					{
						name: 'Token',
						value: 'token',
					},
				],
				default: 'user',
			},

			// ===============================
			// User Operations
			// ===============================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['user'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a new user',
						action: 'Create a user',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a user',
						action: 'Delete a user',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a user by ID',
						action: 'Get a user',
					},
					{
						name: 'List',
						value: 'list',
						description: 'List users',
						action: 'List users',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update a user',
						action: 'Update a user',
					},
					{
						name: 'Reset Password',
						value: 'resetPassword',
						description: 'Reset user password',
						action: 'Reset user password',
					},
					{
						name: 'Send Verify Email',
						value: 'sendVerifyEmail',
						description: 'Send verification email to user',
						action: 'Send verify email to user',
					},
					{
						name: 'Get Groups',
						value: 'getUserGroups',
						description: 'Get groups for a user',
						action: 'Get user groups',
					},
					{
						name: 'Add to Group',
						value: 'addUserToGroup',
						description: 'Add user to a group',
						action: 'Add user to group',
					},
					{
						name: 'Remove from Group',
						value: 'removeUserFromGroup',
						description: 'Remove user from a group',
						action: 'Remove user from group',
					},
				],
				default: 'list',
			},

			// User ID (for get, update, delete, resetPassword, etc.)
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['get', 'update', 'delete', 'resetPassword', 'sendVerifyEmail', 'getUserGroups', 'addUserToGroup', 'removeUserFromGroup'],
					},
				},
				default: '',
				description: 'The ID of the user',
			},

			// User fields for create
			{
				displayName: 'Username',
				name: 'username',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'The username for the new user',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'The email address for the new user',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'The first name of the user',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'The last name of the user',
			},
			{
				displayName: 'Enabled',
				name: 'enabled',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['create'],
					},
				},
				default: true,
				description: 'Whether the user is enabled',
			},
			{
				displayName: 'Email Verified',
				name: 'emailVerified',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['create'],
					},
				},
				default: false,
				description: 'Whether the user email is pre-verified (set true for service/operator users that authenticate via direct grant)',
			},
			{
				displayName: 'Attributes (JSON)',
				name: 'attributes',
				type: 'json',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['create'],
					},
				},
				default: '{}',
				description: 'Custom user attributes object. Each value MUST be an array of strings (Keycloak attribute shape), e.g. { "tenant_id": ["<uuid>"], "phone": ["+10000000010"] }. Required attributes enforced by a declarative user-profile (e.g. tenant_id, phone) must be supplied here or the user is "not fully set up".',
			},

			// Update fields
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['update'],
					},
				},
				options: [
					{
						displayName: 'Username',
						name: 'username',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
						default: '',
					},
					{
						displayName: 'First Name',
						name: 'firstName',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Last Name',
						name: 'lastName',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Enabled',
						name: 'enabled',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Email Verified',
						name: 'emailVerified',
						type: 'boolean',
						default: false,
					},
				],
			},

			// List users filters
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['list'],
					},
				},
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['list'],
						returnAll: [false],
					},
				},
				typeOptions: {
					minValue: 1,
					maxValue: 500,
				},
				default: 100,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['list'],
					},
				},
				options: [
					{
						displayName: 'Search',
						name: 'search',
						type: 'string',
						default: '',
						description: 'Search for users by username, email, first name, or last name',
					},
					{
						displayName: 'Username',
						name: 'username',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Enabled',
						name: 'enabled',
						type: 'boolean',
						default: true,
					},
				],
			},

			// Reset password fields
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: {
					password: true,
				},
				required: false,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['resetPassword'],
					},
				},
				default: '',
				description: 'The new password for the user',
			},
			{
				displayName: 'Temporary',
				name: 'temporary',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['resetPassword'],
					},
				},
				default: false,
				description: 'Whether the password is temporary and must be changed on first login',
			},

			// Group ID for add/remove operations
			{
				displayName: 'Group ID',
				name: 'groupId',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['addUserToGroup', 'removeUserFromGroup'],
					},
				},
				default: '',
				description: 'The ID of the group',
			},

			// ===============================
			// Client Operations
			// ===============================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['client'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a new client',
						action: 'Create a client',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a client',
						action: 'Delete a client',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a client by ID',
						action: 'Get a client',
					},
					{
						name: 'Get Secret',
						value: 'getSecret',
						description: 'Get client secret',
						action: 'Get client secret',
					},
					{
						name: 'List',
						value: 'list',
						description: 'List clients',
						action: 'List clients',
					},
					{
						name: 'Regenerate Secret',
						value: 'regenerateSecret',
						description: 'Regenerate client secret',
						action: 'Regenerate client secret',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update a client',
						action: 'Update a client',
					},
				],
				default: 'list',
			},

			// Client ID (UUID)
			{
				displayName: 'Client ID',
				name: 'clientId',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['get', 'update', 'delete', 'getSecret', 'regenerateSecret'],
					},
				},
				default: '',
				description: 'The UUID of the client (not the clientId field)',
			},

			// Create client fields
			{
				displayName: 'Client ID',
				name: 'clientIdField',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'The client-id of the application (e.g., my-app)',
			},
			{
				displayName: 'Client Name',
				name: 'clientName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'Display name of the client',
			},
			{
				displayName: 'Root URL',
				name: 'rootUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'Root URL of the application',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Enabled',
						name: 'enabled',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Public Client',
						name: 'publicClient',
						type: 'boolean',
						default: false,
						description: 'Whether this is a public client (no secret required)',
					},
					{
						displayName: 'Standard Flow Enabled',
						name: 'standardFlowEnabled',
						type: 'boolean',
						default: true,
						description: 'Enable standard OpenID Connect flow',
					},
					{
						displayName: 'Direct Access Grants Enabled',
						name: 'directAccessGrantsEnabled',
						type: 'boolean',
						default: false,
						description: 'Enable direct access grants (password grant)',
					},
					{
						displayName: 'Service Accounts Enabled',
						name: 'serviceAccountsEnabled',
						type: 'boolean',
						default: false,
						description: 'Enable service accounts for this client',
					},
					{
						displayName: 'Redirect URIs',
						name: 'redirectUris',
						type: 'string',
						default: '',
						description: 'Valid redirect URIs (comma-separated)',
					},
				],
			},

			// Update client fields
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['update'],
					},
				},
				options: [
					{
						displayName: 'Client Name',
						name: 'name',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Enabled',
						name: 'enabled',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Root URL',
						name: 'rootUrl',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Public Client',
						name: 'publicClient',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Standard Flow Enabled',
						name: 'standardFlowEnabled',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Direct Access Grants Enabled',
						name: 'directAccessGrantsEnabled',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Service Accounts Enabled',
						name: 'serviceAccountsEnabled',
						type: 'boolean',
						default: false,
					},
				],
			},

			// ===============================
			// Token Operations
			// ===============================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['token'],
					},
				},
				options: [
					{
						name: 'Mint Token (Password Grant)',
						value: 'mintPasswordGrant',
						description: 'Mint an access token via Keycloak\'s password-grant flow (used by improvement-loop operator workflows)',
						action: 'Mint a token via password grant',
					},
					{
						name: 'Mint Token (Client Credentials)',
						value: 'mintClientCredentials',
						description: 'Mint a SERVICE access token via client_credentials. Prefer this over the password grant for machine-to-machine calls: it authenticates the CLIENT, so it is not subject to Keycloak\'s per-USER brute-force lockout and needs no shared human password.',
						action: 'Mint a service token via client credentials',
					},
				],
				default: 'mintPasswordGrant',
			},

			// Token mintPasswordGrant fields
			{
				displayName: 'Realm',
				name: 'tokenRealm',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintPasswordGrant'],
					},
				},
				default: 'my-realm',
				description: 'The realm to mint the token in',
			},
			{
				displayName: 'Client ID',
				name: 'tokenClientId',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintPasswordGrant'],
					},
				},
				default: 'my-client',
				description: 'OAuth client_id for the password-grant request',
			},
			{
				displayName: 'Username',
				name: 'tokenUsername',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintPasswordGrant'],
					},
				},
				default: '',
				description: 'Username to authenticate as',
			},
			{
				displayName: 'Password',
				name: 'tokenPassword',
				type: 'string',
				typeOptions: {
					password: true,
				},
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintPasswordGrant'],
					},
				},
				default: '',
				description: 'Password for the user',
			},
			{
				displayName: 'Scope',
				name: 'tokenScope',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintPasswordGrant'],
					},
				},
				default: 'openid',
				description: 'OAuth scope to request',
			},
			{
				displayName: 'Client Secret',
				name: 'tokenClientSecret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintPasswordGrant'],
					},
				},
				default: '',
				description: 'OAuth client_secret (only required for confidential clients)',
			},
			{
				displayName: 'Reuse Token',
				name: 'reuseToken',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintPasswordGrant'],
					},
				},
				default: true,
				description:
					'Whether to reuse a still-valid token already minted in this n8n process for the same realm, client, user, scope and secret. Concurrent callers share one login. Keep ON for shared service accounts: parallel password-grant logins for one user trip Keycloak\'s brute-force lockout. Turn OFF only when a caller genuinely needs a brand-new token.',
			},

			// Token mintClientCredentials fields
			{
				displayName: 'Realm',
				name: 'ccRealm',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintClientCredentials'],
					},
				},
				default: 'my-realm',
				description: 'The realm holding the confidential client',
			},
			{
				displayName: 'Client ID',
				name: 'ccClientId',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintClientCredentials'],
					},
				},
				default: '',
				description: 'client_id of the CONFIDENTIAL client whose service account this token represents',
			},
			{
				displayName: 'Client Secret',
				name: 'ccClientSecret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintClientCredentials'],
					},
				},
				default: '',
				description: 'client_secret for the confidential client. Leave EMPTY to use the Keycloak API credential\'s encrypted Client Secret field instead (preferred: a parameter is plaintext in the workflow JSON). Setting both is refused. One of the two is mandatory — client_credentials has no other authentication factor.',
			},
			{
				displayName: 'Scope',
				name: 'ccScope',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintClientCredentials'],
					},
				},
				default: '',
				description: 'Optional OAuth scope. Leave empty to receive the client\'s default scopes; `openid` is NOT required for a service token.',
			},
			{
				displayName: 'Require Tenant Claim',
				name: 'ccRequireTenantClaim',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['token'],
						operation: ['mintClientCredentials'],
					},
				},
				default: true,
				description: 'Whether to refuse a token that carries no `tenant_id` claim. Leave ON. Consumers derive the tenant from this claim and FALL BACK TO `sub` when it is absent — so a service account missing its tenant_id protocol mapper does not get a 401, it silently writes into a phantom tenant named after the client\'s own UUID. This check converts that silent mis-tenanting into a loud failure at mint time.',
			},
		]),
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('keycloakApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let result: any;

				if (resource === 'user') {
					switch (operation) {
						case 'create':
							result = await createUser.call(this, i, credentials);
							break;
						case 'get':
							result = await getUser.call(this, i, credentials);
							break;
						case 'list':
							result = await listUsers.call(this, i, credentials);
							break;
						case 'update':
							result = await updateUser.call(this, i, credentials);
							break;
						case 'delete':
							result = await deleteUser.call(this, i, credentials);
							break;
						case 'resetPassword':
							result = await resetPassword.call(this, i, credentials);
							break;
						case 'sendVerifyEmail':
							result = await sendVerifyEmail.call(this, i, credentials);
							break;
						case 'getUserGroups':
							result = await getUserGroups.call(this, i, credentials);
							break;
						case 'addUserToGroup':
							result = await addUserToGroup.call(this, i, credentials);
							break;
						case 'removeUserFromGroup':
							result = await removeUserFromGroup.call(this, i, credentials);
							break;
						default:
							throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
					}
				} else if (resource === 'client') {
					switch (operation) {
						case 'create':
							result = await createClient.call(this, i, credentials);
							break;
						case 'get':
							result = await getClient.call(this, i, credentials);
							break;
						case 'list':
							result = await listClients.call(this, i, credentials);
							break;
						case 'update':
							result = await updateClient.call(this, i, credentials);
							break;
						case 'delete':
							result = await deleteClient.call(this, i, credentials);
							break;
						case 'getSecret':
							result = await getClientSecret.call(this, i, credentials);
							break;
						case 'regenerateSecret':
							result = await regenerateClientSecret.call(this, i, credentials);
							break;
						default:
							throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
					}
				} else if (resource === 'token') {
					switch (operation) {
						case 'mintPasswordGrant':
							result = await mintPasswordGrant.call(this, i, credentials);
							break;
						case 'mintClientCredentials':
							result = await mintClientCredentials.call(this, i, credentials);
							break;
						default:
							throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
					}
				}

				returnData.push({
					json: result,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					returnData.push({
						json: { error: errorMessage },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

// ===============================
// Helper Functions
// ===============================

/**
 * `Ignore SSL Issues` is declared inside the credential's `sslOptions`
 * collection. The top-level spelling is honoured too, so credentials saved
 * before that collection existed keep working.
 */
function allowSelfSigned(credentials: any): boolean {
	return Boolean(credentials?.sslOptions?.ignoreSSL ?? credentials?.ignoreSSL);
}

async function getAccessToken(
	this: IExecuteFunctions,
	credentials: any,
): Promise<string> {
	const tokenUrl = `${credentials.baseUrl}/realms/${credentials.realm}/protocol/openid-connect/token`;

	const formData = new URLSearchParams({
		grant_type: 'password',
		client_id: credentials.clientId as string,
		username: credentials.username as string,
		password: credentials.password as string,
	});

	const options: any = {
		method: 'POST',
		url: tokenUrl,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: formData.toString(),
		json: true,
		strictSSL: !allowSelfSigned(credentials),
		rejectUnauthorized: !allowSelfSigned(credentials),
	};

	try {
		const response = await this.helpers.request(options);
		return response.access_token;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as any, {
			message: 'Authentication failed',
			description: 'Could not obtain access token. Check your credentials.',
		});
	}
}

async function makeRequest(
	this: IExecuteFunctions,
	method: string,
	endpoint: string,
	body: any,
	credentials: any,
	targetRealm?: string,
): Promise<any> {
	const accessToken = await getAccessToken.call(this, credentials);
	const realm = targetRealm || credentials.realm;
	const url = `${credentials.baseUrl}/admin/realms/${realm}${endpoint}`;

	const options: any = {
		method,
		url,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		json: true,
		strictSSL: !allowSelfSigned(credentials),
		rejectUnauthorized: !allowSelfSigned(credentials),
	};

	if (body !== null && body !== undefined) {
		options.body = body;
	}

	try {
		return await this.helpers.request(options);
	} catch (error) {
		const statusCode = (error as any)?.statusCode;
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (statusCode === 401) {
			throw new NodeApiError(this.getNode(), error as any, {
				message: 'Authentication failed',
				description: 'The access token is invalid or expired.',
			});
		}

		if (statusCode === 403) {
			throw new NodeApiError(this.getNode(), error as any, {
				message: 'Permission denied',
				description: 'The authenticated user does not have permission for this operation.',
			});
		}

		if (statusCode === 404) {
			throw new NodeApiError(this.getNode(), error as any, {
				message: 'Resource not found',
				description: 'The requested resource does not exist.',
			});
		}

		if (statusCode === 409) {
			throw new NodeApiError(this.getNode(), error as any, {
				message: 'Conflict',
				description: 'Resource already exists or constraint violation.',
			});
		}

		if (statusCode === 400) {
			throw new NodeApiError(this.getNode(), error as any, {
				message: 'Bad request',
				description: 'Invalid request parameters. Check your input.',
			});
		}

		throw new NodeOperationError(
			this.getNode(),
			error instanceof Error ? error : new Error(errorMessage),
		);
	}
}

// ===============================
// User Operations
// ===============================

async function createUser(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const username = this.getNodeParameter('username', i) as string;
	const email = this.getNodeParameter('email', i, '') as string;
	const firstName = this.getNodeParameter('firstName', i, '') as string;
	const lastName = this.getNodeParameter('lastName', i, '') as string;
	const enabled = this.getNodeParameter('enabled', i, true) as boolean;
	const emailVerified = this.getNodeParameter('emailVerified', i, false) as boolean;
	const attributesRaw = this.getNodeParameter('attributes', i, '') as unknown;

	const body: any = {
		username,
		enabled,
		emailVerified,
	};

	if (email) body.email = email;
	if (firstName) body.firstName = firstName;
	if (lastName) body.lastName = lastName;

	// Optional custom attributes (e.g. tenant_id/phone required by a declarative
	// user-profile). Accept an object or a JSON string; only attach when non-empty.
	if (attributesRaw !== undefined && attributesRaw !== null && attributesRaw !== '') {
		let attributes: any = attributesRaw;
		if (typeof attributesRaw === 'string') {
			try {
				attributes = JSON.parse(attributesRaw);
			} catch (e) {
				throw new NodeOperationError(
					this.getNode(),
					`Parameter "Attributes (JSON)" is not valid JSON: ${(e as Error).message}`,
					{ itemIndex: i },
				);
			}
		}
		if (attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
			body.attributes = attributes;
		}
	}

	await makeRequest.call(this, 'POST', '/users', body, credentials);

	// Fetch the created user by username to return their ID
	const users = await makeRequest.call(this, 'GET', `/users?username=${encodeURIComponent(username)}&exact=true`, null, credentials);
	if (Array.isArray(users) && users.length > 0) {
		return users[0];
	}

	return { success: true, message: `User ${username} created successfully`, username };
}

async function getUser(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	return await makeRequest.call(this, 'GET', `/users/${encodeURIComponent(userId)}`, null, credentials);
}

async function listUsers(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const filters = this.getNodeParameter('filters', i, {}) as any;

	let endpoint = '/users';
	const queryParams: string[] = [];

	if (!returnAll) {
		const limit = this.getNodeParameter('limit', i, 100) as number;
		queryParams.push(`max=${limit}`);
	}

	if (filters.search) {
		queryParams.push(`search=${encodeURIComponent(filters.search)}`);
	}
	if (filters.username) {
		queryParams.push(`username=${encodeURIComponent(filters.username)}`);
	}
	if (filters.email) {
		queryParams.push(`email=${encodeURIComponent(filters.email)}`);
	}
	if (filters.enabled !== undefined) {
		queryParams.push(`enabled=${filters.enabled}`);
	}

	if (queryParams.length > 0) {
		endpoint += '?' + queryParams.join('&');
	}

	return await makeRequest.call(this, 'GET', endpoint, null, credentials);
}

async function updateUser(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	const updateFields = this.getNodeParameter('updateFields', i, {}) as any;

	const body: any = {};

	if (updateFields.username) body.username = updateFields.username;
	if (updateFields.email) body.email = updateFields.email;
	if (updateFields.firstName) body.firstName = updateFields.firstName;
	if (updateFields.lastName) body.lastName = updateFields.lastName;
	if (updateFields.enabled !== undefined) body.enabled = updateFields.enabled;
	if (updateFields.emailVerified !== undefined) body.emailVerified = updateFields.emailVerified;

	await makeRequest.call(this, 'PUT', `/users/${encodeURIComponent(userId)}`, body, credentials);
	return { success: true, message: `User ${userId} updated successfully` };
}

async function deleteUser(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	await makeRequest.call(this, 'DELETE', `/users/${encodeURIComponent(userId)}`, null, credentials);
	return { success: true, message: `User ${userId} deleted successfully` };
}

async function resetPassword(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	const password = this.getNodeParameter('password', i) as string;
	const temporary = this.getNodeParameter('temporary', i, false) as boolean;

	const body = {
		type: 'password',
		value: password,
		temporary,
	};

	await makeRequest.call(this, 'PUT', `/users/${encodeURIComponent(userId)}/reset-password`, body, credentials);
	return { success: true, message: `Password reset for user ${userId}` };
}

async function sendVerifyEmail(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	await makeRequest.call(this, 'PUT', `/users/${encodeURIComponent(userId)}/send-verify-email`, null, credentials);
	return { success: true, message: `Verification email sent to user ${userId}` };
}

async function getUserGroups(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	return await makeRequest.call(this, 'GET', `/users/${encodeURIComponent(userId)}/groups`, null, credentials);
}

async function addUserToGroup(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	const groupId = this.getNodeParameter('groupId', i) as string;
	await makeRequest.call(this, 'PUT', `/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`, null, credentials);
	return { success: true, message: `User ${userId} added to group ${groupId}` };
}

async function removeUserFromGroup(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const userId = this.getNodeParameter('userId', i) as string;
	const groupId = this.getNodeParameter('groupId', i) as string;
	await makeRequest.call(this, 'DELETE', `/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`, null, credentials);
	return { success: true, message: `User ${userId} removed from group ${groupId}` };
}

// ===============================
// Client Operations
// ===============================

async function createClient(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const clientId = this.getNodeParameter('clientIdField', i) as string;
	const name = this.getNodeParameter('clientName', i, '') as string;
	const rootUrl = this.getNodeParameter('rootUrl', i, '') as string;
	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as any;

	const body: any = {
		clientId,
	};

	if (name) body.name = name;
	if (rootUrl) body.rootUrl = rootUrl;
	if (additionalFields.enabled !== undefined) body.enabled = additionalFields.enabled;
	if (additionalFields.publicClient !== undefined) body.publicClient = additionalFields.publicClient;
	if (additionalFields.standardFlowEnabled !== undefined) body.standardFlowEnabled = additionalFields.standardFlowEnabled;
	if (additionalFields.directAccessGrantsEnabled !== undefined) body.directAccessGrantsEnabled = additionalFields.directAccessGrantsEnabled;
	if (additionalFields.serviceAccountsEnabled !== undefined) body.serviceAccountsEnabled = additionalFields.serviceAccountsEnabled;
	if (additionalFields.redirectUris) {
		body.redirectUris = additionalFields.redirectUris.split(',').map((uri: string) => uri.trim());
	}

	await makeRequest.call(this, 'POST', '/clients', body, credentials);

	// Fetch the created client by clientId to return their internal ID
	const clients = await makeRequest.call(this, 'GET', `/clients?clientId=${encodeURIComponent(clientId)}`, null, credentials);
	if (Array.isArray(clients) && clients.length > 0) {
		return clients[0];
	}

	return { success: true, message: `Client ${clientId} created successfully`, clientId };
}

async function getClient(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const clientId = this.getNodeParameter('clientId', i) as string;
	return await makeRequest.call(this, 'GET', `/clients/${encodeURIComponent(clientId)}`, null, credentials);
}

async function listClients(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	return await makeRequest.call(this, 'GET', '/clients', null, credentials);
}

async function updateClient(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const clientId = this.getNodeParameter('clientId', i) as string;
	const updateFields = this.getNodeParameter('updateFields', i, {}) as any;

	const body: any = {};

	if (updateFields.name) body.name = updateFields.name;
	if (updateFields.enabled !== undefined) body.enabled = updateFields.enabled;
	if (updateFields.rootUrl) body.rootUrl = updateFields.rootUrl;
	if (updateFields.publicClient !== undefined) body.publicClient = updateFields.publicClient;
	if (updateFields.standardFlowEnabled !== undefined) body.standardFlowEnabled = updateFields.standardFlowEnabled;
	if (updateFields.directAccessGrantsEnabled !== undefined) body.directAccessGrantsEnabled = updateFields.directAccessGrantsEnabled;
	if (updateFields.serviceAccountsEnabled !== undefined) body.serviceAccountsEnabled = updateFields.serviceAccountsEnabled;

	await makeRequest.call(this, 'PUT', `/clients/${encodeURIComponent(clientId)}`, body, credentials);
	return { success: true, message: `Client ${clientId} updated successfully` };
}

async function deleteClient(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const clientId = this.getNodeParameter('clientId', i) as string;
	await makeRequest.call(this, 'DELETE', `/clients/${encodeURIComponent(clientId)}`, null, credentials);
	return { success: true, message: `Client ${clientId} deleted successfully` };
}

async function getClientSecret(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const clientId = this.getNodeParameter('clientId', i) as string;
	return await makeRequest.call(this, 'GET', `/clients/${encodeURIComponent(clientId)}/client-secret`, null, credentials);
}

async function regenerateClientSecret(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const clientId = this.getNodeParameter('clientId', i) as string;
	return await makeRequest.call(this, 'POST', `/clients/${encodeURIComponent(clientId)}/client-secret`, {}, credentials);
}

// ===============================
// Token Operations
// ===============================

async function mintPasswordGrant(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const realm = this.getNodeParameter('tokenRealm', i) as string;
	const clientId = this.getNodeParameter('tokenClientId', i) as string;
	const username = this.getNodeParameter('tokenUsername', i) as string;
	const password = this.getNodeParameter('tokenPassword', i) as string;
	const scope = this.getNodeParameter('tokenScope', i) as string;
	const clientSecret = this.getNodeParameter('tokenClientSecret', i, '') as string;
	const reuseToken = this.getNodeParameter('reuseToken', i, true) as boolean;

	const tokenUrl = `${credentials.baseUrl}/realms/${realm}/protocol/openid-connect/token`;

	const formData = new URLSearchParams({
		grant_type: 'password',
		client_id: clientId,
		username,
		password,
		scope,
	});

	if (clientSecret) {
		formData.append('client_secret', clientSecret);
	}

	const options: any = {
		method: 'POST',
		url: tokenUrl,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: formData.toString(),
		json: true,
		strictSSL: !allowSelfSigned(credentials),
		rejectUnauthorized: !allowSelfSigned(credentials),
	};

	const mint = async (): Promise<Record<string, unknown>> => {
		try {
			return await this.helpers.request(options);
		} catch (error) {
			throw buildMintError(this, error, { grant: 'password', realm, clientId, username });
		}
	};

	if (!reuseToken) {
		return await mint();
	}

	const key = tokenCacheKey({
		baseUrl: String(credentials.baseUrl),
		realm,
		clientId,
		username,
		scope,
		password,
		clientSecret,
	});
	return await getOrMintToken(key, mint);
}

/**
 * Pull Keycloak's OAuth error out of whatever shape the request helper threw. The body
 * may arrive as an object or as a JSON string, under `error`, `response.body` or
 * `response.data`; the status as `statusCode`, `httpCode` or `response.status`.
 */
function extractKeycloakError(error: any): { status?: number; error?: string; errorDescription?: string } {
	const statusRaw = error?.statusCode ?? error?.httpCode ?? error?.response?.status ?? error?.response?.statusCode;
	const status = Number.isFinite(Number(statusRaw)) ? Number(statusRaw) : undefined;

	const candidates = [error?.error, error?.response?.body, error?.response?.data];
	for (const candidate of candidates) {
		let body = candidate;
		if (typeof body === 'string') {
			try {
				body = JSON.parse(body);
			} catch {
				continue;
			}
		}
		if (body && typeof body === 'object' && (body.error || body.error_description)) {
			return {
				status,
				error: typeof body.error === 'string' ? body.error : undefined,
				errorDescription: typeof body.error_description === 'string' ? body.error_description : undefined,
			};
		}
	}
	return { status };
}

/**
 * Build the thrown error for a failed password-grant mint.
 *
 * It carries Keycloak's own `error` / `error_description` and the HTTP status, not a
 * fixed "check your credentials". It is built from a SANITISED object, never the raw
 * request error, because that error can carry the request options and with them the
 * form body, which contains the password.
 */
function buildMintError(
	ctx: IExecuteFunctions,
	error: any,
	who: { grant: 'password' | 'client_credentials'; realm: string; clientId: string; username?: string },
): NodeApiError {
	const kc = extractKeycloakError(error);
	const parts = [
		kc.status !== undefined ? `HTTP ${kc.status}` : undefined,
		kc.error,
		kc.errorDescription ? `"${kc.errorDescription}"` : undefined,
	].filter(Boolean);
	const detail = parts.length > 0 ? parts.join(' ') : String(error?.message ?? 'no response from Keycloak').slice(0, 200);
	const subject =
		who.grant === 'password'
			? `user '${who.username}' via client '${who.clientId}' in realm '${who.realm}'`
			: `client '${who.clientId}' in realm '${who.realm}'`;
	const prefix = who.grant === 'password' ? 'Token mint failed' : 'Service token mint failed';

	const desc = (kc.errorDescription ?? '').toLowerCase();
	let description: string;
	if (who.grant === 'client_credentials') {
		description =
			`Could not mint a client_credentials token for ${subject}. Check that the client exists in this realm, is CONFIDENTIAL (not public), has "Service accounts roles" enabled, and that the secret is current.`;
	} else if (desc.includes('disabled') || desc.includes('temporarily')) {
		description =
			`Keycloak reports the account as disabled/locked for ${subject}. This is most likely ` +
			'brute-force protection (a temporary lockout), NOT a wrong password: concurrent logins ' +
			'for one shared user can trip it. It self-clears; keep "Reuse Token" ON so parallel ' +
			'executions share one login.';
	} else if (kc.error === 'invalid_grant' && desc.includes('invalid user credentials')) {
		description =
			`Keycloak rejected the login for ${subject}. Keycloak returns this SAME response for a ` +
			'wrong password AND for an account temporarily locked by brute-force protection. Check ' +
			'the realm events: USER_TEMPORARILY_DISABLED means a lockout (concurrent logins for a ' +
			'shared user), INVALID_USER_CREDENTIALS means a wrong password.';
	} else {
		description = `Could not mint a password-grant token for ${subject}. Check realm, client_id, credentials, and scope.`;
	}

	const sanitised: Record<string, unknown> = {
		message: `${prefix}: ${detail}`,
		...(kc.status !== undefined ? { httpCode: String(kc.status) } : {}),
		...(kc.error || kc.errorDescription
			? { error: { error: kc.error, error_description: kc.errorDescription } }
			: {}),
	};
	return new NodeApiError(ctx.getNode(), sanitised as any, {
		message: `${prefix}: ${detail}`,
		description,
		...(kc.status !== undefined ? { httpCode: String(kc.status) } : {}),
	});
}

/**
 * Read the payload of a JWT WITHOUT verifying its signature.
 *
 * This is deliberately unverified and that is safe HERE, because it is not a trust
 * decision: the token was just minted by Keycloak over TLS in the call above, and we
 * are inspecting OUR OWN token to confirm the realm actually stamped the claim we
 * provisioned. Never use this to validate a token that arrived from a caller.
 *
 * Returns null for anything that is not a decodable three-part JWT, so a caller can
 * distinguish "no claim" from "not a JWT at all".
 */
function decodeJwtPayloadUnverified(token: string): Record<string, unknown> | null {
	if (typeof token !== 'string') return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	try {
		const payload = Buffer.from(
			parts[1].replace(/-/g, '+').replace(/_/g, '/'),
			'base64',
		).toString('utf8');
		const parsed = JSON.parse(payload);
		return typeof parsed === 'object' && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}

async function mintClientCredentials(
	this: IExecuteFunctions,
	i: number,
	credentials: any,
): Promise<any> {
	const realm = this.getNodeParameter('ccRealm', i) as string;
	const clientId = this.getNodeParameter('ccClientId', i) as string;
	const paramSecret = (this.getNodeParameter('ccClientSecret', i, '') as string) || '';
	const credentialSecret = (credentials.clientSecret as string) || '';
	const scope = this.getNodeParameter('ccScope', i, '') as string;
	const requireTenantClaim = this.getNodeParameter('ccRequireTenantClaim', i, true) as boolean;

	// The secret may come from the node parameter (plaintext in the workflow JSON) or
	// from the credential's encrypted `clientSecret` field. Exactly one source may be
	// set: with both present, which one wins would be invisible to whoever edits either,
	// so an ambiguous source is refused before any request is built. Neither value is
	// ever interpolated into the message.
	if (paramSecret && credentialSecret) {
		throw new NodeOperationError(
			this.getNode(),
			'Client Secret is set both on the node (Client Secret parameter) and on the Keycloak API credential (clientSecret) — refusing an ambiguous secret source. Clear one of them; prefer the credential, which is stored encrypted.',
		);
	}
	const clientSecret = paramSecret || credentialSecret;

	// client_credentials authenticates the CLIENT and nothing else. Without a secret
	// there is no authentication factor at all, so refuse rather than send a request
	// that can only fail — or, worse, succeed against a misconfigured public client.
	if (!clientSecret) {
		throw new NodeOperationError(
			this.getNode(),
			'Client Secret is required for the client_credentials grant: it is the only authentication factor this flow has.',
		);
	}

	const tokenUrl = `${credentials.baseUrl}/realms/${realm}/protocol/openid-connect/token`;

	const formData = new URLSearchParams({
		grant_type: 'client_credentials',
		client_id: clientId,
		client_secret: clientSecret,
	});

	// Unlike the password grant, an empty scope is meaningful here: it means "give me
	// the client's default scopes". Sending `scope=` would ask for a scope named ''.
	if (scope) {
		formData.append('scope', scope);
	}

	const options: any = {
		method: 'POST',
		url: tokenUrl,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: formData.toString(),
		json: true,
		strictSSL: !allowSelfSigned(credentials),
		rejectUnauthorized: !allowSelfSigned(credentials),
	};

	let response: any;
	try {
		response = await this.helpers.request(options);
	} catch (error) {
		// Same sanitised builder as the password grant: the raw request error carries the
		// form body in `options.data`, and here that body holds the client_secret.
		throw buildMintError(this, error, { grant: 'client_credentials', realm, clientId });
	}

	if (!response || !response.access_token) {
		throw new NodeOperationError(
			this.getNode(),
			'Keycloak returned no access_token for the client_credentials grant — refusing to hand back an empty bearer.',
		);
	}

	// ── FAIL CLOSED ON A MISSING TENANT CLAIM ────────────────────────────────────────
	// A service account whose `tenant_id` protocol mapper was never provisioned mints a
	// perfectly valid token. Downstream, a consumer's `deriveTenantId`
	// reads `claims.tenant_id` and FALLS BACK TO `claims.sub` when it is absent — so the
	// request is not rejected, it is silently attributed to a tenant named after this
	// client's own service-account UUID, and every row written under it lands in a
	// phantom workspace nobody looks at. The failure is invisible precisely because the
	// token is valid. Catch it at mint time, where the fix is one mapper away.
	if (requireTenantClaim) {
		const claims = decodeJwtPayloadUnverified(response.access_token as string);
		const tenantId = claims ? claims.tenant_id : undefined;
		if (typeof tenantId !== 'string' || tenantId.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				`Service token for client '${clientId}' in realm '${realm}' carries no \`tenant_id\` claim. ` +
					'Consumers fall back to `sub` when this claim is missing, which silently writes into a ' +
					'phantom tenant instead of failing — so this token is being refused here. Add a ' +
					'"User Attribute" protocol mapper named tenant_id (token claim name `tenant_id`, ' +
					'"Add to access token" ON) to the client, and set the tenant_id attribute on its ' +
					'service-account user. Set "Require Tenant Claim" to false ONLY for a consumer that ' +
					'does not tenant-scope its writes.',
			);
		}
	}

	return response;
}
