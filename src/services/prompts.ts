import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { UserContext } from "../auth/types.js";
import { isAdmin } from "../auth/middleware.js";
import { config } from "../config.js";

const client = new DynamoDBClient({ region: config.awsRegion });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = config.promptsTable;
const CATEGORY_INDEX = "category-updatedAt-index";

export interface PromptRecord {
  promptId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  template: string;
  variables: { name: string; type: "text" | "select"; options?: string[]; default?: string }[];
  icon: string;
  scope: "base" | "account" | "shared";
  accountId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PromptCreateInput {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  template: string;
  variables?: { name: string; type: "text" | "select"; options?: string[]; default?: string }[];
  icon?: string;
  scope?: "base" | "account" | "shared";
  accountId?: string;
}

function generateId(): string {
  const ts = Date.now().toString(36).padStart(9, "0");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${ts}${rand}`;
}

function canViewPrompt(user: UserContext, prompt: PromptRecord, targetAccountId?: string): boolean {
  if (prompt.scope === "base" || prompt.scope === "shared") return true;
  if (prompt.scope === "account") {
    if (isAdmin(user)) return true;
    return prompt.accountId === targetAccountId;
  }
  return false;
}

function canEditPrompt(user: UserContext, prompt: PromptRecord): boolean {
  if (prompt.scope === "base") return isAdmin(user);
  if (prompt.scope === "shared") return isAdmin(user) || prompt.createdBy === user.sub;
  if (prompt.scope === "account") return isAdmin(user) || prompt.createdBy === user.sub;
  return false;
}

export async function handleListPrompts(
  user: UserContext,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string
): Promise<PromptRecord[]> {
  const { category, scope, tags } = queryParams;

  let items: PromptRecord[];

  if (category) {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: CATEGORY_INDEX,
        KeyConditionExpression: "category = :cat",
        ExpressionAttributeValues: { ":cat": category },
        ScanIndexForward: false,
      })
    );
    items = (result.Items || []) as PromptRecord[];
  } else if (scope === "base") {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "scope = :s",
        ExpressionAttributeValues: { ":s": "base" },
      })
    );
    items = (result.Items || []) as PromptRecord[];
  } else {
    const result = await docClient.send(
      new ScanCommand({ TableName: TABLE_NAME })
    );
    items = (result.Items || []) as PromptRecord[];
  }

  items = items.filter((p) => canViewPrompt(user, p, targetAccountId));

  if (!isAdmin(user) && targetAccountId) {
    items = items.filter((p) =>
      p.scope === "base" || p.scope === "shared" || p.accountId === targetAccountId
    );
  }

  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim().toLowerCase());
    items = items.filter((p) =>
      tagList.some((t) => p.tags.map((pt) => pt.toLowerCase()).includes(t))
    );
  }

  return items;
}

export async function handleGetPrompt(
  user: UserContext,
  promptId: string,
  targetAccountId?: string
): Promise<PromptRecord> {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { promptId } })
  );
  if (!result.Item) throw new Error("NOT_FOUND: Prompt not found");
  const prompt = result.Item as PromptRecord;
  if (!canViewPrompt(user, prompt, targetAccountId)) {
    throw new Error("FORBIDDEN: You do not have access to this prompt");
  }
  return prompt;
}

export async function handleCreatePrompt(
  user: UserContext,
  input: PromptCreateInput,
  targetAccountId?: string
): Promise<PromptRecord> {
  if (!input.title || !input.template) {
    throw new Error("BAD_REQUEST: title and template are required");
  }

  const scope = input.scope || "account";

  if (scope === "base" && !isAdmin(user)) {
    throw new Error("FORBIDDEN: Only admins can create base prompts");
  }

  const now = new Date().toISOString();
  const prompt: PromptRecord = {
    promptId: generateId(),
    title: input.title,
    description: input.description || "",
    category: input.category || "three-tier",
    tags: input.tags || [],
    template: input.template,
    variables: input.variables || [],
    icon: input.icon || "",
    scope,
    accountId: scope === "account" ? (input.accountId || targetAccountId || "") : undefined,
    createdBy: user.sub,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: prompt }));
  return prompt;
}

export async function handleUpdatePrompt(
  user: UserContext,
  promptId: string,
  input: Partial<PromptCreateInput>,
  targetAccountId?: string
): Promise<PromptRecord> {
  const existing = await handleGetPrompt(user, promptId, targetAccountId);
  if (!canEditPrompt(user, existing)) {
    throw new Error("FORBIDDEN: You do not have permission to edit this prompt");
  }

  const now = new Date().toISOString();
  const updated: PromptRecord = {
    ...existing,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    tags: input.tags ?? existing.tags,
    template: input.template ?? existing.template,
    variables: input.variables ?? existing.variables,
    icon: input.icon ?? existing.icon,
    scope: input.scope ?? existing.scope,
    accountId: input.accountId ?? existing.accountId,
    updatedAt: now,
  };

  if (updated.scope === "base" && !isAdmin(user)) {
    throw new Error("FORBIDDEN: Only admins can manage base prompts");
  }

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
  return updated;
}

export async function handleDeletePrompt(
  user: UserContext,
  promptId: string,
  targetAccountId?: string
): Promise<void> {
  const existing = await handleGetPrompt(user, promptId, targetAccountId);
  if (!canEditPrompt(user, existing)) {
    throw new Error("FORBIDDEN: You do not have permission to delete this prompt");
  }
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { promptId } }));
}

export async function handleForkPrompt(
  user: UserContext,
  promptId: string,
  targetAccountId?: string
): Promise<PromptRecord> {
  const source = await handleGetPrompt(user, promptId, targetAccountId);
  const now = new Date().toISOString();
  const forked: PromptRecord = {
    promptId: generateId(),
    title: `${source.title} (fork)`,
    description: source.description,
    category: source.category,
    tags: [...source.tags],
    template: source.template,
    variables: [...source.variables],
    icon: source.icon,
    scope: "account",
    accountId: targetAccountId || "",
    createdBy: user.sub,
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: forked }));
  return forked;
}
