import { TokenPayload } from "@ssurak/db";

export function isAdmin(role: TokenPayload["role"]): boolean {
  return role === "admin";
}
