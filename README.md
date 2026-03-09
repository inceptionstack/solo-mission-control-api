# Solo API

Cloud-agnostic, Docker-ready Express.js backend for the Solo Mission Control dashboard. Ported from an AWS Lambda + API Gateway deployment to run anywhere as a standalone service.

## Features

- JWT authentication with pluggable providers (Cognito, generic OIDC)
- Dashboard stats (EC2, VPC, CloudWatch metrics, SSM agent status)
- Console bridge (connection details, temporary AWS credential generation)
- Cost Explorer integration (summary, by-service, daily trends)
- CodePipeline and CodeCommit browsing
- CloudFormation stack discovery and drift detection
- Prompt library CRUD with DynamoDB (scoped: base/account/shared)
- Organization account listing (admin)
- Cross-account AWS access via STS AssumeRole

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Development
npm run dev

# Production build
npm run build
npm start
```

## Docker

```bash
# Build and run
docker compose up --build

# Or standalone
docker build -t solo-api .
docker run -p 3000:3000 --env-file .env solo-api
```

## API Routes

All routes under `/api` require a Bearer JWT token.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (unauthenticated) |
| GET | `/api/me` | Current user info |
| GET | `/api/admin/accounts` | List org accounts (admin) |
| GET | `/api/dashboard/instance` | EC2 instance + metrics |
| GET | `/api/dashboard/vpc` | VPC details |
| GET | `/api/dashboard/agent` | Agent status via SSM |
| GET | `/api/connect/details` | Connection details |
| POST | `/api/connect/access-keys` | Generate temp AWS creds |
| GET | `/api/costs/summary` | Cost summary + forecast |
| GET | `/api/costs/by-service` | Costs by AWS service |
| GET | `/api/costs/daily` | Daily cost trend (30d) |
| GET | `/api/pipelines` | List pipelines |
| GET | `/api/pipelines/:name` | Pipeline detail |
| GET | `/api/repos` | List CodeCommit repos |
| GET | `/api/repos/:name/files` | Browse repo files |
| GET | `/api/prompts` | List prompts |
| POST | `/api/prompts` | Create prompt |
| GET | `/api/prompts/:id` | Get prompt |
| PUT | `/api/prompts/:id` | Update prompt |
| DELETE | `/api/prompts/:id` | Delete prompt |
| POST | `/api/prompts/:id/fork` | Fork prompt |
| GET | `/api/stacks` | List CloudFormation stacks |
| GET | `/api/stacks/:name` | Stack detail |
| POST | `/api/stacks/:name/drift` | Detect stack drift |

## Auth Configuration

Set `AUTH_PROVIDER` to `cognito` or `oidc`.

Custom JWT claims are mapped via environment variables:

| Env Var | Default | Description |
|---------|---------|-------------|
| `CLAIM_MAP_SUB` | `sub` | User ID claim |
| `CLAIM_MAP_EMAIL` | `email` | Email claim |
| `CLAIM_MAP_GROUPS` | `cognito:groups` | Groups/roles claim |
| `CLAIM_MAP_ACCOUNT_ID` | `custom:accountId` | Account ID claim |

## CI/CD

GitHub Actions workflow at `.github/workflows/ci.yml` builds TypeScript and pushes Docker images to GHCR on main branch pushes.
