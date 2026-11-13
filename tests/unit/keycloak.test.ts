// TypeScript checking disabled for test file due to Jest mock type complexity
// Tests are functionally correct and properly validate node implementation
// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Keycloak } from '../../nodes/Keycloak/Keycloak.node';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

function createMockExecuteFunctions(parameters: any, inputData: any[] = [{ json: {} }]): IExecuteFunctions {
	const mockRequest = jest.fn();

	return {
		getNodeParameter: (name: string, index: number, defaultValue?: any) => {
			return parameters[name] ?? defaultValue;
		},
		helpers: {
			request: mockRequest,
		},
		getNode: jest.fn(() => ({
			name: 'Keycloak',
			type: 'keycloak.keycloak',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		})),
		continueOnFail: jest.fn(() => false),
		getCredentials: jest.fn(async () => ({
			baseUrl: 'https://keycloak.test',
			realm: 'my-realm',
			username: 'admin',
			password: 'admin',
			clientId: 'admin-cli',
			ignoreSSL: true,
		})),
		getInputData: jest.fn(() => inputData),
	} as unknown as IExecuteFunctions;
}

describe('Keycloak Node - User Operations', () => {
	let keycloakNode: Keycloak;

	beforeEach(() => {
		keycloakNode = new Keycloak();
	});

	describe('List Users', () => {
		it('should list users with default limit', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'list',
				returnAll: false,
				limit: 100,
				filters: {},
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce([
					{ id: '1', username: 'user1' },
					{ id: '2', username: 'user2' },
				]);

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual([
				{ id: '1', username: 'user1' },
				{ id: '2', username: 'user2' },
			]);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});

		it('should apply search filter', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'list',
				returnAll: false,
				limit: 50,
				filters: {
					search: 'john',
				},
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce([{ id: '1', username: 'john.doe' }]);

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual([{ id: '1', username: 'john.doe' }]);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});

		it('should apply multiple query parameter filters', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'list',
				returnAll: false,
				limit: 25,
				filters: {
					username: 'admin',
					email: 'admin@example.com',
					enabled: true,
				},
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce([
					{ id: '1', username: 'admin', email: 'admin@example.com', enabled: true },
				]);

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual([
				{ id: '1', username: 'admin', email: 'admin@example.com', enabled: true },
			]);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
			// Verify query parameters were properly encoded and combined
			const lastCall = (mockContext.helpers.request as jest.Mock).mock.calls[1];
			const requestOptions = lastCall[0];
			expect(requestOptions.url).toContain('max=25');
			expect(requestOptions.url).toContain('username=admin');
			expect(requestOptions.url).toContain('email=admin%40example.com');
			expect(requestOptions.url).toContain('enabled=true');
		});
	});

	describe('Create User', () => {
		it('should create user with required fields', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'create',
				username: 'testuser',
				email: 'test@example.com',
				firstName: 'Test',
				lastName: 'User',
				enabled: true,
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for POST
				.mockResolvedValueOnce({}) // POST /users (201 empty)
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for GET fetch-back
				.mockResolvedValueOnce([{ id: 'user-abc', username: 'testuser' }]); // GET /users?username=...

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('id', 'user-abc');
			expect(result[0][0].json).toHaveProperty('username', 'testuser');
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(4);
		});

		it('should send attributes + emailVerified in the create body', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'create',
				username: 'example-user',
				email: 'user@example.com',
				firstName: 'AA Card Writer',
				lastName: 'X',
				enabled: true,
				emailVerified: true,
				attributes:
					'{"tenant_id":["0195f48b-d000-7000-8000-0000000000ff"],"phone":["+10000000099"]}',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for POST
				.mockResolvedValueOnce({}) // POST /users
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for GET fetch-back
				.mockResolvedValueOnce([{ id: 'user-x', username: 'example-user' }]);

			await keycloakNode.execute.call(mockContext);

			// 2nd request call is the POST /users — assert it carried the new fields.
			const postCall = (mockContext.helpers.request as jest.Mock).mock.calls[1][0];
			expect(postCall.url).toContain('/users');
			expect(postCall.body.emailVerified).toBe(true);
			expect(postCall.body.attributes).toEqual({
				tenant_id: ['0195f48b-d000-7000-8000-0000000000ff'],
				phone: ['+10000000099'],
			});
		});
	});

	describe('Get User', () => {
		it('should get user by ID', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'get',
				userId: 'user-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({
					id: 'user-123',
					username: 'testuser',
					email: 'test@example.com',
				});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('id', 'user-123');
			expect(result[0][0].json).toHaveProperty('username', 'testuser');
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Update User', () => {
		it('should update user fields', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'update',
				userId: 'user-123',
				updateFields: {
					username: 'newusername',
					email: 'newemail@example.com',
					firstName: 'NewFirst',
					lastName: 'NewLast',
					enabled: false,
					emailVerified: true,
				},
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Delete User', () => {
		it('should delete user by ID', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'delete',
				userId: 'user-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Reset Password', () => {
		it('should reset user password', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'resetPassword',
				userId: 'user-123',
				password: 'newpassword123',
				temporary: false,
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Send Verify Email', () => {
		it('should send verification email', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'sendVerifyEmail',
				userId: 'user-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Get User Groups', () => {
		it('should get user groups', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'getUserGroups',
				userId: 'user-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce([
					{ id: 'group-1', name: 'admins', path: '/admins' },
					{ id: 'group-2', name: 'users', path: '/users' },
				]);

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual([
				{ id: 'group-1', name: 'admins', path: '/admins' },
				{ id: 'group-2', name: 'users', path: '/users' },
			]);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Add User to Group', () => {
		it('should add user to group', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'addUserToGroup',
				userId: 'user-123',
				groupId: 'group-456',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Remove User from Group', () => {
		it('should remove user from group', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'user',
				operation: 'removeUserFromGroup',
				userId: 'user-123',
				groupId: 'group-456',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});
});

describe('Keycloak Node - Client Operations', () => {
	let keycloakNode: Keycloak;

	beforeEach(() => {
		keycloakNode = new Keycloak();
	});

	describe('List Clients', () => {
		it('should list all clients', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'list',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce([
					{ id: '1', clientId: 'app1' },
					{ id: '2', clientId: 'app2' },
				]);

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual([
				{ id: '1', clientId: 'app1' },
				{ id: '2', clientId: 'app2' },
			]);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Create Client', () => {
		it('should create client with required fields', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'create',
				clientIdField: 'my-app',
				clientName: 'My Application',
				rootUrl: 'https://app.example.com',
				additionalFields: {
					enabled: true,
					publicClient: false,
					standardFlowEnabled: true,
					directAccessGrantsEnabled: true,
					serviceAccountsEnabled: false,
				},
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for POST
				.mockResolvedValueOnce({}) // POST /clients (201 empty)
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for GET fetch-back
				.mockResolvedValueOnce([{ id: 'client-uuid', clientId: 'my-app' }]); // GET /clients?clientId=...

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('id', 'client-uuid');
			expect(result[0][0].json).toHaveProperty('clientId', 'my-app');
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(4);
		});

		it('should handle redirectUris array correctly', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'create',
				clientIdField: 'my-app',
				clientName: 'My Application',
				rootUrl: 'https://app.example.com',
				additionalFields: {
					enabled: true,
					publicClient: false,
					redirectUris: 'https://app.example.com/callback, https://app.example.com/auth, https://app.example.com/oauth',
				},
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for POST
				.mockResolvedValueOnce({}) // POST /clients
				.mockResolvedValueOnce({ access_token: 'test-token' }) // auth for GET fetch-back
				.mockResolvedValueOnce([{ id: 'client-uuid', clientId: 'my-app' }]); // GET /clients?clientId=...

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('id', 'client-uuid');
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(4);
			// Verify POST request was called with properly split and trimmed redirectUris array
			const postCall = (mockContext.helpers.request as jest.Mock).mock.calls[1];
			const requestOptions = postCall[0];
			expect(requestOptions.body.redirectUris).toEqual([
				'https://app.example.com/callback',
				'https://app.example.com/auth',
				'https://app.example.com/oauth',
			]);
		});
	});

	describe('Get Client', () => {
		it('should get client by UUID', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'get',
				clientId: 'client-uuid-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({
					id: 'client-uuid-123',
					clientId: 'my-app',
					name: 'My Application',
				});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('id', 'client-uuid-123');
			expect(result[0][0].json).toHaveProperty('clientId', 'my-app');
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Get Client Secret', () => {
		it('should retrieve client secret', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'getSecret',
				clientId: 'client-uuid-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({
					type: 'secret',
					value: 'super-secret-value',
				});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('type', 'secret');
			expect(result[0][0].json).toHaveProperty('value', 'super-secret-value');
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Regenerate Client Secret', () => {
		it('should regenerate client secret', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'regenerateSecret',
				clientId: 'client-uuid-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({
					type: 'secret',
					value: 'new-secret-value',
				});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('type', 'secret');
			expect(result[0][0].json).toHaveProperty('value', 'new-secret-value');
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Update Client', () => {
		it('should update client fields', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'update',
				clientId: 'client-uuid-123',
				updateFields: {
					name: 'Updated Application Name',
					enabled: true,
					rootUrl: 'https://newapp.example.com',
					publicClient: false,
					standardFlowEnabled: true,
					directAccessGrantsEnabled: true,
					serviceAccountsEnabled: false,
				},
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});

	describe('Delete Client', () => {
		it('should delete client by UUID', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'client',
				operation: 'delete',
				clientId: 'client-uuid-123',
			});

			(mockContext.helpers.request as jest.Mock)
				.mockResolvedValueOnce({ access_token: 'test-token' })
				.mockResolvedValueOnce({});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('success', true);
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(2);
		});
	});
});

