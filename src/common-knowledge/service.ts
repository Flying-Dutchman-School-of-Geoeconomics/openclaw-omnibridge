import { createHash, randomUUID } from "node:crypto";
import nacl from "tweetnacl";
import { deriveStatusPublicKeyHex } from "../channels/status/waku-proof.js";
import { canonicalJson } from "../core/canonical-json.js";
import { BridgePolicyRule, CanonicalMessage, ChannelKind } from "../core/types.js";
import {
  ChannelSurfaceProfile,
  CommonKnowledgeIntentInput,
  CommonKnowledgeServiceOptions,
  DestinationKind,
  IntentResolution,
  Offer,
  OfferManifest,
  ReplyPlan,
} from "./types.js";

const CHANNEL_ORDER: ChannelKind[] = [
  "status",
  "signal",
  "telegram",
  "whatsapp",
  "discord",
  "slack",
  "email",
];

const DEFAULT_SURFACES: Record<ChannelKind, ChannelSurfaceProfile> = {
  status: {
    channel: "status",
    englishName: "Status",
    aliases: ["status", "status network", "waku"],
    ingressMode: "bridge-shim",
    replySupported: true,
    destinationKind: "status-chat",
    securityPosture: "waku-signed-payload with topic/community/chat binding",
  },
  signal: {
    channel: "signal",
    englishName: "Signal",
    aliases: ["signal"],
    ingressMode: "provider-native",
    replySupported: true,
    destinationKind: "phone-number",
    securityPosture: "trusted local daemon boundary plus trusted peer allowlist",
  },
  telegram: {
    channel: "telegram",
    englishName: "Telegram",
    aliases: ["telegram"],
    ingressMode: "provider-native",
    replySupported: true,
    destinationKind: "telegram-chat",
    securityPosture: "webhook secret token",
  },
  whatsapp: {
    channel: "whatsapp",
    englishName: "WhatsApp",
    aliases: ["whatsapp", "wa"],
    ingressMode: "provider-native",
    replySupported: true,
    destinationKind: "phone-number",
    securityPosture: "x-hub-signature-256 HMAC verification",
  },
  discord: {
    channel: "discord",
    englishName: "Discord",
    aliases: ["discord"],
    ingressMode: "provider-native",
    replySupported: true,
    destinationKind: "discord-channel",
    securityPosture: "ed25519 interaction verification",
  },
  slack: {
    channel: "slack",
    englishName: "Slack",
    aliases: ["slack"],
    ingressMode: "provider-native",
    replySupported: true,
    destinationKind: "slack-channel",
    securityPosture: "signed webhook HMAC verification",
  },
  email: {
    channel: "email",
    englishName: "Email",
    aliases: ["email", "mail"],
    ingressMode: "provider-native",
    replySupported: true,
    destinationKind: "email-address",
    securityPosture: "DKIM-policy boundary plus sender allowlist",
  },
};

const stripHexPrefix = (value: string): string => value.trim().replace(/^0x/i, "").toLowerCase();

const fromHex = (value: string): Uint8Array => new Uint8Array(Buffer.from(stripHexPrefix(value), "hex"));

const toHex = (value: Uint8Array): string => Buffer.from(value).toString("hex");

const destinationLabel = (kind: DestinationKind): string => {
  switch (kind) {
    case "status-chat":
      return "Status chat";
    case "phone-number":
      return "phone number";
    case "telegram-chat":
      return "Telegram chat";
    case "discord-channel":
      return "Discord channel";
    case "slack-channel":
      return "Slack channel";
    case "email-address":
      return "email address";
  }
};

const hashString = (value: string): string => createHash("sha256").update(value).digest("hex");

export class CommonKnowledgeService {
  private readonly channelProfiles: Record<ChannelKind, ChannelSurfaceProfile>;

  constructor(private readonly options: CommonKnowledgeServiceOptions) {
    this.channelProfiles = this.mergeProfiles(options.channelProfiles);
  }

