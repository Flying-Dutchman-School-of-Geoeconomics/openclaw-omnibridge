import { appendFile } from "node:fs/promises";
import { AuditEvent, AuditLog } from "./types.js";

export class FileAuditLog implements AuditLog {
  constructor(private readonly outputPath: string) {}

  async record(event: AuditEvent): Promise<void> {
    const line = JSON.stringify(event);
    await appendFile(this.outputPath, `${line}\n`, { encoding: "utf8" });
  }
}

export class ConsoleAuditLog implements AuditLog {
  async record(event: AuditEvent): Promise<void> {
    console.log(`[audit] ${JSON.stringify(event)}`);
  }
}
