import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { config } from "../../config.js";
import type { AuthAdapter, UserContext } from "../types.js";

export class CognitoAdapter implements AuthAdapter {
  readonly name = "cognito";
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
      const cleaned = rawGroups.replace(/^\[|\]$/g, "");
      groups = cleaned
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);
    }

    return { sub, email, accountId, groups };
  }
}
