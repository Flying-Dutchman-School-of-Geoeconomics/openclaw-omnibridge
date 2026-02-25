export class SignalRpcClient {
  constructor(private readonly baseUrl: string) {}

  async sendMessage(recipient: string, text: string): Promise<void> {
    // SPECIFICATION: align endpoint to your deployed signal-cli-rest-api version.
    const url = `${this.baseUrl}/v2/send`;
    const res = await fetch(url, {
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
}
