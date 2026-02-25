export class SlackApiClient {
  constructor(private readonly botToken: string) {}

  async postMessage(channel: string, text: string): Promise<void> {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.botToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text }),
    });

    if (!res.ok) {
      throw new Error(`Slack chat.postMessage HTTP error: ${res.status}`);
    }

    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      throw new Error(`Slack chat.postMessage API error: ${json.error ?? "unknown"}`);
    }
  }
}
