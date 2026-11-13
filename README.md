# n8n-nodes-keycloak

[![npm version](https://img.shields.io/npm/v/@nonagentic/n8n-nodes-keycloak.svg)](https://www.npmjs.com/package/@nonagentic/n8n-nodes-keycloak)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/nonagenticai/n8n-nodes-keycloak/actions/workflows/ci.yml/badge.svg)](https://github.com/nonagenticai/n8n-nodes-keycloak/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/nonagenticai/n8n-nodes-keycloak)](https://github.com/nonagenticai/n8n-nodes-keycloak/releases)

An n8n community node for administering [Keycloak](https://www.keycloak.org): users, clients and
OAuth tokens.

## Features

- **User management** — create, read, update, delete, list and search users; reset passwords; send
  verification emails; read, add and remove group memberships.
- **Client management** — create, read, update, delete and list clients (applications); read and
  regenerate client secrets.
- **Token minting** — password grant and client-credentials grant, with a per-process single-flight
  token cache so concurrent executions do not trip Keycloak's brute-force protection.
- **Error handling** — upstream detail is preserved, and credentials are redacted from messages.

## Installation

### n8n GUI (recommended)

1. Go to **Settings → Community Nodes → Install**.
2. Enter `@nonagentic/n8n-nodes-keycloak`.

### Manual

```bash
npm install @nonagentic/n8n-nodes-keycloak
```

Restart n8n afterwards.

## Credentials

Create a **Keycloak API** credential:

| Field | Notes |
|---|---|
| **Keycloak Base URL** | e.g. `https://keycloak.example.com`, without a trailing slash. `http://localhost:8080` is the default for a local development server. |
| **Realm** | The realm to authenticate against, e.g. `master` or your own realm. |
| **Username** / **Password** | A realm user with permission to administer it. |
| **Client ID** | `admin-cli` unless your realm requires a dedicated client. |
| **Client Secret** | Optional. Used only by **Token → Mint Client Credentials** when that operation's own client-secret field is empty. Never sent on admin calls. |
| **SSL Certificate Options** | Enable **Ignore SSL Issues** only for a self-signed development server. |

The credential test obtains a real admin token with the password grant and reads the realm, so it
fails for a reachable server whose credentials or realm are wrong.

## Operations

### User (10)

Create · Get · List · Update · Delete · Reset Password · Send Verify Email · Get Groups ·
Add to Group · Remove from Group

### Client (7)

Create · Get · List · Update · Delete · Get Secret · Regenerate Secret

### Token (2)

Mint Password Grant · Mint Client Credentials — the latter can refuse a token that carries no
`tenant_id` claim, which turns a silently mis-tenanted service account into a loud failure at mint
time.

## Examples

**Create a user**

```
Resource: User
Operation: Create
Username: john.doe
Email: john.doe@example.com
Enabled: true
```

**Create a client**

```
Resource: Client
Operation: Create
Client ID: my-app
Root URL: https://app.example.com
Additional Fields:
  - Public Client: false
  - Standard Flow Enabled: true
  - Redirect URIs: https://app.example.com/callback
```

**Regenerate a client secret**

```
Resource: Client
Operation: Regenerate Secret
Client ID: <client-uuid>
```

## Development

```bash
npm install
npm run build     # tsc + icon copy
npm run lint
npm test
npm run dev       # tsc --watch
```

`npm run build` emits `dist/`, which is what the `n8n` block in `package.json` points at.

## Troubleshooting

- **Authentication failed** — check the base URL, realm and credentials; confirm the user has the
  realm-management roles it needs.
- **Resource not found** — user and client identifiers are UUIDs, not usernames or `clientId`
  values.
- **Cannot connect** — the node must be able to reach the base URL from where n8n runs. A container
  cannot reach the host's `localhost`.

## API coverage

19 operations over the Keycloak Admin REST API and the OIDC token endpoint. The full specification
this node is validated against is vendored as
[`keycloak-admin-api-openapi.json`](./keycloak-admin-api-openapi.json), and
`node validate_openapi_compliance.js` checks the implemented endpoints against it.

## Links

- [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/index.html)
- [Keycloak documentation](https://www.keycloak.org/documentation)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## Security

Report vulnerabilities privately through the repository's Security tab — see
[`SECURITY.md`](SECURITY.md). Do not open a public issue for a security problem.

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
development commands and the commit conventions. Commits carry DCO sign-off.

## License

[Apache-2.0](./LICENSE)
