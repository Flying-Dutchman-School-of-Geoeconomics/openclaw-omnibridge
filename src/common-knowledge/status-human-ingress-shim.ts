import { StatusAdapter } from "../channels/status/adapter.js";

export class StatusHumanIngressShim {
  constructor(
    private readonly statusAdapter: StatusAdapter,
    private readonly statusChatId: string,
  ) {}

  async publishHumanText(text: string): Promise<void> {
    const normalized = text.trim();
    if (!normalized) {
      throw new Error("Status human ingress text must not be empty");
    }

    await this.statusAdapter.send({
      channel: "status",
      conversationId: this.statusChatId,
      text: normalized,
      metadata: {
        ingressMode: "bridge-shim",
        source: "status-human-ingress-shim",
      },
    });
  }
}
