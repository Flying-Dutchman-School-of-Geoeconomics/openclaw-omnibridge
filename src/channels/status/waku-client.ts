import { EventEmitter } from "node:events";
import {
  deriveStatusPublicKeyHex,
  isSignedStatusPayload,
  signStatusPayload,
  verifySignedStatusPayload,
} from "./waku-proof.js";

export interface StatusEnvelope {
  id: string;
  senderPublicKey: string;
  chatId: string;
  communityId: string;
  timestampMs: number;
  nonce: string;
  contentType: "text/plain" | "audio/ogg" | "application/json";
  payload: string;
  topic: string;
  signatureVerifiedByWaku: boolean;
  signatureProof: string;
}

export interface StatusWakuClientOptions {
  bootstrapNodes: string[];
  privateKeyHex: string;
  communityId: string;
  chatId: string;
  expectedTopic: string;
  sdkModuleLoader?: () => Promise<Record<string, unknown>>;
}

export interface StatusWarningEvent {
  reason: string;
  messageId?: string;
}

type WakuNode = Record<string, unknown>;

const toObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value != null ? (value as Record<string, unknown>) : {};

const getField = (value: unknown, keys: string[]): unknown => {
  const object = toObject(value);
  for (const key of keys) {
    if (key in object) {
      return object[key];
    }
  }

  return undefined;
};

const toBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }

  if (Array.isArray(value) && value.every((part) => typeof part === "number")) {
    return new Uint8Array(value);
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  return null;
};

const pickFunction = <T extends (...args: unknown[]) => unknown>(
  source: Record<string, unknown>,
  keys: string[],
): T => {
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate === "function") {
      return candidate as T;
    }
  }

  throw new Error(`missing function export: ${keys.join(" | ")}`);
};

export class StatusWakuClient extends EventEmitter {
  private connected = false;
  private readonly sdkModuleLoader: () => Promise<Record<string, unknown>>;
  private readonly selfPublicKeyHex: string;
  private node: WakuNode | null = null;
  private encoder: unknown | null = null;
  private unsubscribe: (() => Promise<void> | void) | null = null;

  constructor(private readonly options: StatusWakuClientOptions) {
    super();
    this.selfPublicKeyHex = deriveStatusPublicKeyHex(options.privateKeyHex);
    this.sdkModuleLoader =
      options.sdkModuleLoader ??
      (async () => (await import("@waku/sdk")) as unknown as Record<string, unknown>);
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const sdk = await this.sdkModuleLoader();
    const createNode = pickFunction<(options: Record<string, unknown>) => Promise<WakuNode>>(sdk, [
      "createLightNode",
      "createRelayNode",
    ]);

    const node = await createNode({
      defaultBootstrap: this.options.bootstrapNodes.length === 0,
      bootstrapPeers: this.options.bootstrapNodes,
    });

    await this.callNode(node, "start");
    await this.waitForPeers(sdk, node);

    this.encoder = this.createEncoder(sdk, node);
    this.unsubscribe = await this.subscribe(node, sdk);
    this.node = node;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      this.removeAllListeners();
      return;
    }

    if (this.unsubscribe) {
      await this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.node) {
      await this.callNode(this.node, "stop");
      this.node = null;
    }

