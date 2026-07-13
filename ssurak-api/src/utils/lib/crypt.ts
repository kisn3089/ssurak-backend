import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";

export async function encrypt(value: string): Promise<string> {
  return await bcrypt.hash(value, 10);
}

export async function comparePlainToEncrypted(
  plainText: string,
  encrypted: string
): Promise<boolean> {
  return await bcrypt.compare(plainText, encrypted);
}

export function generateSecureSessionToken(): string {
  const buffer = randomBytes(32);
  return buffer.toString("base64url");
}
