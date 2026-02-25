export class DiscordApiClient {
  constructor(private readonly botToken: string) {}

  async createMessage(channelId: string, content: string): Promise<void> {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bot ${this.botToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      throw new Error(`Discord create message failed: ${res.status}`);
    }
  }
}
