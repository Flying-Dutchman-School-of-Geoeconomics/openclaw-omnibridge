import { createHmac } from "node:crypto";
import { safeEqualHex } from "./timing-safe.js";

export const hmacSha256Hex = (secret: string, payload: string): string =>
  createHmac("sha256", secret).update(payload).digest("hex");

export const verifyHmacSha256Hex = (secret: string, payload: string, providedHex: string): boolean => {
  const expected = hmacSha256Hex(secret, payload);
  return safeEqualHex(expected, providedHex.toLowerCase());
};
