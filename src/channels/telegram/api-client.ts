export class TelegramApiClient {
  constructor(private readonly botToken: string) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed: ${res.status}`);
    }
  }
}
