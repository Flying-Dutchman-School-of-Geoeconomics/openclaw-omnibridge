import { EventEmitter } from "node:events";
import {
  CanonicalMessage,
  InboundChannelAdapter,
  OutboundMessage,
  RawInboundMessage,
  VerificationResult,
} from "../core/types.js";

export abstract class BaseInboundAdapter extends EventEmitter implements InboundChannelAdapter {
  abstract readonly kind: RawInboundMessage["channel"];

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(message: OutboundMessage): Promise<void>;
  abstract verify(raw: RawInboundMessage): Promise<VerificationResult>;
  abstract normalize(raw: RawInboundMessage, verification: VerificationResult): Promise<CanonicalMessage>;

  onMessage(handler: (message: RawInboundMessage) => Promise<void>): void {
    this.on("message", handler);
  }

  protected emitInbound(raw: RawInboundMessage): void {
    this.emit("message", raw);
  }

  // Utility for tests and local simulations.
  async simulateInbound(raw: RawInboundMessage): Promise<void> {
    this.emitInbound(raw);
  }
}
