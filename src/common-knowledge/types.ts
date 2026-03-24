import { BridgePolicy, BridgePolicyRule, CanonicalMessage, ChannelKind } from "../core/types.js";

export type IngressMode = "provider-native" | "bridge-shim";
export type OfferState = "active" | "degraded";
export type OfferClass = "channel-surface" | "channel-fanout" | "runtime";
export type ExecutionOutcome = "relay" | "dispatch" | "reply" | "clarify" | "reject";
export type DestinationKind =
  | "status-chat"
  | "phone-number"
  | "telegram-chat"
  | "discord-channel"
  | "slack-channel"
  | "email-address";

export interface ChannelSurfaceProfile {
  channel: ChannelKind;
  englishName: string;
  aliases: string[];
  ingressMode: IngressMode;
  replySupported: boolean;
  destinationKind: DestinationKind;
  securityPosture: string;
}

export interface Offer {
  offerId: string;
  class: OfferClass;
  state: OfferState;
  summary: string;
  channel?: ChannelKind;
  sourceChannel?: ChannelKind;
  fanoutTarget?: ChannelKind;
  ingressMode?: IngressMode;
  replySupported?: boolean;
  destinationKind?: DestinationKind;
  securityPosture?: string;
  aliases?: string[];
  reason?: string;
}

export interface OfferManifestSignature {
  algorithm: "ed25519" | "none";
  signer: string;
  value: string;
}

export interface OfferManifest {
  schema: "openclaw-common-knowledge/1";
  manifestId: string;
  runtimeId: string;
  generatedAt: string;
  generatedAtMs: number;
  policyHash: string;
  offers: Offer[];
  signature: OfferManifestSignature;
}

export interface ReplyPlan {
  channel: ChannelKind;
  conversationId: string;
  text: string;
  metadata?: Record<string, string>;
}

export interface ExecutionPlan {
  outcome: ExecutionOutcome;
  dispatchTargets?: ChannelKind[];
  dispatchText?: string;
  reply?: ReplyPlan;
  reason?: string;
}

export type ResolvedIntentKind =
  | "none"
  | "help"
  | "show-routes"
  | "what-works-here"
  | "send"
  | "why-cant-send-from"
  | "why-was-this-rejected"
  | "what-do-you-need";

export interface IntentResolution {
  matched: boolean;
  intent: ResolvedIntentKind;
  execution: ExecutionPlan;
}

export interface CommonKnowledgeContext {
  rule: BridgePolicyRule;
  manifest: OfferManifest;
}

export interface CommonKnowledgeServiceOptions {
  policy: BridgePolicy;
  statusPrivateKeyHex?: string;
  isChannelEnabled: (channel: ChannelKind) => boolean;
  isChannelHealthy?: (channel: ChannelKind) => boolean;
  channelProfiles?: Partial<Record<ChannelKind, Partial<ChannelSurfaceProfile>>>;
}

export interface CommonKnowledgeIntentInput {
  message: CanonicalMessage;
  rule: BridgePolicyRule;
}
