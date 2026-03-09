import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { config } from "../config.js";

const stsClient = new STSClient({ region: config.awsRegion });

export { stsClient };

export async function getCrossAccountCredentials(accountId: string, sessionLabel: string) {
  const roleArn = `arn:aws:iam::${accountId}:role/${config.crossAccountRole}`;
  const result = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `solo-mc-${sessionLabel}-${accountId}-${Date.now()}`,
      DurationSeconds: 900,
    })
  );
  if (!result.Credentials) throw new Error(`Failed to assume role in account ${accountId}`);
  return {
    accessKeyId: result.Credentials.AccessKeyId!,
    secretAccessKey: result.Credentials.SecretAccessKey!,
    sessionToken: result.Credentials.SessionToken!,
  };
}

export function isManagementAccount(accountId: string): boolean {
  return !accountId || accountId === config.managementAccountId;
}
