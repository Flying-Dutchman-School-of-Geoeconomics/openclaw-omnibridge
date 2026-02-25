import { createFastifyIngress } from "./server.js";
import { createBridgeRuntime } from "../../runtime.js";

const main = async (): Promise<void> => {
  const runtime = await createBridgeRuntime(process.env);
  await runtime.start();

  const app = await createFastifyIngress(runtime);
  await app.listen({
    host: "0.0.0.0",
    port: runtime.config.httpPort,
  });

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
