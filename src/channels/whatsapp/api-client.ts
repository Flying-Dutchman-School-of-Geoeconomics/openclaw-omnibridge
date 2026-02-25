export class WhatsAppApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
  ) {}

  async sendText(to: string, body: string): Promise<void> {
    const url = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });

    if (!res.ok) {
      throw new Error(`WhatsApp sendText failed: ${res.status}`);
    }
  }
}
