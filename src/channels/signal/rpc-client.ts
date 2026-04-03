export class SignalRpcClient {
  constructor(private readonly baseUrl: string) {}

  private sendUrl(): string {
    return `${this.baseUrl}/v2/send`;
  }

  async sendMessage(recipient: string, text: string): Promise<void> {
    // SPECIFICATION: align endpoint to your deployed signal-cli-rest-api version.
    const res = await fetch(this.sendUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: text,
        number: recipient,
        recipients: [recipient],
      }),
    });

    if (!res.ok) {
      throw new Error(`Signal sendMessage failed: ${res.status}`);
    }
  }

  async probeSendSurface(): Promise<{ state: "healthy" | "degraded" | "unavailable"; detail: string }> {
    const res = await fetch(this.sendUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Intentionally malformed so we can verify the expected HTTP surface
      // without sending a real message.
      body: JSON.stringify({}),
    });

    if (res.status === 404) {
      return {
        state: "unavailable",
        detail: "expected /v2/send endpoint not found",
      };
    }

    if (res.status === 400 || res.status === 422) {
      return {
        state: "healthy",
        detail: "Signal send endpoint reachable and validating payloads",
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        state: "degraded",
        detail: `Signal send endpoint rejected probe with ${res.status}`,
      };
    }

    if (res.status >= 500) {
      return {
        state: "degraded",
        detail: `Signal send endpoint returned ${res.status}`,
      };
    }

    return {
      state: res.ok ? "healthy" : "degraded",
      detail: `Signal send endpoint responded with ${res.status}`,
    };
  }
}
