import { Buffer } from "node:buffer";
import { PolicyError } from "./errors.js";
import { BridgePolicy, BridgePolicyRule, CanonicalMessage, RawInboundMessage } from "./types.js";

export class PolicyEngine {
  constructor(private readonly policy: BridgePolicy) {}

  resolveRule(sourceChannel: CanonicalMessage["sourceChannel"]): BridgePolicyRule {
    const rule = this.policy.rules.find((candidate) => candidate.sourceChannel === sourceChannel);
    if (!rule) {
      throw new PolicyError(`No policy rule configured for source channel: ${sourceChannel}`);
    }

    return rule;
  }

  enforcePayloadLimit(raw: RawInboundMessage, rule: BridgePolicyRule): void {
    const bytes = Buffer.byteLength(raw.payload, "utf8");
    if (bytes > rule.maxPayloadBytes) {
      throw new PolicyError(`Payload too large for ${raw.channel}: ${bytes} > ${rule.maxPayloadBytes}`);
    }
  }

  enforceSenderAllowlist(message: CanonicalMessage, rule: BridgePolicyRule): void {
    if (!rule.allowedSenders || rule.allowedSenders.length === 0) {
      return;
    }

    const allowed = new Set(rule.allowedSenders.map((s) => s.toLowerCase()));
    if (!allowed.has(message.sourceSenderId.toLowerCase())) {
      throw new PolicyError(`Sender is not allowlisted for ${message.sourceChannel}`);
    }
  }

  enforceCommandAllowlist(message: CanonicalMessage, rule: BridgePolicyRule): void {
    if (message.kind !== "command") {
      return;
    }

    if (!rule.allowedCommands || rule.allowedCommands.length === 0) {
      throw new PolicyError(`Command handling disabled for ${message.sourceChannel}`);
    }

    const allowedCommands = new Set(rule.allowedCommands);
    if (!message.commandName || !allowedCommands.has(message.commandName)) {
      throw new PolicyError(`Command not allowed: ${message.commandName ?? "(missing)"}`);
    }
  }

  enforceAuthentication(message: CanonicalMessage, rule: BridgePolicyRule): void {
    if (rule.requireAuthentication && !message.cryptographicState.authenticated) {
      throw new PolicyError(`Authentication required for ${message.sourceChannel}`);
    }
  }
}
