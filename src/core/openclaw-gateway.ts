import { CanonicalMessage, OpenClawGateway } from "./types.js";

export class ConsoleOpenClawGateway implements OpenClawGateway {
  async ingest(message: CanonicalMessage): Promise<void> {
    console.log(`[openclaw] ingest ${JSON.stringify(message)}`);
  }
}
