import { BridgeHttpServer } from "./server.js";
import { createBridgeRuntime } from "./runtime.js";

const runSelfCheck = async (): Promise<void> => {
  const { verifySlackSignature, verifyTelegramSecretToken } = await import("./crypto/verifiers.js");

  const slack = verifySlackSignature("secret", "123", "body", "v0=bad");
  if (slack.authenticated) {
    throw new Error("selfcheck failed: slack verifier should reject mismatched signature");
  }

  const telegram = verifyTelegramSecretToken("abc", "abc");
  if (!telegram.authenticated) {
    throw new Error("selfcheck failed: telegram verifier should accept matching token");
  }

  console.log("selfcheck: ok");
};

const bootstrap = async (): Promise<void> => {
  const runtime = await createBridgeRuntime(process.env);
  await runtime.start();

  const server = new BridgeHttpServer({
    port: runtime.config.httpPort,
    telegramAdapter: runtime.adapters.telegram,
    slackAdapter: runtime.adapters.slack,
    discordAdapter: runtime.adapters.discord,
    whatsappAdapter: runtime.adapters.whatsapp,
    signalAdapter: runtime.adapters.signal,
    emailAdapter: runtime.adapters.email,
  });

  await server.start();

  const shutdown = async () => {
    console.log("shutdown requested");
    await server.stop();
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  console.log("openclaw-omnibridge started");
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--selfcheck")) {
    await runSelfCheck();
    return;
  }

  await bootstrap();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
