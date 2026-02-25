import { Socket } from "node:net";
import tls, { TLSSocket } from "node:tls";

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

const encodeBase64 = (value: string): string => Buffer.from(value, "utf8").toString("base64");

export class SmtpClient {
  constructor(private readonly config: SmtpConfig) {}

  async sendText(from: string, to: string, subject: string, body: string): Promise<void> {
    // Minimal SMTP over implicit TLS implementation.
    // SPECIFICATION: for production, replace with a hardened mail library supporting STARTTLS, retries, and DKIM signing.
    const socket = await this.connect();

    try {
      await this.expect(socket, 220);
      await this.command(socket, `EHLO openclaw-omnibridge`, 250);
      await this.command(socket, "AUTH LOGIN", 334);
      await this.command(socket, encodeBase64(this.config.username), 334);
      await this.command(socket, encodeBase64(this.config.password), 235);
      await this.command(socket, `MAIL FROM:<${from}>`, 250);
      await this.command(socket, `RCPT TO:<${to}>`, 250);
      await this.command(socket, "DATA", 354);

      const message = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        body,
        ".",
      ].join("\r\n");

      await this.command(socket, message, 250);
      await this.command(socket, "QUIT", 221);
    } finally {
      socket.end();
      socket.destroy();
    }
  }

  private connect(): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
      const sock = tls.connect(
        {
          host: this.config.host,
          port: this.config.port,
          rejectUnauthorized: true,
        },
        () => resolve(sock),
      );
      sock.on("error", reject);
    });
  }

  private async command(socket: Socket, line: string, expectedCode: number): Promise<void> {
    socket.write(`${line}\r\n`);
    await this.expect(socket, expectedCode);
  }

  private expect(socket: Socket, expectedCode: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onData = (buffer: Buffer) => {
        const response = buffer.toString("utf8");
        const code = Number(response.slice(0, 3));
        if (code === expectedCode) {
          cleanup();
          resolve();
          return;
        }

        cleanup();
        reject(new Error(`SMTP expected ${expectedCode}, received ${code}: ${response.trim()}`));
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };

      socket.on("data", onData);
      socket.on("error", onError);
    });
  }
}
