import { OrganizationsClient, ListAccountsForParentCommand } from "@aws-sdk/client-organizations";
import { isAdmin } from "../auth/middleware.js";
import type { UserContext } from "../auth/types.js";
import { config } from "../config.js";

const orgs = new OrganizationsClient({ region: config.awsRegion });

let cachedAccounts: { id: string; name: string; email: string }[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function handleListAccounts(user: UserContext) {
  if (!isAdmin(user)) {
    throw new Error("FORBIDDEN: Admin access required");
  }

  if (cachedAccounts && Date.now() - cacheTime < CACHE_TTL) {
    return cachedAccounts;
  }

  if (!config.sandboxOuId) {
    return [];
  }

  const accounts: { id: string; name: string; email: string }[] = [];
  let nextToken: string | undefined;

  do {
    const resp = await orgs.send(new ListAccountsForParentCommand({
      ParentId: config.sandboxOuId,
      NextToken: nextToken,
    }));
    for (const acc of resp.Accounts || []) {
      if (acc.Status === "ACTIVE" && acc.Id) {
        accounts.push({
          id: acc.Id,
          name: acc.Name || acc.Id,
          email: acc.Email || "",
        });
      }
    }
    nextToken = resp.NextToken;
  } while (nextToken);

  if (config.managementAccountId) {
    accounts.push({ id: config.managementAccountId, name: "Management Account", email: "" });
  }

  accounts.sort((a, b) => {
    if (a.id === config.managementAccountId) return 1;
    return a.name.localeCompare(b.name);
  });

  cachedAccounts = accounts;
  cacheTime = Date.now();
  return accounts;
}