  createOfferManifest(): OfferManifest {
    const offers: Offer[] = [];

    for (const channel of CHANNEL_ORDER) {
      if (!this.options.isChannelEnabled(channel)) {
        continue;
      }

      const profile = this.channelProfiles[channel];
      const active = this.isChannelActive(channel);
      offers.push({
        offerId: `${channel}.surface`,
        class: "channel-surface",
        state: active ? "active" : "degraded",
        channel,
        summary: `${profile.englishName} ingress is ${profile.ingressMode === "bridge-shim" ? "bridge-owned shim" : "provider-native"}.`,
        ingressMode: profile.ingressMode,
        replySupported: profile.replySupported,
        destinationKind: profile.destinationKind,
        securityPosture: profile.securityPosture,
        aliases: profile.aliases,
        reason: active ? undefined : `${profile.englishName} is enabled but not healthy.`,
      });
    }

    for (const rule of this.options.policy.rules) {
      if (!this.options.isChannelEnabled(rule.sourceChannel)) {
        continue;
      }

      for (const target of rule.fanoutTargets) {
        const sourceActive = this.isChannelActive(rule.sourceChannel);
        const targetActive = this.isChannelActive(target);
        const state = sourceActive && targetActive ? "active" : "degraded";

        offers.push({
          offerId: `${rule.sourceChannel}.to.${target}`,
          class: "channel-fanout",
          state,
          channel: rule.sourceChannel,
          sourceChannel: rule.sourceChannel,
          fanoutTarget: target,
          summary:
            state === "active"
              ? `${this.channelProfiles[rule.sourceChannel].englishName} can dispatch to ${this.channelProfiles[target].englishName}.`
              : `${this.channelProfiles[rule.sourceChannel].englishName} route to ${this.channelProfiles[target].englishName} is unavailable.`,
          reason: state === "active" ? undefined : this.routeDegradationReason(rule.sourceChannel, target),
        });
      }
    }

    const runtimeHealthy = CHANNEL_ORDER.every((channel) => {
      if (!this.options.isChannelEnabled(channel)) {
        return true;
      }

      return this.isChannelActive(channel);
    });

    offers.push({
      offerId: "runtime.selfcheck",
      class: "runtime",
      state: runtimeHealthy ? "active" : "degraded",
      summary: runtimeHealthy ? "Runtime offers are healthy." : "Runtime has degraded channel offers.",
      reason: runtimeHealthy ? undefined : "One or more enabled channels are degraded.",
    });

    const body = {
      schema: "openclaw-common-knowledge/1" as const,
      manifestId: randomUUID(),
      runtimeId: this.runtimeId(),
      generatedAt: new Date().toISOString(),
      generatedAtMs: Date.now(),
      policyHash: hashString(canonicalJson(this.options.policy)),
      offers,
    };

    return {
      ...body,
      signature: this.signManifestBody(body),
    };
  }

  renderOffersText(manifest = this.createOfferManifest()): string {
    const surfaceOffers = manifest.offers.filter((offer) => offer.class === "channel-surface");
    const routeOffers = manifest.offers.filter((offer) => offer.class === "channel-fanout");

    const lines = [
      "OpenClaw Common Knowledge",
      `Runtime: ${manifest.runtimeId}`,
      `Policy hash: ${manifest.policyHash}`,
      "Active channel surfaces:",
    ];

    for (const offer of surfaceOffers) {
      if (!offer.channel) {
        continue;
      }

      const profile = this.channelProfiles[offer.channel];
      lines.push(
        `- ${profile.englishName}: ${offer.state}; ingress=${profile.ingressMode}; replies=${profile.replySupported ? "yes" : "no"}; destination=${destinationLabel(profile.destinationKind)}; security=${profile.securityPosture}`,
      );
    }

    lines.push("Routes:");
    for (const offer of routeOffers) {
      if (!offer.sourceChannel || !offer.fanoutTarget) {
        continue;
      }

      lines.push(
        `- ${this.channelProfiles[offer.sourceChannel].englishName} -> ${this.channelProfiles[offer.fanoutTarget].englishName}: ${offer.state}${offer.reason ? ` (${offer.reason})` : ""}`,
      );
    }

    return lines.join("\n");
  }

