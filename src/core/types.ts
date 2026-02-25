export type ChannelKind =
  | "status"
  | "whatsapp"
  | "telegram"
  | "signal"
  | "discord"
  | "slack"
  | "email";

export type MessageKind = "text" | "audio" | "file" | "command";

export interface RawInboundMessage {
  id: string;
  channel: ChannelKind;
  senderId: string;
  conversationId: string;
  timestampMs: number;
  nonce?: string;
  payload: string;
  contentType: string;
  headers: Record<string, string>;
  metadata: Record<string, string>;
}

export interface VerifiedInboundMessage extends RawInboundMessage {
  auth: {
    authenticated: boolean;
    mechanism: string;
    keyId?: string;
    confidence: "low" | "medium" | "high";
  };
}

export interface CanonicalMessage {
  messageId: string;
  sourceChannel: ChannelKind;
  sourceSenderId: string;
  sourceConversationId: string;
  createdAtMs: number;
  kind: MessageKind;
  text?: string;
  audioUrl?: string;
  fileUrl?: string;
  commandName?: string;
  commandArgs?: string[];
  metadata: Record<string, string>;
  cryptographicState: {
    authenticated: boolean;
    mechanism: string;
    confidence: "low" | "medium" | "high";
  };
}

export interface OutboundMessage {
  channel: ChannelKind;
  conversationId: string;
  text: string;
  metadata?: Record<string, string>;
}

export interface VerificationResult {
  authenticated: boolean;
  mechanism: string;
  keyId?: string;
  confidence: "low" | "medium" | "high";
  reason?: string;
}

export interface ChannelAdapter {
  readonly kind: ChannelKind;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutboundMessage): Promise<void>;
}

export interface InboundChannelAdapter extends ChannelAdapter {
  onMessage(handler: (message: RawInboundMessage) => Promise<void>): void;
}

export interface BridgePolicyRule {
  sourceChannel: ChannelKind;
  requireAuthentication: boolean;
  allowedSenders?: string[];
  allowedCommands?: string[];
  maxPayloadBytes: number;
  fanoutTargets: ChannelKind[];
}

export interface BridgePolicy {
  rules: BridgePolicyRule[];
}

export interface OpenClawGateway {
  ingest(message: CanonicalMessage): Promise<void>;
}

export interface IdempotencyStore {
  hasProcessed(messageId: string): Promise<boolean>;
  markProcessed(messageId: string): Promise<void>;
}

export interface ReplayStore {
  markIfNew(key: string, ttlMs: number): Promise<boolean>;
}

export interface RateLimiter {
  allow(subject: string, nowMs: number): Promise<boolean>;
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

export interface AuditEvent {
  type: "accepted" | "rejected" | "forwarded" | "error";
  channel: ChannelKind;
  messageId: string;
  detail: string;
  timestampMs: number;
  metadata?: Record<string, string>;
}
