export class SignalRpcClient {
  constructor(private readonly baseUrl: string) {}
async sendMessage(recipient: string, text: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/rpc`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "send",
            params: {
                recipient: [recipient],
                message: text,
            },
            id: 1,
        }),
    });
    if (!res.ok) {
        throw new Error(`Signal sendMessage failed: ${res.status}`);
    }
}
}
