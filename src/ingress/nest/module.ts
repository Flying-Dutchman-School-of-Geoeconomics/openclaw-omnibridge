import { DynamicModule, Module } from "@nestjs/common";
import { BridgeRuntime } from "../../runtime.js";
import { IngressService } from "./ingress.service.js";
import { BRIDGE_RUNTIME } from "./tokens.js";
import { HealthController } from "./health.controller.js";
import { WebhooksController } from "./webhooks.controller.js";

@Module({})
export class OmniBridgeIngressModule {
  static register(runtime: BridgeRuntime): DynamicModule {
    return {
      module: OmniBridgeIngressModule,
      controllers: [WebhooksController, HealthController],
      providers: [
        {
          provide: BRIDGE_RUNTIME,
          useValue: runtime,
        },
        IngressService,
      ],
    };
  }
}
