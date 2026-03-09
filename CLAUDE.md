# Solo API

Cloud-agnostic Express.js backend for the Solo Mission Control dashboard.

## Build & Run

```bash
npm install
npm run build    # TypeScript compile
npm start        # Production (dist/server.js)
npm run dev      # Dev with hot reload (tsx)
```

## Project Structure

- `src/config.ts` — All configuration via environment variables
- `src/auth/` — JWT auth middleware with pluggable adapters (cognito, oidc)
- `src/services/` — Business logic ported from Lambda handlers
- `src/routes/` — Express route definitions
- `src/app.ts` — Express app setup (middleware, routes, error handling)
- `src/server.ts` — HTTP server with graceful shutdown

## Auth

Set `AUTH_PROVIDER=cognito|oidc` and configure `JWT_ISSUER`, `JWT_AUDIENCE`, `JWKS_URI`.
Custom claims are mapped via `CLAIM_MAP_*` env vars.

## Docker

```bash
docker compose up --build
```

## Key Conventions

- No hardcoded AWS account IDs or secrets
- All config via env vars (see .env.example)
- Error prefixes: `NOT_FOUND:`, `FORBIDDEN:`, `BAD_REQUEST:` for HTTP status mapping
- TypeScript strict mode, ESM modules
