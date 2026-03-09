import {
  CodePipelineClient,
  ListPipelinesCommand,
  GetPipelineStateCommand,
  ListPipelineExecutionsCommand,
} from "@aws-sdk/client-codepipeline";
import {
  CodeCommitClient,
  ListRepositoriesCommand,
  GetRepositoryCommand,
  GetBranchCommand,
  GetCommitCommand,
  GetFolderCommand,
} from "@aws-sdk/client-codecommit";
import type { UserContext } from "../auth/types.js";
import { config } from "../config.js";
import { getCrossAccountCredentials, isManagementAccount } from "./aws-clients.js";

async function getClients(accountId: string) {
  if (!accountId || isManagementAccount(accountId)) {
    return {
      cp: new CodePipelineClient({ region: config.awsRegion }),
      cc: new CodeCommitClient({ region: config.awsRegion }),
    };
  }
  const credentials = await getCrossAccountCredentials(accountId, "pipes");
  return {
    cp: new CodePipelineClient({ region: config.awsRegion, credentials }),
    cc: new CodeCommitClient({ region: config.awsRegion, credentials }),
  };
}

export async function handleListPipelines(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string
) {
  const { cp } = await getClients(targetAccountId || "");

  const listResult = await cp.send(new ListPipelinesCommand({}));
  const pipelineNames = (listResult.pipelines || []).map((p) => p.name!);

  if (pipelineNames.length === 0) return [];

  const pipelines = await Promise.all(
    pipelineNames.map(async (name) => {
      try {
        const [stateResult, execResult] = await Promise.all([
          cp.send(new GetPipelineStateCommand({ name })),
          cp.send(new ListPipelineExecutionsCommand({ pipelineName: name, maxResults: 1 })),
        ]);

        const stages = (stateResult.stageStates || []).map((stage) => ({
          name: stage.stageName || "Unknown",
          status: (stage.latestExecution?.status as string) || "Unknown",
          actions: (stage.actionStates || []).map((action) => ({
            name: action.actionName || "Unknown",
            status: (action.latestExecution?.status as string) || "Unknown",
            lastStatusChange: action.latestExecution?.lastStatusChange?.toISOString() || undefined,
          })),
        }));

        let status: "Succeeded" | "Failed" | "InProgress" | "Stopped" = "Succeeded";
        if (stages.some((s) => s.status === "Failed")) status = "Failed";
        else if (stages.some((s) => s.status === "InProgress")) status = "InProgress";
        else if (stages.some((s) => s.status === "Stopped")) status = "Stopped";

        const latestExec = execResult.pipelineExecutionSummaries?.[0];
        const lastExecution = latestExec
          ? { time: latestExec.startTime?.toISOString() || "", commitMessage: latestExec.sourceRevisions?.[0]?.revisionSummary || undefined }
          : undefined;

        return { name, status, lastExecution, stages };
      } catch {
        return { name, status: "Unknown" as const, stages: [] };
      }
    })
  );

  return pipelines;
}

export async function handleGetPipeline(
  _user: UserContext,
  pipelineName: string,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string
) {
  const { cp } = await getClients(targetAccountId || "");

  const [stateResult, execResult] = await Promise.all([
    cp.send(new GetPipelineStateCommand({ name: pipelineName })),
    cp.send(new ListPipelineExecutionsCommand({ pipelineName, maxResults: 5 })),
  ]);

  const stages = (stateResult.stageStates || []).map((stage) => ({
    name: stage.stageName || "Unknown",
    status: (stage.latestExecution?.status as string) || "Unknown",
    actions: (stage.actionStates || []).map((action) => ({
      name: action.actionName || "Unknown",
      status: (action.latestExecution?.status as string) || "Unknown",
      lastStatusChange: action.latestExecution?.lastStatusChange?.toISOString() || undefined,
    })),
  }));

  let status: "Succeeded" | "Failed" | "InProgress" | "Stopped" = "Succeeded";
  if (stages.some((s) => s.status === "Failed")) status = "Failed";
  else if (stages.some((s) => s.status === "InProgress")) status = "InProgress";
  else if (stages.some((s) => s.status === "Stopped")) status = "Stopped";

  const latestExec = execResult.pipelineExecutionSummaries?.[0];
  const lastExecution = latestExec
    ? { time: latestExec.startTime?.toISOString() || "", commitMessage: latestExec.sourceRevisions?.[0]?.revisionSummary || undefined }
    : undefined;

  return { name: pipelineName, status, lastExecution, stages };
}

export async function handleListRepos(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string
) {
  const { cc } = await getClients(targetAccountId || "");

  const listResult = await cc.send(new ListRepositoriesCommand({}));
  const repoNames = (listResult.repositories || []).map((r) => r.repositoryName!);

  if (repoNames.length === 0) return [];

  const repos = await Promise.all(
    repoNames.map(async (name) => {
      try {
        const repoResult = await cc.send(new GetRepositoryCommand({ repositoryName: name }));
        const repo = repoResult.repositoryMetadata!;
        const defaultBranch = repo.defaultBranch || "main";

        let lastCommit: { message: string; author: string; date: string } | undefined;
        try {
          const branchResult = await cc.send(new GetBranchCommand({ repositoryName: name, branchName: defaultBranch }));
          const commitId = branchResult.branch?.commitId;
          if (commitId) {
            const commitResult = await cc.send(new GetCommitCommand({ repositoryName: name, commitId }));
            const commit = commitResult.commit!;
            lastCommit = {
              message: commit.message || "",
              author: commit.author?.name || commit.author?.email || "Unknown",
              date: commit.author?.date ? new Date(commit.author.date).toISOString() : "",
            };
          }
        } catch { /* branch may not exist */ }

        return { name, description: repo.repositoryDescription || undefined, defaultBranch, lastCommit, cloneUrlHttp: repo.cloneUrlHttp || "" };
      } catch {
        return { name, defaultBranch: "main", cloneUrlHttp: "" };
      }
    })
  );

  return repos;
}

export async function handleGetRepoFiles(
  _user: UserContext,
  repoName: string,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string
) {
  const { cc } = await getClients(targetAccountId || "");
  const folderPath = queryParams.path || "/";

  const repoResult = await cc.send(new GetRepositoryCommand({ repositoryName: repoName }));
  const defaultBranch = repoResult.repositoryMetadata?.defaultBranch || "main";

  const branchResult = await cc.send(new GetBranchCommand({ repositoryName: repoName, branchName: defaultBranch }));
  const commitSpecifier = branchResult.branch?.commitId || defaultBranch;

  const folderResult = await cc.send(new GetFolderCommand({ repositoryName: repoName, commitSpecifier, folderPath }));

  const files: { name: string; path: string; type: "file" | "directory"; size?: number }[] = [];
  for (const subFolder of folderResult.subFolders || []) {
    files.push({ name: subFolder.relativePath || "", path: subFolder.absolutePath || "", type: "directory" });
  }
  for (const file of folderResult.files || []) {
    files.push({ name: file.relativePath || "", path: file.absolutePath || "", type: "file" });
  }
  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return files;
}
