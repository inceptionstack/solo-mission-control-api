import type { JWTPayload } from "jose";

export interface UserContext {
  sub: string;
  email: string;
  accountId: string;
  groups: string[];
}

export interface AuthAdapter {
  readonly name: string;
  validateToken(token: string): Promise<JWTPayload>;
  extractUser(payload: JWTPayload): UserContext;
}
