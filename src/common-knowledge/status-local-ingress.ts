import { deriveStatusPublicKeyHex, signStatusPayload } from "../channels/status/waku-proof.js";
import { StatusAdapter } from "../channels/status/adapter.js";

export interface StatusLocalIngressServiceOptions {
  statusAdapter: StatusAdapter;
  privateKeyHex: string;
  expectedTopic: string;
  communityId: string;
  chatId: string;
}

export interface StatusLocalIngressResult {
  messageId: string;
}

export class StatusLocalIngressService {
  private readonly senderPublicKeyHex: string;

  constructor(private readonly options: StatusLocalIngressServiceOptions) {
    this.senderPublicKeyHex = deriveStatusPublicKeyHex(options.privateKeyHex);
  }

  async injectHumanText(text: string): Promise<StatusLocalIngressResult> {
    const normalized = text.trim();
    if (!normalized) {
      throw new Error("Status local ingress text must not be empty");
    }

    const signed = signStatusPayload(
      {
        senderPublicKey: this.senderPublicKeyHex,
        communityId: this.options.communityId,
        chatId: this.options.chatId,
        topic: this.options.expectedTopic,
        contentType: "text/plain",
        payload: normalized,
      },
      this.options.privateKeyHex,
    );

    await this.options.statusAdapter.injectSignedPayloadLocally(signed, {
      ingressMode: "bridge-shim",
      source: "status-local-ingress",
    });

    return {
      messageId: signed.messageId,
    };
  }
}
