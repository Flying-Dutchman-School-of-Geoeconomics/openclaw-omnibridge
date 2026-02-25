import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import rawBody from "@fastify/raw-body";
import { createBridgeRuntime } from "../../runtime.js";
import { OmniBridgeIngressModule } from "./module.js";

const main = async (): Promise<void> => {
  const runtime = await createBridgeRuntime(process.env);
  await runtime.start();

  @Module({
    imports: [OmniBridgeIngressModule.register(runtime)],
  })
  class AppModule {}

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    logger: true,
    bodyLimit: 1024 * 1024,
  }));

  await app.register(rawBody, {
    field: "rawBody",
    global: true,
    encoding: "utf8",
    runFirst: true,
  });

  await app.listen(runtime.config.httpPort, "0.0.0.0");

  const shutdown = async () => {
    await app.close();
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