  resolveIntent(input: CommonKnowledgeIntentInput): IntentResolution {
    const manifest = this.createOfferManifest();
    const message = input.message;
    const rule = input.rule;

    if (message.kind !== "text" || !message.text?.trim()) {
      return {
        matched: false,
        intent: "none",
        execution: {
          outcome: "relay",
        },
      };
    }

    const text = message.text.trim();

    if (/^help$/i.test(text) || /^what can you do\??$/i.test(text)) {
      return this.replyIntent("help", message, this.renderHelp(message.sourceChannel, rule, manifest));
    }

    if (/^show routes\??$/i.test(text)) {
      return this.replyIntent("show-routes", message, this.renderRoutes(message.sourceChannel, rule));
    }

    if (/^what works here\??$/i.test(text)) {
      return this.replyIntent("what-works-here", message, this.renderWorksHere(message.sourceChannel, rule));
    }

    if (/^why was this rejected\??$/i.test(text)) {
      return this.replyIntent("why-was-this-rejected", message, this.renderWhyRejected(message.sourceChannel, rule));
    }

    const whyCantSendMatch = text.match(/^why can't i send from\s+(.+?)\??$/i);
    if (whyCantSendMatch) {
      const channel = this.resolveChannelName(whyCantSendMatch[1]);
      if (!channel) {
        return this.clarifyIntent(
          "why-cant-send-from",
          message,
          `I could not resolve that channel. Supported channels: ${this.knownChannelsList()}.`,
        );
      }

      return this.replyIntent("why-cant-send-from", message, this.renderIngressExplanation(channel));
    }

    const whatDoYouNeedMatch = text.match(/^what do you need for\s+(.+?)\??$/i);
    if (whatDoYouNeedMatch) {
      const channel = this.resolveChannelName(whatDoYouNeedMatch[1]);
      if (!channel) {
        return this.clarifyIntent(
          "what-do-you-need",
          message,
          `I could not resolve that channel. Supported channels: ${this.knownChannelsList()}.`,
        );
      }

      return this.replyIntent("what-do-you-need", message, this.renderRequirements(channel));
    }

    const sendQuotedMatch = text.match(/^send\s+"([\s\S]+)"\s+to\s+(.+?)\s*$/i);
    if (sendQuotedMatch) {
      return this.resolveDispatch(message, rule, sendQuotedMatch[2], sendQuotedMatch[1]);
    }

    const sendColonMatch = text.match(/^send\s+to\s+(.+?)\s*:\s*([\s\S]+)$/i);
    if (sendColonMatch) {
      return this.resolveDispatch(message, rule, sendColonMatch[1], sendColonMatch[2]);
    }

    return {
      matched: false,
      intent: "none",
      execution: {
        outcome: "relay",
      },
    };
  }

  private renderHelp(sourceChannel: ChannelKind, rule: BridgePolicyRule, manifest: OfferManifest): string {
    const profile = this.channelProfiles[sourceChannel];
    const activeRoutes = this.activeTargetsForRule(rule);
    return [
      `OmniBridge common knowledge for ${profile.englishName}.`,
      `Ingress mode here is ${profile.ingressMode === "bridge-shim" ? "bridge-owned shim" : "provider-native"}.`,
      profile.ingressMode === "bridge-shim"
        ? `Typing in the native ${profile.englishName} app does not create bridge-acceptable ingress. Use the bridge-owned publisher for this channel.`
        : `${profile.englishName} accepts provider-native human messages when its adapter is enabled and healthy.`,
      `Policy-approved active dispatch targets from here: ${activeRoutes.length > 0 ? activeRoutes.map((target) => this.channelProfiles[target].englishName).join(", ") : "none"}.`,
      `You can say: help, show routes, what works here, send "HELLO" to ${activeRoutes[0] ?? "signal"}, send to ${activeRoutes[0] ?? "signal"}: HELLO, why can't I send from status, what do you need for signal.`,
      `Offer count in the current manifest: ${manifest.offers.length}.`,
    ].join(" ");
  }

  private renderRoutes(sourceChannel: ChannelKind, rule: BridgePolicyRule): string {
    const activeTargets = this.activeTargetsForRule(rule);
    const degradedTargets = rule.fanoutTargets.filter((target) => !activeTargets.includes(target));

    return [
      `Routes from ${this.channelProfiles[sourceChannel].englishName}:`,
      activeTargets.length > 0
        ? `active -> ${activeTargets.map((target) => this.channelProfiles[target].englishName).join(", ")}.`
        : "active -> none.",
      degradedTargets.length > 0
        ? `unavailable -> ${degradedTargets
            .map((target) => `${this.channelProfiles[target].englishName} (${this.routeDegradationReason(sourceChannel, target)})`)
            .join(", ")}.`
        : "unavailable -> none.",
    ].join(" ");
  }

  private renderWorksHere(sourceChannel: ChannelKind, rule: BridgePolicyRule): string {
    const profile = this.channelProfiles[sourceChannel];
    const activeTargets = this.activeTargetsForRule(rule);
    return [
      `${profile.englishName} is currently ${this.isChannelActive(sourceChannel) ? "active" : "degraded"}.`,
      `Ingress mode: ${profile.ingressMode}.`,
      `Reply support: ${profile.replySupported ? "yes" : "no"}.`,
      `Dispatch targets available from here: ${activeTargets.length > 0 ? activeTargets.map((target) => this.channelProfiles[target].englishName).join(", ") : "none"}.`,
    ].join(" ");
  }

  private renderWhyRejected(sourceChannel: ChannelKind, rule: BridgePolicyRule): string {
    return [
      `Messages are rejected before execution when authentication fails, sender policy fails, replay or duplicate protection fires, rate limiting trips, or the requested route is not active.`,
      `From ${this.channelProfiles[sourceChannel].englishName}, currently policy-approved targets are ${rule.fanoutTargets.length > 0 ? rule.fanoutTargets.map((target) => this.channelProfiles[target].englishName).join(", ") : "none"}.`,
      `Use "show routes" to see what is active right now.`,
    ].join(" ");
  }

  private renderIngressExplanation(channel: ChannelKind): string {
    const profile = this.channelProfiles[channel];
    if (!this.options.isChannelEnabled(channel)) {
      return `${profile.englishName} is not enabled in this runtime.`;
    }

    if (profile.ingressMode === "bridge-shim") {
      return [
        `${profile.englishName} currently operates in bridge-owned ingress mode.`,
        `Native app traffic is not the bridge's acceptance contract for this channel.`,
        `A bridge-owned publisher must emit the verified envelope expected by the adapter before the message can enter OmniBridge.`,
      ].join(" ");
    }

    return `${profile.englishName} supports provider-native ingress when its adapter is enabled and healthy.`;
  }

  private renderRequirements(channel: ChannelKind): string {
    const profile = this.channelProfiles[channel];

    switch (channel) {
      case "status":
        return `${profile.englishName} requires STATUS_PRIVATE_KEY_HEX, STATUS_EXPECTED_TOPIC, STATUS_COMMUNITY_ID, STATUS_CHAT_ID, reachable Waku bootstrap nodes, and a bridge-owned publisher that emits signed Status envelopes.`;
      case "signal":
        return `${profile.englishName} requires a working signal-cli compatible daemon, a verified number, reachable RPC endpoint, and trusted peers aligned with policy.`;
      case "telegram":
        return `${profile.englishName} requires a bot token, webhook secret token, and allowed chat identifiers.`;
      case "whatsapp":
        return `${profile.englishName} requires app secret, access token, verify token, phone number ID, and allowlisted senders.`;
      case "discord":
        return `${profile.englishName} requires an application public key, bot token, and allowed guild configuration.`;
      case "slack":
        return `${profile.englishName} requires a signing secret, bot token, and allowed channels.`;
      case "email":
        return `${profile.englishName} requires SMTP and IMAP credentials, allowed senders, and the configured DKIM policy boundary.`;
    }
  }

  private resolveDispatch(
    message: CanonicalMessage,
    rule: BridgePolicyRule,
    rawTarget: string,
    rawPayload: string,
  ): IntentResolution {
    const target = this.resolveChannelName(rawTarget);
    if (!target) {
      return this.clarifyIntent(
        "send",
        message,
        `I could not resolve that target channel. Supported channels: ${this.knownChannelsList()}.`,
      );
    }

    const payload = rawPayload.trim();
    if (!payload) {
      return this.clarifyIntent("send", message, "The send request is missing message text.");
    }

    if (target === message.sourceChannel) {
      return this.rejectIntent(
        "send",
        message,
        `Direct dispatch to the same channel is not supported. Use plain text if you want normal relay behavior inside ${this.channelProfiles[target].englishName}.`,
      );
    }

    if (!rule.fanoutTargets.includes(target)) {
      return this.rejectIntent(
        "send",
        message,
        `${this.channelProfiles[target].englishName} is not policy-approved as a dispatch target from ${this.channelProfiles[message.sourceChannel].englishName}.`,
      );
    }

    if (!this.options.isChannelEnabled(target)) {
      return this.rejectIntent(
        "send",
        message,
        `${this.channelProfiles[target].englishName} is currently disabled in this runtime.`,
      );
    }

    if (!this.isChannelActive(target)) {
      return this.rejectIntent(
        "send",
        message,
        `${this.channelProfiles[target].englishName} is currently degraded: ${this.routeDegradationReason(message.sourceChannel, target)}.`,
      );
    }

    return {
      matched: true,
      intent: "send",
      execution: {
        outcome: "dispatch",
        dispatchTargets: [target],
        dispatchText: payload,
      },
    };
  }

  private activeTargetsForRule(rule: BridgePolicyRule): ChannelKind[] {
    return rule.fanoutTargets.filter((target) => this.isChannelActive(rule.sourceChannel) && this.isChannelActive(target));
  }

  private routeDegradationReason(source: ChannelKind, target: ChannelKind): string {
    if (!this.options.isChannelEnabled(source)) {
      return `${this.channelProfiles[source].englishName} is disabled`;
    }

    if (!this.options.isChannelEnabled(target)) {
      return `${this.channelProfiles[target].englishName} is disabled`;
    }

    if (!this.isChannelActive(source)) {
      return `${this.channelProfiles[source].englishName} is degraded`;
    }

    if (!this.isChannelActive(target)) {
      return `${this.channelProfiles[target].englishName} is degraded`;
    }

    return "route unavailable";
  }

  private runtimeId(): string {
    if (this.options.statusPrivateKeyHex) {
      return deriveStatusPublicKeyHex(this.options.statusPrivateKeyHex);
    }

    return `openclaw-${hashString(canonicalJson(this.options.policy)).slice(0, 16)}`;
  }

  private signManifestBody(body: Omit<OfferManifest, "signature">): OfferManifest["signature"] {
    const payload = canonicalJson(body);

    if (!this.options.statusPrivateKeyHex) {
      return {
        algorithm: "none",
        signer: body.runtimeId,
        value: hashString(payload),
      };
    }

    const keyBytes = fromHex(this.options.statusPrivateKeyHex);
    const secretKey =
      keyBytes.length === 64 ? keyBytes : keyBytes.length === 32 ? nacl.sign.keyPair.fromSeed(keyBytes).secretKey : null;

    if (!secretKey) {
      return {
        algorithm: "none",
        signer: body.runtimeId,
        value: hashString(payload),
      };
    }

    const signature = nacl.sign.detached(new TextEncoder().encode(payload), secretKey);
    return {
      algorithm: "ed25519",
      signer: body.runtimeId,
      value: toHex(signature),
    };
  }

  private replyIntent(intent: IntentResolution["intent"], message: CanonicalMessage, text: string): IntentResolution {
    return {
      matched: true,
      intent,
      execution: {
        outcome: "reply",
        reply: this.sameChannelReply(message, text),
      },
    };
  }

  private clarifyIntent(intent: IntentResolution["intent"], message: CanonicalMessage, text: string): IntentResolution {
    return {
      matched: true,
      intent,
      execution: {
        outcome: "clarify",
        reply: this.sameChannelReply(message, text),
      },
    };
  }

  private rejectIntent(intent: IntentResolution["intent"], message: CanonicalMessage, text: string): IntentResolution {
    return {
      matched: true,
      intent,
      execution: {
        outcome: "reject",
        reply: this.sameChannelReply(message, text),
        reason: text,
      },
    };
  }

  private sameChannelReply(message: CanonicalMessage, text: string): ReplyPlan {
    return {
      channel: message.sourceChannel,
      conversationId: message.sourceConversationId,
      text,
      metadata: {
        commonKnowledgeReply: "true",
        sourceMessageId: message.messageId,
      },
    };
  }

  private resolveChannelName(value: string): ChannelKind | null {
    const normalized = value.trim().toLowerCase().replace(/[?.!]+$/g, "");

    for (const channel of CHANNEL_ORDER) {
      const profile = this.channelProfiles[channel];
      if (profile.aliases.some((alias) => alias.toLowerCase() === normalized)) {
        return channel;
      }
    }

    return null;
  }

  private knownChannelsList(): string {
    return CHANNEL_ORDER.map((channel) => this.channelProfiles[channel].englishName).join(", ");
  }

  private isChannelActive(channel: ChannelKind): boolean {
    if (!this.options.isChannelEnabled(channel)) {
      return false;
    }

    return this.options.isChannelHealthy ? this.options.isChannelHealthy(channel) : true;
  }

  private mergeProfiles(
    overrides: CommonKnowledgeServiceOptions["channelProfiles"],
  ): Record<ChannelKind, ChannelSurfaceProfile> {
    return CHANNEL_ORDER.reduce(
      (acc, channel) => {
        acc[channel] = {
          ...DEFAULT_SURFACES[channel],
          ...(overrides?.[channel] ?? {}),
          aliases: overrides?.[channel]?.aliases ?? DEFAULT_SURFACES[channel].aliases,
        };
        return acc;
      },
      {} as Record<ChannelKind, ChannelSurfaceProfile>,
    );
  }
}
