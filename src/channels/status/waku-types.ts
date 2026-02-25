export type StatusContentType = "text/plain" | "audio/ogg" | "application/json";

export interface SignedStatusPayload {
  version: 1;
  messageId: string;
  senderPublicKey: string;
  communityId: string;
  chatId: string;
  topic: string;
  timestampMs: number;
  nonce: string;
  contentType: StatusContentType;
  payload: string;
  signature: string;
}
