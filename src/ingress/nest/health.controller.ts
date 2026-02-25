import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("healthz")
  health(): { ok: boolean } {
    return { ok: true };
  }
}
