import {
  CloudFormationClient,
  ListStacksCommand,
  DescribeStacksCommand,
  DetectStackDriftCommand,
  type StackSummary,
  type StackStatus,
} from "@aws-sdk/client-cloudformation";
import type { UserContext } from "../auth/types.js";
import { config } from "../config.js";
import { getCrossAccountCredentials, isManagementAccount } from "./aws-clients.js";

const ACTIVE_STATUSES: StackStatus[] = [
  "CREATE_COMPLETE", "CREATE_IN_PROGRESS", "CREATE_FAILED",
  "UPDATE_COMPLETE", "UPDATE_IN_PROGRESS",
  "UPDATE_ROLLBACK_COMPLETE", "UPDATE_ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_FAILED", "UPDATE_FAILED",
  "ROLLBACK_COMPLETE", "ROLLBACK_IN_PROGRESS", "ROLLBACK_FAILED",
  "DELETE_IN_PROGRESS", "DELETE_FAILED",
  "IMPORT_COMPLETE", "IMPORT_IN_PROGRESS",
  "IMPORT_ROLLBACK_COMPLETE", "IMPORT_ROLLBACK_IN_PROGRESS", "IMPORT_ROLLBACK_FAILED",
];

async function getCfnClient(accountId: string): Promise<CloudFormationClient> {
  if (!accountId || isManagementAccount(accountId)) {
    return new CloudFormationClient({ region: config.awsRegion });
  }
  const credentials = await getCrossAccountCredentials(accountId, "cfn");
  return new CloudFormationClient({ region: config.awsRegion, credentials });
}

function classifyStatus(status: string): "success" | "failed" | "in_progress" | "warning" {
  if (status.endsWith("_COMPLETE") && !status.includes("ROLLBACK") && !status.includes("FAILED")) return "success";
  if (status.includes("FAILED") || status === "ROLLBACK_COMPLETE") return "failed";
  if (status.includes("IN_PROGRESS")) return "in_progress";
  return "warning";
}

function detectCreatedBy(summary: StackSummary, tags: Record<string, string>): string {
  if (tags["aws:cdk:id"] || tags["aws:cdk:path"]) return "CDK";
  if (tags["aws:sam:deployment:source"]) return "SAM";
  if (tags["CreatedBy"]) return tags["CreatedBy"];
  const desc = summary.TemplateDescription || "";
  const name = summary.StackName || "";
  if (desc.includes("CDK") || desc.includes("cdk") || name.includes("CDK") || name.includes("cdk")) return "CDK";
  if (desc.includes("AWS SAM") || name.startsWith("sam-") || name.startsWith("aws-sam-")) return "SAM";
  return "CloudFormation";
}

export interface CfnStack {
  stackName: string;
  stackId: string;
  status: string;
  statusClass: "success" | "failed" | "in_progress" | "warning";
  createdBy: string;
  description?: string;
  creationTime: string;
  lastUpdatedTime?: string;
  driftStatus?: string;
  outputCount: number;
  outputs: { key: string; value: string; description?: string }[];
  tags: Record<string, string>;
}

