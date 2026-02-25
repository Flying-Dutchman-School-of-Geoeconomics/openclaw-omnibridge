import { createPublicKey, verify } from "node:crypto";

const toPemFromRawPublicKey = (publicKeyHex: string): string => {
  const derPrefix = "302a300506032b6570032100";
  const derHex = `${derPrefix}${publicKeyHex}`;
  const derBuffer = Buffer.from(derHex, "hex");

  const b64 = derBuffer.toString("base64");
  const chunked = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN PUBLIC KEY-----\n${chunked}\n-----END PUBLIC KEY-----`;
};

export const verifyEd25519 = (publicKeyHex: string, message: string, signatureHex: string): boolean => {
  const publicKeyPem = toPemFromRawPublicKey(publicKeyHex);
  const key = createPublicKey(publicKeyPem);
  const signature = Buffer.from(signatureHex, "hex");
  return verify(null, Buffer.from(message, "utf8"), key, signature);
};
