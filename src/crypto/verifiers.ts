import { VerificationResult } from "../core/types.js";
import { verifyEd25519 } from "./ed25519.js";
import { verifyHmacSha256Hex } from "./hmac.js";
import { safeEqualUtf8 } from "./timing-safe.js";

const reject = (reason: string): VerificationResult => ({
  authenticated: false,
  mechanism: "none",
  confidence: "low",
  reason,
});

export const verifySlackSignature = (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string,
): VerificationResult => {
  if (!timestamp || !signatureHeader) {
    return reject("missing Slack signature headers");
  }

  const signature = signatureHeader.replace(/^v0=/, "");
  const base = `v0:${timestamp}:${rawBody}`;
  const ok = verifyHmacSha256Hex(signingSecret, base, signature);

  if (!ok) {
    return reject("Slack signature mismatch");
  }

  return {
    authenticated: true,
    mechanism: "slack-signing-secret-hmac-sha256",
    confidence: "high",
  };
};

export const verifyWhatsAppWebhookSignature = (
  appSecret: string,
  rawBody: string,
  signatureHeader: string,
): VerificationResult => {
  if (!signatureHeader.startsWith("sha256=")) {
    return reject("invalid WhatsApp signature header format");
  }

  const signature = signatureHeader.replace(/^sha256=/, "");
  const ok = verifyHmacSha256Hex(appSecret, rawBody, signature);

  if (!ok) {
    return reject("WhatsApp X-Hub signature mismatch");
  }

  return {
    authenticated: true,
    mechanism: "x-hub-signature-256",
    confidence: "high",
  };
};

export const verifyTelegramSecretToken = (
  expectedSecret: string,
  providedSecret: string,
): VerificationResult => {
  if (!providedSecret) {
    return reject("missing Telegram secret token");
  }

  if (!safeEqualUtf8(expectedSecret, providedSecret)) {
    return reject("Telegram webhook secret mismatch");
  }

  return {
    authenticated: true,
    mechanism: "telegram-webhook-secret-token",
    confidence: "medium",
  };
};

export const verifyDiscordEd25519Signature = (
  publicKeyHex: string,
  timestamp: string,
  rawBody: string,
  signatureHex: string,
): VerificationResult => {
  if (!timestamp || !signatureHex) {
    return reject("missing Discord signature headers");
  }

  const ok = verifyEd25519(publicKeyHex, `${timestamp}${rawBody}`, signatureHex);
  if (!ok) {
    return reject("Discord Ed25519 verification failed");
  }

  return {
    authenticated: true,
    mechanism: "discord-ed25519",
    confidence: "high",
  };
};

export interface StatusVerificationParams {
  senderId: string;
  expectedTopic: string;
  providedTopic: string;
  expectedCommunityId: string;
  providedCommunityId: string;
  expectedChatId: string;
  providedChatId: string;
  signatureVerifiedByWaku: boolean;
  signatureProof?: string;
  allowedSenders: string[];
}

export const verifyStatusEnvelope = (params: StatusVerificationParams): VerificationResult => {
  if (!params.signatureVerifiedByWaku) {
    return reject(`Status signature not verified for sender ${params.senderId}`);
  }

  if (!params.signatureProof) {
    return reject("Status signature proof missing");
  }

  if (params.expectedTopic !== params.providedTopic) {
    return reject(`Status topic mismatch: expected ${params.expectedTopic}, got ${params.providedTopic}`);
  }

  if (params.expectedCommunityId !== params.providedCommunityId) {
    return reject("Status community mismatch");
  }

  if (params.expectedChatId !== params.providedChatId) {
    return reject("Status chat mismatch");
  }

  if (params.allowedSenders.length > 0) {
    const allowlist = new Set(params.allowedSenders.map((sender) => sender.toLowerCase()));
    if (!allowlist.has(params.senderId.toLowerCase())) {
      return reject(`Status sender not allowlisted: ${params.senderId}`);
    }
  }

  return {
    authenticated: true,
    mechanism: "waku-signed-payload",
    confidence: "high",
  };
};

export const verifySignalTrustBoundary = (
  trustedPeers: string[],
  senderId: string,
): VerificationResult => {
  const allowed = new Set(trustedPeers.map((p) => p.toLowerCase()));
  if (allowed.size > 0 && !allowed.has(senderId.toLowerCase())) {
    return reject("Signal sender not in trusted peers");
  }

  // SPECIFICATION: augment with mTLS / local socket peer identity attestation.
  return {
    authenticated: true,
    mechanism: "signal-local-trust-boundary",
    confidence: "medium",
  };
};

export const verifyEmailPolicyEnvelope = (
  requireDkimPass: boolean,
  dkimResult: string | undefined,
): VerificationResult => {
  if (requireDkimPass && dkimResult?.toLowerCase() !== "pass") {
    return reject("DKIM result is not pass");
  }

  // SPECIFICATION: integrate full DKIM/SPF/DMARC verification library for cryptographic header validation.
  return {
    authenticated: true,
    mechanism: "email-auth-results-policy",
    confidence: requireDkimPass ? "medium" : "low",
  };
};