describe('Keycloak Node - Error Handling', () => {
	let keycloakNode: Keycloak;

	beforeEach(() => {
		keycloakNode = new Keycloak();
	});

	it('should handle authentication errors', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'list',
		});

		(mockContext.helpers.request as jest.Mock).mockRejectedValue({
			statusCode: 401,
			message: 'Unauthorized',
		});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
	});

	it('should handle permission errors', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'delete',
			userId: 'user-123',
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' })
			.mockRejectedValue({
				statusCode: 403,
				message: 'Forbidden',
			});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
	});

	it('should handle not found errors', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'get',
			userId: 'nonexistent',
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' })
			.mockRejectedValue({
				statusCode: 404,
				message: 'Not Found',
			});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
	});

	it('should handle conflict errors (409)', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'create',
			username: 'existing-user',
			email: 'existing@example.com',
			firstName: 'Test',
			lastName: 'User',
			enabled: true,
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' })
			.mockRejectedValue({
				statusCode: 409,
				message: 'Conflict - User already exists',
			});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
	});

	it('should handle bad request errors (400)', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'create',
			username: '',
			email: 'invalid-email',
			firstName: 'Test',
			lastName: 'User',
			enabled: true,
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' })
			.mockRejectedValue({
				statusCode: 400,
				message: 'Bad Request - Invalid data',
			});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
	});

	it('should handle continue on fail mode', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'list',
		});

		(mockContext.continueOnFail as jest.Mock).mockReturnValue(true);
		(mockContext.helpers.request as jest.Mock).mockRejectedValue({
			statusCode: 500,
			message: 'Internal Server Error',
		});

		const result = await keycloakNode.execute.call(mockContext);

		expect(result).toBeDefined();
		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json).toHaveProperty('error');
	});

	it('should handle unknown user operation', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'unknownOperation',
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' });

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow('Unknown operation');
	});

	it('should handle unknown client operation', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'client',
			operation: 'unknownOperation',
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' });

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow('Unknown operation');
	});

	it('should handle authentication failure in getAccessToken', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'list',
		});

		(mockContext.helpers.request as jest.Mock).mockRejectedValue({
			statusCode: 401,
			message: 'Invalid credentials',
		});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
	});

	it('should handle expired token (401 after successful authentication)', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'get',
			userId: 'user-123',
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' }) // Token obtained successfully
			.mockRejectedValue({
				statusCode: 401,
				message: 'Token expired',
			});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow('Authentication failed');
	});

	it('should handle generic error with unknown status code', async () => {
		const mockContext = createMockExecuteFunctions({
			resource: 'user',
			operation: 'get',
			userId: 'user-123',
		});

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' })
			.mockRejectedValue({
				statusCode: 503,
				message: 'Service Unavailable',
			});

		await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
	});
});