export async function handleListStacks(
  _user: UserContext,
  _queryParams: Record<string, string | undefined>,
  targetAccountId?: string
): Promise<CfnStack[]> {
  const cfn = await getCfnClient(targetAccountId || "");

  const summaries: StackSummary[] = [];
  let nextToken: string | undefined;
  do {
    const result = await cfn.send(new ListStacksCommand({
      StackStatusFilter: ACTIVE_STATUSES,
      NextToken: nextToken,
    }));
    summaries.push(...(result.StackSummaries || []));
    nextToken = result.NextToken;
  } while (nextToken);

  if (summaries.length === 0) return [];

  const detailed: CfnStack[] = [];
  const batches: string[][] = [];
  const names = summaries.map((s) => s.StackName!);
  for (let i = 0; i < names.length; i += 10) batches.push(names.slice(i, i + 10));

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (name) => {
        try {
          const desc = await cfn.send(new DescribeStacksCommand({ StackName: name }));
          const stack = desc.Stacks?.[0];
          if (!stack) return null;

          const summary = summaries.find((s) => s.StackName === name);
          const tags: Record<string, string> = {};
          (stack.Tags || []).forEach((t) => { if (t.Key && t.Value) tags[t.Key] = t.Value; });

          return {
            stackName: stack.StackName!,
            stackId: stack.StackId!,
            status: stack.StackStatus!,
            statusClass: classifyStatus(stack.StackStatus!),
            createdBy: detectCreatedBy(summary || {} as StackSummary, tags),
            description: stack.Description || summary?.TemplateDescription || undefined,
            creationTime: stack.CreationTime!.toISOString(),
            lastUpdatedTime: stack.LastUpdatedTime?.toISOString() || undefined,
            driftStatus: stack.DriftInformation?.StackDriftStatus || undefined,
            outputCount: (stack.Outputs || []).length,
            outputs: (stack.Outputs || []).map((o) => ({
              key: o.OutputKey || "",
              value: o.OutputValue || "",
              description: o.Description || undefined,
            })),
            tags,
          } satisfies CfnStack;
        } catch {
          const summary = summaries.find((s) => s.StackName === name)!;
          return {
            stackName: name,
            stackId: summary.StackId || "",
            status: summary.StackStatus || "UNKNOWN",
            statusClass: classifyStatus(summary.StackStatus || ""),
            createdBy: "CloudFormation",
            creationTime: summary.CreationTime?.toISOString() || "",
            driftStatus: undefined,
            outputCount: 0,
            outputs: [],
            tags: {},
          } satisfies CfnStack;
        }
      })
    );
    detailed.push(...(results.filter(Boolean) as CfnStack[]));
  }

  detailed.sort((a, b) => {
    if (a.statusClass === "in_progress" && b.statusClass !== "in_progress") return -1;
    if (b.statusClass === "in_progress" && a.statusClass !== "in_progress") return 1;
    const aTime = a.lastUpdatedTime || a.creationTime;
    const bTime = b.lastUpdatedTime || b.creationTime;
    return bTime.localeCompare(aTime);
  });

  return detailed;
}

export async function handleGetStack(
  _user: UserContext,
  stackName: string,
  _queryParams: Record<string, string | undefined>,
  targetAccountId?: string
): Promise<CfnStack> {
  const cfn = await getCfnClient(targetAccountId || "");
  const desc = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = desc.Stacks?.[0];
  if (!stack) throw new Error(`NOT_FOUND: Stack ${stackName} not found`);

  const tags: Record<string, string> = {};
  (stack.Tags || []).forEach((t) => { if (t.Key && t.Value) tags[t.Key] = t.Value; });

  let createdBy = "CloudFormation";
  if (tags["aws:cdk:id"] || tags["aws:cdk:path"]) createdBy = "CDK";
  if (tags["aws:sam:deployment:source"]) createdBy = "SAM";
  if (tags["CreatedBy"]) createdBy = tags["CreatedBy"];
  const d = stack.Description || "";
  if (d.includes("CDK") || d.includes("cdk")) createdBy = "CDK";
  if (d.includes("AWS SAM")) createdBy = "SAM";

  return {
    stackName: stack.StackName!, stackId: stack.StackId!, status: stack.StackStatus!,
    statusClass: classifyStatus(stack.StackStatus!), createdBy,
    description: stack.Description || undefined,
    creationTime: stack.CreationTime!.toISOString(),
    lastUpdatedTime: stack.LastUpdatedTime?.toISOString() || undefined,
    driftStatus: stack.DriftInformation?.StackDriftStatus || undefined,
    outputCount: (stack.Outputs || []).length,
    outputs: (stack.Outputs || []).map((o) => ({ key: o.OutputKey || "", value: o.OutputValue || "", description: o.Description || undefined })),
    tags,
  };
}

export async function handleDetectDrift(
  _user: UserContext,
  stackName: string,
  _queryParams: Record<string, string | undefined>,
  targetAccountId?: string
): Promise<{ detectionId: string; status: string }> {
  const cfn = await getCfnClient(targetAccountId || "");
  const result = await cfn.send(new DetectStackDriftCommand({ StackName: stackName }));
  return { detectionId: result.StackDriftDetectionId || "", status: "DETECTION_IN_PROGRESS" };
}
