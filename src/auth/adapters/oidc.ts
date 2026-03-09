import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { config } from "../../config.js";
import type { AuthAdapter, UserContext } from "../types.js";

export class OidcAdapter implements AuthAdapter {
  readonly name = "oidc";
  private jwks;

  constructor() {
    const jwksUri =
      config.jwksUri ||
      `${config.jwtIssuer}/.well-known/jwks.json`;
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async validateToken(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: config.jwtIssuer || undefined,
      audience: config.jwtAudience || undefined,
    });
    return payload;
  }

  extractUser(payload: JWTPayload): UserContext {
    const sub = String(payload[config.claimMap.sub] ?? "");
    const email = String(payload[config.claimMap.email] ?? "");
    const accountId = String(payload[config.claimMap.accountId] ?? "");

    let groups: string[] = [];
    const rawGroups = payload[config.claimMap.groups];
    if (Array.isArray(rawGroups)) {
      groups = rawGroups.map(String);
    } else if (typeof rawGroups === "string") {
      try {
        const parsed = JSON.parse(rawGroups);
        groups = Array.isArray(parsed) ? parsed.map(String) : [rawGroups];
      } catch {
        groups = rawGroups
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean);
      }
    }

    return { sub, email, accountId, groups };
  }
}