    this.encoder = null;
    this.connected = false;
    this.removeAllListeners();
  }

  async publishText(text: string): Promise<void> {
    if (!this.connected || !this.node || !this.encoder) {
      throw new Error("Status Waku client not connected");
    }

    const signed = signStatusPayload(
      {
        senderPublicKey: this.selfPublicKeyHex,
        communityId: this.options.communityId,
        chatId: this.options.chatId,
        topic: this.options.expectedTopic,
        contentType: "text/plain",
        payload: text,
      },
      this.options.privateKeyHex,
    );

    const message = {
      payload: new TextEncoder().encode(JSON.stringify(signed)),
      timestamp: new Date(signed.timestampMs),
    };

    const lightPush = getField(this.node, ["lightPush"]);
    if (typeof getField(lightPush, ["send"]) === "function") {
      await (getField(lightPush, ["send"]) as (encoder: unknown, msg: unknown) => Promise<void>)(
        this.encoder,
        message,
      );
    } else {
      const relay = getField(this.node, ["relay"]);
      if (typeof getField(relay, ["send"]) !== "function") {
        throw new Error("Waku node has no supported send transport");
      }
      await (getField(relay, ["send"]) as (encoder: unknown, msg: unknown) => Promise<void>)(this.encoder, message);
    }

    this.emit("published", {
      messageId: signed.messageId,
      chatId: signed.chatId,
      communityId: signed.communityId,
      topic: signed.topic,
    });
  }

  emitIncoming(envelope: StatusEnvelope): void {
    this.emit("message", envelope);
  }

  private async subscribe(
    node: WakuNode,
    sdk: Record<string, unknown>,
  ): Promise<(() => Promise<void> | void) | null> {
    const decoder = this.createDecoder(sdk, node);
    const onMessage = (message: unknown) => {
      void this.handleWakuMessage(message);
    };

    const filter = getField(node, ["filter"]);
    const subscribe = getField(filter, ["subscribe"]);
    if (typeof subscribe === "function") {
      try {
        const result = await (subscribe as (...args: unknown[]) => Promise<unknown>)([decoder], onMessage);
        const unsubscribe = getField(toObject(result), ["unsubscribe"]);
        if (typeof unsubscribe === "function") {
          return () => (unsubscribe as () => Promise<void>)();
        }
        if (typeof result === "function") {
          return result as () => Promise<void> | void;
        }
        return null;
      } catch {
        const result = await (subscribe as (...args: unknown[]) => Promise<unknown>)(decoder, onMessage);
        const unsubscribe = getField(toObject(result), ["unsubscribe"]);
        if (typeof unsubscribe === "function") {
          return () => (unsubscribe as () => Promise<void>)();
        }
        if (typeof result === "function") {
          return result as () => Promise<void> | void;
        }
        return null;
      }
    }

    const relay = getField(node, ["relay"]);
    const addObserver = getField(relay, ["addObserver"]);
    if (typeof addObserver === "function") {
      (addObserver as (...args: unknown[]) => void)(onMessage);
      const deleteObserver = getField(relay, ["deleteObserver"]);
      if (typeof deleteObserver === "function") {
        return () => (deleteObserver as (...args: unknown[]) => void)(onMessage);
      }
      return null;
    }

    throw new Error("Waku node has no supported subscribe transport");
  }

  private async handleWakuMessage(message: unknown): Promise<void> {
    const payload = this.extractPayload(message);
    if (!payload) {
      this.emitWarning("missing payload bytes");
      return;
    }

    const transportTopic = this.extractTransportTopic(message);
    if (transportTopic && transportTopic !== this.options.expectedTopic) {
      this.emitWarning(
        `transport topic mismatch: expected ${this.options.expectedTopic}, got ${transportTopic}`,
      );
      return;
    }

    const parsed = this.decodePayload(payload);
    if (!parsed) {
      return;
    }

    if (parsed.topic !== this.options.expectedTopic) {
      this.emitWarning(`topic mismatch: expected ${this.options.expectedTopic}, got ${parsed.topic}`, parsed.messageId);
      return;
    }

    if (parsed.communityId !== this.options.communityId) {
      this.emitWarning("community mismatch", parsed.messageId);
      return;
    }

    if (parsed.chatId !== this.options.chatId) {
      this.emitWarning("chat mismatch", parsed.messageId);
      return;
    }

    const verification = verifySignedStatusPayload(parsed);
    if (!verification.ok) {
      this.emitWarning(`signature verification failed: ${verification.reason}`, parsed.messageId);
      return;
    }

    this.emit("message", {
      id: parsed.messageId,
      senderPublicKey: parsed.senderPublicKey,
      chatId: parsed.chatId,
      communityId: parsed.communityId,
      timestampMs: parsed.timestampMs,
      nonce: parsed.nonce,
      contentType: parsed.contentType,
      payload: parsed.payload,
      topic: parsed.topic,
      signatureVerifiedByWaku: true,
      signatureProof: verification.proof,
    } as StatusEnvelope);
  }

  private decodePayload(payload: Uint8Array) {
    const raw = new TextDecoder().decode(payload);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.emitWarning("malformed payload JSON");
      return null;
    }

    if (!isSignedStatusPayload(parsed)) {
      this.emitWarning("payload shape is not SignedStatusPayload");
      return null;
    }

    return parsed;
  }

  private extractPayload(message: unknown): Uint8Array | null {
    const direct = toBytes(getField(message, ["payload"]));
    if (direct) {
      return direct;
    }

    const wakuMessage = getField(message, ["wakuMessage"]);
    const nested = toBytes(getField(wakuMessage, ["payload"]));
    if (nested) {
      return nested;
    }

    return null;
  }

  private extractTransportTopic(message: unknown): string | null {
    const direct = getField(message, ["contentTopic", "topic"]);
    if (typeof direct === "string") {
      return direct;
    }

    const wakuMessage = getField(message, ["wakuMessage"]);
    const nested = getField(wakuMessage, ["contentTopic", "topic"]);
    return typeof nested === "string" ? nested : null;
  }

  private createEncoder(sdk: Record<string, unknown>, node: WakuNode): unknown {
    const createEncoderCandidate = getField(sdk, ["createEncoder"]) ?? getField(node, ["createEncoder"]);
    if (typeof createEncoderCandidate !== "function") {
      throw new Error("missing createEncoder in Waku SDK");
    }

    const createEncoder = createEncoderCandidate as (topic: unknown) => unknown;
    try {
      return createEncoder({
        contentTopic: this.options.expectedTopic,
      });
    } catch {
      return createEncoder(this.options.expectedTopic);
    }
  }

  private createDecoder(sdk: Record<string, unknown>, node: WakuNode): unknown {
    const createDecoderCandidate = getField(sdk, ["createDecoder"]) ?? getField(node, ["createDecoder"]);
    if (typeof createDecoderCandidate !== "function") {
      throw new Error("missing createDecoder in Waku SDK");
    }

    const createDecoder = createDecoderCandidate as (topic: unknown) => unknown;
    try {
      return createDecoder({
        contentTopic: this.options.expectedTopic,
      });
    } catch {
      return createDecoder(this.options.expectedTopic);
    }
  }

  private emitWarning(reason: string, messageId?: string): void {
    this.emit("warning", {
      reason,
      messageId,
    } as StatusWarningEvent);
  }

  private async callNode(node: WakuNode, method: "start" | "stop"): Promise<void> {
    const fn = getField(node, [method]);
    if (typeof fn !== "function") {
      throw new Error(`Waku node missing ${method}()`);
    }
    await (fn as () => Promise<void>)();
  }

  private async waitForPeers(sdk: Record<string, unknown>, node: WakuNode): Promise<void> {
    const waitForRemotePeer = getField(sdk, ["waitForRemotePeer"]);
    if (typeof waitForRemotePeer !== "function") {
      return;
    }

    const protocols = toObject(getField(sdk, ["Protocols"]));
    const requestedProtocols: unknown[] = [];
    for (const key of ["Filter", "LightPush", "Relay"]) {
      if (key in protocols) {
        requestedProtocols.push(protocols[key]);
      }
    }

    await (waitForRemotePeer as (n: unknown, p?: unknown[]) => Promise<void>)(node, requestedProtocols);
  }
}
