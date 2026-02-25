import { createHash, randomUUID } from "node:crypto";
import nacl from "tweetnacl";
import { canonicalJson } from "../../core/canonical-json.js";
import { SignedStatusPayload, StatusContentType } from "./waku-types.js";

export interface UnsignedStatusPayload {
  messageId?: string;
  senderPublicKey: string;
  communityId: string;
  chatId: string;
  topic: string;
  timestampMs?: number;
  nonce?: string;
  contentType: StatusContentType;
  payload: string;
}

const stripHexPrefix = (value: string): string => value.trim().replace(/^0x/i, "").toLowerCase();

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

const fromHex = (value: string): Uint8Array => {
  const normalized = stripHexPrefix(value);
  if (normalized.length === 0 || normalized.length % 2 !== 0) {
    throw new Error("invalid hex value");
  }
  return new Uint8Array(Buffer.from(normalized, "hex"));
};

const statusSigningMessage = (payload: Omit<SignedStatusPayload, "signature">): string =>
  canonicalJson(payload);

const toSigningPayload = (payload: UnsignedStatusPayload): Omit<SignedStatusPayload, "signature"> => ({
  version: 1,
  messageId: payload.messageId ?? randomUUID(),
  senderPublicKey: stripHexPrefix(payload.senderPublicKey),
  communityId: payload.communityId,
  chatId: payload.chatId,
  topic: payload.topic,
  timestampMs: payload.timestampMs ?? Date.now(),
  nonce: payload.nonce ?? randomUUID(),
  contentType: payload.contentType,
  payload: payload.payload,
});

export const deriveStatusPublicKeyHex = (privateKeyHex: string): string => {
  const keyBytes = fromHex(privateKeyHex);

  if (keyBytes.length === 32) {
    const pair = nacl.sign.keyPair.fromSeed(keyBytes);
    return toHex(pair.publicKey);
  }

  if (keyBytes.length === 64) {
    const pair = nacl.sign.keyPair.fromSecretKey(keyBytes);
    return toHex(pair.publicKey);
  }

  throw new Error("STATUS_PRIVATE_KEY_HEX must be 32-byte seed or 64-byte secret key");
};

const signWithPrivateKeyHex = (privateKeyHex: string, message: string): string => {
  const keyBytes = fromHex(privateKeyHex);
  const messageBytes = new TextEncoder().encode(message);

  if (keyBytes.length === 64) {
    return toHex(nacl.sign.detached(messageBytes, keyBytes));
  }

  if (keyBytes.length === 32) {
    const pair = nacl.sign.keyPair.fromSeed(keyBytes);
    return toHex(nacl.sign.detached(messageBytes, pair.secretKey));
  }

  throw new Error("STATUS_PRIVATE_KEY_HEX must be 32-byte seed or 64-byte secret key");
};

export const signStatusPayload = (
  payload: UnsignedStatusPayload,
  privateKeyHex: string,
): SignedStatusPayload => {
  const signingPayload = toSigningPayload(payload);
  const signature = signWithPrivateKeyHex(privateKeyHex, statusSigningMessage(signingPayload));
  return {
    ...signingPayload,
    signature,
  };
};

export const verifySignedStatusPayload = (
  signedPayload: SignedStatusPayload,
): { ok: true; proof: string } | { ok: false; reason: string } => {
  if (signedPayload.version !== 1) {
    return { ok: false, reason: "unsupported payload version" };
  }

  const publicKey = stripHexPrefix(signedPayload.senderPublicKey);
  const signature = stripHexPrefix(signedPayload.signature);

  if (!publicKey || !signature) {
    return { ok: false, reason: "missing sender key or signature" };
  }

  const signingMessage = statusSigningMessage({
    version: signedPayload.version,
    messageId: signedPayload.messageId,
    senderPublicKey: publicKey,
    communityId: signedPayload.communityId,
    chatId: signedPayload.chatId,
    topic: signedPayload.topic,
    timestampMs: signedPayload.timestampMs,
    nonce: signedPayload.nonce,
    contentType: signedPayload.contentType,
    payload: signedPayload.payload,
  });

  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(signingMessage),
    fromHex(signature),
    fromHex(publicKey),
  );

  if (!ok) {
    return { ok: false, reason: "invalid signature" };
  }

  const proof = createHash("sha256")
    .update(signingMessage)
    .update(":")
    .update(signature)
    .digest("hex");

  return { ok: true, proof };
};

export const isSignedStatusPayload = (value: unknown): value is SignedStatusPayload => {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as Partial<SignedStatusPayload>;
  return (
    candidate.version === 1 &&
    typeof candidate.messageId === "string" &&
    typeof candidate.senderPublicKey === "string" &&
    typeof candidate.communityId === "string" &&
    typeof candidate.chatId === "string" &&
    typeof candidate.topic === "string" &&
    typeof candidate.timestampMs === "number" &&
    typeof candidate.nonce === "string" &&
    (candidate.contentType === "text/plain" ||
      candidate.contentType === "audio/ogg" ||
      candidate.contentType === "application/json") &&
    typeof candidate.payload === "string" &&
    typeof candidate.signature === "string"
  );
};
