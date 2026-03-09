import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import type { UserContext } from "../auth/types.js";
import { config } from "../config.js";
import { getCrossAccountCredentials, isManagementAccount, stsClient } from "./aws-clients.js";

async function getEC2Client(accountId: string): Promise<EC2Client> {
  if (isManagementAccount(accountId)) {
    return new EC2Client({ region: config.awsRegion });
  }
  const credentials = await getCrossAccountCredentials(accountId, "connect");
  return new EC2Client({ region: config.awsRegion, credentials });
}

export async function handleGetConnectionDetails(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string
) {
  const accountId = targetAccountId || "";
  if (!accountId) {
    return { accountId: "", region: config.awsRegion, instanceId: "", instanceState: "unknown", privateIp: "", soloConsoleUrl: "" };
  }

  const ec2 = await getEC2Client(accountId);
  const descResult = await ec2.send(new DescribeInstancesCommand({}));
  const instances = (descResult.Reservations || []).flatMap((r) => r.Instances || []);
  const instance = instances.find((i) => i.State?.Name === "running") || instances.find((i) => i.State?.Name !== "terminated");

  return {
    accountId,
    region: config.awsRegion,
    instanceId: instance?.InstanceId || "",
    instanceState: instance?.State?.Name || "none",
    privateIp: instance?.PrivateIpAddress || "",
    publicIp: instance?.PublicIpAddress || undefined,
    soloConsoleUrl: config.soloConsoleDomain ? `https://${config.soloConsoleDomain}/env/${accountId}` : "",
  };
}

export async function handleGenerateAccessKeys(
  user: UserContext,
  targetAccountId?: string
) {
  const accountId = targetAccountId || "";
  if (!accountId) {
    throw new Error("BAD_REQUEST: No account selected");
  }

  const roleArn = accountId === config.managementAccountId
    ? `arn:aws:iam::${accountId}:role/OrganizationAccountAccessRole`
    : `arn:aws:iam::${accountId}:role/${config.crossAccountRole}`;

  const result = await stsClient.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `solo-mc-keys-${user.email.split("@")[0]}-${Date.now()}`,
    DurationSeconds: 3600,
  }));

  if (!result.Credentials) {
    throw new Error("Failed to generate credentials");
  }

  const profileName = `sandbox-${accountId}`;

  return {
    accessKeyId: result.Credentials.AccessKeyId!,
    secretAccessKey: result.Credentials.SecretAccessKey!,
    sessionToken: result.Credentials.SessionToken!,
    expiration: result.Credentials.Expiration?.toISOString() || "",
    profileName,
  };
}
