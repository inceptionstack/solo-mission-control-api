import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
  type GroupDefinition,
} from "@aws-sdk/client-cost-explorer";
import type { UserContext } from "../auth/types.js";
import { config } from "../config.js";

const ceClient = new CostExplorerClient({ region: config.awsRegion });

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function startOfMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function endOfMonthStr(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return end.toISOString().split("T")[0];
}

function accountFilter(accountId: string) {
  return {
    Dimensions: {
      Key: "LINKED_ACCOUNT" as const,
      Values: [accountId],
    },
  };
}

export async function handleGetCostSummary(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string,
) {
  const accountId = targetAccountId || "";
  const today = todayStr();
  const tomorrow = tomorrowStr();
  const monthStart = startOfMonthStr();
  const monthEnd = endOfMonthStr();

  const [todayResult, mtdResult] = await Promise.all([
    ceClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: today, End: tomorrow },
        Granularity: "DAILY",
        Metrics: ["UnblendedCost"],
        Filter: accountFilter(accountId),
      })
    ),
    ceClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: monthStart, End: tomorrow },
        Granularity: "MONTHLY",
        Metrics: ["UnblendedCost"],
        Filter: accountFilter(accountId),
      })
    ),
  ]);

  const todayCost = parseFloat(
    todayResult.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || "0"
  );

  const mtdCost = parseFloat(
    mtdResult.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || "0"
  );

  let forecast = 0;
  try {
    const forecastResult = await ceClient.send(
      new GetCostForecastCommand({
        TimePeriod: { Start: tomorrow, End: monthEnd },
        Metric: "UNBLENDED_COST",
        Granularity: "MONTHLY",
        Filter: accountFilter(accountId),
      })
    );
    const forecastAmount = parseFloat(forecastResult.Total?.Amount || "0");
    forecast = mtdCost + forecastAmount;
  } catch {
    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate();
    const dayOfMonth = new Date().getDate();
    forecast = dayOfMonth > 0 ? (mtdCost / dayOfMonth) * daysInMonth : 0;
  }

  return {
    today: todayCost,
    monthToDate: mtdCost,
    forecast,
    budgetLimit: config.budgetLimit,
    currency: "USD",
  };
}

export async function handleGetCostsByService(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string,
) {
  const accountId = targetAccountId || "";
  const monthStart = startOfMonthStr();
  const tomorrow = tomorrowStr();

  const result = await ceClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: monthStart, End: tomorrow },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" } as GroupDefinition],
      Filter: accountFilter(accountId),
    })
  );

  const groups = result.ResultsByTime?.[0]?.Groups || [];

  const serviceCosts = groups
    .map((group) => ({
      service: group.Keys?.[0] || "Unknown",
      cost: parseFloat(group.Metrics?.UnblendedCost?.Amount || "0"),
    }))
    .filter((s) => s.cost > 0.001)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const total = serviceCosts.reduce((sum, s) => sum + s.cost, 0);

  return serviceCosts.map((s) => ({
    service: s.service,
    cost: s.cost,
    percentage: total > 0 ? (s.cost / total) * 100 : 0,
  }));
}

export async function handleGetDailyCosts(
  _user: UserContext,
  queryParams: Record<string, string | undefined>,
  targetAccountId?: string,
) {
  const accountId = targetAccountId || "";
  const startDate = daysAgoStr(30);
  const tomorrow = tomorrowStr();

  const result = await ceClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: startDate, End: tomorrow },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
      Filter: accountFilter(accountId),
    })
  );

  return (result.ResultsByTime || []).map((period) => ({
    date: period.TimePeriod?.Start || "",
    cost: parseFloat(period.Total?.UnblendedCost?.Amount || "0"),
  }));
}
