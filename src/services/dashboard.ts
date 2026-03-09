import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeNatGatewaysCommand,
  DescribeInternetGatewaysCommand,
} from "@aws-sdk/client-ec2";
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import type { UserContext } from "../auth/types.js";
import { config } from "../config.js";
import { getCrossAccountCredentials, isManagementAccount } from "./aws-clients.js";

async function getEC2Client(accountId: string): Promise<EC2Client> {
  if (isManagementAccount(accountId)) {
    return new EC2Client({ region: config.awsRegion });
  }
  const credentials = await getCrossAccountCredentials(accountId, "dash");
  return new EC2Client({ region: config.awsRegion, credentials });
}

async function getCloudWatchClient(accountId: string): Promise<CloudWatchClient> {
  if (isManagementAccount(accountId)) {
    return new CloudWatchClient({ region: config.awsRegion });
  }
  const credentials = await getCrossAccountCredentials(accountId, "cw");
  return new CloudWatchClient({ region: config.awsRegion, credentials });
}

async function getSSMClient(accountId: string): Promise<SSMClient> {
  if (isManagementAccount(accountId)) {
    return new SSMClient({ region: config.awsRegion });
  }
  const credentials = await getCrossAccountCredentials(accountId, "ssm");
  return new SSMClient({ region: config.awsRegion, credentials });
}

function formatUptime(launchTime: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - launchTime.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  if (days > 0) return `${days}d ${remainHours}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(diffMs / (1000 * 60))}m`;
}

export async function handleGetInstance(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  accountId?: string
) {
  const targetAccount = accountId || "";
  if (!targetAccount) {
    return {
      instanceId: "", state: "unknown", instanceType: "", privateIp: "",
      launchTime: "", uptime: "\u2014", cpu: [], networkIn: [], networkOut: [],
      _noAccount: true,
    };
  }

  const ec2 = await getEC2Client(targetAccount);
  const cw = await getCloudWatchClient(targetAccount);

  const descResult = await ec2.send(new DescribeInstancesCommand({}));
  const instances = (descResult.Reservations || []).flatMap((r) => r.Instances || []);
  const instance = instances.find((i) => i.State?.Name !== "terminated") || instances[0];

  if (!instance) {
    return {
      instanceId: "", state: "none", instanceType: "", privateIp: "",
      launchTime: "", uptime: "\u2014", cpu: [], networkIn: [], networkOut: [],
      _message: "No EC2 instances in this account",
    };
  }

  const instanceId = instance.InstanceId!;
  const launchTime = instance.LaunchTime ? new Date(instance.LaunchTime) : new Date();

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);

  const metricsResult = await cw.send(
    new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        { Id: "cpu", MetricStat: { Metric: { Namespace: "AWS/EC2", MetricName: "CPUUtilization", Dimensions: [{ Name: "InstanceId", Value: instanceId }] }, Period: 300, Stat: "Average" } },
        { Id: "netIn", MetricStat: { Metric: { Namespace: "AWS/EC2", MetricName: "NetworkIn", Dimensions: [{ Name: "InstanceId", Value: instanceId }] }, Period: 300, Stat: "Sum" } },
        { Id: "netOut", MetricStat: { Metric: { Namespace: "AWS/EC2", MetricName: "NetworkOut", Dimensions: [{ Name: "InstanceId", Value: instanceId }] }, Period: 300, Stat: "Sum" } },
      ],
    })
  );

  function parseMetric(id: string) {
    const m = metricsResult.MetricDataResults?.find((r) => r.Id === id);
    if (!m?.Timestamps || !m.Values) return [];
    return m.Timestamps.map((ts, i) => ({ timestamp: ts.toISOString(), value: m.Values![i] }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  return {
    instanceId,
    state: instance.State?.Name || "unknown",
    instanceType: instance.InstanceType || "unknown",
    privateIp: instance.PrivateIpAddress || "",
    publicIp: instance.PublicIpAddress || undefined,
    launchTime: launchTime.toISOString(),
    uptime: formatUptime(launchTime),
    cpu: parseMetric("cpu"),
    networkIn: parseMetric("netIn"),
    networkOut: parseMetric("netOut"),
  };
}

export async function handleGetVpc(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  accountId?: string
) {
  const targetAccount = accountId || "";
  if (!targetAccount) {
    return { vpcId: "", cidrBlock: "", subnets: [], natGateways: [], internetGateway: null, _noAccount: true };
  }

  const ec2 = await getEC2Client(targetAccount);

  const vpcsResult = await ec2.send(new DescribeVpcsCommand({}));
  const vpcs = vpcsResult.Vpcs || [];
  const vpc = vpcs.find((v) => !v.IsDefault) || vpcs[0];
  if (!vpc) {
    return { vpcId: "", cidrBlock: "", subnets: [], natGateways: [], internetGateway: null, _message: "No VPCs found" };
  }

  const vpcId = vpc.VpcId!;

  const subnetsResult = await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] }));
  const subnets = (subnetsResult.Subnets || []).map((s) => ({
    subnetId: s.SubnetId!, cidrBlock: s.CidrBlock!, availabilityZone: s.AvailabilityZone!, isPublic: s.MapPublicIpOnLaunch || false,
  }));

  const natResult = await ec2.send(new DescribeNatGatewaysCommand({ Filter: [{ Name: "vpc-id", Values: [vpcId] }] }));
  const natGateways = (natResult.NatGateways || []).map((n) => ({ id: n.NatGatewayId!, state: n.State || "unknown", subnetId: n.SubnetId || "" }));

  const igwResult = await ec2.send(new DescribeInternetGatewaysCommand({ Filters: [{ Name: "attachment.vpc-id", Values: [vpcId] }] }));
  const igws = igwResult.InternetGateways || [];
  const internetGateway = igws.length > 0
    ? { id: igws[0].InternetGatewayId!, attached: igws[0].Attachments?.some((a) => String(a.State) === "available") || false }
    : null;

  return { vpcId, cidrBlock: vpc.CidrBlock || "", subnets, natGateways, internetGateway };
}

export async function handleGetAgent(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  accountId?: string
) {
  const targetAccount = accountId || "";
  if (!targetAccount) {
    return { status: "offline" as const, lastMessages: [], _noAccount: true };
  }

  const ec2 = await getEC2Client(targetAccount);
  const ssm = await getSSMClient(targetAccount);

  const descResult = await ec2.send(new DescribeInstancesCommand({}));
  const instances = (descResult.Reservations || []).flatMap((r) => r.Instances || []);
  const instance = instances.find((i) => i.State?.Name === "running");

  if (!instance) {
    return { status: "offline" as const, lastMessages: [] };
  }

  const instanceId = instance.InstanceId!;

  try {
    const cmdResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [
        "pgrep -f openclaw-gateway >/dev/null 2>&1 && echo active || systemctl is-active openclaw-gateway 2>/dev/null || echo inactive",
        "systemctl show openclaw-gateway --property=ActiveEnterTimestamp --value 2>/dev/null || echo ''",
      ]},
      TimeoutSeconds: 30,
    }));

    const commandId = cmdResult.Command?.CommandId;
    if (!commandId) return { status: "offline" as const, lastMessages: [] };

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const invocation = await ssm.send(new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId }));
    const output = invocation.StandardOutputContent || "";
    const lines = output.trim().split("\n");
    const isActive = lines[0]?.trim() === "active";
    const uptimeStr = lines[1]?.trim() || "";

    return {
      status: isActive ? ("online" as const) : ("offline" as const),
      uptime: uptimeStr || undefined,
      lastMessages: [],
    };
  } catch {
    return { status: "offline" as const, lastMessages: [] };
  }
}