describe('Keycloak Node - Token Operations', () => {
	let keycloakNode: Keycloak;

	beforeEach(() => {
		keycloakNode = new Keycloak();
	});

	describe('Mint Password Grant', () => {
		it('should mint a token via password grant and return the parsed response', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintPasswordGrant',
				tokenRealm: 'my-realm',
				tokenClientId: 'my-client',
				tokenUsername: 'operator@example.com',
				tokenPassword: 's3cret',
				tokenScope: 'openid',
				tokenClientSecret: '',
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: 'mint-access-token',
				expires_in: 300,
				refresh_token: 'mint-refresh-token',
				refresh_expires_in: 1800,
				token_type: 'Bearer',
				scope: 'openid',
			});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result).toBeDefined();
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual({
				access_token: 'mint-access-token',
				expires_in: 300,
				refresh_token: 'mint-refresh-token',
				refresh_expires_in: 1800,
				token_type: 'Bearer',
				scope: 'openid',
			});
			expect(mockContext.helpers.request).toHaveBeenCalledTimes(1);

			// Verify the form POST shape
			const call = (mockContext.helpers.request as jest.Mock).mock.calls[0][0];
			expect(call.method).toBe('POST');
			expect(call.url).toBe('https://keycloak.test/realms/my-realm/protocol/openid-connect/token');
			expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
			expect(call.body).toContain('grant_type=password');
			expect(call.body).toContain('client_id=my-client');
			expect(call.body).toContain('username=operator%40example.com');
			expect(call.body).toContain('password=s3cret');
			expect(call.body).toContain('scope=openid');
			expect(call.body).not.toContain('client_secret');
		});

		it('should include client_secret when provided', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintPasswordGrant',
				tokenRealm: 'my-realm',
				tokenClientId: 'confidential-client',
				tokenUsername: 'svc-user',
				tokenPassword: 'p@ss',
				tokenScope: 'openid profile',
				tokenClientSecret: 'cs-shhh',
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: 'tok',
				expires_in: 60,
				token_type: 'Bearer',
				scope: 'openid profile',
			});

			await keycloakNode.execute.call(mockContext);

			const call = (mockContext.helpers.request as jest.Mock).mock.calls[0][0];
			expect(call.url).toBe('https://keycloak.test/realms/my-realm/protocol/openid-connect/token');
			expect(call.body).toContain('client_secret=cs-shhh');
		});
	});

	describe('Mint Client Credentials', () => {
		// Build a structurally real JWT so the tenant-claim gate is exercised against the
		// same base64url decode path production uses, not a stubbed claim object.
		function makeJwt(payload: Record<string, unknown>): string {
			const b64 = (o: unknown) =>
				Buffer.from(JSON.stringify(o))
					.toString('base64')
					.replace(/\+/g, '-')
					.replace(/\//g, '_')
					.replace(/=+$/, '');
			return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.sig-not-verified`;
		}

		const withTenant = makeJwt({
			sub: 'svc-acct-uuid',
			tenant_id: '0195f48b-0000-0000-0000-000000000003',
			realm_access: { roles: ['aa_operator'] },
		});

		it('should mint a service token via client_credentials and return the parsed response', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-example',
				ccClientSecret: 'cc-secret',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: withTenant,
				expires_in: 300,
				token_type: 'Bearer',
			});

			const result = await keycloakNode.execute.call(mockContext);

			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual({
				access_token: withTenant,
				expires_in: 300,
				token_type: 'Bearer',
			});

			const call = (mockContext.helpers.request as jest.Mock).mock.calls[0][0];
			expect(call.method).toBe('POST');
			expect(call.url).toBe('https://keycloak.test/realms/my-realm/protocol/openid-connect/token');
			expect(call.body).toContain('grant_type=client_credentials');
			expect(call.body).toContain('client_id=svc-example');
			expect(call.body).toContain('client_secret=cc-secret');
			// No username/password anywhere — that is the entire point of the migration.
			expect(call.body).not.toContain('username');
			expect(call.body).not.toContain('password=');
		});

		it('should omit scope entirely when empty, rather than asking for a scope named ""', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa',
				ccClientSecret: 'cc-secret',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: withTenant,
				token_type: 'Bearer',
			});

			await keycloakNode.execute.call(mockContext);

			const call = (mockContext.helpers.request as jest.Mock).mock.calls[0][0];
			expect(call.body).not.toContain('scope');
		});

		it('should forward a non-empty scope', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa',
				ccClientSecret: 'cc-secret',
				ccScope: 'profile',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: withTenant,
				token_type: 'Bearer',
			});

			await keycloakNode.execute.call(mockContext);

			const call = (mockContext.helpers.request as jest.Mock).mock.calls[0][0];
			expect(call.body).toContain('scope=profile');
		});

		it('should refuse to send a request at all when no client secret is configured', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa',
				ccClientSecret: '',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow(
				/Client Secret is required/,
			);
			expect(mockContext.helpers.request).not.toHaveBeenCalled();
		});

		it('should reject a token with no access_token rather than return an empty bearer', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa',
				ccClientSecret: 'cc-secret',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				token_type: 'Bearer',
			});

			await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow(
				/no access_token/,
			);
		});

		// ── THE DEFECT THIS GATE EXISTS FOR ──────────────────────────────────────────
		// A service account without its tenant_id protocol mapper mints a VALID token.
		// A consumer's `deriveTenantId` falls back to `sub`, so the write is silently attributed to
		// a phantom tenant instead of being rejected. The token being valid is exactly
		// what makes this invisible, so the gate must fire on a well-formed response.
		it('should refuse a VALID token that carries no tenant_id claim', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa-unmapped',
				ccClientSecret: 'cc-secret',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: makeJwt({ sub: 'svc-acct-uuid' }), // valid, just unmapped
				expires_in: 300,
				token_type: 'Bearer',
			});

			await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow(
				/carries no `tenant_id` claim/,
			);
		});

		it('should refuse a token whose tenant_id is present but empty', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa-empty',
				ccClientSecret: 'cc-secret',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: makeJwt({ sub: 'svc-acct-uuid', tenant_id: '' }),
				token_type: 'Bearer',
			});

			await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow(
				/carries no `tenant_id` claim/,
			);
		});

		it('should refuse an opaque (non-JWT) token when the tenant claim is required', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa-opaque',
				ccClientSecret: 'cc-secret',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: 'opaque-not-a-jwt',
				token_type: 'Bearer',
			});

			await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow(
				/carries no `tenant_id` claim/,
			);
		});

		it('should allow an unmapped token when the caller explicitly opts out', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-no-tenant',
				ccClientSecret: 'cc-secret',
				ccScope: '',
				ccRequireTenantClaim: false,
			});

			const noTenant = makeJwt({ sub: 'svc-acct-uuid' });
			(mockContext.helpers.request as jest.Mock).mockResolvedValueOnce({
				access_token: noTenant,
				token_type: 'Bearer',
			});

			const result = await keycloakNode.execute.call(mockContext);
			expect(result[0][0].json).toMatchObject({ access_token: noTenant });
		});

		it('should surface a Keycloak rejection as a node error', async () => {
			const mockContext = createMockExecuteFunctions({
				resource: 'token',
				operation: 'mintClientCredentials',
				ccRealm: 'my-realm',
				ccClientId: 'svc-aa',
				ccClientSecret: 'wrong-secret',
				ccScope: '',
				ccRequireTenantClaim: true,
			});

			(mockContext.helpers.request as jest.Mock).mockRejectedValueOnce({
				statusCode: 401,
				message: 'invalid_client',
			});

			await expect(keycloakNode.execute.call(mockContext)).rejects.toThrow();
		});

		// ── SECRET SOURCE: node parameter vs the credential's encrypted clientSecret ──
		describe('client secret source', () => {
			const CRED_SECRET = 'cred-Zq9-only-in-credential';
			const PARAM_SECRET = 'param-Xk7-only-in-workflow';

			function ctxWith(paramSecret: string, credSecret: string | undefined) {
				const ctx = createMockExecuteFunctions({
					resource: 'token',
					operation: 'mintClientCredentials',
					ccRealm: 'my-realm',
					ccClientId: 'conveyor-priority',
					ccClientSecret: paramSecret,
					ccScope: '',
					ccRequireTenantClaim: true,
				});
				const base = {
					baseUrl: 'https://keycloak.test',
					realm: 'my-realm',
					username: 'admin',
					password: 'admin',
					clientId: 'admin-cli',
					ignoreSSL: true,
				};
				(ctx.getCredentials as jest.Mock).mockResolvedValue(
					credSecret === undefined ? base : { ...base, clientSecret: credSecret },
				);
				return ctx;
			}

			function bodyOf(ctx: IExecuteFunctions): URLSearchParams {
				const call = (ctx.helpers.request as jest.Mock).mock.calls[0][0];
				return new URLSearchParams(call.body);
			}

			it('uses the credential clientSecret when the node parameter is empty, verbatim in the token body', async () => {
				const ctx = ctxWith('', CRED_SECRET);
				(ctx.helpers.request as jest.Mock).mockResolvedValueOnce({ access_token: withTenant });

				await keycloakNode.execute.call(ctx);

				expect(ctx.helpers.request).toHaveBeenCalledTimes(1);
				const body = bodyOf(ctx);
				expect(body.get('client_secret')).toBe(CRED_SECRET);
				expect(body.get('client_id')).toBe('conveyor-priority');
				expect(body.get('grant_type')).toBe('client_credentials');
			});

			it('still uses the node parameter when the credential field is empty (backward compatible)', async () => {
				const ctx = ctxWith(PARAM_SECRET, '');
				(ctx.helpers.request as jest.Mock).mockResolvedValueOnce({ access_token: withTenant });

				await keycloakNode.execute.call(ctx);

				expect(bodyOf(ctx).get('client_secret')).toBe(PARAM_SECRET);
			});

			it('still uses the node parameter when the credential has no clientSecret key at all (pre-existing credentials)', async () => {
				const ctx = ctxWith(PARAM_SECRET, undefined);
				(ctx.helpers.request as jest.Mock).mockResolvedValueOnce({ access_token: withTenant });

				await keycloakNode.execute.call(ctx);

				expect(bodyOf(ctx).get('client_secret')).toBe(PARAM_SECRET);
			});

			it('refuses when BOTH are set, makes NO HTTP call, and names neither secret', async () => {
				const ctx = ctxWith(PARAM_SECRET, CRED_SECRET);

				let caught: any;
				try {
					await keycloakNode.execute.call(ctx);
				} catch (e) {
					caught = e;
				}

				expect(caught).toBeDefined();
				expect(String(caught.message)).toMatch(/refusing an ambiguous secret source/);
				expect(ctx.helpers.request).not.toHaveBeenCalled();
				const rendered = `${caught.message} ${caught.description ?? ''} ${JSON.stringify(caught)} ${caught.stack ?? ''}`;
				expect(rendered).not.toContain(PARAM_SECRET);
				expect(rendered).not.toContain(CRED_SECRET);
			});

			it('keeps the existing refusal when NEITHER is set, with no HTTP call', async () => {
				const ctx = ctxWith('', '');

				await expect(keycloakNode.execute.call(ctx)).rejects.toThrow(/Client Secret is required/);
				expect(ctx.helpers.request).not.toHaveBeenCalled();
			});

			it('does not leak the credential secret in a token-endpoint error', async () => {
				const ctx = ctxWith('', CRED_SECRET);
				(ctx.helpers.request as jest.Mock).mockRejectedValueOnce({
					statusCode: 401,
					message: 'invalid_client',
					options: { data: `grant_type=client_credentials&client_secret=${CRED_SECRET}` },
				});

				let caught: any;
				try {
					await keycloakNode.execute.call(ctx);
				} catch (e) {
					caught = e;
				}

				expect(caught).toBeDefined();
				const rendered = `${caught.message} ${caught.description ?? ''} ${JSON.stringify(caught)}`;
				expect(rendered).not.toContain(CRED_SECRET);
			});

			it('never sends the credential clientSecret on an unrelated admin call', async () => {
				const ctx = createMockExecuteFunctions({
					resource: 'user',
					operation: 'list',
					returnAll: false,
					limit: 100,
					filters: {},
				});
				(ctx.getCredentials as jest.Mock).mockResolvedValue({
					baseUrl: 'https://keycloak.test',
					realm: 'my-realm',
					username: 'admin',
					password: 'admin',
					clientId: 'admin-cli',
					ignoreSSL: true,
					clientSecret: CRED_SECRET,
				});
				(ctx.helpers.request as jest.Mock)
					.mockResolvedValueOnce({ access_token: 'admin-token' })
					.mockResolvedValueOnce([]);

				await keycloakNode.execute.call(ctx);

				const sent = JSON.stringify((ctx.helpers.request as jest.Mock).mock.calls);
				expect(sent).not.toContain(CRED_SECRET);
			});
		});
	});
});

describe('Keycloak Node - Multi-Item Processing', () => {
	let keycloakNode: Keycloak;

	beforeEach(() => {
		keycloakNode = new Keycloak();
	});

	it('should process multiple items', async () => {
		const mockContext = createMockExecuteFunctions(
			{
				resource: 'user',
				operation: 'get',
				userId: 'user-123',
			},
			[
				{ json: {} },
				{ json: {} },
			],
		);

		(mockContext.helpers.request as jest.Mock)
			.mockResolvedValueOnce({ access_token: 'test-token' })
			.mockResolvedValueOnce({ id: 'user-123', username: 'user1' })
			.mockResolvedValueOnce({ access_token: 'test-token' })
			.mockResolvedValueOnce({ id: 'user-123', username: 'user2' });

		const result = await keycloakNode.execute.call(mockContext);

		expect(result).toBeDefined();
		expect(result[0]).toHaveLength(2);
		expect(result[0][0].pairedItem).toEqual({ item: 0 });
		expect(result[0][1].pairedItem).toEqual({ item: 1 });
		expect(mockContext.helpers.request).toHaveBeenCalledTimes(4);
	});
});
