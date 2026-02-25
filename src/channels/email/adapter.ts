import { BaseInboundAdapter } from "../base.js";
import { OutboundMessage, RawInboundMessage, VerificationResult } from "../../core/types.js";
import { verifyEmailPolicyEnvelope } from "../../crypto/verifiers.js";
import { ImapClient, InboundEmail } from "./imap-client.js";
import { SmtpClient } from "./smtp-client.js";

export interface EmailAdapterConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  allowedSenders: string[];
  requireDkimPass: boolean;
}

export class EmailAdapter extends BaseInboundAdapter {
  readonly kind = "email" as const;
  private readonly imapClient: ImapClient;
  private readonly smtpClient: SmtpClient;

  constructor(private readonly config: EmailAdapterConfig) {
    super();
    this.imapClient = new ImapClient({
      host: config.imapHost,
      port: config.imapPort,
      username: config.username,
      password: config.password,
    });
    this.smtpClient = new SmtpClient({
      host: config.smtpHost,
      port: config.smtpPort,
      username: config.username,
      password: config.password,
    });
  }

  async start(): Promise<void> {
    await this.imapClient.startPolling(async (message) => {
      this.ingestInboundEmail(message);
    });
  }

  async stop(): Promise<void> {
    await this.imapClient.stop();
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.smtpClient.sendText(
      this.config.username,
      message.conversationId,
      `OpenClaw bridge (${message.metadata?.sourceChannel ?? "unknown"})`,
      message.text,
    );
  }

  async verify(raw: RawInboundMessage): Promise<VerificationResult> {
    const verification = verifyEmailPolicyEnvelope(this.config.requireDkimPass, raw.metadata.dkimResult);
    if (!verification.authenticated) {
      return verification;
    }

    if (this.config.allowedSenders.length > 0) {
      const allowed = new Set(this.config.allowedSenders.map((s) => s.toLowerCase()));
      if (!allowed.has(raw.senderId.toLowerCase())) {
        return {
          authenticated: false,
          mechanism: verification.mechanism,
          confidence: "low",
          reason: `sender ${raw.senderId} not allowlisted`,
        };
      }
    }

    return verification;
  }

  async normalize(raw: RawInboundMessage, verification: VerificationResult) {
    const command = raw.payload.startsWith("/") ? raw.payload.slice(1).split(/\s+/) : null;

    return {
      messageId: raw.id,
      sourceChannel: this.kind,
      sourceSenderId: raw.senderId,
      sourceConversationId: raw.conversationId,
      createdAtMs: raw.timestampMs,
      kind: command ? "command" : "text",
      text: command ? undefined : raw.payload,
      commandName: command?.[0],
      commandArgs: command?.slice(1),
      metadata: raw.metadata,
      cryptographicState: {
        authenticated: verification.authenticated,
        mechanism: verification.mechanism,
        confidence: verification.confidence,
      },
    };
  }

  ingestInboundEmail(email: InboundEmail): void {
    const raw: RawInboundMessage = {
      id: email.messageId,
      channel: this.kind,
      senderId: email.from,
      conversationId: email.from,
      timestampMs: email.timestampMs,
      nonce: email.messageId,
      payload: email.bodyText,
      contentType: "text/plain",
      headers: {},
      metadata: {
        subject: email.subject,
        dkimResult: email.dkimResult ?? "",
        spfResult: email.spfResult ?? "",
        dmarcResult: email.dmarcResult ?? "",
      },
    };

    this.emitInbound(raw);
  }
}
