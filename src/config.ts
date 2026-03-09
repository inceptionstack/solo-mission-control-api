export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  logLevel: process.env.LOG_LEVEL || "info",

  // Auth
  authProvider: (process.env.AUTH_PROVIDER || "cognito") as "cognito" | "oidc",
  jwtIssuer: process.env.JWT_ISSUER || "",
  jwtAudience: process.env.JWT_AUDIENCE || "",
  jwksUri: process.env.JWKS_URI || "",

  // Custom claims mapping — maps JWT claim names to internal user fields
  claimMap: {
    sub: process.env.CLAIM_MAP_SUB || "sub",
    email: process.env.CLAIM_MAP_EMAIL || "email",
    groups: process.env.CLAIM_MAP_GROUPS || "cognito:groups",
    accountId: process.env.CLAIM_MAP_ACCOUNT_ID || "custom:accountId",
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || "*",

  // AWS
  awsRegion: process.env.AWS_REGION || "us-east-1",
  crossAccountRole: process.env.CROSS_ACCOUNT_ROLE || "",
  managementAccountId: process.env.MANAGEMENT_ACCOUNT_ID || "",
  sandboxOuId: process.env.SANDBOX_OU_ID || "",
  soloConsoleDomain: process.env.SOLO_CONSOLE_DOMAIN || "",

  // DynamoDB
  promptsTable: process.env.PROMPTS_TABLE || "solo-prompts",

  // Budget
  budgetLimit: parseFloat(process.env.BUDGET_LIMIT || "100"),
} as const;
