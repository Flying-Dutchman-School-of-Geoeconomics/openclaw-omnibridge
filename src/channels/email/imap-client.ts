export interface InboundEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  timestampMs: number;
  dkimResult?: string;
  spfResult?: string;
  dmarcResult?: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export class ImapClient {
  constructor(private readonly config: ImapConfig) {}

  async startPolling(onMessage: (message: InboundEmail) => Promise<void>): Promise<void> {
    // SPECIFICATION: implement full IMAP IDLE/polling integration for your provider.
    // This placeholder keeps runtime deterministic in environments without network access.
    void onMessage;
    void this.config;
  }

  async stop(): Promise<void> {
    return Promise.resolve();
  }
}
